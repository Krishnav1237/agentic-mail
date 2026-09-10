/**
 * Whether the app's backend-backed state is loaded, and whether anything has
 * failed to save since.
 *
 * Its own module rather than part of `storeBootstrap.ts` for one structural
 * reason: the three stores report write failures into it, and `storeBootstrap`
 * imports those stores to hydrate them. Anything the stores import must
 * therefore not import them back. This file imports nothing.
 *
 * Same external-store shape as every other store here (`useSyncExternalStore`
 * over a module singleton), so `AppShell`'s loading gate and the error banner
 * read it exactly the way every page already reads preferences.
 */
import { useSyncExternalStore } from 'react';

/**
 * `loading` is the state the shell gates on.
 *
 * `ready` means every store settled successfully. `degraded` means the app is
 * usable but at least one store is running on defaults because its GET failed
 * — deliberately NOT called `error`, because the app still renders and the
 * user can still work; what they cannot do is trust that changes to the failed
 * store will persist.
 */
export type SyncPhase = 'loading' | 'ready' | 'degraded';

export type SyncState = {
  phase: SyncPhase;
  /** Human-readable names of the stores whose initial load failed. */
  failedStores: string[];
  /** The most recent failed write, if any. Cleared by a later success. */
  writeError: string | null;
};

/**
 * Demo mode (no `VITE_API_BASE`) never leaves `ready`: there is nothing to
 * load, so gating the shell on a fetch that will never happen would hold the
 * workspace behind a spinner forever.
 */
const INITIAL_STATE: SyncState = {
  phase: 'ready',
  failedStores: [],
  writeError: null,
};

let state: SyncState = INITIAL_STATE;
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

function set(next: SyncState) {
  state = next;
  emit();
}

export const syncStatusActions = {
  /** Called by `storeBootstrap` before the first fetch, only when a backend is
   * actually configured. */
  beginLoading() {
    set({ phase: 'loading', failedStores: [], writeError: null });
  },

  /** Called once every store has settled. `failedStores` empty means `ready`;
   * anything in it means the app runs but on partial data.
   *
   * SETTLED, NOT SUCCEEDED — a failed GET must still end the loading phase, or
   * one backend blip leaves the workspace permanently blank. */
  finishLoading(failedStores: string[]) {
    set({
      phase: failedStores.length > 0 ? 'degraded' : 'ready',
      failedStores,
      writeError: null,
    });
  },

  /** A background PUT failed. Recorded rather than thrown: the store's own
   * contract is that "a failed write is not a failed change" — the value still
   * applies for this session — so this surfaces the problem without reverting
   * a control under the user's cursor. */
  reportWriteError(message: string) {
    set({ ...state, writeError: message });
  },

  /** A later write succeeded, so the previous failure is stale. */
  clearWriteError() {
    if (state.writeError === null) return;
    set({ ...state, writeError: null });
  },

  /** Test/reset seam, matching the `reset()` every other store exposes. */
  reset() {
    set(INITIAL_STATE);
  },
};

export function getSyncState(): Readonly<SyncState> {
  return getSnapshot();
}

export function useSyncState(): Readonly<SyncState> {
  return useSyncExternalStore(subscribe, getSnapshot);
}
