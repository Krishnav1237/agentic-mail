/**
 * GET/PUT /profile — the backend half of `frontend/src/lib/userProfileStore.ts`.
 *
 * The store names the seam directly: "`updateProfile`/`setUploadedPhoto` take
 * the same shape a `PUT /profile` would". Both, plus `removePhoto`, funnel
 * through one `save(next: UserProfile)` that holds the complete object at the
 * moment of the call — so a single PUT carrying the writable subset serves all
 * three call sites.
 *
 * WHAT IS WRITABLE, AND WHY THE REST IS REJECTED RATHER THAN IGNORED.
 *
 *   displayName   writable.
 *   profilePhoto  writable, `none` and `provider` only — see below.
 *   email         NOT writable. `userProfile.ts` states the rule: it "is not an
 *                 ordinary freely-editable field. Changing it goes through
 *                 `emailChange`, never a direct write."
 *   emailChange   NOT writable, and not persisted at all — see below.
 *
 * A body carrying either read-only field is a 400, not a silent discard.
 * Accepting a field and then ignoring it is the failure mode worth avoiding:
 * the caller has no way to learn its write did nothing.
 *
 * PROFILE PHOTO — `provider` AND `none` ONLY IN THIS PHASE.
 * `uploaded` carries a client-side data URL with no storage behind it (no
 * object store is configured) that would exceed express.json's 512kb body
 * limit for most real photos. `provider` costs nothing: `profile` is already
 * in GMAIL_SCOPES, so the OAuth callback already receives Google's `picture`
 * and populates it with no re-consent. `userProfile.ts` reserves the variant
 * for exactly this ("the Google account picture that comes with Gmail
 * sign-in... modeled now so a backend can hand this shape over without a
 * second migration later"). Accepting `uploaded` is a route change once real
 * blob storage exists — migration 011's CHECK constraint already admits it.
 *
 * EMAIL CHANGE — OUT OF SCOPE, REPORTED AS THE STEADY STATE.
 * Auth is Google-OAuth-only, `users.email` is upserted from Google on every
 * login, and a real current -> new -> verified flow needs a token table plus
 * outbound email infrastructure, neither of which exists. GET therefore always
 * reports `{status:'none'}`. The alternative — storing a pending request that
 * nothing can ever confirm — would put a permanently-unresolvable state in the
 * database, which is worse than not having the feature.
 */
import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { authenticateJwt, AuthenticatedRequest } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rateLimit.js';
import { AppError, ErrorCode } from '../errors/AppError.js';

export const profileRouter = Router();

const profileWriteRateLimiter = rateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  keyPrefix: 'profile_write',
});

/** Mirrors userProfile.ts's `isValidDisplayName`: free text, but not empty
 * text. The 200-char cap is backend-only — the frontend has no length rule,
 * and an unbounded TEXT write from a client is worth bounding. */
const DISPLAY_NAME_MAX = 200;

/**
 * The frontend `ProfilePhoto` union, minus the variant this phase cannot back.
 *
 * `uploaded` is rejected with a message that names the reason, so a client
 * that still offers an upload control gets a comprehensible 400 rather than a
 * generic shape error.
 */
const ProfilePhotoSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }).strict(),
  z.object({ kind: z.literal('provider'), url: z.string().url().max(2048) }).strict(),
]);

const ProfileUpdateSchema = z
  .object({
    displayName: z
      .string()
      .max(DISPLAY_NAME_MAX)
      .refine((name) => name.trim().length > 0, 'displayName must not be empty'),
    profilePhoto: ProfilePhotoSchema,
  })
  .strict();

type ProfilePhoto =
  | { kind: 'none' }
  | { kind: 'uploaded'; dataUrl: string }
  | { kind: 'provider'; url: string };

export type UserProfile = {
  displayName: string;
  profilePhoto: ProfilePhoto;
  email: string;
  emailChange: { status: 'none' };
};

/**
 * Guarantees a non-empty display name, because `sanitizeProfile` falls back to
 * `DEFAULT_PROFILE.displayName` — the hardcoded demo constant 'Alex Rivera' —
 * for anything empty. A real user must never briefly render as the demo
 * identity, so the fallback chain ends at the email local-part instead.
 */
function resolveDisplayName(row: {
  display_name: string | null;
  full_name: string | null;
  email: string;
}): string {
  if (row.display_name && row.display_name.trim()) return row.display_name;
  if (row.full_name && row.full_name.trim()) return row.full_name;
  return row.email.split('@')[0];
}

/** Reconciles a stored photo blob against the shape the frontend expects.
 * `uploaded` is passed through on READ even though it cannot be written — a
 * row could hold one once blob storage lands, and dropping it here would make
 * this route lose data it merely doesn't yet author. */
function normalizeProfilePhoto(raw: unknown): ProfilePhoto {
  if (raw && typeof raw === 'object') {
    const candidate = raw as Record<string, unknown>;
    if (candidate.kind === 'provider' && typeof candidate.url === 'string' && candidate.url) {
      return { kind: 'provider', url: candidate.url };
    }
    if (candidate.kind === 'uploaded' && typeof candidate.dataUrl === 'string' && candidate.dataUrl) {
      return { kind: 'uploaded', dataUrl: candidate.dataUrl };
    }
  }
  return { kind: 'none' };
}

function toUserProfile(row: {
  display_name: string | null;
  full_name: string | null;
  email: string;
  profile_photo: unknown;
}): UserProfile {
  return {
    displayName: resolveDisplayName(row),
    profilePhoto: normalizeProfilePhoto(row.profile_photo),
    email: row.email,
    // Server-owned and constant for now. Present in the response because the
    // frontend's `hydrate` replaces the whole object and would otherwise leave
    // the field undefined for `sanitizeProfile` to guess at.
    emailChange: { status: 'none' },
  };
}

const PROFILE_COLUMNS = 'display_name, full_name, email, profile_photo';

// ─── GET /profile ─────────────────────────────────────────────────────────────
profileRouter.get(
  '/',
  authenticateJwt,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;

    try {
      const result = await query(
        `SELECT ${PROFILE_COLUMNS} FROM users WHERE id = $1`,
        [userId]
      );

      // Unlike /preferences, a missing row here IS an error: it means a valid
      // JWT names a user that no longer exists (deleted account, wrong
      // database). There is no sensible default identity to invent.
      if (result.rows.length === 0) {
        return next(new AppError(ErrorCode.NOT_FOUND, 'User not found', 404));
      }

      res.json(toUserProfile(result.rows[0]));
    } catch (error: unknown) {
      next(
        error instanceof AppError
          ? error
          : new AppError(ErrorCode.INTERNAL_ERROR, 'Failed to fetch profile', 500)
      );
    }
  }
);

// ─── PUT /profile ─────────────────────────────────────────────────────────────
profileRouter.put(
  '/',
  authenticateJwt,
  profileWriteRateLimiter,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;

    // Named rejections for the two read-only fields, so a client sending a
    // whole UserProfile learns which field it may not write rather than
    // getting an opaque "unrecognized key".
    const body = (req.body ?? {}) as Record<string, unknown>;
    if ('email' in body) {
      return next(
        new AppError(
          ErrorCode.VALIDATION_ERROR,
          'email is not writable through PUT /profile — the account address changes only through a verified email-change flow',
          400
        )
      );
    }
    if ('emailChange' in body) {
      return next(
        new AppError(
          ErrorCode.VALIDATION_ERROR,
          'emailChange is not writable — email-change verification is not implemented',
          400
        )
      );
    }
    if (
      body.profilePhoto &&
      typeof body.profilePhoto === 'object' &&
      (body.profilePhoto as Record<string, unknown>).kind === 'uploaded'
    ) {
      return next(
        new AppError(
          ErrorCode.VALIDATION_ERROR,
          'Uploaded profile photos are not supported yet — no image storage is configured. Use {"kind":"none"} or {"kind":"provider","url":...}',
          400
        )
      );
    }

    const parseResult = ProfileUpdateSchema.safeParse(body);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      return next(
        new AppError(
          ErrorCode.VALIDATION_ERROR,
          `Invalid profile payload: ${issue.path.join('.') || 'body'} — ${issue.message}`,
          400
        )
      );
    }
    const { displayName, profilePhoto } = parseResult.data;

    try {
      // display_name, never full_name. full_name is the Google-supplied value
      // and is overwritten by `full_name = EXCLUDED.full_name` on every login
      // (routes/auth.ts) — writing the user's chosen name there would see it
      // silently reverted at the next sign-in. See migration 011.
      const result = await query(
        `UPDATE users
            SET display_name  = $2,
                profile_photo = $3::jsonb,
                updated_at    = NOW()
          WHERE id = $1
        RETURNING ${PROFILE_COLUMNS}`,
        [userId, displayName.trim(), JSON.stringify(profilePhoto)]
      );

      if (result.rows.length === 0) {
        return next(new AppError(ErrorCode.NOT_FOUND, 'User not found', 404));
      }

      // Response is a superset of the request on purpose — it carries the
      // server-owned `email` and `emailChange` too, so the client re-hydrates
      // a complete UserProfile in one round-trip.
      res.json(toUserProfile(result.rows[0]));
    } catch (error: unknown) {
      next(
        error instanceof AppError
          ? error
          : new AppError(ErrorCode.INTERNAL_ERROR, 'Failed to save profile', 500)
      );
    }
  }
);
