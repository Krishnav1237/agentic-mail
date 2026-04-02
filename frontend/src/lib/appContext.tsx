import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getSession, logout as apiLogout, syncInbox as apiSyncInbox } from './api';

type AppContextValue = {
  hasToken: boolean;
  isAuthenticated: boolean;
  token: string | null;
  userEmail: string | null;
  authMode: 'cookie' | 'bearer' | null;
  authLoading: boolean;
  loading: boolean;
  lastSyncedAt: string | null;
  setToken: (token: string | null) => void;
  refreshSession: () => Promise<boolean>;
  signOut: () => Promise<void>;
  status: string;
  setStatus: (status: string) => void;
  syncing: boolean;
  syncInbox: () => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem('auth_token'));
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'cookie' | 'bearer' | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
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

  const clearStoredToken = useCallback(() => {
    localStorage.removeItem('auth_token');
    setTokenState(null);
  }, []);

  const refreshSession = useCallback(async () => {
    setLoading(true);
    try {
      const session = await getSession();
      if (session.authenticated && session.user) {
        setIsAuthenticated(true);
        setUserEmail(session.user.email);
        setAuthMode(session.authMode ?? null);

        if (session.authMode === 'cookie' && token) {
          clearStoredToken();
        }
        return true;
      }

      setIsAuthenticated(false);
      setUserEmail(null);
      setAuthMode(null);
      if (token) {
        clearStoredToken();
      }
      return false;
    } catch (error) {
      console.error(error);
      setIsAuthenticated(false);
      setUserEmail(null);
      setAuthMode(null);
      if (token) {
        clearStoredToken();
      }
      return false;
    } finally {
      setLoading(false);
    }
  }, [clearStoredToken, token]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    console.log('SESSION_CHECK', { isAuthenticated, loading });
  }, [isAuthenticated, loading]);

  const syncInbox = useCallback(async () => {
    setSyncing(true);
    setStatus('Syncing your inbox...');
    try {
      await apiSyncInbox();
      const now = new Date().toISOString();
      setLastSyncedAt(now);
      console.log('INBOX_SYNC', { lastSyncedAt: now });
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
      setIsAuthenticated(false);
      setUserEmail(null);
      setAuthMode(null);
      setStatus('Signed out.');
    }
  }, [setToken]);

  const value = useMemo(() => ({
    hasToken: isAuthenticated,
    isAuthenticated,
    token,
    userEmail,
    authMode,
    authLoading: loading,
    loading,
    lastSyncedAt,
    setToken,
    refreshSession,
    signOut,
    status,
    setStatus,
    syncing,
    syncInbox
  }), [
    isAuthenticated,
    token,
    userEmail,
    authMode,
    loading,
    lastSyncedAt,
    setToken,
    refreshSession,
    signOut,
    status,
    syncing,
    syncInbox
  ]);

  if (loading) {
    return null;
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used within AppProvider');
  }
  return ctx;
};
