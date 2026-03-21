import { query } from '../db/index.js';
import { getUserPreferences, updateUserPreferences } from '../services/preferences.js';
import { generateStrategistAdjustments } from '../services/ai.js';
import { getMemory, upsertMemory } from '../memory/store.js';
import { buildMemorySummary } from '../memory/summary.js';
import { logAgentStep } from './logs.js';
import type { AgentGoalState } from './types.js';

export type StrategistState = {
  planningAggressiveness: 'low' | 'medium' | 'high';
  focusAreas: string[];
  priorityAdjustments: Record<string, number>;
  notes: string;
  updatedAt: string;
};

const STRATEGIST_INTERVAL_HOURS = 12;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const shouldRunStrategist = (lastRun: string | null) => {
  if (!lastRun) return true;
  const last = new Date(lastRun).getTime();
  const diffHours = (Date.now() - last) / (1000 * 60 * 60);
  return diffHours >= STRATEGIST_INTERVAL_HOURS;
};

export const getStrategistState = async (userId: string): Promise<StrategistState> => {
  const state = await getMemory<StrategistState>(userId, 'long', 'strategist_state');
  if (state) return state;
  return {
    planningAggressiveness: 'medium',
    focusAreas: [],
    priorityAdjustments: {},
    notes: '',
    updatedAt: new Date(0).toISOString()
  };
};

export const runStrategist = async (input: { userId: string; goals: AgentGoalState }) => {
  const lastRun = await getMemory<string>(input.userId, 'short', 'strategist_last_run');
  if (!shouldRunStrategist(lastRun)) {
    return getStrategistState(input.userId);
  }

  try {
    const preferences = await getUserPreferences(input.userId);
    const memorySummary = await buildMemorySummary(input.userId);

    const recentActionsResult = await query<{ action_type: string; status: string }>(
      `SELECT action_type, status
       FROM agent_actions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 30`,
      [input.userId]
    );

    const feedbackResult = await query<{ status: string; count: number }>(
      `SELECT status, COUNT(*)::int as count
       FROM agent_actions
       WHERE user_id = $1
         AND status IN ('approved', 'accepted', 'rejected', 'always_allow', 'modified')
         AND created_at >= now() - interval '30 days'
       GROUP BY status`,
      [input.userId]
    );

    const behaviorResult = await query<{ action: string; count: number }>(
      `SELECT action, COUNT(*)::int as count
       FROM user_behavior_logs
       WHERE user_id = $1
         AND created_at >= now() - interval '30 days'
       GROUP BY action`,
      [input.userId]
    );

    const behaviorSummary = behaviorResult.rows.map((row) => `${row.action}:${row.count}`).join(', ') || 'none';

    const strategist = await generateStrategistAdjustments({
      goals: input.goals.goals,
      behaviorSummary,
      preferences,
      recentActions: recentActionsResult.rows,
      recentFeedback: feedbackResult.rows,
      memorySummary
    });

    const updatedWeights = { ...preferences };
    for (const [key, value] of Object.entries(strategist.priority_weight_adjustments ?? {})) {
      const multiplier = clamp(value, 0.7, 1.3);
      updatedWeights[key] = clamp((updatedWeights[key] ?? 1) * multiplier, 0.2, 2);
    }

    await updateUserPreferences(input.userId, updatedWeights);

    const state: StrategistState = {
      planningAggressiveness: strategist.planning_aggressiveness,
      focusAreas: strategist.focus_areas ?? [],
      priorityAdjustments: strategist.priority_weight_adjustments ?? {},
      notes: strategist.notes ?? '',
      updatedAt: new Date().toISOString()
    };

    await upsertMemory(input.userId, 'long', 'strategist_state', state);
    await upsertMemory(input.userId, 'short', 'strategist_last_run', state.updatedAt);

    await logAgentStep({
      userId: input.userId,
      step: 'strategist',
      message: strategist.notes ?? 'Strategist updated priorities',
      data: state
    });

    return state;
  } catch (error) {
    await logAgentStep({
      userId: input.userId,
      step: 'strategist_error',
      message: (error as Error).message
    });
    return getStrategistState(input.userId);
  }
};
