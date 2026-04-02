import { query } from '../db/index.js';
import { encrypt } from '../utils/crypto.js';
import type { GraphProfile, GraphTokenResponse } from './graph.js';
import type { GoogleProfile, GoogleTokenResponse } from './gmail.js';

export type UserRow = {
  id: string;
  email: string;
  display_name: string | null;
};

export const upsertUserFromMicrosoft = async (
  profile: GraphProfile,
  token: GraphTokenResponse
) => {
  const email = profile.mail ?? profile.userPrincipalName ?? '';
  const expiresAt = new Date(
    Date.now() + token.expires_in * 1000
  ).toISOString();

  const result = await query<UserRow>(
    `INSERT INTO users (ms_user_id, email, display_name, ms_access_token, ms_refresh_token, ms_token_expires_at, primary_provider)
     VALUES ($1, $2, $3, $4, $5, $6, 'microsoft')
     ON CONFLICT (email) DO UPDATE SET
       ms_access_token = EXCLUDED.ms_access_token,
       ms_refresh_token = COALESCE(EXCLUDED.ms_refresh_token, users.ms_refresh_token),
       ms_token_expires_at = EXCLUDED.ms_token_expires_at,
       display_name = EXCLUDED.display_name,
       primary_provider = 'microsoft',
       updated_at = now()
     RETURNING id, email, display_name`,
    [
      profile.id,
      email,
      profile.displayName ?? null,
      encrypt(token.access_token),
      encrypt(token.refresh_token),
      expiresAt,
    ]
  );

  return result.rows[0];
};

export const upsertUserFromGoogle = async (
  profile: GoogleProfile,
  token: GoogleTokenResponse
) => {
  const email = profile.email ?? '';
  const expiresAt = new Date(
    Date.now() + token.expires_in * 1000
  ).toISOString();

  const result = await query<UserRow>(
    `INSERT INTO users (google_user_id, email, display_name, google_access_token, google_refresh_token, google_token_expires_at, primary_provider)
     VALUES ($1, $2, $3, $4, $5, $6, 'google')
     ON CONFLICT (email) DO UPDATE SET
       google_access_token = EXCLUDED.google_access_token,
       google_refresh_token = COALESCE(EXCLUDED.google_refresh_token, users.google_refresh_token),
       google_token_expires_at = EXCLUDED.google_token_expires_at,
       display_name = EXCLUDED.display_name,
       primary_provider = 'google',
       updated_at = now()
     RETURNING id, email, display_name`,
    [
      profile.sub,
      email,
      profile.name ?? null,
      encrypt(token.access_token),
      token.refresh_token ? encrypt(token.refresh_token) : null,
      expiresAt,
    ]
  );

  return result.rows[0];
};
