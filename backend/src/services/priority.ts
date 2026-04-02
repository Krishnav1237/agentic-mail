import { query } from '../db/index.js';
import { getUserPreferences } from './preferences.js';

const actionWeights: Record<string, number> = {
  open: 0.1,
  click: 0.2,
  complete: 0.5,
  thumbs_up: 0.6,
  dismiss: -0.3,
  thumbs_down: -0.6,
  snooze: -0.1,
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const computeBehaviorWeight = async (
  userId: string,
  category?: string
) => {
  const result = await query<{ action: string; count: number }>(
    `SELECT action, COUNT(*)::int as count
     FROM user_behavior_logs
     WHERE user_id = $1
       AND created_at >= now() - interval '30 days'
       AND ($2::text IS NULL OR metadata->>'category' = $2)
     GROUP BY action`,
    [userId, category ?? null]
  );

  const weighted = result.rows.reduce((sum, row) => {
    const weight = actionWeights[row.action] ?? 0;
    return sum + weight * row.count;
  }, 0);

  const normalized = clamp(weighted / 10, -0.5, 0.5);
  return clamp(1 + normalized, 0.8, 1.2);
};

export const computePriorityScore = async (input: {
  userId: string;
  aiScore: number;
  category: string;
}) => {
  const preferences = await getUserPreferences(input.userId);
  const userWeight = preferences[input.category] ?? 1.0;
  const behaviorWeight = await computeBehaviorWeight(
    input.userId,
    input.category
  );
  const score = input.aiScore * userWeight * behaviorWeight;
  return clamp(score, 0, 5);
};
