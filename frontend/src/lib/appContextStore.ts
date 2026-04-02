import { createContext } from 'react';

export type AppContextValue = {
  hasToken: boolean;
  token: string | null;
  userEmail: string | null;
  authMode: 'cookie' | 'bearer' | null;
  authLoading: boolean;
  lastSyncedAt: string | null;
  setToken: (token: string | null) => void;
  refreshSession: () => Promise<boolean>;
  signOut: () => Promise<void>;
  status: string;
  setStatus: (status: string) => void;
  syncing: boolean;
  syncInbox: () => Promise<void>;
};

export const AppContext = createContext<AppContextValue | null>(null);
