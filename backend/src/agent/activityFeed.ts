import { query } from '../db/index.js';
import { generateActivityFeed } from '../services/ai.js';
import type { AgentGoalState } from './types.js';
import { getStrategistState } from './strategist.js';
import { logAgentStep } from './logs.js';

const todayDate = () => new Date().toISOString().slice(0, 10);

export const generateDailyActivityFeed = async (input: { userId: string; goals: AgentGoalState }) => {
  const summaryDate = todayDate();
  try {
    const existing = await query<{ id: string }>(
      `SELECT id FROM agent_activity_feed WHERE user_id = $1 AND summary_date = $2`,
      [input.userId, summaryDate]
    );

    if (existing.rowCount) {
      return existing.rows[0].id;
    }

    const actionsResult = await query<{ action_type: string; status: string; count: number }>(
      `SELECT action_type, status, COUNT(*)::int as count
       FROM agent_actions
       WHERE user_id = $1
         AND created_at >= now() - interval '24 hours'
       GROUP BY action_type, status`,
      [input.userId]
    );

    const actionsSummary = actionsResult.rows
      .map((row) => `${row.action_type}:${row.status}:${row.count}`)
      .join(', ') || 'none';

    const reflectionsResult = await query<{ suggestion: string | null }>(
      `SELECT reflection->>'improvement_suggestion' as suggestion
       FROM agent_reflections
       WHERE user_id = $1
         AND created_at >= now() - interval '24 hours'
       ORDER BY created_at DESC
       LIMIT 10`,
      [input.userId]
    );

    const reflectionsSummary = reflectionsResult.rows
      .map((row) => row.suggestion)
      .filter(Boolean)
      .join(' | ') || 'none';

    const strategist = await getStrategistState(input.userId);

    const feed = await generateActivityFeed({
      goals: input.goals.goals,
      actionsSummary,
      reflectionsSummary,
      strategistNotes: strategist.notes ?? ''
    });

    const result = await query<{ id: string }>(
      `INSERT INTO agent_activity_feed (user_id, summary_date, summary)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [input.userId, summaryDate, JSON.stringify(feed)]
    );

    return result.rows[0].id;
  } catch (error) {
    await logAgentStep({
      userId: input.userId,
      step: 'activity_feed_error',
      message: (error as Error).message
    });
    return null;
  }
};

export const getLatestActivityFeed = async (userId: string) => {
  const result = await query<{ summary_date: string; summary: any }>(
    `SELECT summary_date, summary
     FROM agent_activity_feed
     WHERE user_id = $1
     ORDER BY summary_date DESC
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] ?? null;
};
