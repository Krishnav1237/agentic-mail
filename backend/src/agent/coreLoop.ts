import { query } from '../db/index.js';
import { getUserGoals } from './goals.js';
import { buildContext } from './contextBuilder.js';
import { createPlan, markPlanStatus, getLastPlanTime } from './planner.js';
import { executePlan } from './executor.js';
import { runReflection } from './reflection.js';
import { getAuthContext } from '../services/tokens.js';
import { listEvents } from '../services/graph.js';
import { listGoogleEvents } from '../services/gmail.js';
import { logAgentStep } from './logs.js';
import { runStrategist } from './strategist.js';
import { generateDailyActivityFeed } from './activityFeed.js';

const DAILY_PLAN_INTERVAL_HOURS = 6;

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

const fetchPerception = async (userId: string) => {
  const pendingEmailsResult = await query<{ id: string; subject: string; sender_name: string | null; sender_email: string | null; received_at: string | null; body_preview: string | null }>(
    `SELECT id, subject, sender_name, sender_email, received_at, body_preview
     FROM emails
     WHERE user_id = $1 AND status = 'pending'
     ORDER BY received_at DESC
     LIMIT 50`,
    [userId]
  );

  const pendingEmails = pendingEmailsResult.rows.map((row) => ({
    id: row.id,
    subject: row.subject ?? '',
    sender: `${row.sender_name ?? ''} <${row.sender_email ?? ''}>`,
    receivedAt: row.received_at,
    preview: row.body_preview ?? ''
  }));

  const openTasksResult = await query<{ id: string; title: string; due_at: string | null; category: string | null }>(
    `SELECT id, title, due_at, category
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
    category: row.category
  }));

  const recentActionsResult = await query<{ id: string; action_type: string; status: string }>(
    `SELECT id, action_type, status
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

export const runCoreLoop = async (userId: string) => {
  const goals = await getUserGoals(userId);
  const perception = await fetchPerception(userId);
  const strategist = await runStrategist({ userId, goals });
  const context = await buildContext({ userId, goals, ...perception });

  const plans: Array<{ planId: string; plan: unknown }> = [];

  const lastContinuous = await getLastPlanTime(userId, 'continuous');
  const continuousInterval = getContinuousIntervalMinutes(goals.personalityMode);
  if (perception.pendingEmails.length > 0 && shouldRunContinuousPlan(lastContinuous, continuousInterval)) {
    const planResult = await createPlan({
      userId,
      goals,
      context,
      strategy: strategist,
      pendingEmails: perception.pendingEmails,
      openTasks: perception.openTasks,
      upcomingEvents: perception.upcomingEvents,
      recentActions: perception.recentActions,
      planType: 'continuous'
    });
    plans.push(planResult);
  }

  const lastDaily = await getLastPlanTime(userId, 'daily');
  const dailyInterval = getDailyPlanInterval(goals.personalityMode);
  if (shouldRunDailyPlan(lastDaily, dailyInterval)) {
    const dailyPlan = await createPlan({
      userId,
      goals,
      context,
      strategy: strategist,
      pendingEmails: [],
      openTasks: perception.openTasks,
      upcomingEvents: perception.upcomingEvents,
      recentActions: perception.recentActions,
      planType: 'daily'
    });
    plans.push(dailyPlan);
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
      const retryPlan = await createPlan({
        userId,
        goals,
        context,
        strategy: strategist,
        pendingEmails: perception.pendingEmails,
        openTasks: perception.openTasks,
        upcomingEvents: perception.upcomingEvents,
        recentActions: perception.recentActions,
        planType: 'continuous'
      });
      await markPlanStatus(retryPlan.planId, 'running');
      await executePlan({ userId, plan: retryPlan.plan as any, goals, planId: retryPlan.planId, contextSummary: context.summary });
      await markPlanStatus(retryPlan.planId, 'completed');
    }
  }

  if (perception.pendingEmails.length > 0) {
    const emailIds = perception.pendingEmails.map((e) => e.id);
    await query(
      `UPDATE emails SET status = 'processed', processed_at = now(), updated_at = now() WHERE id = ANY($1::uuid[])`,
      [emailIds]
    );
  }

  await generateDailyActivityFeed({ userId, goals });

  return { plans: plans.length };
};
