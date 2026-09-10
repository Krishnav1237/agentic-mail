import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';
import { env } from '../config/env.js';
import { encryptToken, decryptToken } from '../utils/crypto.js';
import {
  getGoogleAuthUrlWithPKCE,
  validateAndConsumeOAuthState,
  exchangeCodeForTokensWithPKCE,
  getGoogleUserInfo,
  revokeGoogleToken,
} from '../services/googleAuth.js';
import {
  authenticateJwt,
  signUserJwt,
  AuthenticatedRequest,
} from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rateLimit.js';
import { AppError, ErrorCode } from '../errors/AppError.js';

const POST_LOGIN_REDIRECT_PATH = '/auth/callback';

const COOKIE_OPTIONS = {
  secure: env.NODE_ENV === 'production',
  sameSite: (env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};

const CLEAR_COOKIE_OPTIONS = {
  secure: env.NODE_ENV === 'production',
  sameSite: (env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
  path: '/',
};

export const authRouter = Router();

// Rate limiter for auth endpoints
const authRateLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 100,
  keyPrefix: 'auth',
});

// ─── GET /auth/google ─────────────────────────────────────────────────────────
authRouter.get('/google', authRateLimiter, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const state = crypto.randomBytes(32).toString('hex');
    const authUrl = await getGoogleAuthUrlWithPKCE(state);
    res.redirect(authUrl);
  } catch (err) {
    next(new AppError(ErrorCode.OAUTH_CALLBACK_FAILED, 'Failed to initiate Google OAuth flow', 500));
  }
});

// ─── GET /auth/google/callback ────────────────────────────────────────────────
authRouter.get('/google/callback', authRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    return next(new AppError(ErrorCode.OAUTH_CALLBACK_FAILED, 'OAuth authorization denied or failed', 400));
  }

  if (
    typeof code !== 'string' ||
    code.length === 0 ||
    typeof state !== 'string' ||
    state.length === 0
  ) {
    return next(new AppError(ErrorCode.OAUTH_STATE_INVALID, 'Missing or invalid code or state', 400));
  }

  const pkceData = await validateAndConsumeOAuthState(state);
  if (!pkceData) {
    return next(new AppError(ErrorCode.OAUTH_STATE_EXPIRED, 'Invalid or expired OAuth state token', 400));
  }

  const client = await db.connect();
  try {
    const tokens = await exchangeCodeForTokensWithPKCE(code, pkceData.verifier);
    if (!tokens.access_token) {
      throw new AppError(ErrorCode.OAUTH_CALLBACK_FAILED, 'No access token returned from provider', 400);
    }

    const userInfo = await getGoogleUserInfo(tokens.access_token);
    if (!userInfo.email) {
      throw new AppError(ErrorCode.OAUTH_CALLBACK_FAILED, 'No email returned from provider', 400);
    }

    if (userInfo.verified_email === false) {
      return next(new AppError(ErrorCode.OAUTH_CALLBACK_FAILED, 'Google account email address is not verified', 400));
    }

    await client.query('BEGIN');

    // Google's account picture, in the frontend's own ProfilePhoto shape. The
    // `profile` scope is already in GMAIL_SCOPES, so this costs no additional
    // consent — it is the reason GET /profile can serve a real avatar without
    // any image storage existing (see routes/profile.ts).
    const providerPhoto = userInfo.picture
      ? JSON.stringify({ kind: 'provider', url: userInfo.picture })
      : null;

    const userRes = await client.query(
      `INSERT INTO users (email, full_name, google_sub, profile_photo)
       VALUES ($1, $2, $3, COALESCE($4::jsonb, '{"kind":"none"}'::jsonb))
       ON CONFLICT (email) DO UPDATE
         SET full_name     = EXCLUDED.full_name,
             google_sub    = COALESCE(EXCLUDED.google_sub, users.google_sub),
             -- Refresh the Google picture only for a user who is still ON the
             -- Google picture (its URLs rotate). A stored {kind:'none'} means
             -- the user either never had one or explicitly removed it, and
             -- re-adding it at the next login would silently undo that
             -- removal — so this never writes over any other kind.
             profile_photo = CASE
                               WHEN $4::jsonb IS NULL THEN users.profile_photo
                               WHEN users.profile_photo->>'kind' = 'provider' THEN $4::jsonb
                               ELSE users.profile_photo
                             END,
             updated_at    = NOW()
       RETURNING id, email`,
      [userInfo.email, userInfo.name || null, userInfo.id || null, providerPhoto]
    );
    const user = userRes.rows[0];

    const encAccessToken = encryptToken(tokens.access_token);
    const encRefreshToken = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null;
    const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : null;
    const scopes = tokens.scope ? tokens.scope.split(' ') : [];

    await client.query(
      `INSERT INTO user_credentials (user_id, provider, key_version, encrypted_access_token, encrypted_refresh_token, expires_at, scopes)
       VALUES ($1, 'google', 1, $2, $3, $4, $5)
       ON CONFLICT (user_id, provider) DO UPDATE SET
         key_version              = 1,
         encrypted_access_token   = EXCLUDED.encrypted_access_token,
         encrypted_refresh_token  = COALESCE(EXCLUDED.encrypted_refresh_token, user_credentials.encrypted_refresh_token),
         expires_at               = EXCLUDED.expires_at,
         scopes                   = EXCLUDED.scopes,
         updated_at               = NOW()`,
      [user.id, encAccessToken, encRefreshToken, expiresAt, scopes]
    );

    await client.query(
      `INSERT INTO provider_sync_states (user_id, provider, sync_status)
       VALUES ($1, 'google', 'idle')
       ON CONFLICT (user_id, provider) DO NOTHING`,
      [user.id]
    );

    await client.query(
      `INSERT INTO user_preferences (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [user.id]
    );

    await client.query(
      `INSERT INTO audit_events (user_id, event_type, actor, details)
       VALUES ($1, 'user_login', 'user', $2)`,
      [user.id, JSON.stringify({ provider: 'google' })]
    );

    await client.query('COMMIT');

    const jwtToken = signUserJwt({ userId: user.id, email: user.email });
    const csrfToken = crypto.randomBytes(32).toString('hex');

    res.cookie('auth_token', jwtToken, { ...COOKIE_OPTIONS, httpOnly: true });
    res.cookie('csrf_token', csrfToken, { ...COOKIE_OPTIONS, httpOnly: false });

    res.redirect(`${env.FRONTEND_URL}${POST_LOGIN_REDIRECT_PATH}`);
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    next(err instanceof AppError ? err : new AppError(ErrorCode.OAUTH_CALLBACK_FAILED, 'Authentication failed', 500));
  } finally {
    client.release();
  }
});

// ─── GET /auth/session ────────────────────────────────────────────────────────
authRouter.get('/session', (req: Request, res: Response) => {
  let token: string | undefined;
  let authMode: 'cookie' | 'bearer' = 'cookie';

  if (req.cookies?.auth_token) {
    token = req.cookies.auth_token as string;
  } else {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
      authMode = 'bearer';
    }
  }

  if (!token) {
    res.json({ authenticated: false });
    return;
  }

  try {
    const payload = jwt.verify(token, env.AUTH_JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: env.AUTH_JWT_ISSUER,
      audience: env.AUTH_JWT_AUDIENCE,
    }) as jwt.JwtPayload;

    res.json({
      authenticated: true,
      user: { userId: payload.sub, email: payload.email },
      authMode,
    });
  } catch {
    res.json({ authenticated: false });
  }
});

// ─── POST /auth/logout ────────────────────────────────────────────────────────
authRouter.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('auth_token', { ...CLEAR_COOKIE_OPTIONS, httpOnly: true });
  res.clearCookie('csrf_token', { ...CLEAR_COOKIE_OPTIONS, httpOnly: false });
  res.json({ ok: true, message: 'Signed out successfully' });
});

// ─── POST /auth/google/disconnect ─────────────────────────────────────────────
authRouter.post(
  '/google/disconnect',
  authenticateJwt,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      const credRes = await client.query(
        `SELECT encrypted_access_token, encrypted_refresh_token
         FROM user_credentials
         WHERE user_id = $1 AND provider = 'google'
         FOR UPDATE`,
        [userId]
      );

      if (credRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return next(new AppError(ErrorCode.GOOGLE_ACCOUNT_DISCONNECTED, 'No Google account is currently connected', 404));
      }

      const { encrypted_access_token, encrypted_refresh_token } = credRes.rows[0];
      let tokenToRevoke: string;
      try {
        tokenToRevoke = encrypted_refresh_token
          ? decryptToken(encrypted_refresh_token)
          : decryptToken(encrypted_access_token);
      } catch {
        tokenToRevoke = '';
      }

      await client.query(
        `DELETE FROM user_credentials WHERE user_id = $1 AND provider = 'google'`,
        [userId]
      );
      await client.query(
        `DELETE FROM provider_sync_states WHERE user_id = $1 AND provider = 'google'`,
        [userId]
      );

      await client.query(
        `INSERT INTO audit_events (user_id, event_type, actor, details)
         VALUES ($1, 'google_disconnected', 'user', $2)`,
        [userId, JSON.stringify({ provider: 'google' })]
      );

      await client.query('COMMIT');

      if (tokenToRevoke) {
        await revokeGoogleToken(tokenToRevoke);
      }

      res.clearCookie('auth_token', { ...CLEAR_COOKIE_OPTIONS, httpOnly: true });
      res.clearCookie('csrf_token', { ...CLEAR_COOKIE_OPTIONS, httpOnly: false });

      res.json({ ok: true, message: 'Google account disconnected successfully' });
    } catch (err: unknown) {
      await client.query('ROLLBACK');
      next(err instanceof AppError ? err : new AppError(ErrorCode.INTERNAL_ERROR, 'Failed to disconnect Google account', 500));
    } finally {
      client.release();
    }
  }
);
