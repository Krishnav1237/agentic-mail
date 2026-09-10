/**
 * The one place account/profile state lives — Account/Auth, kept distinct
 * from `settingsStore` (Obligo preferences), `mailStore` (canonical mail) and
 * `workflowStore` (Actions/Approvals/Opportunities state). See `userProfile.ts`
 * for why that separation matters.
 *
 * Same shape as `settingsStore.ts` on purpose: a module-level external store
 * exposed through `useSyncExternalStore`, with a non-React `get*`/`subscribeTo*`
 * pair alongside the hook, and the same commit/persist split — see that file
 * for why `hydrate()` must never write.
 *
 * WHAT THIS STORE CAN AND CANNOT WRITE TODAY.
 *
 *   displayName   writable. `PUT /profile` stores it in `users.display_name`.
 *   profilePhoto  READ-ONLY here. The only variant the backend can supply is
 *                 `provider` — the Google account picture, populated at the
 *                 OAuth callback — and the only other writable variant
 *                 (`none`) is a one-way door, since nothing can re-add a photo
 *                 once removed while uploads are unsupported. So this store no
 *                 longer offers photo mutations at all rather than offering
 *                 ones that 400 or strand the user; `Profile.tsx` says as much
 *                 in the UI.
 *   email         READ-ONLY, by product rule, not by omission — see
 *                 `userProfile.ts`: the address changes only through a
 *                 verified flow, never a direct write.
 *   emailChange   NOT BACKED AT ALL. `PUT /profile` rejects the field and
 *                 `GET /profile` always reports `{status:'none'}`, because a
 *                 real verification flow needs a token table and outbound
 *                 email, neither of which exists. The store keeps the field so
 *                 the type stays whole; nothing mutates it.
 */
import { useSyncExternalStore } from 'react';
import {
  DEFAULT_PROFILE,
  sanitizeProfile,
  type UserProfile,
} from './userProfile';
import {
  createWriteQueue,
  isBackendEnabled,
  logout,
  saveProfile,
  type ApiError,
  type ProfileUpdate,
} from './apiClient';
import { syncStatusActions } from './syncStatus';
import { settingsActions } from './settingsStore';
import { telegramActions } from './telegramIntegrationStore';

let state: UserProfile = DEFAULT_PROFILE;
const listeners = new Set<() => void>();

/** See `settingsStore`'s `hydrated`: writes are refused until the server's
 * copy has actually been read, so a failed load can never overwrite a real
 * profile with the shipped defaults. */
let hydrated = false;

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return state;
}

const writeQueue = createWriteQueue<ProfileUpdate>(
  async (update) => {
    const stored = await saveProfile(update);
    commit(sanitizeProfile(stored));
    syncStatusActions.clearWriteError();
  },
  (error: ApiError) => {
    syncStatusActions.reportWriteError(`Couldn't save your profile — ${error.message}`);
  }
);

/** Memory + subscribers. Never writes. */
function commit(next: UserProfile) {
  state = next;
  emit();
}

/**
 * Commits locally and schedules the writable subset to `PUT /profile`.
 *
 * Only `displayName` and `profilePhoto` cross the wire — `email` and
 * `emailChange` are rejected by the route rather than ignored, so sending them
 * would be a 400 rather than a no-op. The photo is passed through unchanged
 * when it is a variant the route accepts, and the whole write is skipped when
 * it isn't; nothing in the UI can currently produce an `uploaded` photo, so in
 * practice this only ever forwards what the server itself supplied.
 */
function persist(next: UserProfile) {
  commit(next);
  if (!isBackendEnabled()) return;
  if (!hydrated) return;
  if (next.profilePhoto.kind === 'uploaded') return;
  writeQueue.push({
    displayName: next.displayName,
    profilePhoto: next.profilePhoto,
  });
}

export const profileActions = {
  /** THE `PUT /profile` SEAM for editable identity fields. Only
   * `displayName` today — see the file header for why every other field on
   * `UserProfile` is read-only. */
  updateProfile(patch: { displayName?: string }) {
    persist(sanitizeProfile({ ...state, ...patch }));
  },

  /** Restores account fields to the seeded identity — a deliberate user
   * action, so it writes. Contrast {@link clearLocalState}. */
  reset() {
    persist(DEFAULT_PROFILE);
  },

  /** Replaces the whole object from a `GET /profile` response, and unlocks
   * writing. */
  hydrate(raw: unknown) {
    hydrated = true;
    commit(sanitizeProfile(raw));
  },

  /** Marks the backend copy unreachable; writes stay disabled. */
  markUnavailable() {
    hydrated = false;
  },

  /**
   * Drops local state WITHOUT writing — the sign-out path. Collapsing this
   * into `reset()` would make signing out overwrite the user's real saved
   * profile with defaults; see `settingsStore.clearLocalState`.
   */
  clearLocalState() {
    writeQueue.cancel();
    hydrated = false;
    commit(DEFAULT_PROFILE);
  },

  flush() {
    return writeQueue.flush();
  },
};

/**
 * NO LONGER CALLED BY ANY UI, and kept deliberately rather than deleted.
 *
 * Sign-in is Google OAuth only, so the account has no Obligo credential to
 * rotate — a password is not a deferred feature here, it is an inapplicable
 * one (audit §12). `Profile.tsx` therefore states the sign-in method instead
 * of offering a change form, since the form this backed reported "Password
 * updated." for a password that does not exist.
 *
 * Retained as the shape a `POST /account/password` seam would take IF the
 * product ever adds a non-Google credential path. Until then it is
 * intentionally inert: it owns interaction/form state only, resolves after a
 * simulated delay, and never persists, hashes, verifies or even inspects the
 * passwords it's given. Anyone re-wiring a UI to this must replace the body
 * first — it is not a working implementation.
 */
export function changePassword(
  _currentPassword: string,
  _newPassword: string
): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 500));
}

/**
 * THE SIGN-OUT SEAM, now real on both halves.
 *
 * Server side: `POST /auth/logout` clears the `auth_token` and `csrf_token`
 * cookies. Client side: every user-scoped store drops its state so nothing can
 * leak into a next sign-in on the same browser.
 *
 * ORDER MATTERS. Pending writes are flushed FIRST — a preference changed a
 * moment before signing out should still land — and only then is local state
 * cleared through each store's `clearLocalState()`, which explicitly does NOT
 * write. Calling `reset()` here instead would PUT the defaults over everything
 * the user had saved, which is the exact opposite of signing out.
 *
 * Mail/drafts/workflow state is intentionally left alone: it's in-memory-only
 * and never persisted, so it needs a full reload rather than a store reset to
 * truly clear — which is why callers navigate with a hard `window.location`
 * change rather than router `navigate()` (see `AccountMenu`/`Profile`). This
 * module still has no router dependency.
 */
export const sessionActions = {
  async signOut() {
    if (isBackendEnabled()) {
      try {
        await Promise.all([
          profileActions.flush(),
          settingsActions.flush(),
          telegramActions.flush(),
        ]);
        await logout();
      } catch {
        // A failed logout call must not strand the user in a session they've
        // asked to leave. The cookies may survive server-side, but clearing
        // local state and navigating away is still the right client outcome.
      }
    }
    profileActions.clearLocalState();
    settingsActions.clearLocalState();
    telegramActions.clearLocalState();
  },
};

/** Current profile, for readers that aren't React components. */
export function getUserProfile(): Readonly<UserProfile> {
  return getSnapshot();
}

export function subscribeToProfile(cb: () => void): () => void {
  return subscribe(cb);
}

export function useUserProfile(): Readonly<UserProfile> {
  return useSyncExternalStore(subscribe, getSnapshot);
}
