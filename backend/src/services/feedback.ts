import { query } from '../db/index.js';
import { getUserPreferences, updateUserPreferences } from './preferences.js';

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const recordFeedback = async (input: {
  userId: string;
  emailId?: string | null;
  action: string;
  category?: string | null;
  metadata?: Record<string, unknown>;
}) => {
  await query(
    `INSERT INTO user_behavior_logs (user_id, email_id, action, metadata)
     VALUES ($1, $2, $3, $4)`,
    [
      input.userId,
      input.emailId ?? null,
      input.action,
      JSON.stringify({
        ...(input.metadata ?? {}),
        category: input.category ?? undefined,
      }),
    ]
  );

  if (input.action === 'thumbs_up' || input.action === 'thumbs_down') {
    const weights = await getUserPreferences(input.userId);
    const category = input.category ?? 'other';
    const delta = input.action === 'thumbs_up' ? 0.05 : -0.05;
    weights[category] = clamp((weights[category] ?? 1) + delta, 0.2, 2);
    await updateUserPreferences(input.userId, weights);
  }
};
