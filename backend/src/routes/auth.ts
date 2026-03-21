import { Router, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { authMiddleware, type AuthRequest, readAuthFromRequest } from '../middleware/auth.js';
import { getAuthUrl, exchangeCodeForToken, getProfile, createSubscription } from '../services/graph.js';
import { getGoogleAuthUrl, exchangeGoogleCode, getGoogleProfile } from '../services/gmail.js';
import { upsertUserFromMicrosoft, upsertUserFromGoogle } from '../services/users.js';
import { query } from '../db/index.js';

export const authRouter = Router();

const frontendAppUrl = env.frontendUrl.split(',')[0]?.trim() || env.frontendUrl;

const authCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.nodeEnv === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/'
};

const issueJwt = (user: { id: string; email: string }) => (
  jwt.sign({ userId: user.id, email: user.email }, env.authJwtSecret, {
    expiresIn: '7d',
    issuer: env.authJwtIssuer,
    audience: env.authJwtAudience
  })
);

const setAuthCookie = (res: Response, token: string) => {
  res.cookie(env.authCookieName, token, authCookieOptions);
};

const clearAuthCookie = (res: Response) => {
  res.clearCookie(env.authCookieName, {
    httpOnly: authCookieOptions.httpOnly,
    sameSite: authCookieOptions.sameSite,
    secure: authCookieOptions.secure,
    path: authCookieOptions.path
  });
};

const redirectToFrontendCallback = (res: Response, params: Record<string, string>) => {
  const search = new URLSearchParams(params);
  res.redirect(`${frontendAppUrl}/auth/callback?${search.toString()}`);
};

authRouter.use(rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
}));

authRouter.get('/session', (req, res) => {
  try {
    const auth = readAuthFromRequest(req);
    if (!auth) {
      return res.json({ authenticated: false });
    }

    return res.json({
      authenticated: true,
      user: {
        userId: auth.user.userId,
        email: auth.user.email
      },
      authMode: auth.source
    });
  } catch {
    return res.json({ authenticated: false });
  }
});

authRouter.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  return res.json({ ok: true });
});

authRouter.get('/microsoft', (_req, res) => {
  const state = randomUUID();
  res.cookie('oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.nodeEnv === 'production',
    maxAge: 10 * 60 * 1000
  });
  const url = getAuthUrl(state);
  res.redirect(url);
});

authRouter.get('/microsoft/callback', async (req, res) => {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  const storedState = req.cookies?.oauth_state as string | undefined;

  if (!code || !state || !storedState || storedState !== state) {
    clearAuthCookie(res);
    return redirectToFrontendCallback(res, { status: 'error', provider: 'microsoft' });
  }

  res.clearCookie('oauth_state');

  const token = await exchangeCodeForToken(code);
  const profile = await getProfile(token.access_token);
  const user = await upsertUserFromMicrosoft(profile, token);

  if (env.msWebhookNotificationUrl) {
    const clientState = randomUUID();
    const expirationDateTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const subscription = await createSubscription(token.access_token, {
      resource: 'me/mailFolders/Inbox/messages',
      changeType: 'created,updated',
      notificationUrl: env.msWebhookNotificationUrl,
      expirationDateTime,
      clientState
    });

    await query(
      `INSERT INTO graph_subscriptions (user_id, subscription_id, resource, expiration_date_time, client_state)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, subscription_id) DO NOTHING`,
      [user.id, subscription.id, subscription.resource, subscription.expirationDateTime, clientState]
    );
  }

  setAuthCookie(res, issueJwt(user));
  return redirectToFrontendCallback(res, { status: 'connected', provider: 'microsoft' });
});

authRouter.get('/google', (_req, res) => {
  const state = randomUUID();
  res.cookie('oauth_state_google', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.nodeEnv === 'production',
    maxAge: 10 * 60 * 1000
  });
  const url = getGoogleAuthUrl(state);
  res.redirect(url);
});

authRouter.get('/google/callback', async (req, res) => {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  const storedState = req.cookies?.oauth_state_google as string | undefined;

  if (!code || !state || !storedState || storedState !== state) {
    clearAuthCookie(res);
    return redirectToFrontendCallback(res, { status: 'error', provider: 'google' });
  }

  res.clearCookie('oauth_state_google');

  const token = await exchangeGoogleCode(code);
  const profile = await getGoogleProfile(token.access_token);
  const user = await upsertUserFromGoogle(profile, token);

  setAuthCookie(res, issueJwt(user));
  return redirectToFrontendCallback(res, { status: 'connected', provider: 'google' });
});

authRouter.get('/verify', authMiddleware, (req: AuthRequest, res) => {
  return res.json({
    ok: true,
    user: req.user,
    authMode: req.authSource
  });
});
