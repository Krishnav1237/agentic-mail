import { useEffect } from 'react';
import { API_BASE } from './apiBase';

/**
 * Listens for a secret keystroke sequence defined by the VITE_ADMIN_TRIGGER
 * environment variable. When the full sequence is typed within the timeout
 * window, the browser navigates to the backend admin page.
 *
 * The trigger phrase itself lives exclusively in the .env file (which is
 * gitignored), so it never appears in committed source code.
 */
const ADMIN_TRIGGER = import.meta.env.VITE_ADMIN_TRIGGER?.trim() ?? '';
const ADMIN_TRIGGER_TIMEOUT_MS = 5_000;

export const useAdminShortcut = () => {
  useEffect(() => {
    if (!ADMIN_TRIGGER) return;

    let buffer = '';
    let lastKeyAt = 0;
    let redirecting = false;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (redirecting || event.defaultPrevented || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === 'Escape') {
        buffer = '';
        return;
      }

      // Only accumulate single alphanumeric characters
      if (event.key.length !== 1 || !/[a-z0-9]/i.test(event.key)) {
        buffer = '';
        return;
      }

      const now = Date.now();
      if (now - lastKeyAt > ADMIN_TRIGGER_TIMEOUT_MS) {
        buffer = '';
      }

      lastKeyAt = now;
      buffer = (buffer + event.key.toLowerCase()).slice(-ADMIN_TRIGGER.length);

      if (buffer === ADMIN_TRIGGER) {
        redirecting = true;
        window.location.assign(`${API_BASE}/admin`);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
};
