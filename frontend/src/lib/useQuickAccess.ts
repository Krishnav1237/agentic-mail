/**
 * Single source of truth for which mail views are pinned into the sidebar's
 * Quick Access group vs. left in Available, and in what order. Two separate
 * mounted consumers (`AppShell`'s sidebar and `Settings`'s drag-and-drop lists)
 * have no shared parent state, so — same approach as `useAtmosphereVisible` —
 * this lives in `localStorage` (persists across reload/navigation) with a
 * same-tab custom event to keep every mounted instance in sync the instant
 * one of them drags an item (localStorage's own `storage` event only fires
 * in *other* tabs).
 */
import { useEffect, useState } from 'react';
import { ALL_MAIL_VIEW_IDS, DEFAULT_QUICK_ACCESS, type MailViewId } from './mailViews';

const STORAGE_KEY = 'obligo-quick-access';
const CHANGE_EVENT = 'obligo-quick-access-change';

type QuickAccessState = { quickAccess: string[]; available: string[] };

function defaultState(): QuickAccessState {
  const quickAccess = [...DEFAULT_QUICK_ACCESS];
  const available = ALL_MAIL_VIEW_IDS.filter((id) => !quickAccess.includes(id));
  return { quickAccess, available };
}

/** Guards against a stale/corrupt stored blob (e.g. a future view id added
 * later) by reconciling against the current `MAIL_VIEWS` list — anything
 * missing lands in Available, anything unknown is dropped. */
function sanitize(raw: unknown): QuickAccessState {
  if (
    !raw ||
    typeof raw !== 'object' ||
    !Array.isArray((raw as QuickAccessState).quickAccess) ||
    !Array.isArray((raw as QuickAccessState).available)
  ) {
    return defaultState();
  }
  const seen = new Set<string>();
  const clean = (ids: unknown[]) =>
    ids.filter((id): id is string => {
      if (typeof id !== 'string' || !ALL_MAIL_VIEW_IDS.includes(id as MailViewId) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  const quickAccess = clean((raw as QuickAccessState).quickAccess);
  const available = [...clean((raw as QuickAccessState).available), ...ALL_MAIL_VIEW_IDS.filter((id) => !seen.has(id))];
  return { quickAccess, available };
}

/** `getItem` is inside the try, not just `JSON.parse` — storage access itself
 * throws under Safari private browsing and blocked-cookie settings, and this
 * runs during render (the `useState` initializer below), so an unguarded
 * throw would take the whole workspace to the ErrorBoundary rather than
 * degrading to the default pinned views. */
function readStored(): QuickAccessState {
  if (typeof window === 'undefined') return defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? sanitize(JSON.parse(raw)) : defaultState();
  } catch {
    return defaultState();
  }
}

/** The same-tab broadcast carries the new state as its payload rather than
 * asking every listener to re-read storage. That matters when the write
 * below can't land (blocked storage, quota): re-reading would hand every
 * *other* mounted instance the stale value and silently revert the change on
 * the sidebar while the Settings list showed it applied. With the payload,
 * a failed write degrades to exactly "session-only" instead of "half
 * applied". Cross-tab sync still re-reads — see the `storage` listener. */
function writeStored(next: QuickAccessState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — the change still applies for this session */
  }
  window.dispatchEvent(new CustomEvent<QuickAccessState>(CHANGE_EVENT, { detail: next }));
}

export function useQuickAccess() {
  const [state, setState] = useState<QuickAccessState>(readStored);

  useEffect(() => {
    const onLocalChange = (e: Event) =>
      setState((e as CustomEvent<QuickAccessState>).detail ?? readStored());
    const onStorage = () => setState(readStored());
    window.addEventListener(CHANGE_EVENT, onLocalChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onLocalChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  /** Removes `id` from wherever it currently sits and re-inserts it at
   * `toIndex` in `toList`. No cap on Quick Access membership — every mail
   * view can be pinned into the main sidebar at once if the user wants. */
  const moveItem = (id: string, toList: 'quickAccess' | 'available', toIndex: number) => {
    const current = readStored();
    const fromQuickAccess = current.quickAccess.filter((v) => v !== id);
    const fromAvailable = current.available.filter((v) => v !== id);

    const targetBase = toList === 'quickAccess' ? fromQuickAccess : fromAvailable;
    const clampedIndex = Math.max(0, Math.min(toIndex, targetBase.length));
    const nextTarget = [...targetBase.slice(0, clampedIndex), id, ...targetBase.slice(clampedIndex)];

    const next: QuickAccessState =
      toList === 'quickAccess'
        ? { quickAccess: nextTarget, available: fromAvailable }
        : { quickAccess: fromQuickAccess, available: nextTarget };

    writeStored(next);
    setState(next);
  };

  return { quickAccess: state.quickAccess, available: state.available, moveItem };
}
