import { query } from '../db/index.js';
import { planAgentActions } from '../services/ai.js';
import type { AgentGoalState } from './types.js';
import type { BuiltContext } from './contextBuilder.js';
import { getStrategistState, type StrategistState } from './strategist.js';
import { getUserPreferences } from '../services/preferences.js';
import { getIntentState } from './intent.js';
import { getEnergyContext } from './energy.js';

export const createPlan = async (input: {
  userId: string;
  goals: AgentGoalState;
  context: BuiltContext;
  pendingEmails: Array<{ id: string; subject: string; sender: string; receivedAt?: string | null; preview?: string }>;
  openTasks: Array<{ id: string; title: string; dueAt?: string | null; category?: string | null }>;
  upcomingEvents: Array<{ id: string; subject: string; start?: string | null }>;
  recentActions: Array<{ id: string; action_type: string; status: string }>;
  planType: 'continuous' | 'daily';
  strategy?: StrategistState;
  sessionId?: string;
}) => {
  const strategist = input.strategy ?? await getStrategistState(input.userId);
  const priorityWeights = await getUserPreferences(input.userId);
  const intents = await getIntentState(input.userId, input.sessionId);
  const energy = await getEnergyContext(input.userId);

  const plan = await planAgentActions({
    goals: input.goals.goals,
    autopilotLevel: input.goals.autopilotLevel,
    context: input.context.summary,
    planningAggressiveness: strategist.planningAggressiveness,
    focusAreas: strategist.focusAreas,
    priorityWeights,
    strategistNotes: strategist.notes,
    priorityAdjustments: strategist.priorityAdjustments,
    intentSummary: intents.intents.join(', ') || 'none',
    sessionOverrides: intents.sessionOverrides.join(', ') || 'none',
    priorityBoosts: intents.priorityBoosts,
    energyLevel: energy.energyLevel,
    bestTime: energy.bestTime,
    personalityMode: input.goals.personalityMode,
    pendingEmails: input.pendingEmails,
    openTasks: input.openTasks,
    upcomingEvents: input.upcomingEvents,
    recentActions: input.recentActions
  });

  const result = await query<{ id: string }>(
    `INSERT INTO agent_plans (user_id, plan_type, plan, status)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [input.userId, input.planType, JSON.stringify(plan.plan), 'pending']
  );

  return { planId: result.rows[0].id, plan };
};

export const markPlanStatus = async (planId: string, status: string) => {
  await query(
    `UPDATE agent_plans SET status = $1, updated_at = now() WHERE id = $2`,
    [status, planId]
  );
};

export const getLastPlanTime = async (userId: string, planType: string) => {
  const result = await query<{ created_at: string }>(
    `SELECT created_at FROM agent_plans WHERE user_id = $1 AND plan_type = $2 ORDER BY created_at DESC LIMIT 1`,
    [userId, planType]
  );
  return result.rows[0]?.created_at ?? null;
};
