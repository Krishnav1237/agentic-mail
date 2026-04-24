import { query, withTransaction } from '../db/index.js';
import { consumeUsageMetric } from './billing.js';

export type FollowupPolicy = {
  mode: 'suggest' | 'draft' | 'auto_send';
  defaultDelayDays: number;
  recruiterDelayDays: number;
  cooldownHours: number;
  autoSendEnabled: boolean;
  allowedSenderDomains: string[];
  blockedSenderDomains: string[];
  quietHours: Record<string, unknown>;
};

const defaultPolicy: FollowupPolicy = {
  mode: 'suggest',
  defaultDelayDays: 3,
  recruiterDelayDays: 2,
  cooldownHours: 24,
  autoSendEnabled: false,
  allowedSenderDomains: [],
  blockedSenderDomains: [],
  quietHours: {},
};

const parseJson = <T>(value: unknown, fallback: T): T => {
  if (!value) return fallback;
  if (typeof value === 'object') return value as T;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
};

export const getFollowupPolicy = async (userId: string): Promise<FollowupPolicy> => {
  const result = await query<{
    mode: string;
    default_delay_days: number;
    recruiter_delay_days: number;
    cooldown_hours: number;
    auto_send_enabled: boolean;
    allowed_sender_domains: unknown;
    blocked_sender_domains: unknown;
    quiet_hours: unknown;
  }>(
    `SELECT mode, default_delay_days, recruiter_delay_days, cooldown_hours,
            auto_send_enabled, allowed_sender_domains, blocked_sender_domains, quiet_hours
     FROM followup_policies
     WHERE user_id = $1`,
    [userId]
  );

  const row = result.rows[0];
  if (!row) return defaultPolicy;

  return {
    mode: (row.mode as FollowupPolicy['mode']) || 'suggest',
    defaultDelayDays: row.default_delay_days,
    recruiterDelayDays: row.recruiter_delay_days,
    cooldownHours: row.cooldown_hours,
    autoSendEnabled: row.auto_send_enabled,
    allowedSenderDomains: parseJson<string[]>(row.allowed_sender_domains, []),
    blockedSenderDomains: parseJson<string[]>(row.blocked_sender_domains, []),
    quietHours: parseJson<Record<string, unknown>>(row.quiet_hours, {}),
  };
};

export const updateFollowupPolicy = async (
  userId: string,
  policy: FollowupPolicy
) => {
  await query(
    `INSERT INTO followup_policies (
      user_id, mode, default_delay_days, recruiter_delay_days, cooldown_hours,
      auto_send_enabled, allowed_sender_domains, blocked_sender_domains, quiet_hours,
      created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())
    ON CONFLICT (user_id)
    DO UPDATE SET
      mode = EXCLUDED.mode,
      default_delay_days = EXCLUDED.default_delay_days,
      recruiter_delay_days = EXCLUDED.recruiter_delay_days,
      cooldown_hours = EXCLUDED.cooldown_hours,
      auto_send_enabled = EXCLUDED.auto_send_enabled,
      allowed_sender_domains = EXCLUDED.allowed_sender_domains,
      blocked_sender_domains = EXCLUDED.blocked_sender_domains,
      quiet_hours = EXCLUDED.quiet_hours,
      updated_at = now()`,
    [
      userId,
      policy.mode,
      policy.defaultDelayDays,
      policy.recruiterDelayDays,
      policy.cooldownHours,
      policy.autoSendEnabled,
      JSON.stringify(policy.allowedSenderDomains),
      JSON.stringify(policy.blockedSenderDomains),
      JSON.stringify(policy.quietHours),
    ]
  );
};

export const listFollowupTimeline = async (input: {
  userId: string;
  limit: number;
  offset: number;
}) => {
  const count = await query<{ total: number }>(
    `SELECT COUNT(*)::int as total
     FROM followup_schedules
     WHERE user_id = $1`,
    [input.userId]
  );

  const list = await query<{
    id: string;
    action: string;
    status: string;
    scheduled_for: string;
    sent_at: string | null;
    cancelled_at: string | null;
    metadata: unknown;
    thread_id: string | null;
    thread_type: string | null;
    state: string | null;
    subject: string | null;
    sender_email: string | null;
  }>(
    `SELECT s.id, s.action, s.status, s.scheduled_for, s.sent_at, s.cancelled_at,
            s.metadata,
            t.thread_id, t.thread_type, t.state,
            e.subject, e.sender_email
     FROM followup_schedules s
     LEFT JOIN followup_threads t ON t.id = s.thread_state_id
     LEFT JOIN emails e ON e.id = s.email_id
     WHERE s.user_id = $1
     ORDER BY s.scheduled_for DESC
     LIMIT $2 OFFSET $3`,
    [input.userId, input.limit, input.offset]
  );

  return {
    items: list.rows.map((row) => ({
      ...row,
      metadata: parseJson<Record<string, unknown>>(row.metadata, {}),
    })),
    total: count.rows[0]?.total ?? 0,
    limit: input.limit,
    offset: input.offset,
  };
};

const normalizeDomainList = (domains: string[]) =>
  domains
    .map((domain) => domain.trim().toLowerCase())
    .filter((domain) => domain.length > 0);

export const refreshFollowupSchedulesForUser = async (userId: string) => {
  const policy = await getFollowupPolicy(userId);
  const blockedDomains = normalizeDomainList(policy.blockedSenderDomains);
  const allowedDomains = normalizeDomainList(policy.allowedSenderDomains);

  const threads = await query<{
    email_id: string;
    thread_id: string;
    sender_email: string | null;
    received_at: string | null;
  }>(
    `SELECT DISTINCT ON (thread_id)
        id AS email_id,
        thread_id,
        sender_email,
        received_at
     FROM emails
     WHERE user_id = $1
       AND thread_id IS NOT NULL
     ORDER BY thread_id, received_at DESC NULLS LAST`,
    [userId]
  );

  let upsertedThreads = 0;
  let createdSchedules = 0;
  const now = Date.now();
  const cooldownMs = Math.max(1, policy.cooldownHours) * 60 * 60 * 1000;

  for (const row of threads.rows) {
    const senderDomain = row.sender_email?.split('@')[1]?.toLowerCase() ?? '';
    if (blockedDomains.includes(senderDomain)) continue;
    if (allowedDomains.length && !allowedDomains.includes(senderDomain)) continue;

    const baseMs = row.received_at ? new Date(row.received_at).getTime() : now;
    const delayDays = senderDomain.includes('recruit')
      ? policy.recruiterDelayDays
      : policy.defaultDelayDays;
    const scheduledMs = Math.max(baseMs + delayDays * 24 * 60 * 60 * 1000, now + cooldownMs);
    const scheduledFor = new Date(scheduledMs).toISOString();
    const inboundStr = row.received_at ? new Date(row.received_at).toISOString() : scheduledFor;
    const inboundKey = inboundStr.slice(0, 19);
    const idempotencyKey = `${row.thread_id}:draft_followup:${row.email_id}:${inboundKey}`;

    const thread = await query<{ id: string }>(
      `INSERT INTO followup_threads (
        user_id, thread_id, email_id, thread_type, state, last_contact_at, last_inbound_at,
        next_action_at, metadata, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, 'open', $5, $5, $6, $7, now(), now())
      ON CONFLICT (user_id, thread_id)
      DO UPDATE SET
        email_id = EXCLUDED.email_id,
        thread_type = EXCLUDED.thread_type,
        last_contact_at = EXCLUDED.last_contact_at,
        last_inbound_at = EXCLUDED.last_inbound_at,
        next_action_at = EXCLUDED.next_action_at,
        metadata = followup_threads.metadata || EXCLUDED.metadata,
        updated_at = now()
      RETURNING id`,
      [
        userId,
        row.thread_id,
        row.email_id,
        senderDomain.includes('recruit') ? 'recruiter' : 'general',
        row.received_at,
        scheduledFor,
        JSON.stringify({ mode: policy.mode }),
      ]
    );
    upsertedThreads += 1;

    const existing = await query<{ id: string }>(
      `SELECT id
       FROM followup_schedules
       WHERE user_id = $1
         AND thread_state_id = $2
         AND status IN ('pending', 'suggested')
       LIMIT 1`,
      [userId, thread.rows[0].id]
    );
    if (existing.rowCount) continue;

    const created = await query<{ id: string }>(
      `INSERT INTO followup_schedules (
        user_id, thread_state_id, email_id, action, status, scheduled_for, idempotency_key, metadata, created_at, updated_at
      ) VALUES ($1, $2, $3, 'draft_followup', 'pending', $4, $5, $6, now(), now())
      ON CONFLICT (user_id, idempotency_key) DO NOTHING
      RETURNING id`,
      [
        userId,
        thread.rows[0].id,
        row.email_id,
        scheduledFor,
        idempotencyKey,
        JSON.stringify({ generatedBy: 'refreshFollowupSchedulesForUser' }),
      ]
    );
    if (created.rowCount) createdSchedules += 1;
  }

  return { upsertedThreads, createdSchedules };
};

export const runDueFollowups = async () => {
  let sent = 0;
  let suggested = 0;
  let processed = 0;

  while (true) {
    const batch = await withTransaction(async (client) => {
      const due = await client.query<{
        id: string;
        user_id: string;
        status: string;
        action: string;
      }>(
        `SELECT id, user_id, status, action
         FROM followup_schedules
         WHERE status = 'pending'
           AND scheduled_for <= now()
         ORDER BY scheduled_for ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 100`
      );
      if (!due.rowCount) return [];

      for (const item of due.rows) {
        const policy = await getFollowupPolicy(item.user_id);
        let nextStatus: 'sent' | 'suggested' = policy.autoSendEnabled ? 'sent' : 'suggested';
        if (nextStatus === 'sent') {
          const quota = await consumeUsageMetric({
            userId: item.user_id,
            metric: 'followups_sent',
            units: 1,
            idempotencyKey: `followup-send:${item.id}`,
            source: 'followup_scheduler',
            metadata: { action: item.action },
            enforce: true,
          });
          if (!quota.allowed) {
            nextStatus = 'suggested';
          }
        }
        await client.query(
          `UPDATE followup_schedules
           SET status = $2,
               sent_at = CASE WHEN $2 = 'sent' THEN now() ELSE sent_at END,
               updated_at = now()
           WHERE id = $1`,
          [item.id, nextStatus]
        );
        if (nextStatus === 'sent') sent += 1;
        if (nextStatus === 'suggested') suggested += 1;
      }
      return due.rows;
    });

    if (!batch.length) break;
    processed += batch.length;
  }

  return { processed, sent, suggested };
};

export const cancelFollowupSchedule = async (input: {
  userId: string;
  scheduleId: string;
}) => {
  const result = await query<{ id: string }>(
    `UPDATE followup_schedules
     SET status = 'cancelled',
         cancelled_at = now(),
         updated_at = now()
     WHERE id = $1
       AND user_id = $2
       AND status IN ('pending', 'suggested')
     RETURNING id`,
    [input.scheduleId, input.userId]
  );
  return Boolean(result.rowCount);
};

export const approveFollowupSchedule = async (input: {
  userId: string;
  scheduleId: string;
}) => {
  const schedule = await query<{ id: string; action: string; status: string }>(
    `SELECT id, action, status
     FROM followup_schedules
     WHERE id = $1
       AND user_id = $2`,
    [input.scheduleId, input.userId]
  );

  const row = schedule.rows[0];
  if (!row) return { ok: false as const, reason: 'not_found' as const };
  if (row.status === 'sent')
    return { ok: false as const, reason: 'already_sent' as const };
  if (row.status === 'cancelled')
    return { ok: false as const, reason: 'cancelled' as const };

  const quota = await consumeUsageMetric({
    userId: input.userId,
    metric: 'followups_sent',
    units: 1,
    idempotencyKey: `followup-approve:${input.scheduleId}`,
    source: 'followup_manual_approval',
    metadata: { action: row.action },
    enforce: true,
  });

  if (!quota.allowed) {
    return {
      ok: false as const,
      reason: 'quota_exhausted' as const,
      metric: 'followups_sent' as const,
      used: quota.used ?? 0,
      limit: quota.limit ?? 0,
    };
  }

  await query(
    `UPDATE followup_schedules
     SET status = 'sent',
         sent_at = now(),
         updated_at = now()
     WHERE id = $1
       AND user_id = $2`,
    [input.scheduleId, input.userId]
  );

  return { ok: true as const };
};
