/**
 * Where Google OAuth lands.
 *
 * `routes/auth.ts` redirects to `${FRONTEND_URL}/auth/callback` after
 * exchanging the code and setting the `auth_token` / `csrf_token` cookies.
 * Until now no such route existed, so that redirect hit `App.tsx`'s catch-all
 * and bounced the user to Landing — login worked, but silently deposited
 * people on the marketing page.
 *
 * Deliberately minimal: the backend has already done everything that matters
 * by the time this mounts. This page only asks who we are and forwards
 * accordingly. It holds no tokens, parses no query parameters, and makes no
 * decision the server hasn't already made.
 *
 * A HARD navigation rather than router `navigate()`, for the same reason
 * `sessionActions.signOut()` documents: the stores are module singletons
 * seeded at import, so entering the workspace on a fresh module graph is what
 * guarantees the new session starts clean rather than inheriting whatever the
 * previous one left in memory.
 */
import { useEffect } from 'react';
import { fetchSession, isBackendEnabled } from '../lib/apiClient';

export default function AuthCallback() {
  useEffect(() => {
    let cancelled = false;

    const go = (path: string) => {
      if (cancelled) return;
      window.location.replace(path);
    };

    // No backend configured means no session to verify and no workspace to
    // authenticate into — send them back to Landing rather than hang.
    if (!isBackendEnabled()) {
      go('/');
      return;
    }

    // `GET /auth/session` answers 200 with `{authenticated:false}` rather than
    // a 401, so an unauthenticated visitor lands here rather than being
    // caught by the API client's sign-in redirect. Both paths end at '/'
    // anyway; the distinction matters because it keeps this page in control of
    // its own outcome.
    fetchSession()
      .then((session) => go(session.authenticated ? '/dashboard' : '/'))
      .catch(() => go('/'));

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--root-bg, #0b0b0d)',
      }}
    >
      <p
        role="status"
        style={{
          font: '400 13px/1.5 Inter, sans-serif',
          color: 'var(--text-secondary, rgba(255,255,255,0.6))',
        }}
      >
        Signing you in…
      </p>
    </div>
  );
}
