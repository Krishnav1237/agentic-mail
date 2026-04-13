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

const riskTier = (score: number) => {
  if (score >= 8.5) return 'high';
  if (score >= 6) return 'medium';
  return 'low';
};

const confidence = (priority: number) => {
  if (priority >= 4) return 0.9;
  if (priority >= 2.5) return 0.75;
  return 0.6;
};

const reasonForTask = (input: {
  dueAt: string | null;
  category: string | null;
  senderEmail: string | null;
}) => {
  const pieces: string[] = [];
  if (input.dueAt) pieces.push('deadline approaching');
  if (input.category === 'internship') pieces.push('internship pipeline relevance');
  if (input.senderEmail?.includes('recruit')) pieces.push('high-value recruiter sender');
  return pieces.length ? pieces.join(' + ') : 'high-confidence actionable item';
};

const suggestedBundle = (category: string | null) => {
  if (category === 'internship') {
    return ['draft_reply', 'schedule_followup', 'create_calendar_event'];
  }
  if (category === 'event') {
    return ['create_calendar_event', 'create_task', 'label_email'];
  }
  return ['create_task', 'draft_reply'];
};

export const recomputeMustActForUser = async (userId: string) => {
  const candidates = await query<{
    task_id: string;
    title: string;
    due_at: string | null;
    category: string | null;
    priority_score: number;
    email_id: string;
    subject: string | null;
    sender_name: string | null;
    sender_email: string | null;
  }>(
    `SELECT t.id as task_id, t.title, t.due_at, t.category,
            t.priority_score::float as priority_score,
            e.id as email_id, e.subject, e.sender_name, e.sender_email
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
     LIMIT 200`,
    [userId]
  );

  let upserted = 0;
  for (const row of candidates.rows) {
    const dueBoost = row.due_at
      ? Math.max(0, 4 - Math.max((new Date(row.due_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24), 0))
      : 0;
    const categoryBoost = row.category === 'internship' ? 2 : row.category === 'event' ? 1 : 0;
    const senderBoost = row.sender_email?.toLowerCase().includes('recruit') ? 1.5 : 0;
    const score = Number((row.priority_score + dueBoost + categoryBoost + senderBoost).toFixed(4));

    await query(
      `INSERT INTO must_act_items (
        user_id, email_id, task_id, source_type, title, subject, sender_name, sender_email,
        why_reason, risk_tier, confidence, score, deadline_at,
        suggested_bundle, status, expires_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, 'task', $4, $5, $6, $7,
        $8, $9, $10, $11, $12,
        $13, 'open', now() + interval '30 days', now(), now()
      )
      ON CONFLICT (user_id, task_id)
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
        updated_at = now()`,
      [
        userId,
        row.email_id,
        row.task_id,
        row.title,
        row.subject,
        row.sender_name,
        row.sender_email,
        reasonForTask({
          dueAt: row.due_at,
          category: row.category,
          senderEmail: row.sender_email,
        }),
        riskTier(score),
        confidence(row.priority_score),
        score,
        row.due_at,
        JSON.stringify(suggestedBundle(row.category)),
      ]
    );
    upserted += 1;
  }

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

  return { upserted };
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
