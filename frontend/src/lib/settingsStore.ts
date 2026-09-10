/**
 * The one place the user's agent preferences live.
 *
 * They used to live in `Settings.tsx`'s own `useState` — which meant three
 * things, all wrong: no other surface could read them, they reset the moment
 * you navigated away from the page, and there was nowhere for a backend sync
 * to attach. Every control on that page was therefore inert by construction,
 * however correct its label.
 *
 * Same shape as `mailStore.ts` on purpose — a module-level external store
 * exposed through `useSyncExternalStore`, so preferences and mail are read the
 * same way and a change to either re-renders every consumer.
 *
 * THE BACKEND SEAM IS NOW WIRED. `hydrate()` takes `GET /preferences` and
 * `update()`/`reset()` write through to `PUT /preferences`. The payload is
 * exactly `AgentPreferences` — no mapping layer, because this store never held
 * display strings in the first place, and migration 009 stores that same shape
 * verbatim in one JSONB column.
 *
 * `localStorage` IS GONE. It backed this store while no API existed; keeping
 * it alongside one would create two sources of truth with no reconciliation
 * rule — and `hydrate()` is replace-not-merge precisely so that question never
 * has to be answered. In demo mode (no `VITE_API_BASE`) this store is simply
 * in-memory for the session, exactly like `mailStore` already is.
 *
 * THE COMMIT/PERSIST SPLIT IS LOAD-BEARING. `commit()` updates memory and
 * notifies; `persist()` does that and then writes. `hydrate()` must use
 * `commit()`, or every GET immediately echoes a PUT of what the server just
 * sent — a bug that is invisible in testing because the round-trip succeeds.
 */
import { useSyncExternalStore } from 'react';
import {
  DEFAULT_PREFERENCES,
  sanitizePreferences,
  type AgentPreferences,
} from './agentPreferences';
import {
  createWriteQueue,
  isBackendEnabled,
  savePreferences,
  type ApiError,
} from './apiClient';
import { syncStatusActions } from './syncStatus';

let state: AgentPreferences = DEFAULT_PREFERENCES;
const listeners = new Set<() => void>();

/**
 * Whether this store holds the server's copy or merely the shipped defaults.
 *
 * `persist()` refuses to write unless this is true, and that guard is the
 * whole reason the flag exists. If the initial GET failed we are rendering
 * defaults; writing them back would overwrite whatever the user actually has
 * saved with a blank slate they never chose. A local change still applies for
 * the session — it just never leaves the tab.
 */
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

const writeQueue = createWriteQueue<AgentPreferences>(
  async (preferences) => {
    const stored = await savePreferences(preferences);
    // The server normalizes on write; adopting its answer keeps this store
    // identical to what a later GET would return.
    commit(sanitizePreferences(stored));
    syncStatusActions.clearWriteError();
  },
  (error: ApiError) => {
    syncStatusActions.reportWriteError(`Couldn't save your settings — ${error.message}`);
  }
);

/** Memory + subscribers. Never writes. */
function commit(next: AgentPreferences) {
  state = next;
  emit();
}

/**
 * Applies a change locally and schedules it to the backend.
 *
 * OPTIMISTIC ON PURPOSE. The commit is synchronous so every control on the
 * Settings page stays instant; the write is debounced behind it. This is the
 * same contract this store already kept with `localStorage` — "a failed write
 * is not a failed change; the new value still takes effect for this session" —
 * with the network in place of storage. A failure is surfaced through
 * `syncStatus` rather than rolled back, because reverting a control under the
 * user's cursor is worse than a stale write.
 */
function persist(next: AgentPreferences) {
  commit(next);
  if (!isBackendEnabled()) return;
  if (!hydrated) return;
  writeQueue.push(next);
}

export const settingsActions = {
  /** Applies a partial change on top of the current preferences. Nested
   * groups are merged rather than replaced, so a caller changing one cleanup
   * rule doesn't have to restate the other three. */
  update(patch: {
    replyDrafting?: AgentPreferences['replyDrafting'];
    replyTone?: AgentPreferences['replyTone'];
    automation?: Partial<AgentPreferences['automation']>;
    cleanup?: Partial<AgentPreferences['cleanup']>;
    /** Whole-array replacement, same as every other non-nested field here —
     * unlike `automation`/`cleanup` there is no per-key merge to do, since a
     * reorder or a transfer always has to produce the complete new order. */
    highPriorityTopics?: AgentPreferences['highPriorityTopics'];
    beta?: AgentPreferences['beta'];
    urgencyColor?: AgentPreferences['urgencyColor'];
    importanceColor?: AgentPreferences['importanceColor'];
    quickAccessCollapsed?: AgentPreferences['quickAccessCollapsed'];
  }) {
    persist(
      sanitizePreferences({
        ...state,
        ...patch,
        automation: { ...state.automation, ...patch.automation },
        cleanup: { ...state.cleanup, ...patch.cleanup },
      })
    );
  },

  /**
   * Restores everything this store owns to its shipped defaults — a
   * deliberate user action ("Reset all"), so it WRITES.
   *
   * Not to be confused with {@link clearLocalState}, which looks identical and
   * must never write. See that function for why conflating the two would
   * destroy a user's saved settings on sign-out.
   */
  reset() {
    persist(DEFAULT_PREFERENCES);
  },

  /**
   * Replaces the whole object from a `GET /preferences` response. Sanitised on
   * the way in, so a server on a different deploy cadence can't inject a field
   * shape the rules don't understand.
   *
   * Marks the store hydrated, which is what unlocks writing — see `hydrated`.
   */
  hydrate(raw: unknown) {
    hydrated = true;
    commit(sanitizePreferences(raw));
  },

  /**
   * Marks the backend copy unreachable. State stays at whatever it is
   * (defaults, in practice) and writes stay disabled, so a failed load can
   * never lead to overwriting the server with defaults.
   */
  markUnavailable() {
    hydrated = false;
  },

  /**
   * Drops local state WITHOUT writing — the sign-out path.
   *
   * `reset()` and this differ by exactly one thing, and that difference is a
   * data-loss bug if collapsed: `sessionActions.signOut()` calls this, and if
   * it wrote, signing out would PUT the defaults over the user's real saved
   * preferences. Cancelling the queue matters for the same reason — a write
   * scheduled moments before sign-out must not land afterwards.
   */
  clearLocalState() {
    writeQueue.cancel();
    hydrated = false;
    commit(DEFAULT_PREFERENCES);
  },

  /** Flushes any debounced write immediately. For sign-out and unload, where
   * waiting out the debounce would lose the last change. */
  flush() {
    return writeQueue.flush();
  },
};

/** Current preferences, for readers that aren't React components — the
 * counterpart to `useAgentSettings`, matching `getMailSnapshot`. */
export function getAgentPreferences(): Readonly<AgentPreferences> {
  return getSnapshot();
}

/** Subscribe outside React. Used by `mailStore` to re-derive mail state when
 * preferences change; returns an unsubscribe function. */
export function subscribeToPreferences(cb: () => void): () => void {
  return subscribe(cb);
}

export function useAgentSettings(): Readonly<AgentPreferences> {
  return useSyncExternalStore(subscribe, getSnapshot);
}
