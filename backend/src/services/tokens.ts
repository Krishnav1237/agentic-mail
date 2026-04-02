import { query } from '../db/index.js';
import { decrypt, encrypt } from '../utils/crypto.js';
import { refreshAccessToken } from './graph.js';
import { refreshGoogleAccessToken } from './gmail.js';

export type AuthProvider = 'microsoft' | 'google';

const isExpired = (expiresAt: string) => {
  const expiry = new Date(expiresAt).getTime();
  return Date.now() >= expiry - 5 * 60 * 1000;
};

type TokenRow = {
  primary_provider: string | null;
  ms_access_token: string | null;
  ms_refresh_token: string | null;
  ms_token_expires_at: string | null;
  google_access_token: string | null;
  google_refresh_token: string | null;
  google_token_expires_at: string | null;
  last_sync_at: string | null;
};

const resolveProvider = (
  row: TokenRow,
  override?: AuthProvider
): AuthProvider => {
  if (override) return override;
  if (row.primary_provider === 'google') return 'google';
  if (row.primary_provider === 'microsoft') return 'microsoft';
  if (row.google_access_token) return 'google';
  return 'microsoft';
};

export const getAuthContext = async (
  userId: string,
  providerOverride?: AuthProvider
) => {
  const result = await query<TokenRow>(
    `SELECT primary_provider,
            ms_access_token, ms_refresh_token, ms_token_expires_at,
            google_access_token, google_refresh_token, google_token_expires_at,
            last_sync_at
     FROM users
     WHERE id = $1`,
    [userId]
  );

  if (result.rowCount === 0) {
    throw new Error('User not found');
  }

  const row = result.rows[0];
  const provider = resolveProvider(row, providerOverride);

  if (provider === 'google') {
    if (
      !row.google_access_token ||
      !row.google_refresh_token ||
      !row.google_token_expires_at
    ) {
      throw new Error('Google tokens not available');
    }
    let accessToken = decrypt(row.google_access_token);
    let refreshToken = decrypt(row.google_refresh_token);

    if (isExpired(row.google_token_expires_at)) {
      const refreshed = await refreshGoogleAccessToken(refreshToken);
      accessToken = refreshed.access_token;
      refreshToken = refreshed.refresh_token ?? refreshToken;
      const expiresAt = new Date(
        Date.now() + refreshed.expires_in * 1000
      ).toISOString();

      await query(
        `UPDATE users SET google_access_token = $1, google_refresh_token = $2, google_token_expires_at = $3, updated_at = now() WHERE id = $4`,
        [encrypt(accessToken), encrypt(refreshToken), expiresAt, userId]
      );
    }

    return { provider, accessToken, lastSyncAt: row.last_sync_at };
  }

  if (
    !row.ms_access_token ||
    !row.ms_refresh_token ||
    !row.ms_token_expires_at
  ) {
    throw new Error('Microsoft tokens not available');
  }
  let accessToken = decrypt(row.ms_access_token);
  let refreshToken = decrypt(row.ms_refresh_token);

  if (isExpired(row.ms_token_expires_at)) {
    const refreshed = await refreshAccessToken(refreshToken);
    accessToken = refreshed.access_token;
    refreshToken = refreshed.refresh_token ?? refreshToken;
    const expiresAt = new Date(
      Date.now() + refreshed.expires_in * 1000
    ).toISOString();

    await query(
      'UPDATE users SET ms_access_token = $1, ms_refresh_token = $2, ms_token_expires_at = $3, updated_at = now() WHERE id = $4',
      [encrypt(accessToken), encrypt(refreshToken), expiresAt, userId]
    );
  }

  return { provider, accessToken, lastSyncAt: row.last_sync_at };
};

export const getValidAccessToken = async (
  userId: string,
  providerOverride?: AuthProvider
) => {
  const ctx = await getAuthContext(userId, providerOverride);
  return ctx.accessToken;
};
