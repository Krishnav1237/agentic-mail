/**
 * Loads the three backend-backed stores once, at the authenticated boundary.
 *
 * Before this existed, nothing anywhere called `hydrate()` — the stores
 * self-populated from `localStorage` at module load, synchronously, before
 * React's first render. Replacing that with a fetch introduces the app's first
 * async data dependency, which is why `AppShell` gates on it rather than
 * letting three surfaces each discover they're holding placeholder data.
 *
 * EAGER, ALL THREE, IN PARALLEL. Two of the three are read on every workspace
 * route, not just their own page: `AppShell` itself reads preferences for the
 * root `data-urgency`/`data-importance` attributes, and `AccountMenu` reads the
 * profile for the topbar avatar. "First access" is therefore immediately, on
 * every route, so laziness would buy nothing and cost a second code path.
 * Telegram is the one fair candidate for lazy loading, and rides along anyway:
 * one more small parallel request is cheaper than a second hydration lifecycle.
 *
 * SETTLED, NOT SUCCEEDED. A store whose GET fails is marked unavailable and
 * left on defaults — the phase still ends. Blocking the shell until success
 * would turn one backend blip into a permanently blank workspace.
 */
import { fetchPreferences, fetchProfile, fetchTelegram, isBackendEnabled } from './apiClient';
import { settingsActions } from './settingsStore';
import { profileActions } from './userProfileStore';
import { telegramActions } from './telegramIntegrationStore';
import { syncStatusActions } from './syncStatus';

/**
 * The `localStorage` keys these three stores used before they had a backend.
 *
 * Deleted rather than merely ignored: no longer reading them would still leave
 * the data sitting in every existing browser indefinitely, and it is exactly
 * the kind of stale user-scoped state `sessionActions.signOut()` exists to
 * prevent leaking between accounts.
 *
 * NOT a migration. This app has never had a backend to sync to, so nothing in
 * these keys can be authoritative user data — only demo browsing.
 */
const RETIRED_STORAGE_KEYS = [
  'obligo-agent-preferences',
  'obligo-user-profile',
  'obligo-telegram-integration',
];

function clearRetiredStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    for (const key of RETIRED_STORAGE_KEYS) window.localStorage.removeItem(key);
  } catch {
    // Storage access can throw outright (Safari private browsing, blocked
    // cookies) — the same guard every one of these stores already used to read
    // through. Failing to tidy up is never worth breaking the boot for.
  }
}

/** Idempotent across React's StrictMode double-effect and any remount. */
let started = false;

/**
 * Hydrates all three stores. Safe to call repeatedly; only the first call does
 * anything.
 *
 * In demo mode (no `VITE_API_BASE`) this makes no request at all and leaves
 * the sync phase at its initial `ready`, so the workspace renders immediately
 * on shipped defaults exactly as it did before any backend existed.
 */
export async function bootstrapStores(): Promise<void> {
  if (started) return;
  started = true;

  clearRetiredStorage();

  if (!isBackendEnabled()) return;

  syncStatusActions.beginLoading();

  // `allSettled`, not `all`: one failure must not deny the other two their
  // data, and every outcome has to be recorded before the phase can end.
  const results = await Promise.allSettled([
    fetchPreferences(),
    fetchProfile(),
    fetchTelegram(),
  ]);

  const failed: string[] = [];

  const [preferences, profile, telegram] = results;

  if (preferences.status === 'fulfilled') {
    settingsActions.hydrate(preferences.value);
  } else {
    settingsActions.markUnavailable();
    failed.push('Settings');
  }

  if (profile.status === 'fulfilled') {
    profileActions.hydrate(profile.value);
  } else {
    profileActions.markUnavailable();
    failed.push('Profile');
  }

  if (telegram.status === 'fulfilled') {
    telegramActions.hydrate(telegram.value);
  } else {
    telegramActions.markUnavailable();
    failed.push('Telegram');
  }

  syncStatusActions.finishLoading(failed);
}

/** Test seam — lets a suite run `bootstrapStores()` more than once. */
export function resetBootstrapForTests(): void {
  started = false;
}
