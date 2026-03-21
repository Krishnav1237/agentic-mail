import { createHash } from 'crypto';
import { query } from '../db/index.js';
import type { PlannedAction } from './types.js';

const hashPayload = (payload: unknown) => {
  const json = JSON.stringify(payload ?? {});
  return createHash('sha256').update(json).digest('hex');
};

export const createAgentAction = async (input: {
  userId: string;
  emailId: string;
  action: PlannedAction;
  statusOverride?: string;
}): Promise<string | null> => {
  const idempotencyKey = hashPayload({ type: input.action.type, payload: input.action.payload ?? {} });

  const existing = await query<{ id: string }>(
    `SELECT id FROM agent_actions WHERE user_id = $1 AND email_id = $2 AND action_type = $3 AND idempotency_key = $4`,
    [input.userId, input.emailId, input.action.type, idempotencyKey]
  );

  if (existing.rowCount) return null;

  const payloadWithMeta = {
    ...(input.action.payload ?? {}),
    __preview: input.action.preview ?? null,
    __meta: {
      base_confidence: input.action.baseConfidence ?? input.action.confidence,
      adjusted_confidence: input.action.adjustedConfidence ?? input.action.confidence,
      historical_accuracy: input.action.historicalAccuracy ?? null,
      recency_weight: input.action.recencyWeight ?? null,
      context_similarity: input.action.contextSimilarity ?? null
    }
  };

  const result = await query<{ id: string }>(
    `INSERT INTO agent_actions (user_id, email_id, workflow_id, workflow_name, action_type, action_payload, confidence, decision_reason, status, requires_approval, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      input.userId,
      input.emailId,
      input.action.workflowId ?? null,
      input.action.workflow ?? null,
      input.action.type,
      JSON.stringify(payloadWithMeta),
      input.action.adjustedConfidence ?? input.action.confidence,
      input.action.reason,
      input.statusOverride ?? input.action.execution,
      input.action.requiresApproval,
      idempotencyKey
    ]
  );

  return result.rows[0].id;
};

export const updateAgentActionStatus = async (actionId: string, status: string, metadata?: Record<string, unknown>) => {
  await query(
    `UPDATE agent_actions SET status = $1, action_payload = COALESCE(action_payload, '{}'::jsonb) || $2::jsonb, updated_at = now() WHERE id = $3`,
    [status, JSON.stringify(metadata ?? {}), actionId]
  );
};
