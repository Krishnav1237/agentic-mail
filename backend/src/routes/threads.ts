import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { authenticateJwt, AuthenticatedRequest } from '../middleware/auth.js';
import { AppError, ErrorCode } from '../errors/AppError.js';

export const threadsRouter = Router();

// ─── GET /threads ─────────────────────────────────────────────────────────────
const ThreadsQuerySchema = z.object({
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

threadsRouter.get('/', authenticateJwt, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const userId = req.user!.userId;

  const parseResult = ThreadsQuerySchema.safeParse(req.query);
  if (!parseResult.success) {
    return next(new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid query parameters', 400));
  }
  const { limit, offset, status, classification } = parseResult.data;

  try {
    // Filters (status/classification) apply to each thread's most recent
    // message, matching what a caller of GET /emails would already expect.
    let messageFilter = '';
    const filterParams: (string | number)[] = [];
    if (status) {
      filterParams.push(status);
      messageFilter += ` AND status = $${filterParams.length + 1}`;
    }
    if (classification) {
      filterParams.push(classification);
      messageFilter += ` AND classification = $${filterParams.length + 1}`;
    }

    const countRes = await query(
      `SELECT COUNT(*)::int AS total
       FROM email_threads t
       JOIN LATERAL (
         SELECT status, classification
         FROM emails
         WHERE emails.thread_id = t.id AND emails.user_id = $1 AND emails.is_deleted = FALSE
         ORDER BY received_at DESC NULLS LAST
         LIMIT 1
       ) lm ON TRUE
       WHERE t.user_id = $1 ${messageFilter}`,
      [userId, ...filterParams]
    );
    const total: number = countRes.rows[0]?.total ?? 0;

    // Policy enforcement: same as GET /emails — only plain body_text-derived
    // content and metadata are returned. Raw HTML is never exposed.
    const dataRes = await query(
      `SELECT
         t.id, t.google_thread_id, t.message_count, t.last_message_at,
         lm.id AS email_id, lm.subject, lm.sender_email, lm.sender_name,
         LEFT(lm.body_text, 200) AS snippet, lm.received_at, lm.classification,
         lm.ai_score, lm.status
       FROM email_threads t
       JOIN LATERAL (
         SELECT id, subject, sender_email, sender_name, body_text, received_at,
                classification, ai_score, status
         FROM emails
         WHERE emails.thread_id = t.id AND emails.user_id = $1 AND emails.is_deleted = FALSE
         ORDER BY received_at DESC NULLS LAST
         LIMIT 1
       ) lm ON TRUE
       WHERE t.user_id = $1 ${messageFilter}
       ORDER BY t.last_message_at DESC NULLS LAST
       LIMIT $${filterParams.length + 2} OFFSET $${filterParams.length + 3}`,
      [userId, ...filterParams, limit, offset]
    );

    res.json({ threads: dataRes.rows, total, limit, offset });
  } catch {
    next(new AppError(ErrorCode.INTERNAL_ERROR, 'Failed to fetch threads', 500));
  }
});
