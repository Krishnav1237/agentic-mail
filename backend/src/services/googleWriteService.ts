import crypto from 'crypto';
import { query } from '../db/index.js';
import { getGmailClientForUser } from './googleAuth.js';
import { acquireLock, releaseLock } from '../utils/redisLua.js';
import { redisCache } from '../redis/index.js';
import { agentQueue, EXECUTE_APPROVAL_SEND_JOB } from '../queues/index.js';
import { AppError, ErrorCode } from '../errors/AppError.js';

export const GMAIL_MODIFY_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';
export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

const AUTO_SEND_HOLD_MS = 5 * 60_000;

// Stage-1 placeholder: mandatory, non-configurable, auto-send-only per product
// direction. Real copy/rendering is a later-stage concern — this only pins
// down the one thing that can't wait, which is that the mechanism exists and
// is exclusively reachable from the auto-send path (never manual send).
const AUTO_SEND_DISCLOSURE_FOOTER =
  '\n\n---\nThis message was sent automatically by Obligo’s AI.';

export interface PreparedSendPayload {
  threadId: string; // Gmail thread id
  to: string;
  subject: string;
  bodyText: string;
  inReplyTo?: string;
  references?: string;
}

async function writeAuditEvent(userId: string, eventType: string, details: Record<string, unknown>) {
  await query(
    `INSERT INTO audit_events (user_id, event_type, actor, details) VALUES ($1, $2, 'system', $3)`,
    [userId, eventType, JSON.stringify(details)]
  );
}

/**
 * Fail-fast scope check. Called before queueing/executing any Gmail write so
 * a user who hasn't re-consented since gmail.modify/gmail.send were added
 * gets a clean, immediate error instead of a queued action that fails later.
 */
export async function assertGmailScope(userId: string, scope: string): Promise<void> {
  const { rows } = await query(
    `SELECT scopes FROM user_credentials WHERE user_id = $1 AND provider = 'google'`,
    [userId]
  );
  const scopes: string[] = rows[0]?.scopes ?? [];
  if (!scopes.includes(scope)) {
    throw new AppError(
      ErrorCode.GOOGLE_SCOPE_MISSING,
      'Please reconnect your Google account to enable this feature.',
      403
    );
  }
}

function buildMimeMessage(payload: PreparedSendPayload, discloseAutoSent: boolean): string {
  const body = discloseAutoSent ? payload.bodyText + AUTO_SEND_DISCLOSURE_FOOTER : payload.bodyText;

  const headers = [
    `To: ${payload.to}`,
    `Subject: ${payload.subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
  ];
  if (payload.inReplyTo) headers.push(`In-Reply-To: ${payload.inReplyTo}`);
  if (payload.references) headers.push(`References: ${payload.references}`);

  const message = `${headers.join('\r\n')}\r\n\r\n${body}`;
  return Buffer.from(message).toString('base64url');
}

/**
 * Queue an auto-send: insert the approvals row in `pending`, then schedule a
 * BullMQ delayed job using the approval id as the jobId. The DB row (not the
 * queue) is the source of truth for whether the send still happens — the
 * queue only controls timing. See workers/agentExecutionWorker.ts.
 *
 * `idempotencyKey` is optional (backward compatible — `idempotency_key TEXT
 * UNIQUE` allows unlimited NULLs, so omitting it preserves the old
 * always-insert behavior) but load-bearing for any caller that can be
 * invoked concurrently for the same logical send, e.g.
 * services/replyDraftingService.ts, which can run
 * `POST /emails/:id/extract`-triggered twice for the same email at once.
 *
 * THE RACE THIS CLOSES: two concurrent callers passing the same
 * idempotencyKey both reach this function; both run the INSERT below
 * concurrently. `ON CONFLICT (idempotency_key) DO NOTHING RETURNING id` means
 * Postgres's own unique-index enforcement — not application timing —
 * guarantees exactly one of the two statements returns a row, regardless of
 * how close together they run. Only the call that gets a row back schedules
 * a BullMQ job, so at most one delayed send is ever scheduled for one
 * idempotency key, even under a true concurrent race. This is the same
 * DB-as-arbiter principle already load-bearing in the pending->sending claim
 * in executeQueuedSend and in upsertDraftApproval's ON CONFLICT DO UPDATE.
 */
export async function queueAutoSend(
  userId: string,
  emailId: string,
  preparedPayload: PreparedSendPayload,
  idempotencyKey?: string
): Promise<{ approvalId: string; cancelToken: string; scheduledAt: Date; alreadyQueued: boolean }> {
  await assertGmailScope(userId, GMAIL_SEND_SCOPE);

  const cancelToken = crypto.randomBytes(32).toString('base64url');
  const scheduledAt = new Date(Date.now() + AUTO_SEND_HOLD_MS);

  const { rows } = await query(
    `INSERT INTO approvals
       (user_id, email_id, action_type, status, prepared_payload, scheduled_at, cancel_token, cancel_token_expires_at, idempotency_key)
     VALUES ($1, $2, 'send_reply', 'pending', $3, $4, $5, $4, $6)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [userId, emailId, JSON.stringify(preparedPayload), scheduledAt, cancelToken, idempotencyKey ?? null]
  );

  if (rows.length === 0) {
    // Lost the race — another concurrent call already claimed this key.
    // Do NOT schedule a second delayed job; that's the entire fix.
    const existing = await query(
      `SELECT id, cancel_token, scheduled_at FROM approvals WHERE idempotency_key = $1`,
      [idempotencyKey]
    );
    const winner = existing.rows[0];
    return {
      approvalId: winner.id,
      cancelToken: winner.cancel_token,
      scheduledAt: winner.scheduled_at,
      alreadyQueued: true,
    };
  }

  const approvalId = rows[0].id as string;

  await agentQueue.add(
    EXECUTE_APPROVAL_SEND_JOB,
    { approvalId },
    {
      delay: AUTO_SEND_HOLD_MS,
      jobId: approvalId,
      attempts: 2,
      backoff: { type: 'fixed', delay: 5000 },
    }
  );

  await writeAuditEvent(userId, 'auto_send_queued', { approvalId, emailId });
  return { approvalId, cancelToken, scheduledAt, alreadyQueued: false };
}

/**
 * Authenticated in-app cancel (JWT + ownership), for the pending hold window.
 * The cancel_token/webhook path this reuses telegram_integration's shape for
 * is left for the Telegram notification wiring in a later stage — this
 * function is what that webhook will eventually call too, keyed by token
 * instead of userId, but that route isn't exposed yet.
 */
export async function cancelApproval(approvalId: string, userId: string): Promise<void> {
  const { rows } = await query(
    `UPDATE approvals SET status = 'cancelled', updated_at = now()
     WHERE id = $1 AND user_id = $2 AND status = 'pending'
     RETURNING id`,
    [approvalId, userId]
  );
  if (rows.length === 0) {
    throw new AppError(
      ErrorCode.APPROVAL_ALREADY_RESOLVED,
      'This send has already gone out, been cancelled, or does not exist.',
      409
    );
  }

  const job = await agentQueue.getJob(approvalId);
  try {
    await job?.remove();
  } catch {
    // Job already active (worker has claimed it) — harmless. The conditional
    // UPDATE above is what actually decided the race; if it succeeded, the
    // worker's own claim (WHERE status = 'pending') will find zero rows.
  }

  await writeAuditEvent(userId, 'auto_send_cancelled', { approvalId, reason: 'user_cancelled' });
}

/**
 * Immediate send, no hold, no disclosure footer (a human clicked send).
 * Idempotent on (userId, idempotencyKey): a retried request with the same
 * key returns the original outcome instead of sending twice.
 */
export async function sendReplyNow(
  userId: string,
  preparedPayload: PreparedSendPayload,
  idempotencyKey: string
): Promise<{ approvalId: string; alreadySent: boolean }> {
  await assertGmailScope(userId, GMAIL_SEND_SCOPE);

  let approval: { id: string; status: string };
  try {
    const { rows } = await query(
      `INSERT INTO approvals (user_id, action_type, status, prepared_payload, client_idempotency_key)
       VALUES ($1, 'send_reply', 'sending', $2, $3)
       RETURNING id, status`,
      [userId, JSON.stringify(preparedPayload), idempotencyKey]
    );
    approval = rows[0];
  } catch (err: any) {
    if (err.code !== '23505') throw err; // not our idempotency constraint — a real error
    const { rows } = await query(
      `SELECT id, status FROM approvals WHERE user_id = $1 AND client_idempotency_key = $2`,
      [userId, idempotencyKey]
    );
    approval = rows[0];
    if (approval.status === 'executed') {
      return { approvalId: approval.id, alreadySent: true };
    }
    if (approval.status === 'sending') {
      throw new AppError(ErrorCode.APPROVAL_ALREADY_RESOLVED, 'Send already in progress.', 409);
    }
    // status === 'failed' -> retry the Gmail call on the same row
    await query(`UPDATE approvals SET status = 'sending', updated_at = now() WHERE id = $1 AND status = 'failed'`, [approval.id]);
  }

  try {
    const gmail = await getGmailClientForUser(userId);
    const raw = buildMimeMessage(preparedPayload, false);
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw, threadId: preparedPayload.threadId } });

    await query(`UPDATE approvals SET status = 'executed', updated_at = now() WHERE id = $1`, [approval.id]);
    await writeAuditEvent(userId, 'manual_send_sent', { approvalId: approval.id });
    return { approvalId: approval.id, alreadySent: false };
  } catch (err) {
    await query(`UPDATE approvals SET status = 'failed', updated_at = now() WHERE id = $1`, [approval.id]);
    await writeAuditEvent(userId, 'manual_send_failed', { approvalId: approval.id, error: String(err) });
    throw new AppError(ErrorCode.GMAIL_SEND_FAILED, 'Failed to send message.', 502);
  }
}

/**
 * Execute the held auto-send. Called only by workers/agentExecutionWorker.ts.
 * The conditional UPDATE (pending -> sending) is the entire race-safety
 * mechanism against a concurrent cancel; the caller's Redis lock only guards
 * against two workers processing the same job concurrently.
 */
export async function executeQueuedSend(
  approvalId: string,
  attemptsMade: number,
  maxAttempts: number
): Promise<void> {
  const claim = await query(
    `UPDATE approvals SET status = 'sending', updated_at = now()
     WHERE id = $1 AND status = 'pending' RETURNING *`,
    [approvalId]
  );
  if (claim.rows.length === 0) {
    return; // cancelled, or already resolved by another path
  }
  const approval = claim.rows[0];
  const payload = approval.prepared_payload as PreparedSendPayload;

  try {
    const gmail = await getGmailClientForUser(approval.user_id);
    const raw = buildMimeMessage(payload, true);
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw, threadId: payload.threadId } });

    await query(`UPDATE approvals SET status = 'executed', updated_at = now() WHERE id = $1`, [approvalId]);
    await writeAuditEvent(approval.user_id, 'auto_send_sent', { approvalId });
  } catch (err) {
    const isFinalAttempt = attemptsMade + 1 >= maxAttempts;
    if (isFinalAttempt) {
      await query(`UPDATE approvals SET status = 'failed', updated_at = now() WHERE id = $1 AND status = 'sending'`, [approvalId]);
      await writeAuditEvent(approval.user_id, 'auto_send_failed', { approvalId, error: String(err) });
    } else {
      // Revert to pending so the BullMQ retry can re-claim it, and push the
      // cancel window forward to match — otherwise a user hitting cancel
      // during the retry backoff would hit an already-expired token even
      // though the row is genuinely still pending.
      const nextRetryDelayMs = 5000; // matches agentQueue's fixed backoff
      await query(
        `UPDATE approvals
         SET status = 'pending', updated_at = now(),
             cancel_token_expires_at = now() + ($2 || ' milliseconds')::interval
         WHERE id = $1 AND status = 'sending'`,
        [approvalId, nextRetryDelayMs]
      );
      await writeAuditEvent(approval.user_id, 'auto_send_attempt_failed', { approvalId, error: String(err) });
    }
    throw err; // let BullMQ's attempts/backoff drive the retry
  }
}

type MailboxAction = 'archive' | 'trash' | 'spam';

/**
 * Synchronous archive/trash/spam via real Gmail label changes. No `approvals`
 * row — there's no hold for this action, only send has one. Optimistically
 * updates emails.labels locally; the next incremental sync reconciles
 * authoritatively the same way it already does for label changes made
 * directly in Gmail.
 */
export async function setMailboxLocation(userId: string, emailId: string, action: MailboxAction): Promise<void> {
  await assertGmailScope(userId, GMAIL_MODIFY_SCOPE);

  const emailRes = await query(
    `SELECT id, google_message_id, labels FROM emails WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE`,
    [emailId, userId]
  );
  if (emailRes.rows.length === 0) {
    throw new AppError(ErrorCode.NOT_FOUND, 'Email not found.', 404);
  }
  const email = emailRes.rows[0];

  const lockKey = `lock:gmail_write:${emailId}`;
  const lockToken = crypto.randomBytes(16).toString('hex');
  const acquired = await acquireLock(redisCache, lockKey, lockToken, 10_000);
  if (!acquired) {
    throw new AppError(ErrorCode.GMAIL_WRITE_FAILED, 'This email is already being modified, try again shortly.', 502);
  }

  try {
    const gmail = await getGmailClientForUser(userId);
    let addLabelIds: string[] = [];
    let removeLabelIds: string[] = [];

    switch (action) {
      case 'archive':
        removeLabelIds = ['INBOX'];
        break;
      case 'trash':
        await gmail.users.messages.trash({ userId: 'me', id: email.google_message_id });
        break;
      case 'spam':
        removeLabelIds = ['INBOX'];
        addLabelIds = ['SPAM'];
        break;
    }

    let newLabels: string[] = email.labels ?? [];
    if (action === 'trash') {
      newLabels = Array.from(new Set([...newLabels.filter((l: string) => l !== 'INBOX'), 'TRASH']));
    } else {
      if (removeLabelIds.length || addLabelIds.length) {
        await gmail.users.messages.modify({
          userId: 'me',
          id: email.google_message_id,
          requestBody: { addLabelIds, removeLabelIds },
        });
      }
      newLabels = Array.from(new Set([...newLabels.filter((l: string) => !removeLabelIds.includes(l)), ...addLabelIds]));
    }

    await query(`UPDATE emails SET labels = $1, updated_at = NOW() WHERE id = $2`, [newLabels, emailId]);
    await writeAuditEvent(userId, `email_${action}d`, { emailId });
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(ErrorCode.GMAIL_WRITE_FAILED, 'Failed to update the message in Gmail.', 502);
  } finally {
    await releaseLock(redisCache, lockKey, lockToken);
  }
}
