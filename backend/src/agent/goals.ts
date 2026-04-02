import { query } from '../db/index.js';
import type { AgentGoalState } from './types.js';

type RawGoal = string | { goal: string; weight: number };

const normalizeGoals = (
  goals: RawGoal[] | null | undefined
): Array<{ goal: string; weight: number }> => {
  if (!goals) return [];
  return goals.map((entry) => {
    if (typeof entry === 'string') return { goal: entry, weight: 1 };
    return { goal: entry.goal, weight: entry.weight ?? 1 };
  });
};

export const getUserGoals = async (userId: string): Promise<AgentGoalState> => {
  const result = await query<{
    goals: RawGoal[];
    autopilot_level: number;
    personality_mode: string | null;
  }>(
    'SELECT goals, autopilot_level, personality_mode FROM user_goals WHERE user_id = $1',
    [userId]
  );

  if (result.rowCount === 0) {
    await query(
      'INSERT INTO user_goals (user_id, goals, autopilot_level, personality_mode) VALUES ($1, $2, $3, $4)',
      [userId, JSON.stringify([]), 0, 'proactive']
    );
    return { goals: [], autopilotLevel: 0, personalityMode: 'proactive' };
  }

  const row = result.rows[0];
  return {
    goals: normalizeGoals(row.goals),
    autopilotLevel: (row.autopilot_level ?? 0) as 0 | 1 | 2,
    personalityMode: (row.personality_mode ?? 'proactive') as
      | 'chill'
      | 'proactive'
      | 'aggressive',
  };
};

export const updateUserGoals = async (
  userId: string,
  input: {
    goals: Array<{ goal: string; weight: number }>;
    autopilotLevel: 0 | 1 | 2;
    personalityMode?: 'chill' | 'proactive' | 'aggressive';
  }
) => {
  await query(
    `INSERT INTO user_goals (user_id, goals, autopilot_level, personality_mode)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET goals = EXCLUDED.goals, autopilot_level = EXCLUDED.autopilot_level, personality_mode = EXCLUDED.personality_mode, updated_at = now()`,
    [
      userId,
      JSON.stringify(input.goals),
      input.autopilotLevel,
      input.personalityMode ?? 'proactive',
    ]
  );
};
