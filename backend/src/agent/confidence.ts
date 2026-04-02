import { query } from '../db/index.js';
import { getMemory, upsertMemory } from '../memory/store.js';

type AccuracyCache = {
  updatedAt: string;
  values: Record<string, number>;
};

const CACHE_HOURS = 6;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const isFresh = (updatedAt: string | undefined) => {
  if (!updatedAt) return false;
  const last = new Date(updatedAt).getTime();
  const diffHours = (Date.now() - last) / (1000 * 60 * 60);
  return diffHours <= CACHE_HOURS;
};

const buildAccuracyMap = async (userId: string) => {
  const result = await query<{
    action_type: string;
    status: string;
    count: number;
  }>(
    `SELECT action_type, status, COUNT(*)::int as count
     FROM agent_actions
     WHERE user_id = $1
       AND created_at >= now() - interval '90 days'
       AND status IN ('approved', 'accepted', 'always_allow', 'executed', 'rejected', 'failed')
     GROUP BY action_type, status`,
    [userId]
  );

  const grouped: Record<string, { positive: number; negative: number }> = {};
  for (const row of result.rows) {
    if (!grouped[row.action_type])
      grouped[row.action_type] = { positive: 0, negative: 0 };
    if (
      ['approved', 'accepted', 'always_allow', 'executed'].includes(row.status)
    ) {
      grouped[row.action_type].positive += row.count;
    } else if (['rejected', 'failed'].includes(row.status)) {
      grouped[row.action_type].negative += row.count;
    }
  }

  const values: Record<string, number> = {};
  for (const [actionType, counts] of Object.entries(grouped)) {
    const total = counts.positive + counts.negative;
    if (total === 0) {
      values[actionType] = 1;
      continue;
    }
    const smoothed = (counts.positive + 1) / (total + 2);
    values[actionType] = clamp(smoothed, 0.6, 1);
  }

  return values;
};

export const getHistoricalAccuracy = async (
  userId: string,
  actionType: string
) => {
  const cached = await getMemory<AccuracyCache>(
    userId,
    'short',
    'confidence_accuracy'
  );
  if (cached && isFresh(cached.updatedAt)) {
    return cached.values[actionType] ?? 1;
  }

  const values = await buildAccuracyMap(userId);
  const updatedAt = new Date().toISOString();
  await upsertMemory(userId, 'short', 'confidence_accuracy', {
    updatedAt,
    values,
  });
  return values[actionType] ?? 1;
};

const getRecencyWeight = async (userId: string, actionType: string) => {
  const result = await query<{ last_time: string | null }>(
    `SELECT MAX(created_at) as last_time
     FROM agent_actions
     WHERE user_id = $1
       AND action_type = $2
       AND status IN ('approved', 'accepted', 'always_allow', 'executed')`,
    [userId, actionType]
  );
  const lastTime = result.rows[0]?.last_time;
  if (!lastTime) return 0.9;
  const diffDays =
    (Date.now() - new Date(lastTime).getTime()) / (1000 * 60 * 60 * 24);
  const weight = 1.1 - (diffDays / 30) * 0.3;
  return clamp(weight, 0.7, 1.1);
};

const extractDomain = (email?: string | null) => {
  if (!email) return null;
  const at = email.indexOf('@');
  if (at === -1) return null;
  return email.slice(at + 1).toLowerCase();
};

const getContextSimilarity = async (
  userId: string,
  actionType: string,
  emailId?: string | null
) => {
  if (!emailId) return 0.85;
  const currentEmail = await query<{
    sender_email: string | null;
    subject: string | null;
  }>(
    'SELECT sender_email, subject FROM emails WHERE id = $1 AND user_id = $2',
    [emailId, userId]
  );
  const senderDomain = extractDomain(
    currentEmail.rows[0]?.sender_email ?? null
  );
  const subject = (currentEmail.rows[0]?.subject ?? '').toLowerCase();

  if (!senderDomain) return 0.85;

  const recent = await query<{
    sender_email: string | null;
    subject: string | null;
  }>(
    `SELECT e.sender_email, e.subject
     FROM agent_actions a
     JOIN emails e ON e.id = a.email_id
     WHERE a.user_id = $1
       AND a.action_type = $2
       AND a.status IN ('approved', 'accepted', 'always_allow', 'executed')
     ORDER BY a.created_at DESC
     LIMIT 20`,
    [userId, actionType]
  );

  const subjectTokens = new Set(
    subject.split(/\s+/).filter((token: string) => token.length > 3)
  );
  for (const row of recent.rows) {
    const domain = extractDomain(row.sender_email ?? null);
    if (domain && domain === senderDomain) {
      const otherSubject = (row.subject ?? '').toLowerCase();
      const overlap = otherSubject
        .split(/\s+/)
        .filter(
          (token: string) => token.length > 3 && subjectTokens.has(token)
        );
      if (overlap.length >= 2) return 1.0;
      return 0.95;
    }
  }

  return 0.8;
};

export const getConfidenceFactors = async (input: {
  userId: string;
  actionType: string;
  emailId?: string | null;
}) => {
  const historicalAccuracy = await getHistoricalAccuracy(
    input.userId,
    input.actionType
  );
  const recencyWeight = await getRecencyWeight(input.userId, input.actionType);
  const contextSimilarity = await getContextSimilarity(
    input.userId,
    input.actionType,
    input.emailId
  );
  return { historicalAccuracy, recencyWeight, contextSimilarity };
};
