import { query, withTransaction } from '../db/index.js';
import { env } from '../config/env.js';
import { normalizeRetentionDaysWithBounds } from './privacyUtils.js';

export const normalizeRetentionDays = (value: number) =>
  normalizeRetentionDaysWithBounds(
    value,
    env.dataRetentionMinDays,
    env.dataRetentionMaxDays
  );

export const getUserRetentionDays = async (userId: string) => {
  const result = await query<{ data_retention_days: number }>(
    'SELECT data_retention_days FROM users WHERE id = $1',
    [userId]
  );
  return normalizeRetentionDays(
    result.rows[0]?.data_retention_days ?? env.dataRetentionDefaultDays
  );
};

export const setUserRetentionDays = async (userId: string, days: number) => {
  const retentionDays = normalizeRetentionDays(days);
  const result = await query<{ data_retention_days: number }>(
    `UPDATE users
     SET data_retention_days = $2, updated_at = now()
     WHERE id = $1
     RETURNING data_retention_days`,
    [userId, retentionDays]
  );
  return result.rows[0]?.data_retention_days ?? retentionDays;
};

const retentionQueries = [
  `DELETE FROM emails t
   USING users u
   WHERE t.user_id = u.id
     AND t.created_at < now() - (u.data_retention_days || ' days')::interval`,
  `DELETE FROM extracted_tasks t
   USING users u
   WHERE t.user_id = u.id
     AND t.created_at < now() - (u.data_retention_days || ' days')::interval`,
  `DELETE FROM notifications t
   USING users u
   WHERE t.user_id = u.id
     AND t.created_at < now() - (u.data_retention_days || ' days')::interval`,
  `DELETE FROM user_behavior_logs t
   USING users u
   WHERE t.user_id = u.id
     AND t.created_at < now() - (u.data_retention_days || ' days')::interval`,
  `DELETE FROM agent_actions t
   USING users u
   WHERE t.user_id = u.id
     AND t.created_at < now() - (u.data_retention_days || ' days')::interval`,
  `DELETE FROM agent_plans t
   USING users u
   WHERE t.user_id = u.id
     AND t.created_at < now() - (u.data_retention_days || ' days')::interval`,
  `DELETE FROM agent_reflections t
   USING users u
   WHERE t.user_id = u.id
     AND t.created_at < now() - (u.data_retention_days || ' days')::interval`,
  `DELETE FROM decision_traces t
   USING users u
   WHERE t.user_id = u.id
     AND t.created_at < now() - (u.data_retention_days || ' days')::interval`,
  `DELETE FROM agent_activity_feed t
   USING users u
   WHERE t.user_id = u.id
     AND t.created_at < now() - (u.data_retention_days || ' days')::interval`,
  `DELETE FROM episodic_memory t
   USING users u
   WHERE t.user_id = u.id
     AND t.created_at < now() - (u.data_retention_days || ' days')::interval`,
  `DELETE FROM agent_logs t
   USING users u
   WHERE t.user_id = u.id
     AND t.created_at < now() - (u.data_retention_days || ' days')::interval`,
  `DELETE FROM llm_usage_events t
   USING users u
   WHERE t.user_id = u.id
     AND t.created_at < now() - (u.data_retention_days || ' days')::interval`,
  `DELETE FROM llm_cost_daily_aggregates t
   USING users u
   WHERE t.user_id = u.id
     AND t.created_at < now() - (u.data_retention_days || ' days')::interval`,
];

export const runRetentionCleanup = async () => {
  let deleted = 0;

  for (const sql of retentionQueries) {
    const result = await query(sql);
    deleted += result.rowCount ?? 0;
  }

  const expiredMemory = await query(
    `DELETE FROM memory_store
     WHERE expires_at IS NOT NULL
       AND expires_at <= now()`
  );
  deleted += expiredMemory.rowCount ?? 0;

  const staleMemory = await query(
    `DELETE FROM memory_store m
     USING users u
     WHERE m.user_id = u.id
       AND m.updated_at < now() - (u.data_retention_days || ' days')::interval`
  );
  deleted += staleMemory.rowCount ?? 0;

  return { deleted };
};

export const purgeUserAccount = async (userId: string, confirmEmail: string) => {
  return withTransaction(async (client) => {
    await client.query('DELETE FROM waitlist WHERE lower(email) = lower($1)', [
      confirmEmail.trim(),
    ]);

    const deleted = await client.query<{ id: string }>(
      `DELETE FROM users
       WHERE id = $1
         AND lower(email) = lower($2)
       RETURNING id`,
      [userId, confirmEmail.trim()]
    );
    if (deleted.rowCount === 0) return { deleted: false };
    return { deleted: true };
  });
};
