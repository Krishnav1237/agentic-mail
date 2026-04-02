import { query } from '../db/index.js';

export const addEpisode = async (input: {
  userId: string;
  context: Record<string, unknown>;
  outcome: Record<string, unknown>;
}) => {
  await query(
    `INSERT INTO episodic_memory (user_id, context, outcome)
     VALUES ($1, $2, $3)`,
    [input.userId, JSON.stringify(input.context), JSON.stringify(input.outcome)]
  );
};

export const listEpisodes = async (userId: string, limit = 10) => {
  const result = await query<{
    context: any;
    outcome: any;
    created_at: string;
  }>(
    `SELECT context, outcome, created_at
     FROM episodic_memory
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
};
