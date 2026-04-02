import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getSession,
  logout as apiLogout,
  syncInbox as apiSyncInbox,
} from './api';
import { AppContext } from './appContextStore';

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const [token, setTokenState] = useState<string | null>(() =>
    localStorage.getItem('auth_token')
  );
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'cookie' | 'bearer' | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const setToken = useCallback((next: string | null) => {
    if (next) {
      localStorage.setItem('auth_token', next);
    } else {
      localStorage.removeItem('auth_token');
    }
    setTokenState(next);
  }, []);

  const refreshSession = useCallback(async () => {
    setAuthLoading(true);
    try {
      const session = await getSession();
      setAuthenticated(session.authenticated);
      setUserEmail(session.user?.email ?? null);
      setAuthMode(session.authMode ?? null);

      if (session.authenticated && session.authMode === 'cookie' && token) {
        localStorage.removeItem('auth_token');
        setTokenState(null);
      }
      return session.authenticated;
    } catch (error) {
      console.error(error);
      setAuthenticated(Boolean(token));
      setUserEmail(null);
      setAuthMode(token ? 'bearer' : null);
      return Boolean(token);
    } finally {
      setAuthLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const syncInbox = useCallback(async () => {
    setSyncing(true);
    setStatus('Syncing your inbox...');
    try {
      await apiSyncInbox();
      const now = new Date().toISOString();
      setLastSyncedAt(now);
      setStatus('Sync queued. Fresh email intelligence is on the way.');
    } catch (error) {
      console.error(error);
      setStatus('Sync failed. Check your connection and try again.');
    } finally {
      setSyncing(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setStatus('Signing out...');
    try {
      await apiLogout();
    } catch (error) {
      console.error(error);
    } finally {
      setToken(null);
      setAuthenticated(false);
      setUserEmail(null);
      setAuthMode(null);
      setStatus('Signed out.');
    }
  }, [setToken]);

  const value = useMemo(
    () => ({
      hasToken: authenticated,
      token,
      userEmail,
      authMode,
      authLoading,
      lastSyncedAt,
      setToken,
      refreshSession,
      signOut,
      status,
      setStatus,
      syncing,
      syncInbox,
    }),
    [
      authenticated,
      token,
      userEmail,
      authMode,
      authLoading,
      lastSyncedAt,
      setToken,
      refreshSession,
      signOut,
      status,
      syncing,
      syncInbox,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
