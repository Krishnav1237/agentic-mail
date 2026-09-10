/**
 * The Telegram Bot API boundary — the only file that talks to telegram.org.
 *
 * Kept out of `routes/integrations.ts` for the reason every other service here
 * is split out: the route owns HTTP shape, ownership checks and persistence;
 * this owns the provider protocol. It holds no database access and no Express
 * types, so the linking flow can be exercised without a request.
 *
 * SECRET HANDLING. `TELEGRAM_BOT_TOKEN` is a bearer credential that appears in
 * the request URL (the Bot API's own design). It must never reach a log line,
 * an error message, or an API response — every failure path below returns a
 * bounded reason string, never the URL or the raw provider body, matching the
 * rules in errors/AppError.ts.
 */
import crypto from 'crypto';
import { env } from '../config/env.js';

const TELEGRAM_API_BASE = 'https://api.telegram.org';

/** Telegram's public deep-link host — a different domain from the Bot API's,
 * not a variant of it. */
const TELEGRAM_LINK_BASE = 'https://t.me';

/** Telegram's own cap is 4096 characters per message. */
const MAX_MESSAGE_CHARS = 4096;

const REQUEST_TIMEOUT_MS = 10_000;

/** Minutes a link code stays usable. Short on purpose: the code is a bearer
 * credential for binding a Telegram chat to an Obligo account, and the user is
 * expected to act on it immediately (the deep link opens Telegram straight
 * away). */
export const LINK_CODE_TTL_MINUTES = 15;

/**
 * Whether a bot is configured at all. Every environment without
 * `TELEGRAM_BOT_TOKEN` still boots and still serves GET/PUT
 * /integrations/telegram for preferences — only connect and test require a
 * real bot, and they return TELEGRAM_NOT_CONFIGURED rather than failing
 * obscurely inside a fetch.
 */
export function isTelegramConfigured(): boolean {
  return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_BOT_USERNAME);
}

/**
 * A single-use code binding a Telegram chat to an Obligo account.
 *
 * 32 bytes of CSPRNG output, base64url so it survives a `t.me` deep link
 * unescaped. Telegram caps the `start` payload at 64 characters, which
 * 32 bytes (43 chars encoded) fits with room to spare.
 */
export function generateLinkCode(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * The deep link handed to the client by POST /integrations/telegram/connect.
 * Opening it in Telegram pre-fills `/start <code>`, which the bot delivers to
 * our webhook — that round-trip, not this URL, is what actually connects the
 * integration.
 */
export function buildLinkUrl(linkCode: string): string {
  return `${TELEGRAM_LINK_BASE}/${env.TELEGRAM_BOT_USERNAME}?start=${linkCode}`;
}

/**
 * Validates the webhook's only credential.
 *
 * The webhook has no JWT session — Telegram calls it — so this header is the
 * entire gate. Compared timing-safe for the same reason the CSRF check in
 * middleware/auth.ts is: an attacker who can measure comparison time can
 * otherwise recover the secret a byte at a time.
 *
 * Returns false when no secret is configured, so an unconfigured deployment
 * rejects webhook traffic outright rather than accepting anything.
 */
export function verifyWebhookSecret(header: unknown): boolean {
  const expected = env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return false;
  if (typeof header !== 'string' || header.length !== expected.length) return false;

  try {
    return crypto.timingSafeEqual(Buffer.from(header, 'utf8'), Buffer.from(expected, 'utf8'));
  } catch {
    return false;
  }
}

/**
 * Parses the `/start <code>` payload out of a webhook update.
 *
 * Returns null for every other kind of update — Telegram delivers many, and
 * this integration cares about exactly one. Never throws on a malformed body:
 * an unauthenticated-by-design endpoint receives whatever the internet sends.
 */
export function parseStartCommand(update: unknown): {
  linkCode: string;
  chatId: string;
  username: string | null;
} | null {
  if (!update || typeof update !== 'object') return null;

  const message = (update as Record<string, unknown>).message;
  if (!message || typeof message !== 'object') return null;

  const { text, chat, from } = message as Record<string, unknown>;
  if (typeof text !== 'string') return null;
  if (!chat || typeof chat !== 'object') return null;

  const chatId = (chat as Record<string, unknown>).id;
  if (typeof chatId !== 'number' && typeof chatId !== 'string') return null;

  const match = /^\/start\s+(\S{1,128})$/.exec(text.trim());
  if (!match) return null;

  const username =
    from && typeof from === 'object' && typeof (from as Record<string, unknown>).username === 'string'
      ? ((from as Record<string, unknown>).username as string)
      : null;

  return { linkCode: match[1], chatId: String(chatId), username };
}

export type TelegramSendResult = { ok: true } | { ok: false; reason: string };

/**
 * Sends one message to a linked chat.
 *
 * Never throws — every failure is a bounded `reason` string the caller can put
 * in an error envelope. Raw provider bodies are logged server-side (where
 * they're useful for correlation) and never returned.
 */
export async function sendMessage(chatId: string, text: string): Promise<TelegramSendResult> {
  if (!isTelegramConfigured()) {
    return { ok: false, reason: 'Telegram bot is not configured' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(
      `${TELEGRAM_API_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text.slice(0, MAX_MESSAGE_CHARS),
          disable_notification: false,
        }),
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      // 403 is the one worth naming: it means the user blocked the bot or
      // deleted the chat, which is a user-actionable state rather than an
      // outage. The caller surfaces it differently from a generic failure.
      console.error('[Telegram] sendMessage failed', { status: res.status });
      if (res.status === 403) {
        return { ok: false, reason: 'Telegram chat is no longer reachable — the bot may have been blocked' };
      }
      if (res.status === 429) {
        return { ok: false, reason: 'Telegram is rate limiting this bot — try again shortly' };
      }
      return { ok: false, reason: 'Telegram rejected the message' };
    }

    return { ok: true };
  } catch (error: unknown) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    console.error('[Telegram] sendMessage error', { aborted });
    return {
      ok: false,
      reason: aborted ? 'Telegram did not respond in time' : 'Could not reach Telegram',
    };
  } finally {
    clearTimeout(timer);
  }
}
