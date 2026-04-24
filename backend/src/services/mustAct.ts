import { query } from '../db/index.js';

export type MustActItem = {
  id: string;
  title: string;
  subject: string | null;
  sender_name: string | null;
  sender_email: string | null;
  why_reason: string | null;
  risk_tier: string;
  confidence: number;
  score: number;
  deadline_at: string | null;
  suggested_bundle: unknown;
  status: string;
  deferred_until: string | null;
  created_at: string;
};

export const recomputeMustActForUser = async (userId: string) => {
  const result = await query<{ upserted: number }>(
    `WITH candidates AS (
      SELECT
        t.id AS task_id,
        t.title,
        t.due_at,
        t.category,
        t.priority_score::float AS priority_score,
        e.id AS email_id,
        e.subject,
        e.sender_name,
        e.sender_email,
        CASE
          WHEN t.due_at IS NULL THEN 0
          ELSE GREATEST(
            0,
            4 - GREATEST(EXTRACT(EPOCH FROM (t.due_at - now())) / 86400.0, 0)
          )
        END AS due_boost,
        CASE WHEN t.category = 'internship' THEN 2
             WHEN t.category = 'event' THEN 1
             ELSE 0 END AS category_boost,
        CASE WHEN lower(coalesce(e.sender_email, '')) LIKE '%recruit%' THEN 1.5 ELSE 0 END AS sender_boost
      FROM extracted_tasks t
      JOIN emails e ON e.id = t.email_id
      WHERE t.user_id = $1
        AND t.status = 'open'
        AND (
          t.priority_score >= 2
          OR t.due_at <= now() + interval '7 days'
          OR t.category IN ('internship', 'event')
        )
      ORDER BY t.priority_score DESC, t.due_at ASC NULLS LAST
      LIMIT 200
    ),
    scored AS (
      SELECT
        *,
        round((priority_score + due_boost + category_boost + sender_boost)::numeric, 4) AS score,
        CASE WHEN (priority_score + due_boost + category_boost + sender_boost) >= 8.5 THEN 'high'
             WHEN (priority_score + due_boost + category_boost + sender_boost) >= 6 THEN 'medium'
             ELSE 'low' END AS risk_tier,
        CASE WHEN priority_score >= 4 THEN 0.9
             WHEN priority_score >= 2.5 THEN 0.75
             ELSE 0.6 END AS confidence,
        CASE
          WHEN due_at IS NOT NULL AND category = 'internship' AND lower(coalesce(sender_email, '')) LIKE '%recruit%'
            THEN 'deadline approaching + internship pipeline relevance + high-value recruiter sender'
          WHEN due_at IS NOT NULL AND category = 'internship'
            THEN 'deadline approaching + internship pipeline relevance'
          WHEN due_at IS NOT NULL AND lower(coalesce(sender_email, '')) LIKE '%recruit%'
            THEN 'deadline approaching + high-value recruiter sender'
          WHEN category = 'internship' AND lower(coalesce(sender_email, '')) LIKE '%recruit%'
            THEN 'internship pipeline relevance + high-value recruiter sender'
          WHEN due_at IS NOT NULL THEN 'deadline approaching'
          WHEN category = 'internship' THEN 'internship pipeline relevance'
          WHEN lower(coalesce(sender_email, '')) LIKE '%recruit%' THEN 'high-value recruiter sender'
          ELSE 'high-confidence actionable item'
        END AS why_reason,
        CASE
          WHEN category = 'internship' THEN '["draft_reply","schedule_followup","create_calendar_event"]'::jsonb
          WHEN category = 'event' THEN '["create_calendar_event","create_task","label_email"]'::jsonb
          ELSE '["create_task","draft_reply"]'::jsonb
        END AS suggested_bundle
      FROM candidates
    ),
    upserted_rows AS (
      INSERT INTO must_act_items (
        user_id, email_id, task_id, source_type, title, subject, sender_name, sender_email,
        why_reason, risk_tier, confidence, score, deadline_at,
        suggested_bundle, status, expires_at, created_at, updated_at
      )
      SELECT
        $1,
        email_id,
        task_id,
        'task',
        title,
        subject,
        sender_name,
        sender_email,
        why_reason,
        risk_tier,
        confidence,
        score,
        due_at,
        suggested_bundle,
        'open',
        now() + interval '30 days',
        now(),
        now()
      FROM scored
      ON CONFLICT (user_id, task_id) WHERE task_id IS NOT NULL
      DO UPDATE SET
        title = EXCLUDED.title,
        subject = EXCLUDED.subject,
        sender_name = EXCLUDED.sender_name,
        sender_email = EXCLUDED.sender_email,
        why_reason = EXCLUDED.why_reason,
        risk_tier = EXCLUDED.risk_tier,
        confidence = EXCLUDED.confidence,
        score = EXCLUDED.score,
        deadline_at = EXCLUDED.deadline_at,
        suggested_bundle = EXCLUDED.suggested_bundle,
        updated_at = now()
      RETURNING id
    )
    SELECT COUNT(*)::int AS upserted FROM upserted_rows`,
    [userId]
  );

  await query(
    `UPDATE must_act_items
     SET status = 'expired', updated_at = now()
     WHERE user_id = $1
       AND status = 'open'
       AND task_id IS NOT NULL
       AND task_id NOT IN (
         SELECT id FROM extracted_tasks WHERE user_id = $1 AND status = 'open'
       )`,
    [userId]
  );

  return { upserted: result.rows[0]?.upserted ?? 0 };
};

export const listMustAct = async (input: {
  userId: string;
  limit: number;
  offset: number;
  status?: string;
}) => {
  const conditions = ['user_id = $1'];
  const params: Array<string | number> = [input.userId];
  const addParam = (value: string | number) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (input.status) {
    conditions.push(`status = ${addParam(input.status)}`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const count = await query<{ total: number }>(
    `SELECT COUNT(*)::int as total FROM must_act_items ${where}`,
    params
  );

  const list = await query<MustActItem>(
    `SELECT id, title, subject, sender_name, sender_email, why_reason, risk_tier,
            confidence::float as confidence, score::float as score, deadline_at,
            suggested_bundle, status, deferred_until, created_at
     FROM must_act_items
     ${where}
     ORDER BY score DESC, deadline_at ASC NULLS LAST, created_at DESC
     LIMIT $${params.length + 1}
     OFFSET $${params.length + 2}`,
    [...params, input.limit, input.offset]
  );

  return {
    items: list.rows,
    total: count.rows[0]?.total ?? 0,
    limit: input.limit,
    offset: input.offset,
  };
};

export const updateMustAct = async (input: {
  userId: string;
  mustActId: string;
  status: 'approved' | 'rejected' | 'deferred' | 'edited';
  deferredUntil?: string;
  actionResult?: Record<string, unknown>;
}) => {
  const result = await query<{ id: string }>(
    `UPDATE must_act_items
     SET status = $3,
         deferred_until = CASE WHEN $3 = 'deferred' THEN $4::timestamptz ELSE NULL END,
         acted_at = now(),
         action_result = COALESCE($5::jsonb, action_result),
         updated_at = now()
     WHERE id = $1
       AND user_id = $2
     RETURNING id`,
    [
      input.mustActId,
      input.userId,
      input.status,
      input.deferredUntil ?? null,
      input.actionResult ? JSON.stringify(input.actionResult) : null,
    ]
  );

  return Boolean(result.rowCount);
};

export const reopenMustAct = async (input: { userId: string; mustActId: string }) => {
  const result = await query<{ id: string }>(
    `UPDATE must_act_items
     SET status = 'open',
         deferred_until = NULL,
         acted_at = NULL,
         action_result = NULL,
         updated_at = now()
     WHERE id = $1
       AND user_id = $2
     RETURNING id`,
    [input.mustActId, input.userId]
  );

  return Boolean(result.rowCount);
};
