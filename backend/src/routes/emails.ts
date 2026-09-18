import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { ingestionQueue } from '../queues/index.js';
import { authenticateJwt, AuthenticatedRequest } from '../middleware/auth.js';
import { IntelligenceService } from '../services/intelligenceService.js';
import { rateLimiter } from '../middleware/rateLimit.js';
import { AppError, ErrorCode } from '../errors/AppError.js';
import { sendReplyNow, setMailboxLocation, cancelApproval } from '../services/googleWriteService.js';

export const emailsRouter = Router();

const UUIDSchema = z.string().uuid();

function isValidUUID(id: string): boolean {
  return UUIDSchema.safeParse(id).success;
}

const emailActionRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 min
  max: 30,
  keyPrefix: 'email_action',
});

// Fail-closed (per docs/integration-audit.md's Gmail write access design):
// a Redis outage blocks sends rather than silently removing their rate limit,
// since an unlimited irreversible action is a worse failure mode than a
// temporarily unavailable one.
const sendRateLimiter = rateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  keyPrefix: 'email_send',
  failClosed: true,
});

// ─── POST /emails/sync ────────────────────────────────────────────────────────
emailsRouter.post('/sync', authenticateJwt, emailActionRateLimiter, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const userId = req.user!.userId;
  const minuteTimestamp = Math.floor(Date.now() / 60_000);
  const jobId = `sync:${userId}:${minuteTimestamp}`;

  try {
    const credRes = await query(
      `SELECT id FROM user_credentials WHERE user_id = $1 AND provider = 'google'`,
      [userId]
    );
    if (credRes.rows.length === 0) {
      return next(new AppError(ErrorCode.GOOGLE_ACCOUNT_DISCONNECTED, 'Google account is not connected. Please connect via /auth/google', 400));
    }

    let syncRunId: string;
    try {
      const runRes = await query(
        `INSERT INTO sync_runs (user_id, sync_type, status, started_at)
         VALUES ($1, 'manual', 'pending', NOW())
         RETURNING id`,
        [userId]
      );
      syncRunId = runRes.rows[0].id as string;
    } catch (dbErr: any) {
      if (dbErr.code === '23505' || dbErr.message?.includes('idx_sync_runs_active_user')) {
        return next(new AppError(ErrorCode.GMAIL_SYNC_ALREADY_RUNNING, 'A synchronization run is already active for this account', 409));
      }
      throw dbErr;
    }

    await ingestionQueue.add(
      'ingest-inbox',
      { userId, syncRunId, triggeredBy: 'user_request' },
      { jobId }
    );

    res.status(202).json({
      status: 'accepted',
      jobId,
      syncRunId,
      message: 'Inbox synchronization queued successfully',
    });
  } catch (error: unknown) {
    next(error instanceof AppError ? error : new AppError(ErrorCode.INTERNAL_ERROR, 'Failed to queue sync job', 500));
  }
});

// ─── GET /emails ──────────────────────────────────────────────────────────────
const EmailsQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .default('50')
    .transform((v) => Math.min(Math.max(parseInt(v, 10) || 50, 1), 100)),
  offset: z
    .string()
    .optional()
    .default('0')
    .transform((v) => Math.max(parseInt(v, 10) || 0, 0)),
  status: z.string().max(50).optional(),
  classification: z.string().max(50).optional(),
});

emailsRouter.get('/', authenticateJwt, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const userId = req.user!.userId;

  const parseResult = EmailsQuerySchema.safeParse(req.query);
  if (!parseResult.success) {
    return next(new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid query parameters', 400));
  }
  const { limit, offset, status, classification } = parseResult.data;

  try {
    const params: (string | number)[] = [userId, limit, offset];
    let whereClause = 'WHERE user_id = $1 AND is_deleted = FALSE';

    if (status) {
      params.push(status);
      whereClause += ` AND status = $${params.length}`;
    }
    if (classification) {
      params.push(classification);
      whereClause += ` AND classification = $${params.length}`;
    }

    const countParams: (string | number)[] = [userId];
    let countWhereClause = 'WHERE user_id = $1 AND is_deleted = FALSE';

    if (status) {
      countParams.push(status);
      countWhereClause += ` AND status = $${countParams.length}`;
    }
    if (classification) {
      countParams.push(classification);
      countWhereClause += ` AND classification = $${countParams.length}`;
    }

    const countRes = await query(
      `SELECT COUNT(*)::int AS total FROM emails ${countWhereClause}`,
      countParams
    );
    const total: number = countRes.rows[0]?.total ?? 0;

    // Policy enforcement: Only plain body_text and metadata are returned. Raw HTML is not exposed.
    const dataRes = await query(
      `SELECT
         id, google_message_id, google_thread_id, sender_email, sender_name,
         subject, body_text, received_at, classification, ai_score, status,
         ingestion_status, ai_processing_status, labels, attachment_metadata, created_at
       FROM emails
       ${whereClause}
       ORDER BY received_at DESC NULLS LAST
       LIMIT $2 OFFSET $3`,
      params
    );

    res.json({ emails: dataRes.rows, total, limit, offset });
  } catch {
    next(new AppError(ErrorCode.INTERNAL_ERROR, 'Failed to fetch emails', 500));
  }
});

// ─── GET /emails/:id/intelligence ────────────────────────────────────────────
emailsRouter.get(
  '/:id/intelligence',
  authenticateJwt,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;
    const emailId = req.params.id;

    if (!isValidUUID(emailId)) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid email ID format', 400));
    }

    try {
      // Verification of ownership
      const emailCheck = await query(
        `SELECT id FROM emails WHERE id = $1 AND user_id = $2`,
        [emailId, userId]
      );
      if (emailCheck.rows.length === 0) {
        return next(new AppError(ErrorCode.NOT_FOUND, 'Email not found', 404));
      }

      // Model A query: join with emails table or filter by email_id (ownership confirmed by emailCheck)
      const intelRes = await query(
        `SELECT
           ei.id, ei.email_id, ei.extraction_version, ei.intent_classification, ei.sender_classification,
           ei.priority_score, ei.urgency_score, ei.is_noise, ei.action_candidates, ei.opportunity_candidates,
           ei.extracted_reasoning, ei.analysis_mode, ei.created_at, ei.updated_at
         FROM email_intelligence ei
         JOIN emails e ON e.id = ei.email_id
         WHERE ei.email_id = $1 AND e.user_id = $2
         ORDER BY ei.extraction_version DESC
         LIMIT 1`,
        [emailId, userId]
      );

      if (intelRes.rows.length === 0) {
        return next(new AppError(ErrorCode.NOT_FOUND, 'No intelligence record found for this email', 404));
      }

      res.json(intelRes.rows[0]);
    } catch {
      next(new AppError(ErrorCode.INTERNAL_ERROR, 'Failed to fetch email intelligence', 500));
    }
  }
);

// ─── POST /emails/:id/extract ─────────────────────────────────────────────────
emailsRouter.post(
  '/:id/extract',
  authenticateJwt,
  emailActionRateLimiter,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;
    const emailId = req.params.id;

    if (!isValidUUID(emailId)) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid email ID format', 400));
    }

    try {
      const emailCheck = await query(
        `SELECT id FROM emails WHERE id = $1 AND user_id = $2`,
        [emailId, userId]
      );
      if (emailCheck.rows.length === 0) {
        return next(new AppError(ErrorCode.NOT_FOUND, 'Email not found', 404));
      }

      const extractionRunId = await IntelligenceService.processEmailIntelligence(emailId);
      res.status(200).json({
        status: 'completed',
        extractionRunId,
        message: 'Email structured extraction completed',
      });
    } catch (error: unknown) {
      next(error instanceof AppError ? error : new AppError(ErrorCode.EXTRACTION_FAILED, 'Email extraction failed', 500));
    }
  }
);

// ─── POST /emails/:id/send ────────────────────────────────────────────────────
// Immediate send — no hold, no auto-send disclosure footer. Requires a
// client-supplied Idempotency-Key header so a retried request (e.g. a flaky
// network on the frontend) replays the original outcome instead of sending
// twice; scoped to this endpoint only, distinct from the server-computed
// idempotency keys used for actions/opportunities materialization.
const SendReplySchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(998),
  bodyText: z.string().min(1).max(50_000),
  inReplyTo: z.string().max(500).optional(),
  references: z.string().max(2000).optional(),
});

emailsRouter.post(
  '/:id/send',
  authenticateJwt,
  sendRateLimiter,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;
    const emailId = req.params.id;

    if (!isValidUUID(emailId)) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid email ID format', 400));
    }

    const idempotencyKey = req.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
      return next(new AppError(ErrorCode.IDEMPOTENCY_KEY_REQUIRED, 'A valid Idempotency-Key header is required.', 400));
    }

    const parseResult = SendReplySchema.safeParse(req.body);
    if (!parseResult.success) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid send payload', 400));
    }

    try {
      const emailCheck = await query(
        `SELECT google_thread_id FROM emails WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE`,
        [emailId, userId]
      );
      if (emailCheck.rows.length === 0) {
        return next(new AppError(ErrorCode.NOT_FOUND, 'Email not found', 404));
      }
      const threadId = emailCheck.rows[0].google_thread_id;
      if (!threadId) {
        return next(new AppError(ErrorCode.VALIDATION_ERROR, 'This email has no Gmail thread to reply on.', 400));
      }

      const result = await sendReplyNow(userId, { ...parseResult.data, threadId }, idempotencyKey);
      res.status(result.alreadySent ? 200 : 201).json(result);
    } catch (error: unknown) {
      next(error instanceof AppError ? error : new AppError(ErrorCode.GMAIL_SEND_FAILED, 'Failed to send message', 502));
    }
  }
);

// ─── POST /emails/:id/archive | /trash | /spam ────────────────────────────────
// Synchronous — no hold, no approvals row. Real Gmail label changes; see
// services/googleWriteService.ts for the label mapping.
for (const action of ['archive', 'trash', 'spam'] as const) {
  emailsRouter.post(
    `/:id/${action}`,
    authenticateJwt,
    emailActionRateLimiter,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      const userId = req.user!.userId;
      const emailId = req.params.id;

      if (!isValidUUID(emailId)) {
        return next(new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid email ID format', 400));
      }

      try {
        await setMailboxLocation(userId, emailId, action);
        res.status(200).json({ status: 'ok', action });
      } catch (error: unknown) {
        next(error instanceof AppError ? error : new AppError(ErrorCode.GMAIL_WRITE_FAILED, `Failed to ${action} message`, 502));
      }
    }
  );
}

// ─── POST /approvals/:id/cancel ───────────────────────────────────────────────
// In-app cancel for a held auto-send, authenticated by JWT + ownership. The
// Telegram cancel-token path (same shape as telegram_integration.link_code)
// is reserved for the notification wiring in a later stage and isn't exposed
// as a route yet.
export const approvalsRouter = Router();

approvalsRouter.post(
  '/:id/cancel',
  authenticateJwt,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;
    const approvalId = req.params.id;

    if (!isValidUUID(approvalId)) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid approval ID format', 400));
    }

    try {
      await cancelApproval(approvalId, userId);
      res.status(200).json({ status: 'cancelled' });
    } catch (error: unknown) {
      next(error instanceof AppError ? error : new AppError(ErrorCode.INTERNAL_ERROR, 'Failed to cancel send', 500));
    }
  }
);
