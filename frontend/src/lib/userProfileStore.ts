/**
 * The one place account/profile state lives — Account/Auth, kept distinct
 * from `settingsStore` (Obligo preferences), `mailStore` (canonical mail) and
 * `workflowStore` (Actions/Approvals/Opportunities state). See `userProfile.ts`
 * for why that separation matters.
 *
 * Same shape as `settingsStore.ts` on purpose: a module-level external store
 * exposed through `useSyncExternalStore`, persisted to `localStorage`, with a
 * non-React `get*`/`subscribeTo*` pair alongside the hook.
 *
 * THE BACKEND SEAMS ARE THE NAMED FUNCTIONS BELOW. Each is written the way it
 * will be called once a real API exists — `updateProfile`/`setUploadedPhoto`
 * take the same shape a `PUT /profile` would, `requestEmailChange` models the
 * pending step of a verification flow without performing one, and
 * `changePassword` returns a Promise so the form can already await a network
 * call that doesn't exist yet. None of them do real persistence, hashing,
 * verification or authorization — that is explicitly out of scope here (see
 * the Profile page for the UI these back).
 */
import { useSyncExternalStore } from 'react';
import {
  DEFAULT_PROFILE,
  sanitizeProfile,
  type UserProfile,
} from './userProfile';
import { settingsActions } from './settingsStore';
import { telegramActions } from './telegramIntegrationStore';

const STORAGE_KEY = 'obligo-user-profile';

function readStored(): UserProfile {
  if (typeof window === 'undefined') return DEFAULT_PROFILE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeProfile(JSON.parse(raw)) : DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}

let state: UserProfile = readStored();
const listeners = new Set<() => void>();

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

/** Commits a new profile: in memory, to storage, and to every subscriber.
 * Same degrade-to-session-only contract as `settingsStore.save` when storage
 * is unavailable. */
function save(next: UserProfile) {
  state = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — session-only */
  }
  emit();
}

export const profileActions = {
  /** THE `PUT /profile` SEAM for editable identity fields. Only
   * `displayName` today — email is intentionally excluded, see
   * `requestEmailChange`. */
  updateProfile(patch: { displayName?: string }) {
    save(sanitizeProfile({ ...state, ...patch }));
  },

  /** THE FUTURE UPLOAD SEAM. Takes a data URL (produced client-side from a
   * chosen file) rather than performing any real upload — there is no image
   * storage backing this yet. A real integration replaces the data URL with
   * a hosted URL returned from the upload; every consumer already renders
   * through `resolveAvatar`, so nothing downstream changes shape. Leaves
   * `displayName` untouched — an uploaded photo survives a later rename,
   * see `resolveAvatar`. */
  setUploadedPhoto(dataUrl: string) {
    save(sanitizeProfile({ ...state, profilePhoto: { kind: 'uploaded', dataUrl } }));
  },

  /** Explicit removal — sets the photo back to `{ kind: 'none' }` rather than
   * leaving stale image data around, so `resolveAvatar` immediately falls
   * back to initials generated from whatever `displayName` is now. */
  removePhoto() {
    save(sanitizeProfile({ ...state, profilePhoto: { kind: 'none' } }));
  },

  /** Starts (or restarts) the pending step of a future
   * current-email -> new-email -> verification-pending -> confirmed flow.
   * Never mutates `email` itself — only a real verified confirmation may do
   * that, which is why there is no local "confirm" action here at all. */
  requestEmailChange(requestedEmail: string) {
    save(
      sanitizeProfile({
        ...state,
        emailChange: { status: 'pending', requestedEmail },
      })
    );
  },

  /** Abandons a pending email change without affecting the confirmed
   * `email`. */
  cancelEmailChange() {
    save(sanitizeProfile({ ...state, emailChange: { status: 'none' } }));
  },

  /** Restores account fields to the seeded identity. */
  reset() {
    save(DEFAULT_PROFILE);
  },

  /** Replaces the whole object — the entry point a `GET /profile` response
   * would use once the backend exists. */
  hydrate(raw: unknown) {
    save(sanitizeProfile(raw));
  },
};

/** THE FUTURE `POST /account/password` SEAM. Owns only interaction/form
 * state on the caller's side — no hashing, verification or authentication
 * happens here or ever will in this file. Resolves after a short simulated
 * delay so the Profile page's form can exercise real pending/success UI
 * states against something that behaves like a network call. Never persists
 * or even looks at the passwords it's given. */
export function changePassword(
  _currentPassword: string,
  _newPassword: string
): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 500));
}

/** THE FUTURE SIGN-OUT SEAM. No real session/token exists yet — invalidating
 * one is the backend's job once it exists — but what this CAN and must do
 * today is clear every locally-persisted, user-scoped store, so a stale
 * profile/preferences/integration state can never leak into a next sign-in
 * on the same browser (audit requirement: logout clears user-specific
 * frontend state; switching users must not show user A's data to user B).
 * Each store's own `reset()` both wipes its `localStorage` key and restores
 * its in-memory state to defaults, matching what a fresh, never-signed-in
 * session would look like. Mail/drafts/workflow state is intentionally left
 * alone here — it's in-memory-only and never persisted (see `mailStore.ts`),
 * so it needs a full reload rather than a store reset to truly clear, which
 * is why callers navigate with a hard `window.location` change rather than
 * router `navigate()` (see `AccountMenu`/`Profile`). Callers remain
 * responsible for that navigation — this module still has no router
 * dependency, matching `settingsActions`/`profileActions` staying
 * navigation-agnostic. */
export const sessionActions = {
  signOut() {
    profileActions.reset();
    settingsActions.reset();
    telegramActions.reset();
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
