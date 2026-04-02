import { query } from '../db/index.js';

export const logAgentStep = async (input: {
  userId: string;
  emailId?: string | null;
  step: string;
  message?: string;
  data?: Record<string, unknown>;
}) => {
  await query(
    `INSERT INTO agent_logs (user_id, email_id, step, message, data)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      input.userId,
      input.emailId ?? null,
      input.step,
      input.message ?? null,
      JSON.stringify(input.data ?? {}),
    ]
  );
};
