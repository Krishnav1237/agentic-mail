import { query } from '../db/index.js';

export type PreferenceWeights = Record<string, number>;

const defaultWeights: PreferenceWeights = {
  assignment: 1.3,
  internship: 1.4,
  event: 1.0,
  academic: 1.2,
  personal: 0.9,
  spam: 0.2,
  other: 1.0,
};

export const getUserPreferences = async (
  userId: string
): Promise<PreferenceWeights> => {
  const result = await query<{ weights: PreferenceWeights }>(
    'SELECT weights FROM user_preferences WHERE user_id = $1',
    [userId]
  );

  if (result.rowCount === 0) {
    await query(
      'INSERT INTO user_preferences (user_id, weights) VALUES ($1, $2)',
      [userId, JSON.stringify(defaultWeights)]
    );
    return defaultWeights;
  }

  return result.rows[0].weights ?? defaultWeights;
};

export const updateUserPreferences = async (
  userId: string,
  weights: PreferenceWeights
) => {
  await query(
    `INSERT INTO user_preferences (user_id, weights)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET weights = EXCLUDED.weights, updated_at = now()`,
    [userId, JSON.stringify(weights)]
  );
};
