const configuredApiBase = import.meta.env.VITE_API_BASE?.trim();

export const API_BASE = configuredApiBase
  ? configuredApiBase.replace(/\/+$/, '')
  : import.meta.env.DEV
    ? 'http://localhost:4000'
    : typeof window !== 'undefined'
      ? window.location.origin
      : '';
