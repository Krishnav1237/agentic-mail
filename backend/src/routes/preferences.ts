/**
 * GET/PUT /preferences — the backend half of `frontend/src/lib/settingsStore.ts`.
 *
 * The store's own header names this seam: "`save()` below is the single
 * function that gains a `PUT /preferences`, and a `hydrate()` its `GET`. The
 * payload is already exactly `AgentPreferences` — no mapping layer." Migration
 * 009 made that literally true by replacing `user_preferences`' ad hoc columns
 * with one `preferences JSONB` holding exactly what `sanitizePreferences()`
 * produces. So this file has no adapter in either direction: every key below
 * is the frontend key, at the same nesting depth, with the same allowed values.
 *
 * WHY VALIDATION IS ASYMMETRIC BETWEEN READ AND WRITE.
 *
 *   READ  is lenient. `user_preferences.preferences` defaults to `{}` (the row
 *         is created empty by the OAuth callback), and a blob written by an
 *         older deploy may be missing fields entirely. Every missing or
 *         unrecognised field falls back to its default so the response is
 *         always a complete AgentPreferences — the frontend's
 *         `sanitizePreferences` exists for exactly this reason and this is its
 *         server-side mirror.
 *   WRITE is strict. The only writer is our own client, which runs
 *         `sanitizePreferences` before `save()` and so structurally cannot
 *         send an invalid enum. If one arrives anyway it is a bug worth a 400
 *         rather than a silent coercion. Strict-object parsing also keeps the
 *         stored blob from accumulating keys no reader understands.
 *
 * WHAT IS DELIBERATELY NOT MIRRORED HERE: the frontend's legacy migrations
 * (`topicWeights` -> `highPriorityTopics`, three-state `followup` -> off/on).
 * Nothing was ever written to this column in either legacy shape — the column
 * is new as of 009 — so a server-side copy would be dead code guarding against
 * data that cannot exist.
 *
 * ENUM DRIFT IS A KNOWN, ACCEPTED RISK. `agentPreferences.ts` argues these are
 * shared product decisions that "cannot silently disagree", but there is no
 * package shared between frontend and backend today, so the unions below are a
 * second hand-maintained copy. Changing a value in either place means changing
 * it in both.
 */
import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { authenticateJwt, AuthenticatedRequest } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rateLimit.js';
import { AppError, ErrorCode } from '../errors/AppError.js';

export const preferencesRouter = Router();

// Every control on the Settings page commits immediately — there is no Save
// button — so flipping ten toggles is ten writes. Sized well above the
// email_action limiter accordingly, and kept as its own instance per audit §9.
// NOTE: middleware/rateLimit.ts keys on client IP, not user id, so this bucket
// is shared by everyone behind one NAT. Pre-existing; not fixed here.
const preferencesWriteRateLimiter = rateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  keyPrefix: 'preferences_write',
});

// ─── The AgentPreferences contract ────────────────────────────────────────────
// Mirrors frontend/src/lib/agentPreferences.ts. Field order matches that file.

const REPLY_DRAFTING = ['off', 'review', 'auto'] as const;
const REPLY_TONE = ['neutral', 'professional', 'friendly', 'personalized'] as const;
const AUTOMATION_LEVEL = ['never', 'suggest', 'automatic'] as const;
const FOLLOW_UP_MODE = ['off', 'on'] as const;
const CLEANUP_ACTION = ['keep', 'archive', 'spam', 'delete'] as const;
const CLEANUP_CATEGORIES = ['promotions', 'newsletters', 'marketing', 'banking'] as const;
const PRIORITY_TOPICS = [
  'career',
  'academic',
  'finance',
  'personal',
  'health',
  'networking',
  'travel',
  'shopping',
] as const;
const URGENCY_COLORS = ['coral', 'amber', 'rose', 'magenta', 'crimson'] as const;
const IMPORTANCE_COLORS = ['gold', 'teal', 'blue', 'violet', 'green'] as const;

type CleanupCategory = (typeof CLEANUP_CATEGORIES)[number];
type CleanupAction = (typeof CLEANUP_ACTION)[number];
type PriorityTopic = (typeof PRIORITY_TOPICS)[number];

/** Byte-for-byte DEFAULT_PREFERENCES from agentPreferences.ts. */
const DEFAULT_PREFERENCES = {
  replyDrafting: 'review',
  replyTone: 'neutral',
  automation: { archive: 'suggest', followup: 'off' },
  cleanup: {
    promotions: 'keep',
    newsletters: 'keep',
    marketing: 'keep',
    banking: 'keep',
  },
  highPriorityTopics: [] as PriorityTopic[],
  beta: false,
  urgencyColor: 'coral',
  importanceColor: 'gold',
  quickAccessCollapsed: false,
} as const;

export type AgentPreferences = {
  replyDrafting: (typeof REPLY_DRAFTING)[number];
  replyTone: (typeof REPLY_TONE)[number];
  automation: {
    archive: (typeof AUTOMATION_LEVEL)[number];
    followup: (typeof FOLLOW_UP_MODE)[number];
  };
  cleanup: Record<CleanupCategory, CleanupAction>;
  highPriorityTopics: PriorityTopic[];
  beta: boolean;
  urgencyColor: (typeof URGENCY_COLORS)[number];
  importanceColor: (typeof IMPORTANCE_COLORS)[number];
  quickAccessCollapsed: boolean;
};

/**
 * The write contract: a COMPLETE AgentPreferences, replace-not-merge.
 *
 * Replace rather than a partial merge because `settingsActions.update()`
 * already merges locally and hands `save()` a whole object, and `hydrate()` is
 * documented replace-not-merge. A second, server-side merge semantics could
 * disagree with the store's, so there is only one.
 *
 * `.strict()` at every level: an unknown key is a 400, not a silently dropped
 * field. That is what keeps the stored blob readable by every future reader.
 */
const AgentPreferencesSchema = z
  .object({
    replyDrafting: z.enum(REPLY_DRAFTING),
    replyTone: z.enum(REPLY_TONE),
    automation: z
      .object({
        archive: z.enum(AUTOMATION_LEVEL),
        followup: z.enum(FOLLOW_UP_MODE),
      })
      .strict(),
    cleanup: z
      .object({
        promotions: z.enum(CLEANUP_ACTION),
        newsletters: z.enum(CLEANUP_ACTION),
        marketing: z.enum(CLEANUP_ACTION),
        banking: z.enum(CLEANUP_ACTION),
      })
      .strict(),
    // Ordered and de-duplicated, matching migrateHighPriorityTopics' contract
    // ("first occurrence wins, so a corrupted double-entry can't silently
    // double a topic's rank"). Order is the user's own organization and is
    // preserved exactly; it is not read by any rule.
    highPriorityTopics: z
      .array(z.enum(PRIORITY_TOPICS))
      .max(PRIORITY_TOPICS.length)
      .refine(
        (topics) => new Set(topics).size === topics.length,
        'highPriorityTopics must not contain duplicates'
      ),
    beta: z.boolean(),
    urgencyColor: z.enum(URGENCY_COLORS),
    importanceColor: z.enum(IMPORTANCE_COLORS),
    quickAccessCollapsed: z.boolean(),
  })
  .strict();

/**
 * The read path's server-side `sanitizePreferences` — every missing or
 * unrecognised field falls back to its default so callers can treat every
 * field as present.
 *
 * Deliberately hand-rolled per field rather than `AgentPreferencesSchema
 * .partial()`: the frontend's contract is field-level fallback, not
 * all-or-nothing. A blob with one bad enum must yield eight good fields and
 * one default, not the whole default object.
 */
function normalizePreferences(raw: unknown): AgentPreferences {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(value as T) ? (value as T) : fallback;

  const automation = (input.automation ?? {}) as Record<string, unknown>;
  const cleanupInput = (input.cleanup ?? {}) as Record<string, unknown>;

  const cleanup = Object.fromEntries(
    CLEANUP_CATEGORIES.map((category) => [
      category,
      oneOf(cleanupInput[category], CLEANUP_ACTION, DEFAULT_PREFERENCES.cleanup[category]),
    ])
  ) as Record<CleanupCategory, CleanupAction>;

  const rawTopics = Array.isArray(input.highPriorityTopics) ? input.highPriorityTopics : [];
  const seen = new Set<PriorityTopic>();
  const highPriorityTopics: PriorityTopic[] = [];
  for (const topic of rawTopics) {
    if (PRIORITY_TOPICS.includes(topic as PriorityTopic) && !seen.has(topic as PriorityTopic)) {
      seen.add(topic as PriorityTopic);
      highPriorityTopics.push(topic as PriorityTopic);
    }
  }

  return {
    replyDrafting: oneOf(input.replyDrafting, REPLY_DRAFTING, DEFAULT_PREFERENCES.replyDrafting),
    replyTone: oneOf(input.replyTone, REPLY_TONE, DEFAULT_PREFERENCES.replyTone),
    automation: {
      archive: oneOf(automation.archive, AUTOMATION_LEVEL, DEFAULT_PREFERENCES.automation.archive),
      followup: oneOf(automation.followup, FOLLOW_UP_MODE, DEFAULT_PREFERENCES.automation.followup),
    },
    cleanup,
    highPriorityTopics,
    beta: typeof input.beta === 'boolean' ? input.beta : DEFAULT_PREFERENCES.beta,
    urgencyColor: oneOf(input.urgencyColor, URGENCY_COLORS, DEFAULT_PREFERENCES.urgencyColor),
    importanceColor: oneOf(
      input.importanceColor,
      IMPORTANCE_COLORS,
      DEFAULT_PREFERENCES.importanceColor
    ),
    quickAccessCollapsed:
      typeof input.quickAccessCollapsed === 'boolean'
        ? input.quickAccessCollapsed
        : DEFAULT_PREFERENCES.quickAccessCollapsed,
  };
}

// ─── GET /preferences ─────────────────────────────────────────────────────────
preferencesRouter.get(
  '/',
  authenticateJwt,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;

    try {
      const result = await query(
        `SELECT preferences FROM user_preferences WHERE user_id = $1`,
        [userId]
      );

      // No row is not an error. The OAuth callback creates one, but a user
      // predating that line (or created directly in a test) may have none —
      // and the frontend has no "preferences do not exist" state, only
      // DEFAULT_PREFERENCES. normalizePreferences({}) is exactly that.
      res.json(normalizePreferences(result.rows[0]?.preferences));
    } catch {
      next(new AppError(ErrorCode.INTERNAL_ERROR, 'Failed to fetch preferences', 500));
    }
  }
);

// ─── PUT /preferences ─────────────────────────────────────────────────────────
preferencesRouter.put(
  '/',
  authenticateJwt,
  preferencesWriteRateLimiter,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;

    const parseResult = AgentPreferencesSchema.safeParse(req.body);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      return next(
        new AppError(
          ErrorCode.VALIDATION_ERROR,
          `Invalid preferences payload: ${issue.path.join('.') || 'body'} — ${issue.message}`,
          400
        )
      );
    }
    const preferences = parseResult.data;

    try {
      // Upsert, not a bare UPDATE: the row is normally created by the OAuth
      // callback, but a user predating that line would otherwise silently
      // write nothing and read back defaults forever.
      //
      // Only the `preferences` column is written. `iana_timezone` lives on this
      // same table and is NOT an AgentPreferences field — migration 009 left it
      // deliberately alone, and this route must not clobber it.
      const result = await query(
        `INSERT INTO user_preferences (user_id, preferences)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (user_id) DO UPDATE
           SET preferences = EXCLUDED.preferences,
               updated_at  = NOW()
         RETURNING preferences`,
        [userId, JSON.stringify(preferences)]
      );

      // Echo the stored value rather than the request body, so the client
      // re-hydrates from what was actually persisted.
      res.json(normalizePreferences(result.rows[0]?.preferences));
    } catch {
      next(new AppError(ErrorCode.INTERNAL_ERROR, 'Failed to save preferences', 500));
    }
  }
);
