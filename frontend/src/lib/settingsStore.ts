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
 * exposed through `useSyncExternalStore`, so preferences and mail are read
 * the same way and a change to either re-renders every consumer. Persisted to
 * `localStorage` (preferences are real user configuration, unlike the mock
 * mailbox, which is deliberately seeded fresh each load).
 *
 * THE BACKEND SEAM IS HERE. When the API lands, `save()` below is the single
 * function that gains a `PUT /preferences`, and a `hydrate()` its `GET`. The
 * payload is already exactly `AgentPreferences` — no mapping layer, because
 * this store never held display strings in the first place. Nothing else in
 * the app has to change: every consumer already reads through this store.
 */
import { useSyncExternalStore } from 'react';
import {
  DEFAULT_PREFERENCES,
  sanitizePreferences,
  type AgentPreferences,
} from './agentPreferences';

const STORAGE_KEY = 'obligo-agent-preferences';

/** Storage access can throw outright, not just return junk — Safari private
 * browsing and blocked-cookie settings both do. This runs during render (the
 * initial snapshot), so an unguarded throw would take the workspace down to
 * the ErrorBoundary rather than falling back to defaults. Same guard
 * `useQuickAccess` and the theme boot script already use. */
function readStored(): AgentPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizePreferences(JSON.parse(raw)) : DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

let state: AgentPreferences = readStored();
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

/**
 * Commits a new set of preferences: in memory, to storage, and to every
 * subscriber.
 *
 * A failed write is not a failed change — the new value still takes effect
 * for this session and simply doesn't survive a reload, which is the same
 * degradation `useQuickAccess` chose for the same reason.
 *
 * THIS IS THE FUNCTION THAT GAINS THE NETWORK CALL. Everything downstream —
 * the mail store's reaction, every re-render — is already driven by the
 * `emit()` below, so adding a `PUT` here reaches the whole app.
 */
function save(next: AgentPreferences) {
  state = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — session-only */
  }
  emit();
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
    save(
      sanitizePreferences({
        ...state,
        ...patch,
        automation: { ...state.automation, ...patch.automation },
        cleanup: { ...state.cleanup, ...patch.cleanup },
      })
    );
  },

  /** Restores everything this store owns to its shipped defaults. */
  reset() {
    save(DEFAULT_PREFERENCES);
  },

  /** Replaces the whole object — the entry point a `GET /preferences`
   * response would use once the backend exists. Sanitised on the way in, so a
   * server on a different deploy cadence can't inject a field shape the rules
   * don't understand. */
  hydrate(raw: unknown) {
    save(sanitizePreferences(raw));
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
