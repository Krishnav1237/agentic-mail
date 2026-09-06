import { useEffect, useState } from 'react';

const STORAGE_KEY = 'obligo-atmosphere-visible';
const CHANGE_EVENT = 'obligo-atmosphere-visible-change';

/** Storage access itself can throw, not just its contents — Safari private
 * browsing and any "block third-party/all cookies" setting make even
 * `getItem` raise. Reading it during render (this hook's `useState`
 * initializer) means an unguarded throw takes the whole workspace down to
 * the ErrorBoundary. The same guard the theme boot script in `index.html`
 * already uses. */
function readStored(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

/**
 * Tracks whether the shared `<Atmosphere />` (the gold beam lines, their
 * glow, the grain particles, the vignette — the whole ambient room) should
 * render at all, gated by Settings → Advanced → "Show background".
 *
 * `AppShell` and the Settings toggle are separate mounted components with no
 * shared parent state, so this mirrors `useWorkspaceTheme`'s approach rather
 * than introducing a new context: the flag lives in `localStorage` (persists
 * across reloads/navigation) and a same-tab custom event keeps every mounted
 * instance of this hook in sync the instant one of them changes it —
 * `localStorage`'s own `storage` event only fires in *other* tabs, never the
 * one that made the write.
 *
 * This only ever toggles whether `<Atmosphere />` is rendered; the component
 * and its motion are untouched.
 */
export function useAtmosphereVisible(): [boolean, (next: boolean) => void] {
  const [visible, setVisibleState] = useState(readStored);

  useEffect(() => {
    // Same-tab changes arrive with the new value attached; only a cross-tab
    // `storage` event has to go back to storage for it. See the matching
    // note in `useQuickAccess` — re-reading on a write that couldn't land is
    // what silently reverts the change in every *other* mounted instance.
    const onLocalChange = (e: Event) => {
      const detail = (e as CustomEvent<boolean>).detail;
      setVisibleState(typeof detail === 'boolean' ? detail : readStored());
    };
    const onStorage = () => setVisibleState(readStored());
    window.addEventListener(CHANGE_EVENT, onLocalChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onLocalChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const setVisible = (next: boolean) => {
    // The toggle still takes effect for this session even where the write
    // can't land (blocked storage, quota) — it just won't survive a reload.
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      /* storage unavailable — session-only */
    }
    window.dispatchEvent(new CustomEvent<boolean>(CHANGE_EVENT, { detail: next }));
  };

  return [visible, setVisible];
}
