import { query } from '../db/index.js';
import { env } from '../config/env.js';
import { getUserGoals } from './goals.js';
import { buildContext } from './contextBuilder.js';
import { persistPlan, markPlanStatus, getLastPlanTime } from './planner.js';
import { executePlan } from './executor.js';
import { runReflection } from './reflection.js';
import { getAuthContext } from '../services/tokens.js';
import { listEvents } from '../services/graph.js';
import { listGoogleEvents } from '../services/gmail.js';
import { logAgentStep } from './logs.js';
import { runStrategist } from './strategist.js';
import { generateDailyActivityFeed } from './activityFeed.js';
import { getIntentState } from './intent.js';
import { getEnergyContext } from './energy.js';
import { filterPlanningContext } from './contextFilter.js';
import { buildDecisionState, computeDecisionStateHash, getStoredStateHash, storeStateHash } from './stateManager.js';
import { runFastPlanner } from './fastPlanner.js';
import { runHeavyPlanner } from './heavyPlanner.js';
import { mergeAndDedupePlans } from './planMerge.js';
import { optimizeMemory } from '../memory/optimizer.js';
import type { PlannerInput } from './planningTypes.js';

const DAILY_PLAN_INTERVAL_HOURS = 6;
const HEAVY_PLANNER_MIN_BUDGET_MS = 2500;

const getDailyPlanInterval = (personality: 'chill' | 'proactive' | 'aggressive') => {
  if (personality === 'aggressive') return 4;
  if (personality === 'chill') return 8;
  return DAILY_PLAN_INTERVAL_HOURS;
};

const getContinuousIntervalMinutes = (personality: 'chill' | 'proactive' | 'aggressive') => {
  if (personality === 'aggressive') return 5;
  if (personality === 'chill') return 20;
  return 10;
};

const getSenderDomain = (email?: string | null) => {
  if (!email || !email.includes('@')) return null;
  return email.split('@')[1]?.toLowerCase() ?? null;
};

const fetchPerception = async (userId: string) => {
  const pendingEmailsResult = await query<{
    id: string;
    thread_id: string | null;
    subject: string | null;
    sender_name: string | null;
    sender_email: string | null;
    received_at: string | null;
    body_preview: string | null;
    importance: string | null;
    classification: string | null;
  }>(
    `SELECT id, thread_id, subject, sender_name, sender_email, received_at, body_preview, importance, classification
     FROM emails
     WHERE user_id = $1 AND status = 'pending'
     ORDER BY received_at DESC
     LIMIT 50`,
    [userId]
  );

  const pendingEmails = pendingEmailsResult.rows.map((row) => ({
    id: row.id,
    threadId: row.thread_id,
    subject: row.subject ?? '',
    sender: `${row.sender_name ?? ''} <${row.sender_email ?? ''}>`,
    senderDomain: getSenderDomain(row.sender_email),
    receivedAt: row.received_at,
    preview: row.body_preview ?? '',
    importance: row.importance,
    classification: row.classification
  }));

  const openTasksResult = await query<{
    id: string;
    title: string;
    due_at: string | null;
    category: string | null;
    priority_score: number | null;
    status: string;
  }>(
    `SELECT id, title, due_at, category, priority_score::float as priority_score, status
     FROM extracted_tasks
     WHERE user_id = $1 AND status = 'open'
     ORDER BY due_at ASC NULLS LAST
     LIMIT 100`,
    [userId]
  );

  const openTasks = openTasksResult.rows.map((row) => ({
    id: row.id,
    title: row.title,
    dueAt: row.due_at,
    category: row.category,
    priorityScore: row.priority_score,
    status: row.status
  }));

  const recentActionsResult = await query<{ id: string; action_type: string; status: string; workflow_name: string | null }>(
    `SELECT id, action_type, status, workflow_name
     FROM agent_actions
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 20`,
    [userId]
  );

  const recentActions = recentActionsResult.rows;

  let upcomingEvents: Array<{ id: string; subject: string; start?: string | null }> = [];
  try {
    const auth = await getAuthContext(userId);
    if (auth.provider === 'google') {
      const events = await listGoogleEvents(auth.accessToken, 10);
      upcomingEvents = (events?.items ?? []).map((event: any) => ({
        id: event.id,
        subject: event.summary ?? 'Event',
        start: event.start?.dateTime ?? event.start?.date ?? null
      }));
    } else {
      const events = await listEvents(auth.accessToken, 10);
      upcomingEvents = (events?.value ?? []).map((event: any) => ({
        id: event.id,
        subject: event.subject ?? 'Event',
        start: event.start?.dateTime ?? null
      }));
    }
  } catch {
    upcomingEvents = [];
  }

  return { pendingEmails, openTasks, recentActions, upcomingEvents };
};

const shouldRunDailyPlan = (lastPlanTime: string | null, intervalHours: number) => {
  if (!lastPlanTime) return true;
  const last = new Date(lastPlanTime).getTime();
  const diffHours = (Date.now() - last) / (1000 * 60 * 60);
  return diffHours >= intervalHours;
};

const shouldRunContinuousPlan = (lastPlanTime: string | null, intervalMinutes: number) => {
  if (!lastPlanTime) return true;
  const last = new Date(lastPlanTime).getTime();
  const diffMinutes = (Date.now() - last) / (1000 * 60);
  return diffMinutes >= intervalMinutes;
};

const getPendingPreviewCount = async (userId: string) => {
  const result = await query<{ count: number }>(
    `SELECT COUNT(*)::int as count
     FROM agent_actions
     WHERE user_id = $1 AND status IN ('preview', 'suggest', 'suggested', 'modified')`,
    [userId]
  );
  return result.rows[0]?.count ?? 0;
};

const shouldUseHeavyPlanner = (input: { fastPlanCount: number; plannerInput: PlannerInput; remainingBudgetMs: number | undefined }) => {
  if (input.remainingBudgetMs === undefined) return true;
  if (input.remainingBudgetMs < HEAVY_PLANNER_MIN_BUDGET_MS) return false;
  if (input.fastPlanCount === 0) return true;
  if (input.fastPlanCount < Math.min(2, input.plannerInput.filtered.emails.length)) return true;
  return input.plannerInput.filtered.emails.some((email) => email.importance === 'high');
};

export const runCoreLoop = async (userId: string) => {
  const startedAt = Date.now();
  const goals = await getUserGoals(userId);
  const perception = await fetchPerception(userId);
  const strategist = await runStrategist({ userId, goals });
  const intents = await getIntentState(userId);
  const energy = await getEnergyContext(userId);
  const filtered = filterPlanningContext({
    pendingEmails: perception.pendingEmails,
    openTasks: perception.openTasks,
    upcomingEvents: perception.upcomingEvents
  });

  const context = await buildContext({
    userId,
    goals,
    pendingEmails: filtered.emails.map((email) => ({
      id: email.id,
      subject: email.subject,
      sender: email.sender,
      receivedAt: email.receivedAt,
      preview: email.preview
    })),
    openTasks: filtered.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      dueAt: task.dueAt,
      category: task.category
    })),
    upcomingEvents: filtered.events.map((event) => ({
      id: event.id,
      subject: event.subject,
      start: event.start
    })),
    recentActions: perception.recentActions
  });

  const plannerInput: PlannerInput = {
    userId,
    planType: 'continuous',
    goals,
    context,
    strategist,
    intents,
    energy,
    filtered,
    recentActions: perception.recentActions
  };

  const plans: Array<{ planId: string; plan: { plan: any[] }; planType: 'continuous' | 'daily'; stateHash: string; counts: Record<string, number> }> = [];
  const counts = {
    emails: filtered.emails.length,
    tasks: filtered.tasks.length,
    events: filtered.events.length
  };

  const buildAndQueuePlan = async (planType: 'continuous' | 'daily') => {
    const decisionState = buildDecisionState({
      filtered,
      goals,
      intents,
      strategist,
      recentActions: perception.recentActions
    });
    const { stateHash } = computeDecisionStateHash(decisionState);
    const previous = await getStoredStateHash(userId, planType);
    const unchanged = previous?.stateHash === stateHash;

    if (unchanged) {
      await logAgentStep({
        userId,
        step: 'state_skip',
        message: `Skipped ${planType} planning because decision state is unchanged`,
        data: { planType, stateHash, counts }
      });
      return;
    }

    const currentInput: PlannerInput = { ...plannerInput, planType };
    const fastPlan = await runFastPlanner(currentInput);
    const remainingBudgetMs = planType === 'continuous' ? Math.max(env.agentLoopMaxMs - (Date.now() - startedAt), 0) : undefined;
    const useHeavyPlanner = shouldUseHeavyPlanner({
      fastPlanCount: fastPlan.plan.length,
      plannerInput: currentInput,
      remainingBudgetMs
    });

    const mergedPlan = useHeavyPlanner
      ? mergeAndDedupePlans([fastPlan, await runHeavyPlanner({ ...currentInput, remainingBudgetMs })])
      : mergeAndDedupePlans([fastPlan]);

    if (mergedPlan.plan.length === 0) {
      await storeStateHash({ userId, loopType: planType, stateHash, counts });
      await logAgentStep({
        userId,
        step: 'plan_empty',
        message: `No ${planType} actions produced after fast/heavy planning`,
        data: { planType, diagnostics: mergedPlan.diagnostics, useHeavyPlanner }
      });
      return;
    }

    const persisted = await persistPlan({
      userId,
      planType,
      plan: { plan: mergedPlan.plan },
      metadata: {
        source: mergedPlan.source,
        diagnostics: mergedPlan.diagnostics,
        filteredDiagnostics: filtered.diagnostics,
        useHeavyPlanner
      }
    });

    plans.push({
      planId: persisted.planId,
      plan: persisted.plan,
      planType,
      stateHash,
      counts
    });
  };

  const lastContinuous = await getLastPlanTime(userId, 'continuous');
  const continuousInterval = getContinuousIntervalMinutes(goals.personalityMode);
  if (filtered.emails.length > 0 && shouldRunContinuousPlan(lastContinuous, continuousInterval)) {
    await buildAndQueuePlan('continuous');
  }

  const lastDaily = await getLastPlanTime(userId, 'daily');
  const dailyInterval = getDailyPlanInterval(goals.personalityMode);
  if (shouldRunDailyPlan(lastDaily, dailyInterval)) {
    await buildAndQueuePlan('daily');
  }

  for (const planItem of plans) {
    await markPlanStatus(planItem.planId, 'running');
    const execution = await executePlan({ userId, plan: planItem.plan as any, goals, planId: planItem.planId, contextSummary: context.summary });
    await markPlanStatus(planItem.planId, execution.failed > 0 ? 'partial' : 'completed');

    const reflection = await runReflection({
      userId,
      goals,
      context: context.summary,
      planId: planItem.planId,
      plan: planItem.plan,
      results: execution.results
    });

    await logAgentStep({
      userId,
      step: 'reflection',
      message: reflection.improvement_suggestion,
      data: reflection
    });

    if (execution.failed > 0) {
      await logAgentStep({ userId, step: 'replan', message: 'Replanning after failures' });
      const retryFastPlan = await runFastPlanner({ ...plannerInput, planType: 'continuous' });
      const retryMerged = mergeAndDedupePlans([retryFastPlan]);
      if (retryMerged.plan.length > 0) {
        const retryPlan = await persistPlan({
          userId,
          planType: 'continuous',
          plan: { plan: retryMerged.plan },
          metadata: { source: retryMerged.source, diagnostics: retryMerged.diagnostics, retryOf: planItem.planId }
        });
        await markPlanStatus(retryPlan.planId, 'running');
        await executePlan({ userId, plan: retryPlan.plan as any, goals, planId: retryPlan.planId, contextSummary: context.summary });
        await markPlanStatus(retryPlan.planId, 'completed');
      }
    }

    await storeStateHash({
      userId,
      loopType: planItem.planType,
      stateHash: planItem.stateHash,
      counts: planItem.counts
    });
  }

  if (perception.pendingEmails.length > 0) {
    const emailIds = perception.pendingEmails.map((email) => email.id);
    await query(
      `UPDATE emails SET status = 'processed', processed_at = now(), updated_at = now() WHERE id = ANY($1::uuid[])`,
      [emailIds]
    );
  }

  const pendingPreviews = await getPendingPreviewCount(userId);
  if (pendingPreviews > 0) {
    await logAgentStep({
      userId,
      step: 'pending_previews',
      message: `${pendingPreviews} preview actions awaiting review`,
      data: { pendingPreviews }
    });
  }

  await optimizeMemory(userId);
  await generateDailyActivityFeed({ userId, goals });

  return { plans: plans.length };
};
