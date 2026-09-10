/**
 * /integrations/telegram — the backend half of
 * `frontend/src/lib/telegramIntegrationStore.ts`.
 *
 * Mounted under `/integrations` rather than at a bare `/telegram` so a second
 * provider doesn't reshape the path later — the same reasoning the store gives
 * for holding one object today and deferring the keyed-collection shape "until
 * there's a second real one to shape it against".
 *
 * THE ONE PLACE THIS DOES NOT MATCH THE FRONTEND, STATED UP FRONT.
 * `telegramActions.connectIntegration()` is synchronous, argument-less, void,
 * and flips `connected: true` on the spot. Real bot linking cannot be any of
 * those things: the backend issues a single-use code, the user leaves for
 * Telegram, and a webhook completes the binding some seconds later. So
 * POST /connect below returns a deep link with `connected` still FALSE, and
 * `connected` only becomes true once POST /webhook has seen the code come
 * back. Wiring the frontend's pending state to that flow is the next item;
 * until it lands, the store's local boolean and this route disagree by
 * construction. This is not the backend adapting badly to the frontend — it is
 * the one shape the frontend genuinely cannot express yet.
 *
 * `connected` IS NEVER STORED. It is derived per-response as
 * `telegram_chat_id IS NOT NULL`. A stored boolean can disagree with whether a
 * chat is actually addressable; a derived one cannot.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db, query } from '../db/index.js';
import { authenticateJwt, AuthenticatedRequest } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rateLimit.js';
import { AppError, ErrorCode } from '../errors/AppError.js';
import {
  LINK_CODE_TTL_MINUTES,
  buildLinkUrl,
  generateLinkCode,
  isTelegramConfigured,
  parseStartCommand,
  sendMessage,
  verifyWebhookSecret,
} from '../services/telegramService.js';

export const integrationsRouter = Router();

const telegramWriteRateLimiter = rateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  keyPrefix: 'telegram_write',
});

/** Tightest limiter here: this is the only route that causes an outbound
 * message to a third party on demand. */
const telegramTestRateLimiter = rateLimiter({
  windowMs: 60 * 1000,
  max: 5,
  keyPrefix: 'telegram_test',
});

/**
 * The webhook is unauthenticated by design (Telegram has no session), so it
 * gets its own limiter as a floor under secret-guessing and flood traffic.
 *
 * Sized generously because the limiter keys on client IP and Telegram delivers
 * from a small, shared range — this is effectively one global bucket for all
 * webhook traffic, not a per-user one. Ample for a bot whose only handled
 * update is `/start`; worth revisiting if this bot ever receives ordinary
 * message traffic.
 */
const telegramWebhookRateLimiter = rateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  keyPrefix: 'telegram_webhook',
});

// ─── The TelegramIntegration contract ─────────────────────────────────────────
// Mirrors frontend/src/lib/telegramIntegration.ts. Same enum-drift caveat as
// routes/preferences.ts: no package is shared between the two codebases, so
// these values are a second hand-maintained copy.

const DEADLINE_REMINDERS = ['1h', '3h', '1d', '2d', '3d'] as const;

/** Same 24-hour HH:MM shape as the frontend's PREFERRED_TIME_RE and migration
 * 011's CHECK constraint. */
const PREFERRED_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export type TelegramIntegration = {
  provider: 'telegram';
  connected: boolean;
  notificationPreferences: { urgentEmails: boolean; followUps: boolean };
  deliveryPreferences: {
    preferredTime: string;
    deadlineReminder: (typeof DEADLINE_REMINDERS)[number];
  };
};

/** DEFAULT_TELEGRAM_INTEGRATION from telegramIntegration.ts, and the same
 * values as migration 011's column defaults. */
const DEFAULT_TELEGRAM_INTEGRATION: TelegramIntegration = {
  provider: 'telegram',
  connected: false,
  notificationPreferences: { urgentEmails: true, followUps: true },
  deliveryPreferences: { preferredTime: '09:00', deadlineReminder: '1d' },
};

/**
 * The write contract: preferences only.
 *
 * `connected` and `provider` are absent on purpose. `connected` is a
 * consequence of linking, not something a client asserts; `provider` is fixed
 * for this route. `.strict()` turns either into a 400 rather than a silent
 * discard — the same accept-or-reject rule PUT /profile applies to `email`.
 */
const TelegramPreferencesSchema = z
  .object({
    notificationPreferences: z
      .object({ urgentEmails: z.boolean(), followUps: z.boolean() })
      .strict(),
    deliveryPreferences: z
      .object({
        preferredTime: z.string().regex(PREFERRED_TIME_RE, 'preferredTime must be 24-hour HH:MM'),
        deadlineReminder: z.enum(DEADLINE_REMINDERS),
      })
      .strict(),
  })
  .strict();

type TelegramRow = {
  telegram_chat_id: string | null;
  notify_urgent_emails: boolean;
  notify_follow_ups: boolean;
  preferred_time: string;
  deadline_reminder: string;
};

const TELEGRAM_COLUMNS =
  'telegram_chat_id, notify_urgent_emails, notify_follow_ups, preferred_time, deadline_reminder';

function toTelegramIntegration(row: TelegramRow | undefined): TelegramIntegration {
  // No row is not an error and never a 404: `sanitizeTelegramIntegration` has
  // exactly two outcomes — a valid integration or the defaults — and the modal
  // has no "integration does not exist" state distinct from "not connected".
  // A 404 would force the client to invent one.
  if (!row) return DEFAULT_TELEGRAM_INTEGRATION;

  return {
    provider: 'telegram',
    connected: row.telegram_chat_id !== null,
    notificationPreferences: {
      urgentEmails: row.notify_urgent_emails,
      followUps: row.notify_follow_ups,
    },
    deliveryPreferences: {
      preferredTime: row.preferred_time,
      deadlineReminder: row.deadline_reminder as TelegramIntegration['deliveryPreferences']['deadlineReminder'],
    },
  };
}

// ─── GET /integrations/telegram ───────────────────────────────────────────────
integrationsRouter.get(
  '/telegram',
  authenticateJwt,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;

    try {
      const result = await query(
        `SELECT ${TELEGRAM_COLUMNS} FROM telegram_integration WHERE user_id = $1`,
        [userId]
      );
      // telegram_chat_id, link_code and link_code_expires_at are deliberately
      // never selected into a response: the frontend has no field for any of
      // them, and the chat id is a delivery credential.
      res.json(toTelegramIntegration(result.rows[0]));
    } catch {
      next(new AppError(ErrorCode.INTERNAL_ERROR, 'Failed to fetch Telegram integration', 500));
    }
  }
);

// ─── PUT /integrations/telegram ───────────────────────────────────────────────
integrationsRouter.put(
  '/telegram',
  authenticateJwt,
  telegramWriteRateLimiter,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;

    const body = (req.body ?? {}) as Record<string, unknown>;
    if ('connected' in body) {
      return next(
        new AppError(
          ErrorCode.VALIDATION_ERROR,
          'connected is not writable — it is derived from whether a Telegram chat is linked. Use POST /integrations/telegram/connect or /disconnect',
          400
        )
      );
    }

    const parseResult = TelegramPreferencesSchema.safeParse(body);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      return next(
        new AppError(
          ErrorCode.VALIDATION_ERROR,
          `Invalid Telegram payload: ${issue.path.join('.') || 'body'} — ${issue.message}`,
          400
        )
      );
    }
    const { notificationPreferences, deliveryPreferences } = parseResult.data;

    try {
      // Upsert: a user who edits preferences before ever connecting still gets
      // a row, and their choices survive to whenever they do connect.
      const result = await query(
        `INSERT INTO telegram_integration
           (user_id, notify_urgent_emails, notify_follow_ups, preferred_time, deadline_reminder)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE
           SET notify_urgent_emails = EXCLUDED.notify_urgent_emails,
               notify_follow_ups    = EXCLUDED.notify_follow_ups,
               preferred_time       = EXCLUDED.preferred_time,
               deadline_reminder    = EXCLUDED.deadline_reminder,
               updated_at           = NOW()
         RETURNING ${TELEGRAM_COLUMNS}`,
        [
          userId,
          notificationPreferences.urgentEmails,
          notificationPreferences.followUps,
          deliveryPreferences.preferredTime,
          deliveryPreferences.deadlineReminder,
        ]
      );

      res.json(toTelegramIntegration(result.rows[0]));
    } catch {
      next(new AppError(ErrorCode.INTERNAL_ERROR, 'Failed to save Telegram integration', 500));
    }
  }
);

// ─── POST /integrations/telegram/connect ──────────────────────────────────────
integrationsRouter.post(
  '/telegram/connect',
  authenticateJwt,
  telegramWriteRateLimiter,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;

    if (!isTelegramConfigured()) {
      return next(
        new AppError(
          ErrorCode.TELEGRAM_NOT_CONFIGURED,
          'Telegram integration is not configured on this server',
          503
        )
      );
    }

    const linkCode = generateLinkCode();
    const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MINUTES * 60_000);

    try {
      // Issuing a new code invalidates any previous one for this user by
      // overwriting it — a user who starts linking twice ends up with exactly
      // one live code, which is the behaviour a "Connect" button retried after
      // a lost deep link should have.
      const result = await query(
        `INSERT INTO telegram_integration (user_id, link_code, link_code_expires_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE
           SET link_code            = EXCLUDED.link_code,
               link_code_expires_at = EXCLUDED.link_code_expires_at,
               updated_at           = NOW()
         RETURNING ${TELEGRAM_COLUMNS}`,
        [userId, linkCode, expiresAt]
      );

      // `connected` in this response is still false, and stays false until the
      // webhook sees the code. Returning true here would be a lie the very
      // next GET would contradict.
      res.json({
        linkUrl: buildLinkUrl(linkCode),
        expiresAt: expiresAt.toISOString(),
        integration: toTelegramIntegration(result.rows[0]),
      });
    } catch {
      next(new AppError(ErrorCode.INTERNAL_ERROR, 'Failed to start Telegram linking', 500));
    }
  }
);

// ─── POST /integrations/telegram/disconnect ───────────────────────────────────
integrationsRouter.post(
  '/telegram/disconnect',
  authenticateJwt,
  telegramWriteRateLimiter,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;

    // Read-then-write in one transaction, mirroring POST /auth/google/disconnect
    // — the closest existing analogue, and for the same reason: the audit event
    // depends on what the state WAS, so the read and the write cannot race.
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      const priorRes = await client.query(
        `SELECT telegram_chat_id FROM telegram_integration WHERE user_id = $1 FOR UPDATE`,
        [userId]
      );
      const wasConnected = Boolean(priorRes.rows[0]?.telegram_chat_id);

      // Clears link state ONLY. The four preference columns and the row itself
      // survive, because the store's disconnect seam says so explicitly:
      // "Clears `connected` only — notification and delivery preferences are
      // left as-is, so reconnecting doesn't ask the user to redo them."
      //
      // That contract is also why this is POST /disconnect and not
      // DELETE /integrations/telegram: DELETE implies removing the resource,
      // which is precisely the behaviour the frontend says must not happen.
      const result = await client.query(
        `UPDATE telegram_integration
            SET telegram_chat_id      = NULL,
                telegram_username     = NULL,
                linked_at             = NULL,
                link_code             = NULL,
                link_code_expires_at  = NULL,
                updated_at            = NOW()
          WHERE user_id = $1
        RETURNING ${TELEGRAM_COLUMNS}`,
        [userId]
      );

      // Audited only when something was actually disconnected, so the trail
      // records real state changes rather than every button press. Matches the
      // 'google_disconnected' event this route is modelled on.
      if (wasConnected) {
        await client.query(
          `INSERT INTO audit_events (user_id, event_type, actor, details)
           VALUES ($1, 'telegram_disconnected', 'user', $2)`,
          [userId, JSON.stringify({ provider: 'telegram' })]
        );
      }

      await client.query('COMMIT');

      // Disconnecting a never-connected integration is a no-op, not a 404 —
      // the end state the caller asked for is the state they already have.
      res.json(toTelegramIntegration(result.rows[0]));
    } catch {
      await client.query('ROLLBACK');
      next(new AppError(ErrorCode.INTERNAL_ERROR, 'Failed to disconnect Telegram', 500));
    } finally {
      client.release();
    }
  }
);

// ─── POST /integrations/telegram/test ─────────────────────────────────────────
integrationsRouter.post(
  '/telegram/test',
  authenticateJwt,
  telegramTestRateLimiter,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;

    if (!isTelegramConfigured()) {
      return next(
        new AppError(
          ErrorCode.TELEGRAM_NOT_CONFIGURED,
          'Telegram integration is not configured on this server',
          503
        )
      );
    }

    try {
      const result = await query(
        `SELECT telegram_chat_id FROM telegram_integration WHERE user_id = $1`,
        [userId]
      );
      const chatId: string | null = result.rows[0]?.telegram_chat_id ?? null;

      if (!chatId) {
        return next(
          new AppError(
            ErrorCode.TELEGRAM_NOT_CONNECTED,
            'No Telegram chat is linked to this account',
            409
          )
        );
      }

      const sendResult = await sendMessage(
        chatId,
        'Obligo test notification — your Telegram integration is working.'
      );

      if (!sendResult.ok) {
        return next(new AppError(ErrorCode.TELEGRAM_SEND_FAILED, sendResult.reason, 502));
      }

      // The frontend's TestNotificationResult is `{ok:true} | {ok:false,
      // reason}`. Only the success half is served here as a body; failures use
      // the standard {error, message, requestId} envelope, which the client
      // adapter maps into the `ok:false` half. One error channel, not two.
      res.json({ ok: true });
    } catch (error: unknown) {
      next(
        error instanceof AppError
          ? error
          : new AppError(ErrorCode.INTERNAL_ERROR, 'Failed to send test notification', 500)
      );
    }
  }
);

// ─── POST /integrations/telegram/webhook ──────────────────────────────────────
/**
 * Telegram's callback — the step that actually connects an integration.
 *
 * DELIBERATELY NOT `authenticateJwt`: Telegram has no session with us. Its only
 * credential is the `X-Telegram-Bot-Api-Secret-Token` header, echoed back from
 * what we registered with setWebhook, compared timing-safe.
 *
 * Always answers 200 once the secret checks out, whatever the payload turned
 * out to be. Telegram retries any non-2xx, so returning an error for an update
 * we simply don't handle (a plain message, an edit, a channel post) would earn
 * an indefinite redelivery loop for traffic that will never become valid.
 */
integrationsRouter.post(
  '/telegram/webhook',
  telegramWebhookRateLimiter,
  async (req: Request, res: Response) => {
    if (!verifyWebhookSecret(req.headers['x-telegram-bot-api-secret-token'])) {
      // 401 with no envelope detail: an unauthenticated caller learns only
      // that it was rejected, never whether a secret is configured at all.
      res.status(401).json({ error: ErrorCode.AUTH_REQUIRED, message: 'Unauthorized' });
      return;
    }

    const start = parseStartCommand(req.body);
    if (!start) {
      res.json({ ok: true });
      return;
    }

    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // A Telegram chat must belong to at most ONE Obligo account. Without
      // this, someone who links their chat to account A and later to account B
      // would leave BOTH rows pointing at the same chat — and that chat would
      // then receive another person's email notifications. Re-linking moves
      // the chat rather than duplicating it, which is also the behaviour a
      // user re-running /start from a second account would expect.
      //
      // Belt and braces: migration 011 also carries a partial unique index on
      // telegram_chat_id, so a future code path that forgets this cannot
      // recreate the cross-delivery bug silently.
      const displacedRes = await client.query(
        `UPDATE telegram_integration
            SET telegram_chat_id  = NULL,
                telegram_username = NULL,
                linked_at         = NULL,
                updated_at        = NOW()
          WHERE telegram_chat_id = $1
        RETURNING user_id`,
        [start.chatId]
      );

      // Single-use and time-bounded, enforced in the UPDATE's WHERE clause
      // rather than in application code — the same "let the database enforce
      // it" approach intelligenceService.ts uses for protected statuses. A
      // replayed or expired code matches no row and connects nothing.
      const result = await client.query(
        `UPDATE telegram_integration
            SET telegram_chat_id     = $2,
                telegram_username    = $3,
                linked_at            = NOW(),
                link_code            = NULL,
                link_code_expires_at = NULL,
                updated_at           = NOW()
          WHERE link_code = $1
            AND link_code_expires_at > NOW()
        RETURNING user_id`,
        [start.linkCode, start.chatId, start.username]
      );

      if (result.rows.length === 0) {
        // Nothing was linked, so the displacement above must not stand either —
        // an unknown or expired code would otherwise silently disconnect a
        // perfectly good existing integration.
        await client.query('ROLLBACK');
        console.warn('[Telegram] Webhook presented an unknown or expired link code');
        res.json({ ok: true });
        return;
      }

      const userId: string = result.rows[0].user_id;

      for (const displaced of displacedRes.rows) {
        if (displaced.user_id === userId) continue;
        await client.query(
          `INSERT INTO audit_events (user_id, event_type, actor, details)
           VALUES ($1, 'telegram_disconnected', 'user', $2)`,
          [displaced.user_id, JSON.stringify({ provider: 'telegram', reason: 'chat_relinked' })]
        );
      }

      await client.query(
        `INSERT INTO audit_events (user_id, event_type, actor, details)
         VALUES ($1, 'telegram_connected', 'user', $2)`,
        [userId, JSON.stringify({ provider: 'telegram' })]
      );

      await client.query('COMMIT');

      // Best-effort confirmation into the chat that just linked, sent AFTER the
      // commit. A failure here must not undo the binding — the link is already
      // durable, and the user can verify with "Send test notification".
      await sendMessage(
        start.chatId,
        'Obligo is now connected. You will receive notifications here based on your settings.'
      );

      res.json({ ok: true });
    } catch {
      await client.query('ROLLBACK');
      // 500 only for a genuine server fault, where Telegram's retry is exactly
      // what we want.
      console.error('[Telegram] Webhook processing failed');
      res.status(500).json({ error: ErrorCode.INTERNAL_ERROR, message: 'Webhook processing failed' });
    } finally {
      client.release();
    }
  }
);
