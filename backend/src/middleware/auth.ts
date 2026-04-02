import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export type AuthUser = {
  userId: string;
  email: string;
  iss?: string;
  aud?: string | string[];
};

export type AuthSource = 'bearer' | 'cookie';

export type AuthRequest = Request & {
  user?: AuthUser;
  authSource?: AuthSource;
};

const verifyToken = (token: string): AuthUser =>
  jwt.verify(token, env.authJwtSecret, {
    issuer: env.authJwtIssuer,
    audience: env.authJwtAudience,
  }) as AuthUser;

export const readAuthFromRequest = (
  req: Request
): { user: AuthUser; source: AuthSource } | null => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '').trim();
    return { user: verifyToken(token), source: 'bearer' };
  }

  const cookieToken = req.cookies?.[env.authCookieName];
  if (typeof cookieToken === 'string' && cookieToken.trim().length > 0) {
    return { user: verifyToken(cookieToken.trim()), source: 'cookie' };
  }

  return null;
};

export const authMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const auth = (() => {
    try {
      return readAuthFromRequest(req);
    } catch {
      return null;
    }
  })();

  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  req.user = auth.user;
  req.authSource = auth.source;
  return next();
};
