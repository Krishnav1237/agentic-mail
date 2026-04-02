import { query } from '../db/index.js';
import { perceiveEmail, type EmailRow } from './perception.js';
import { getUserGoals } from './goals.js';
import { buildMemorySummary } from '../memory/summary.js';
import { appendMemoryList } from '../memory/store.js';
import { reasonAboutEmail } from './reasoning.js';
import { planActions } from '../planner/actionPlanner.js';
import { createAgentAction, updateAgentActionStatus } from './actionStore.js';
import { executeTool } from '../tools/registry.js';
import { logAgentStep } from './logs.js';

export const runAgentLoop = async (input: {
  userId: string;
  emailId: string;
}) => {
  const emailResult = await query<EmailRow>(
    `SELECT id, message_id, thread_id, subject, sender_name, sender_email, body_preview, received_at, importance
     FROM emails WHERE id = $1 AND user_id = $2`,
    [input.emailId, input.userId]
  );

  if (emailResult.rowCount === 0) {
    return { status: 'missing' };
  }

  const claim = await query(
    `UPDATE emails SET status = 'processing', updated_at = now()
     WHERE id = $1 AND status != 'processing'
     RETURNING id`,
    [input.emailId]
  );

  if (claim.rowCount === 0) {
    return { status: 'in_progress' };
  }

  try {
    const perception = perceiveEmail(emailResult.rows[0]);
    await logAgentStep({
      userId: input.userId,
      emailId: input.emailId,
      step: 'perception',
      data: perception,
    });

    const goals = await getUserGoals(input.userId);
    const memorySummary = await buildMemorySummary(input.userId);

    const decision = await reasonAboutEmail({
      email: perception,
      goals,
      memorySummary,
    });
    await logAgentStep({
      userId: input.userId,
      emailId: input.emailId,
      step: 'reasoning',
      data: decision,
    });

    const planned = planActions(decision, goals.autopilotLevel);
    await logAgentStep({
      userId: input.userId,
      emailId: input.emailId,
      step: 'planning',
      data: { planned },
    });

    await query(
      `UPDATE emails SET ai_json = $1, classification = $2, ai_score = $3, processed_at = now(), status = 'processed', updated_at = now()
       WHERE id = $4`,
      [
        JSON.stringify(decision),
        decision.classification,
        decision.priority / 100,
        input.emailId,
      ]
    );

    await appendMemoryList(input.userId, 'short', 'recent_emails', {
      emailId: input.emailId,
      subject: perception.subject,
      classification: decision.classification,
      priority: decision.priority,
      ts: new Date().toISOString(),
    });

    for (const action of planned) {
      const enrichedPayload = {
        ...(action.payload ?? {}),
        category: (action.payload as any)?.category ?? decision.classification,
        priority: (action.payload as any)?.priority ?? decision.priority,
      };
      const actionWithPayload = { ...action, payload: enrichedPayload };

      if (action.execution === 'ignore') {
        await createAgentAction({
          userId: input.userId,
          emailId: input.emailId,
          action: actionWithPayload,
        });
        continue;
      }

      const actionId = await createAgentAction({
        userId: input.userId,
        emailId: input.emailId,
        action: actionWithPayload,
      });
      if (!actionId) continue;

      if (action.execution === 'suggest') {
        await updateAgentActionStatus(actionId, 'suggested');
        continue;
      }

      try {
        const result = await executeTool(
          action.type as any,
          {
            userId: input.userId,
            emailId: perception.emailId,
            messageId: perception.messageId,
          },
          actionWithPayload.payload ?? {}
        );

        await updateAgentActionStatus(actionId, 'executed', { result });
        await appendMemoryList(
          input.userId,
          'short',
          'recent_actions',
          {
            actionId,
            type: action.type,
            result,
            ts: new Date().toISOString(),
          },
          50
        );
      } catch (error) {
        await updateAgentActionStatus(actionId, 'failed', {
          error: (error as Error).message,
        });
        await logAgentStep({
          userId: input.userId,
          emailId: input.emailId,
          step: 'execution_error',
          message: (error as Error).message,
        });
      }
    }

    return { status: 'completed', planned: planned.length };
  } catch (error) {
    await query(
      `UPDATE emails SET status = 'failed', updated_at = now() WHERE id = $1`,
      [input.emailId]
    );
    await logAgentStep({
      userId: input.userId,
      emailId: input.emailId,
      step: 'agent_error',
      message: (error as Error).message,
    });
    throw error;
  }
};
