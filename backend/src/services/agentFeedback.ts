import { query } from '../db/index.js';
import { getUserPreferences, updateUserPreferences } from './preferences.js';
import { recordAlwaysAllow } from '../agent/policy.js';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const recordAgentFeedback = async (input: {
  userId: string;
  actionId: string;
  status: 'accepted' | 'approved' | 'approve' | 'rejected' | 'reject' | 'modified' | 'always_allow';
  notes?: string;
  metadata?: Record<string, unknown>;
}) => {
  const normalizedStatus =
    input.status === 'approve' ? 'approved'
      : input.status === 'reject' ? 'rejected'
      : input.status === 'accepted' ? 'approved'
      : input.status;

  const actionResult = await query<{ action_payload: Record<string, unknown>; action_type: string }>(
    'SELECT action_payload, action_type FROM agent_actions WHERE id = $1 AND user_id = $2',
    [input.actionId, input.userId]
  );

  await query(
    `UPDATE agent_actions SET status = $1, updated_at = now() WHERE id = $2`,
    [normalizedStatus, input.actionId]
  );

  await query(
    `INSERT INTO user_behavior_logs (user_id, action, metadata)
     VALUES ($1, $2, $3)`,
    [
      input.userId,
      `agent_${normalizedStatus}`,
      JSON.stringify({ actionId: input.actionId, ...(input.metadata ?? {}), notes: input.notes ?? null })
    ]
  );

  const payload = actionResult.rows[0]?.action_payload ?? {};
  const actionType = actionResult.rows[0]?.action_type;
  const category = (payload as any).category as string | undefined;
  if (category) {
    const weights = await getUserPreferences(input.userId);
    const delta = normalizedStatus === 'approved' || normalizedStatus === 'always_allow' ? 0.03 : normalizedStatus === 'rejected' ? -0.03 : 0;
    if (delta !== 0) {
      weights[category] = clamp((weights[category] ?? 1) + delta, 0.2, 2);
      await updateUserPreferences(input.userId, weights);
    }
  }

  if (normalizedStatus === 'always_allow') {
    const fallbackType = actionType ?? (input.metadata?.['action_type'] as string | undefined);
    if (fallbackType) {
      await recordAlwaysAllow(input.userId, fallbackType);
    }
  }
};
