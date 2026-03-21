import { createHash } from 'crypto';
import { executeTool, getToolDefinition } from '../tools/registry.js';
import { query } from '../db/index.js';
import type { AgentPlan } from '../ai/schemas.js';
import { createAgentAction, updateAgentActionStatus } from './actionStore.js';
import { logAgentStep } from './logs.js';
import type { AgentGoalState } from './types.js';
import { getConfidenceFactors } from './confidence.js';
import { isAlwaysAllowed } from './policy.js';
import { logDecisionTrace } from './decisionTrace.js';
import { generateActionPreview } from './preview.js';
import { detectRiskyOutcome } from './recovery.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const resolveContext = async (userId: string, input: Record<string, unknown>) => {
  if (input.email_id) {
    const result = await query<{ id: string; message_id: string }>(
      'SELECT id, message_id FROM emails WHERE id = $1 AND user_id = $2',
      [input.email_id, userId]
    );
    return result.rows[0] ?? null;
  }

  if (input.message_id) {
    const result = await query<{ id: string; message_id: string }>(
      'SELECT id, message_id FROM emails WHERE message_id = $1 AND user_id = $2',
      [input.message_id, userId]
    );
    return result.rows[0] ?? null;
  }

  if (input.task_id) {
    const result = await query<{ email_id: string; message_id: string }>(
      `SELECT t.email_id, e.message_id
       FROM extracted_tasks t
       JOIN emails e ON e.id = t.email_id
       WHERE t.id = $1 AND t.user_id = $2`,
      [input.task_id, userId]
    );
    return result.rows[0] ? { id: result.rows[0].email_id, message_id: result.rows[0].message_id } : null;
  }

  return null;
};

const stripContextFields = (input: Record<string, unknown>) => {
  const { email_id, task_id, message_id, ...rest } = input as any;
  return rest;
};

export const executePlan = async (input: {
  userId: string;
  plan: AgentPlan;
  goals: AgentGoalState;
  planId: string;
  contextSummary: string;
}) => {
  const results: Array<Record<string, unknown>> = [];
  let failed = 0;
  const personalityAdjust = input.goals.personalityMode === 'chill' ? 0.05 : input.goals.personalityMode === 'aggressive' ? -0.05 : 0;
  const autoThreshold = Math.min(Math.max(0.85 + personalityAdjust, 0.75), 0.95);
  const suggestThreshold = Math.min(Math.max(0.5 + personalityAdjust, 0.4), 0.65);

  const workflowGroups: Array<{ id: string; name: string; steps: typeof input.plan.plan }> = [];
  let current: { id: string; name: string; steps: typeof input.plan.plan } | null = null;

  input.plan.plan.forEach((step) => {
    const name = step.workflow ?? 'General';
    if (!current || current.name !== name) {
      const index = workflowGroups.length;
      const workflowId = createHash('sha1').update(`${input.planId}:${index}:${name}`).digest('hex').slice(0, 12);
      current = { id: workflowId, name, steps: [] as typeof input.plan.plan };
      workflowGroups.push(current);
    }
    current.steps.push(step);
  });

  for (const workflow of workflowGroups) {
    await logAgentStep({
      userId: input.userId,
      step: 'workflow_start',
      message: workflow.name,
      data: { workflowId: workflow.id, planId: input.planId }
    });

    let workflowFailures = 0;

    for (const step of workflow.steps) {
      const tool = getToolDefinition(step.action);
      if (!tool) {
        results.push({ step: step.step, action: step.action, workflow: workflow.name, status: 'discarded', reason: 'tool_not_found' });
        await logDecisionTrace({
          userId: input.userId,
          planId: input.planId,
          workflowId: workflow.id,
          data: {
            input: { context: input.contextSummary, stepInput: step.input },
            reasoning: { reason: step.reason },
            decision: { action: step.action, workflow: workflow.name },
            action: { execution: 'discard', requiresApproval: false },
            result: { status: 'tool_not_found' }
          }
        });
        continue;
      }

      const resolvedContext = await resolveContext(input.userId, step.input);
      const factors = await getConfidenceFactors({
        userId: input.userId,
        actionType: step.action,
        emailId: resolvedContext?.id ?? (step.input as any)?.email_id ?? null
      });
      const adjustedConfidence = Math.min(
        Math.max(step.confidence * factors.historicalAccuracy * factors.recencyWeight * factors.contextSimilarity, 0),
        1
      );

      if (adjustedConfidence < suggestThreshold) {
        results.push({ step: step.step, action: step.action, workflow: workflow.name, status: 'discarded', reason: 'low_confidence' });
        await logDecisionTrace({
          userId: input.userId,
          planId: input.planId,
          workflowId: workflow.id,
          data: {
            input: { context: input.contextSummary, stepInput: step.input },
            reasoning: {
              reason: step.reason,
              base_confidence: step.confidence,
              historical_accuracy: factors.historicalAccuracy,
              recency_weight: factors.recencyWeight,
              context_similarity: factors.contextSimilarity,
              adjusted_confidence: adjustedConfidence
            },
            decision: { action: step.action, workflow: workflow.name },
            action: { execution: 'discard', requiresApproval: tool.requiresApproval },
            result: { status: 'low_confidence' }
          }
        });
        continue;
      }

      const requiresApproval = tool.requiresApproval;
      const safe = tool.safe;
      const policyAllows = await isAlwaysAllowed(input.userId, step.action);
      const canExecute =
        (input.goals.autopilotLevel >= 1 && !requiresApproval && (input.goals.autopilotLevel === 2 || safe)) ||
        (policyAllows && !requiresApproval && safe);

      let preview: any = null;
      try {
        preview = await generateActionPreview({
          userId: input.userId,
          actionType: step.action,
          actionInput: step.input,
          emailId: resolvedContext?.id ?? null
        });
      } catch (error) {
        await logAgentStep({
          userId: input.userId,
          step: 'preview_error',
          message: (error as Error).message
        });
        preview = null;
      }

      if (adjustedConfidence <= autoThreshold || !canExecute) {
        if (resolvedContext) {
          await createAgentAction({
            userId: input.userId,
            emailId: resolvedContext.id,
            action: {
              type: step.action,
              reason: step.reason,
              confidence: adjustedConfidence,
              baseConfidence: step.confidence,
              adjustedConfidence,
              historicalAccuracy: factors.historicalAccuracy,
              recencyWeight: factors.recencyWeight,
              contextSimilarity: factors.contextSimilarity,
              workflow: workflow.name,
              workflowId: workflow.id,
              preview,
              payload: step.input,
              execution: 'suggest',
              requiresApproval
            },
            statusOverride: 'preview'
          });
        }
        results.push({ step: step.step, action: step.action, workflow: workflow.name, status: 'suggested' });
        await logDecisionTrace({
          userId: input.userId,
          planId: input.planId,
          workflowId: workflow.id,
          data: {
            input: { context: input.contextSummary, stepInput: step.input },
            reasoning: {
              reason: step.reason,
              base_confidence: step.confidence,
              historical_accuracy: factors.historicalAccuracy,
              recency_weight: factors.recencyWeight,
              context_similarity: factors.contextSimilarity,
              adjusted_confidence: adjustedConfidence
            },
            decision: { action: step.action, workflow: workflow.name },
            action: { execution: 'suggest', requiresApproval, preview },
            result: { status: 'suggested' }
          }
        });
        continue;
      }

      const ctx = resolvedContext;
      if (!ctx) {
        results.push({ step: step.step, action: step.action, workflow: workflow.name, status: 'failed', reason: 'missing_context' });
        failed += 1;
        workflowFailures += 1;
        await logDecisionTrace({
          userId: input.userId,
          planId: input.planId,
          workflowId: workflow.id,
          data: {
            input: { context: input.contextSummary, stepInput: step.input },
            reasoning: {
              reason: step.reason,
              base_confidence: step.confidence,
              historical_accuracy: factors.historicalAccuracy,
              recency_weight: factors.recencyWeight,
              context_similarity: factors.contextSimilarity,
              adjusted_confidence: adjustedConfidence
            },
            decision: { action: step.action, workflow: workflow.name },
            action: { execution: 'execute', requiresApproval },
            result: { status: 'missing_context' }
          }
        });
        continue;
      }

      const actionId = await createAgentAction({
        userId: input.userId,
        emailId: ctx.id,
        action: {
          type: step.action,
          reason: step.reason,
          confidence: adjustedConfidence,
          baseConfidence: step.confidence,
          adjustedConfidence,
          historicalAccuracy: factors.historicalAccuracy,
          recencyWeight: factors.recencyWeight,
          contextSimilarity: factors.contextSimilarity,
          workflow: workflow.name,
          workflowId: workflow.id,
          preview,
          payload: step.input,
          execution: 'execute',
          requiresApproval
        }
      });

      if (!actionId) {
        results.push({ step: step.step, action: step.action, workflow: workflow.name, status: 'skipped', reason: 'duplicate' });
        await logDecisionTrace({
          userId: input.userId,
          planId: input.planId,
          workflowId: workflow.id,
          data: {
            input: { context: input.contextSummary, stepInput: step.input },
            reasoning: {
              reason: step.reason,
              base_confidence: step.confidence,
              historical_accuracy: factors.historicalAccuracy,
              recency_weight: factors.recencyWeight,
              context_similarity: factors.contextSimilarity,
              adjusted_confidence: adjustedConfidence
            },
            decision: { action: step.action, workflow: workflow.name },
            action: { execution: 'execute', requiresApproval },
            result: { status: 'duplicate' }
          }
        });
        continue;
      }

      const payload = stripContextFields(step.input);
      let attempt = 0;
      let success = false;
      let lastError: string | null = null;
      let lastResult: Record<string, unknown> | null = null;

      while (attempt < 3 && !success) {
        try {
          const result = await executeTool(step.action, {
            userId: input.userId,
            emailId: ctx.id,
            messageId: ctx.message_id
          }, payload);

          await updateAgentActionStatus(actionId, 'executed', { result });
          results.push({ step: step.step, action: step.action, workflow: workflow.name, status: 'executed', result });
          lastResult = result as Record<string, unknown>;
          success = true;
        } catch (error) {
          lastError = (error as Error).message;
          attempt += 1;
          await sleep(500 * attempt);
        }
      }

      if (!success) {
        failed += 1;
        workflowFailures += 1;
        await updateAgentActionStatus(actionId, 'failed', { error: lastError });
        await logAgentStep({
          userId: input.userId,
          emailId: ctx.id,
          step: 'executor_failure',
          message: lastError ?? 'Unknown error'
        });
        results.push({ step: step.step, action: step.action, workflow: workflow.name, status: 'failed', reason: lastError });
      }

      const risk = await detectRiskyOutcome({
        userId: input.userId,
        actionType: step.action,
        result: success ? (lastResult ?? {}) : { error: lastError ?? 'Unknown error' },
        confidence: adjustedConfidence
      });

      await logDecisionTrace({
        userId: input.userId,
        planId: input.planId,
        workflowId: workflow.id,
        data: {
          input: { context: input.contextSummary, stepInput: step.input },
          reasoning: {
            reason: step.reason,
            base_confidence: step.confidence,
            historical_accuracy: factors.historicalAccuracy,
            recency_weight: factors.recencyWeight,
            context_similarity: factors.contextSimilarity,
            adjusted_confidence: adjustedConfidence
          },
          decision: { action: step.action, workflow: workflow.name },
          action: { execution: 'execute', requiresApproval, preview },
          result: { status: success ? 'executed' : 'failed', error: lastError ?? undefined, risk }
        }
      });
    }

    await logAgentStep({
      userId: input.userId,
      step: 'workflow_end',
      message: workflow.name,
      data: { workflowId: workflow.id, planId: input.planId, failures: workflowFailures }
    });
  }

  return { results, failed };
};
