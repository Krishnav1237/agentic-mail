/**
 * Account identity: display name, avatar and email-change state.
 *
 * Deliberately separate from `AgentPreferences` (Obligo behavior configuration)
 * and from `mailAdapters`' `CURRENT_USER_NAME`/`CURRENT_USER_EMAIL` (the
 * canonical mailbox identity every "is this me?" check in the mail system
 * reads). This file is the fourth, distinct concern: Account/Auth, alongside
 * Settings, Mail and Workflow — a user can rename their display name or swap
 * their avatar without touching anything mail-identity or Obligo-behavior
 * related.
 *
 * Same split as `agentPreferences.ts`: pure types, defaults and a
 * `sanitize*` function, free of React/storage/UI. `userProfileStore.ts` wires
 * this to persistence the same way `settingsStore.ts` wires `agentPreferences.ts`.
 */
import { CURRENT_USER_EMAIL, CURRENT_USER_NAME, initialsOf } from './mailAdapters';

/** Where a requested email change stands. `none` is the steady state; a real
 * backend is what will ever move this to `pending` -> `confirmed` for real —
 * here it only models the shape so the UI has something to render. */
export type EmailChangeStatus = 'none' | 'pending';

export type EmailChangeRequest = {
  status: EmailChangeStatus;
  /** The address awaiting confirmation. Present only while `status` is
   * `'pending'`. */
  requestedEmail?: string;
};

/**
 * Where the account's picture, if any, comes from — an explicit tag, not
 * something inferred from whether a URL happens to be truthy. Three cases
 * a real backend can eventually populate:
 *
 *   `none`     — nothing on file. The avatar falls back to initials generated
 *                from `displayName` (see `resolveAvatar`) — that fallback is
 *                never itself stored as photo data.
 *   `uploaded` — the user picked a file in this app. `dataUrl` is a client-
 *                side data URL; see `profileActions.setUploadedPhoto` for why
 *                there is no real upload/storage behind this yet.
 *   `provider` — reserved for a future OAuth handshake (e.g. the Google
 *                account picture that comes with Gmail sign-in). Not
 *                reachable from any UI today, but modeled now so a backend
 *                can hand this shape over without a second migration later.
 */
export type ProfilePhoto =
  | { kind: 'none' }
  | { kind: 'uploaded'; dataUrl: string }
  | { kind: 'provider'; url: string };

export const NO_PROFILE_PHOTO: ProfilePhoto = { kind: 'none' };

/** What an `Avatar` should actually render — the ONE decision every avatar
 * surface (topbar, account menu, Profile page) defers to, rather than each
 * independently checking "is there an image" and "what are the initials".
 * `resolveAvatar` is the only place this decision is made. */
export type AvatarResolution =
  | { kind: 'image'; url: string }
  | { kind: 'initials'; text: string };

/**
 * Everything this page renders and edits. This shape IS the future
 * `PUT /profile` payload, same contract `AgentPreferences` already keeps with
 * a future `PUT /preferences` — typed values, no display strings, so
 * relabelling a control here can never change what a backend would receive.
 */
export type UserProfile = {
  /** A DISPLAY NAME, not a username — free text, no uniqueness rule, no
   * @handle. The email is the account's unique identifier; this is only
   * ever shown, never looked up by. */
  displayName: string;
  /** Independent from `displayName` on purpose — see `ProfilePhoto`. Never
   * holds generated initials; those are always derived, never stored. */
  profilePhoto: ProfilePhoto;
  /** The account's confirmed email — the identity address, not an ordinary
   * freely-editable field. Changing it goes through `emailChange` below,
   * never a direct write. */
  email: string;
  emailChange: EmailChangeRequest;
};

/** Seeded from the same identity `mailAdapters` already treats as canonical,
 * so a fresh profile starts as "the name/email associated with this Gmail
 * identity" — exactly what a real OAuth handshake would hand this page on
 * first login, once one exists. */
export const DEFAULT_PROFILE: UserProfile = {
  displayName: CURRENT_USER_NAME,
  profilePhoto: NO_PROFILE_PHOTO,
  email: CURRENT_USER_EMAIL,
  emailChange: { status: 'none' },
};

/** A display name is free text but not *empty* text — an account with no
 * name at all has nothing for the avatar menu, the topbar avatar's tooltip
 * or any future "from" line to show. Whitespace-only input is rejected the
 * same as empty. */
export function isValidDisplayName(name: string): boolean {
  return name.trim().length > 0;
}

/** Extremely light shape check — this is a frontend seam, not validation
 * that stands in for a real verification email. Good enough to keep the
 * "enter new email" step from submitting obvious garbage; no more. */
export function isPlausibleEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * THE single answer to "what avatar should this user have?" — every avatar
 * surface (topbar trigger, account menu, Profile page's own preview) renders
 * through this, never through its own `imageUrl ? ... : initials` branch.
 *
 * An uploaded or provider photo always wins; otherwise initials are
 * generated fresh from the CURRENT `displayName` every time this runs — never
 * cached, never stored — so renaming the account updates the fallback
 * immediately and removing a photo falls back to whatever the name is now,
 * with no separate "did the image fail to load" check involved.
 */
export function resolveAvatar(profile: {
  displayName: string;
  profilePhoto: ProfilePhoto;
}): AvatarResolution {
  if (profile.profilePhoto.kind === 'uploaded') {
    return { kind: 'image', url: profile.profilePhoto.dataUrl };
  }
  if (profile.profilePhoto.kind === 'provider') {
    return { kind: 'image', url: profile.profilePhoto.url };
  }
  return { kind: 'initials', text: initialsOf(profile.displayName) };
}

/**
 * Reconciles a stored/received blob against the current shape — same reason
 * `sanitizePreferences` exists: a blob from an older build, or one day a
 * different backend deploy, must not hand a rule `undefined`.
 */
export function sanitizeProfile(raw: unknown): UserProfile {
  if (!raw || typeof raw !== 'object') return DEFAULT_PROFILE;
  const input = raw as Partial<UserProfile> & { avatarDataUrl?: unknown };

  const displayName =
    typeof input.displayName === 'string' && isValidDisplayName(input.displayName)
      ? input.displayName
      : DEFAULT_PROFILE.displayName;

  const profilePhoto = sanitizeProfilePhoto(input.profilePhoto, input.avatarDataUrl);

  const email =
    typeof input.email === 'string' && input.email.trim()
      ? input.email
      : DEFAULT_PROFILE.email;

  const rawChange = input.emailChange;
  const emailChange: EmailChangeRequest =
    rawChange &&
    typeof rawChange === 'object' &&
    rawChange.status === 'pending' &&
    typeof rawChange.requestedEmail === 'string' &&
    rawChange.requestedEmail.trim()
      ? { status: 'pending', requestedEmail: rawChange.requestedEmail }
      : { status: 'none' };

  return { displayName, profilePhoto, email, emailChange };
}

/** `legacyAvatarDataUrl` migrates a blob written by the build that stored a
 * bare `avatarDataUrl: string | null` before `ProfilePhoto` existed — same
 * one-time migration shape `agentPreferences.ts`'s `migrateHighPriorityTopics`
 * uses for its own predecessor field. */
function sanitizeProfilePhoto(raw: unknown, legacyAvatarDataUrl: unknown): ProfilePhoto {
  if (raw && typeof raw === 'object') {
    const candidate = raw as Partial<ProfilePhoto>;
    if (candidate.kind === 'uploaded' && typeof candidate.dataUrl === 'string' && candidate.dataUrl) {
      return { kind: 'uploaded', dataUrl: candidate.dataUrl };
    }
    if (candidate.kind === 'provider' && typeof candidate.url === 'string' && candidate.url) {
      return { kind: 'provider', url: candidate.url };
    }
    if (candidate.kind === 'none') return NO_PROFILE_PHOTO;
  }
  if (typeof legacyAvatarDataUrl === 'string' && legacyAvatarDataUrl) {
    return { kind: 'uploaded', dataUrl: legacyAvatarDataUrl };
  }
  return NO_PROFILE_PHOTO;
}
