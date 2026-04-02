import { query } from '../db/index.js';
import type { AgentPlan } from '../ai/schemas.js';

export const persistPlan = async (input: {
  userId: string;
  planType: 'continuous' | 'daily';
  plan: AgentPlan;
  metadata?: Record<string, unknown>;
}) => {
  const result = await query<{ id: string }>(
    `INSERT INTO agent_plans (user_id, plan_type, plan, status)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [
      input.userId,
      input.planType,
      JSON.stringify({
        ...input.plan,
        metadata: input.metadata ?? {},
      }),
      'pending',
    ]
  );

  return { planId: result.rows[0].id, plan: input.plan };
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
