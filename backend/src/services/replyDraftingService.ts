import crypto from 'crypto';
import { query } from '../db/index.js';
import { DraftReplyService, type ThreadMessageForPrompt, type DraftAiProvider } from '../ai/draftReplyService.js';
import { queueAutoSend, type PreparedSendPayload } from './googleWriteService.js';
import { normalizePreferences } from '../routes/preferences.js';
import { acquireLock, releaseLock } from '../utils/redisLua.js';
import { redisCache } from '../redis/index.js';

const REPLY_WORTHY_CONFIDENCE_THRESHOLD = 0.6;

/**
 * PROVISIONAL. Chosen without real accuracy data on how draft confidence
 * scores correlate with actual draft quality — there is no review-mode usage
 * history yet to calibrate against. Revisit once enough 'review'-mode drafts
 * have been approved/edited/rejected by real users to know what confidence
 * band actually predicts an unedited approval. Until then this is a
 * deliberately conservative guess, not a measured cutoff. The asymmetry this
 * exists for: a wrongly-surfaced review draft costs one glance and a dismiss;
 * a wrongly-auto-sent email is irreversible and external.
 */
const AUTO_SEND_CONFIDENCE_THRESHOLD = 0.9;

const REPLY_DRAFT_LOCK_TTL_MS = 60_000;

/**
 * Stable per-(user, email) key, deliberately NOT parameterized by action_type
 * — an email has exactly one meaningful reply attempt regardless of whether
 * it ends up as a draft_reply row or a send_reply row. Reusing one key across
 * both means the bare UNIQUE constraint on approvals.idempotency_key
 * structurally prevents ever having both a lingering draft AND a separately
 * queued send for the same email — not just discouraged by application
 * logic, but impossible at the database level.
 */
export function makeReplyIdempotencyKey(params: { userId: string; emailId: string }): string {
  const canonical = JSON.stringify({ k: 'reply-v1', u: params.userId, e: params.emailId });
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

async function getAgentPreferences(userId: string) {
  const result = await query(`SELECT preferences FROM user_preferences WHERE user_id = $1`, [userId]);
  return normalizePreferences(result.rows[0]?.preferences);
}

interface EmailForDrafting {
  id: string;
  userId: string;
  subject: string | null;
  senderEmail: string | null;
  threadId: string | null; // internal email_threads.id
  googleThreadId: string | null;
  messageIdHeader: string | null;
  referencesHeader: string | null;
}

async function getEmailForDrafting(emailId: string, userId: string): Promise<EmailForDrafting | null> {
  const { rows } = await query(
    `SELECT id, user_id, subject, sender_email, thread_id, google_thread_id, message_id_header, references_header
     FROM emails WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE`,
    [emailId, userId]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    userId: r.user_id,
    subject: r.subject,
    senderEmail: r.sender_email,
    threadId: r.thread_id,
    googleThreadId: r.google_thread_id,
    messageIdHeader: r.message_id_header,
    referencesHeader: r.references_header,
  };
}

/** True if the thread's most recent message is one the user already sent —
 * Gmail's own SENT label, already captured into emails.labels at ingestion,
 * repurposed here rather than adding a new column for the same fact. */
async function threadAlreadyAnswered(threadId: string): Promise<boolean> {
  const { rows } = await query(
    `SELECT labels FROM emails WHERE thread_id = $1 ORDER BY received_at DESC NULLS LAST LIMIT 1`,
    [threadId]
  );
  const labels: string[] = rows[0]?.labels ?? [];
  return labels.includes('SENT');
}

/** Whether this email's one reply attempt has already been decided —
 * anything other than 'pending' means a human or the send pipeline has acted
 * on it, and re-extraction must not reopen it. */
async function hasProtectedApproval(idempotencyKey: string): Promise<boolean> {
  const { rows } = await query(`SELECT 1 FROM approvals WHERE idempotency_key = $1 AND status != 'pending'`, [
    idempotencyKey,
  ]);
  return rows.length > 0;
}

async function getThreadMessagesChronological(threadId: string): Promise<ThreadMessageForPrompt[]> {
  const { rows } = await query(
    `SELECT sender_email, labels, received_at, body_text
     FROM emails WHERE thread_id = $1 ORDER BY received_at ASC NULLS LAST`,
    [threadId]
  );
  return rows.map((r: any) => ({
    senderEmail: r.sender_email ?? 'unknown',
    isFromUser: Array.isArray(r.labels) && r.labels.includes('SENT'),
    receivedAt: r.received_at ? new Date(r.received_at).toISOString() : '',
    bodyText: r.body_text ?? '',
  }));
}

function replySubject(subject: string | null): string {
  const s = subject ?? '(no subject)';
  return /^re:/i.test(s.trim()) ? s : `Re: ${s}`;
}

function buildReferences(priorReferences: string | null, parentMessageId: string | null): string | undefined {
  const chain = [priorReferences, parentMessageId].filter((v): v is string => Boolean(v && v.trim()));
  return chain.length > 0 ? chain.join(' ') : undefined;
}

/** Upserts the review-mode (or auto-fallback) draft. The ON CONFLICT clause
 * is what makes re-extraction safe: a still-pending row gets refreshed with
 * the latest draft; anything else (approved/rejected/executed/...) is left
 * alone because the WHERE clause simply won't match it. */
async function upsertDraftApproval(
  userId: string,
  emailId: string,
  idempotencyKey: string,
  payload: PreparedSendPayload,
  confidence: number,
  decisionReason: string
): Promise<void> {
  await query(
    `INSERT INTO approvals (user_id, email_id, idempotency_key, action_type, status, prepared_payload, confidence, decision_reason)
     VALUES ($1, $2, $3, 'draft_reply', 'pending', $4, $5, $6)
     ON CONFLICT (idempotency_key) DO UPDATE SET
       prepared_payload = EXCLUDED.prepared_payload,
       confidence       = EXCLUDED.confidence,
       decision_reason  = EXCLUDED.decision_reason,
       updated_at       = NOW()
     WHERE approvals.status = 'pending'`,
    [userId, emailId, idempotencyKey, JSON.stringify(payload), confidence, decisionReason]
  );
}

export interface ReplyDraftingExtractionInput {
  isNoise: boolean;
  replyWorthy: boolean;
  replyWorthyConfidence: number;
}

/**
 * Orchestrates reply detection -> drafting -> routing for one email, called
 * after intelligenceService.ts's extraction transaction has committed.
 *
 * The Redis lock here is a COST optimization, not a correctness requirement:
 * two concurrent calls for the same email would otherwise both pay for a
 * Phase B LLM call before one of them loses the race at queueAutoSend's
 * INSERT (see that function's own doc comment for why that race is closed
 * regardless of this lock). Losing the lock just means skipping this call
 * entirely on the assumption another call is already handling it — never
 * blocking or retrying, since there's nothing this call would do differently
 * if it waited.
 */
export async function processReplyDrafting(
  emailId: string,
  userId: string,
  extraction: ReplyDraftingExtractionInput,
  injectedProvider?: DraftAiProvider
): Promise<void> {
  if (extraction.isNoise || !extraction.replyWorthy) return;
  if (extraction.replyWorthyConfidence < REPLY_WORTHY_CONFIDENCE_THRESHOLD) return;

  const prefs = await getAgentPreferences(userId);
  if (prefs.replyDrafting === 'off') return;

  const lockKey = `lock:reply_draft:${emailId}`;
  const lockToken = crypto.randomBytes(16).toString('hex');
  const acquired = await acquireLock(redisCache, lockKey, lockToken, REPLY_DRAFT_LOCK_TTL_MS);
  if (!acquired) return; // another call is already handling this email — skip, don't wait

  try {
    const email = await getEmailForDrafting(emailId, userId);
    if (!email || !email.threadId || !email.googleThreadId || !email.senderEmail) return;

    if (await threadAlreadyAnswered(email.threadId)) return;

    const replyKey = makeReplyIdempotencyKey({ userId, emailId });
    if (await hasProtectedApproval(replyKey)) return;

    const threadMessages = await getThreadMessagesChronological(email.threadId);
    const draftResponse = await DraftReplyService.generateDraft(threadMessages, prefs.replyTone, injectedProvider);
    if (!draftResponse) return; // provider unavailable / abstained — produce nothing, not a placeholder

    const { draftBody, confidence, reasoning } = draftResponse.data;

    const payload: PreparedSendPayload = {
      threadId: email.googleThreadId,
      to: email.senderEmail,
      subject: replySubject(email.subject),
      bodyText: draftBody,
      inReplyTo: email.messageIdHeader ?? undefined,
      references: buildReferences(email.referencesHeader, email.messageIdHeader),
    };

    if (prefs.replyDrafting === 'review' || confidence < AUTO_SEND_CONFIDENCE_THRESHOLD) {
      // Auto users whose draft misses the stricter bar fall back to a review
      // draft — never silently dropped. Same function, same row shape as a
      // plain 'review' user; the caller's mode doesn't change what gets written.
      await upsertDraftApproval(userId, emailId, replyKey, payload, confidence, reasoning);
      return;
    }

    // prefs.replyDrafting === 'auto' AND confidence >= AUTO_SEND_CONFIDENCE_THRESHOLD.
    // queueAutoSend's own INSERT ... ON CONFLICT (idempotency_key) DO NOTHING
    // is the actual race-safety mechanism against a concurrent duplicate send
    // (see its doc comment) — this Redis lock only saves the wasted LLM call
    // above; it is not what makes this call safe.
    await queueAutoSend(userId, emailId, payload, replyKey);
  } finally {
    await releaseLock(redisCache, lockKey, lockToken);
  }
}
