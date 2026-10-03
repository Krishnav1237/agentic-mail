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
import {
  fetchPreferences,
  fetchProfile,
  fetchTelegram,
  fetchThreads,
  isBackendEnabled,
} from './apiClient';
import { settingsActions } from './settingsStore';
import { profileActions } from './userProfileStore';
import { telegramActions } from './telegramIntegrationStore';
import { syncStatusActions } from './syncStatus';
import {
  demoMailboxInput,
  getMailSnapshot,
  mailActions,
  threadToMailRow,
  type MailboxInput,
} from './mailStore';
import type { ThreadSummary } from './apiClient';
import type { ThreadDetail } from './workspaceData';

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

/**
 * Assembles the `MailboxInput` a real `GET /threads` hydration passes to
 * `mailActions.hydrate()` — pulled out as its own pure function so the
 * merge logic is directly testable without mocking the network.
 *
 * Real inbox data replaces ONLY the Inbox slice of mailStore's unified
 * `rows` array — everything else (Approvals/demoMail/Opportunities-sourced
 * rows, anything already filed to Archive/Trash/Spam/Snoozed or starred,
 * and drafts/scheduled/sent) is explicitly carried forward, because
 * `hydrate()` itself is a from-scratch replace with no notion of "what was
 * already there." See docs/integration-audit.md §1 and §5.
 *
 * ACCEPTED, BOUNDED LIMITATION: every real thread lands with
 * `status: 'inbox'` regardless of its actual Gmail location, because
 * `GET /threads` doesn't expose mailbox location yet (separate, in-progress
 * backend work) — a thread already archived/trashed/spammed in real Gmail
 * will incorrectly show up in Inbox until that lands, and self-corrects
 * once it does.
 */
export function buildInboxHydrationInput(
  threadRows: ThreadSummary[],
  previous: ReturnType<typeof getMailSnapshot>
): MailboxInput {
  const preservedRows = previous.rows.filter(
    (r) => r.status !== 'inbox' || r.starred
  );
  // A preserved row already carries everything its original source (an
  // approval, a demoMail item, an opportunity) would otherwise re-derive
  // from scratch — excluding its source here is what stops the same id
  // showing up twice (once preserved as the user left it, once freshly
  // re-adapted back to plain `inbox`/unstarred).
  const preservedIds = new Set(preservedRows.map((r) => r.id));
  const demoInput = demoMailboxInput();

  // `buildThreadDetails` only ever derives entries from
  // `approvals`/`demoMail`/`opportunities` — it never reads `rows` at all.
  // Excluding a preserved row's source above is correct for `rows` but
  // leaves nothing behind to produce ITS thread detail, since that detail
  // is never carried forward the way drafts/sent/scheduled are. Without
  // this, a preserved row still lists correctly but opens onto an empty/
  // broken thread. Pulled from `previous.threadDetails` rather than carried
  // forward wholesale — only the ids this hydrate is actually preserving,
  // so every other id still gets the fresh derivation its (still-included)
  // source produces.
  const preservedThreadDetails: Record<string, ThreadDetail> = {};
  for (const row of preservedRows) {
    const detail = previous.threadDetails[row.id];
    if (detail) preservedThreadDetails[row.id] = detail;
  }

  return {
    ...demoInput,
    threadDetails: { ...demoInput.threadDetails, ...preservedThreadDetails },
    approvals: demoInput.approvals?.filter((a) => !preservedIds.has(a.id)),
    demoMail: demoInput.demoMail?.filter((m) => !preservedIds.has(m.id)),
    opportunities: demoInput.opportunities?.filter(
      (o) => !preservedIds.has(o.id)
    ),
    rows: [...preservedRows, ...threadRows.map(threadToMailRow)],
    sent: previous.sent,
    scheduled: previous.scheduled,
    drafts: previous.drafts,
  };
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

  // `allSettled`, not `all`: one failure must not deny the others their
  // data, and every outcome has to be recorded before the phase can end.
  const results = await Promise.allSettled([
    fetchPreferences(),
    fetchProfile(),
    fetchTelegram(),
    fetchThreads(),
  ]);

  const failed: string[] = [];

  const [preferences, profile, telegram, threads] = results;

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

  if (threads.status === 'fulfilled') {
    mailActions.hydrate(
      buildInboxHydrationInput(threads.value.threads, getMailSnapshot())
    );
  } else {
    // Left exactly as the demo bootstrap already hydrated it at module
    // load — better than a blank inbox, and nothing here can distinguish
    // "server has no threads" from "request failed" anyway.
    failed.push('Inbox');
  }

  syncStatusActions.finishLoading(failed);
}

/** Test seam — lets a suite run `bootstrapStores()` more than once. */
export function resetBootstrapForTests(): void {
  started = false;
}
