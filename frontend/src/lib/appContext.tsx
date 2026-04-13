import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getSession,
  logout as apiLogout,
  syncInbox as apiSyncInbox,
} from './api';
import { AppContext } from './appContextStore';

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'cookie' | 'bearer' | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const refreshSession = useCallback(async () => {
    setAuthLoading(true);
    try {
      const session = await getSession();
      setAuthenticated(session.authenticated);
      setUserEmail(session.user?.email ?? null);
      setAuthMode(session.authMode ?? null);
      return session.authenticated;
    } catch (error) {
      console.error(error);
      setAuthenticated(false);
      setUserEmail(null);
      setAuthMode(null);
      return false;
    } finally {
      setAuthLoading(false);
    }
  }, []);

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
      setAuthenticated(false);
      setUserEmail(null);
      setAuthMode(null);
      setStatus('Signed out.');
    }
  }, []);

  const value = useMemo(
    () => ({
      hasToken: authenticated,
      userEmail,
      authMode,
      authLoading,
      lastSyncedAt,
      refreshSession,
      signOut,
      status,
      setStatus,
      syncing,
      syncInbox,
    }),
    [
      authenticated,
      userEmail,
      authMode,
      authLoading,
      lastSyncedAt,
      refreshSession,
      signOut,
      status,
      syncing,
      syncInbox,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
