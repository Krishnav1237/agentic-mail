import crypto from 'crypto';
import { google } from 'googleapis';
import { env } from '../config/env.js';
import { redisCache } from '../redis/index.js';
import { query } from '../db/index.js';
import { encryptToken, decryptToken } from '../utils/crypto.js';
import { acquireLock, releaseLock, renewLock, atomicGetDel } from '../utils/redisLua.js';

// Phase 1–4 only requires gmail.readonly for ingestion + read-only classification.
// gmail.modify and gmail.send are NOT included until Phase 6 execution is approved.
export const GMAIL_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
];

export const createOAuth2Client = () => {
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI
  );
};

export const generatePKCE = () => {
  // RFC 7636: verifier must be 43–128 chars from [A-Z a-z 0-9 -._~]
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
};

export const getGoogleAuthUrlWithPKCE = async (state: string) => {
  const client = createOAuth2Client();
  const { verifier, challenge } = generatePKCE();

  // Store state + PKCE verifier with 10-minute TTL
  await redisCache.set(
    `oauth:state:${state}`,
    JSON.stringify({ verifier, createdAt: new Date().toISOString() }),
    'EX',
    600
  );

  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GMAIL_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 's256' as any,
  });

  return authUrl;
};

/**
 * Atomically consume the OAuth state from Redis.
 * Uses a Lua GETDEL script so that no two concurrent callbacks can both consume the same state.
 */
export const validateAndConsumeOAuthState = async (state: string) => {
  const redisKey = `oauth:state:${state}`;
  // Atomic: GET + DEL in one operation. Returns null if already consumed or expired.
  const data = await atomicGetDel(redisCache, redisKey);
  if (!data) return null;
  try {
    return JSON.parse(data) as { verifier: string };
  } catch {
    return null;
  }
};

export const exchangeCodeForTokensWithPKCE = async (
  code: string,
  codeVerifier: string
) => {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken({ code, codeVerifier });
  return tokens;
};

export const getGoogleUserInfo = async (accessToken: string) => {
  const client = createOAuth2Client();
  client.setCredentials({ access_token: accessToken });
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const { data } = await oauth2.userinfo.get();
  return data;
};

export const revokeGoogleToken = async (token: string) => {
  const client = createOAuth2Client();
  try {
    await client.revokeToken(token);
  } catch (err) {
    // Revocation is best-effort; Google may reject already-invalid tokens
    console.warn('[Google Auth] Token revocation warning (best-effort)');
  }
};

const TOKEN_REFRESH_LOCK_TTL_MS = 15_000; // 15 seconds — enough for a network round-trip

/**
 * Protected token refresh with per-user Redis lock.
 * - Uses a random lock token (not a hardcoded string) for ownership safety
 * - Uses acquireLock (SET NX PX) for atomic acquisition
 * - Uses releaseLock (Lua compare-and-DEL) so we never release another process's lock
 */
export const refreshUserGoogleToken = async (userId: string): Promise<string> => {
  const lockKey = `lock:token_refresh:${userId}`;
  const lockToken = crypto.randomBytes(16).toString('hex'); // Random — no other process knows this
  const acquireTimeoutMs = 12_000;
  const pollIntervalMs = 200;
  const start = Date.now();

  let acquired = false;
  while (Date.now() - start < acquireTimeoutMs) {
    acquired = await acquireLock(redisCache, lockKey, lockToken, TOKEN_REFRESH_LOCK_TTL_MS);
    if (acquired) break;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  if (!acquired) {
    throw new Error('GOOGLE_TOKEN_REFRESH_FAILED: could not acquire refresh lock within timeout');
  }

  try {
    // Re-read credentials after acquiring the lock — another process may have refreshed already
    const credRes = await query(
      `SELECT encrypted_access_token, encrypted_refresh_token, expires_at
       FROM user_credentials
       WHERE user_id = $1 AND provider = 'google'`,
      [userId]
    );

    if (credRes.rows.length === 0) {
      throw new Error('GOOGLE_ACCOUNT_DISCONNECTED: user has no Google credentials');
    }

    const creds = credRes.rows[0];
    const now = new Date();
    const expiresAt = creds.expires_at ? new Date(creds.expires_at) : null;

    // Return current token if still valid (with 60s buffer)
    if (expiresAt && expiresAt.getTime() - now.getTime() > 60_000) {
      return decryptToken(creds.encrypted_access_token);
    }

    if (!creds.encrypted_refresh_token) {
      throw new Error('GOOGLE_TOKEN_REFRESH_FAILED: no refresh token available');
    }

    const refreshToken = decryptToken(creds.encrypted_refresh_token);
    const client = createOAuth2Client();
    client.setCredentials({ refresh_token: refreshToken });

    const { credentials } = await client.refreshAccessToken();
    if (!credentials.access_token) {
      throw new Error('GOOGLE_TOKEN_REFRESH_FAILED: provider returned empty access token');
    }

    const encAccessToken = encryptToken(credentials.access_token);
    const newExpiresAt = credentials.expiry_date ? new Date(credentials.expiry_date) : null;

    // Preserve refresh token if provider did not return a new one
    const encRefreshToken = credentials.refresh_token
      ? encryptToken(credentials.refresh_token)
      : undefined;

    if (encRefreshToken) {
      await query(
        `UPDATE user_credentials
         SET encrypted_access_token = $1, encrypted_refresh_token = $2, expires_at = $3, updated_at = NOW()
         WHERE user_id = $4 AND provider = 'google'`,
        [encAccessToken, encRefreshToken, newExpiresAt, userId]
      );
    } else {
      await query(
        `UPDATE user_credentials
         SET encrypted_access_token = $1, expires_at = $2, updated_at = NOW()
         WHERE user_id = $3 AND provider = 'google'`,
        [encAccessToken, newExpiresAt, userId]
      );
    }

    return credentials.access_token;
  } finally {
    // Ownership-safe release: Lua compare-and-DEL
    await releaseLock(redisCache, lockKey, lockToken);
  }
};
