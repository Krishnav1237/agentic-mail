import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env.js';

// Explicitly restrict JWT to HS256 only — prevents algorithm confusion attacks.
// This blocks: 'none' algorithm, RS256 confusion, HS384/HS512 accidental usage.
const JWT_ALGORITHM: jwt.Algorithm = 'HS256';
const JWT_ALGORITHMS: jwt.Algorithm[] = ['HS256'];

export interface AuthenticatedUser {
  userId: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  authMode?: 'cookie' | 'bearer';
}

export const signUserJwt = (user: AuthenticatedUser): string => {
  return jwt.sign(
    { sub: user.userId, email: user.email },
    env.AUTH_JWT_SECRET,
    {
      algorithm: JWT_ALGORITHM,
      issuer: env.AUTH_JWT_ISSUER,
      audience: env.AUTH_JWT_AUDIENCE,
      expiresIn: '7d',
    }
  );
};

export const authenticateJwt = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const hasCookie = Boolean(req.cookies?.auth_token);
  const hasBearer = Boolean(req.headers.authorization?.startsWith('Bearer '));

  // Reject conflicting identities
  if (hasCookie && hasBearer) {
    res.status(401).json({
      error: 'AUTH_CONFLICT',
      message: 'Provide either a session cookie or Bearer token — not both',
    });
    return;
  }

  let token: string;
  let authMode: 'cookie' | 'bearer';

  if (hasCookie) {
    token = req.cookies.auth_token as string;
    authMode = 'cookie';
  } else if (hasBearer) {
    token = req.headers.authorization!.substring(7);
    authMode = 'bearer';
  } else {
    res.status(401).json({ error: 'AUTH_REQUIRED', message: 'Missing authentication token' });
    return;
  }

  try {
    const payload = jwt.verify(token, env.AUTH_JWT_SECRET, {
      algorithms: JWT_ALGORITHMS,
      issuer: env.AUTH_JWT_ISSUER,
      audience: env.AUTH_JWT_AUDIENCE,
    }) as jwt.JwtPayload;

    // Double-Submit CSRF validation for cookie-authenticated state-changing requests
    if (authMode === 'cookie' && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      const csrfHeader = req.headers['x-csrf-token'];
      const csrfCookie = req.cookies?.csrf_token;

      if (
        typeof csrfHeader !== 'string' ||
        typeof csrfCookie !== 'string' ||
        csrfHeader.length < 16 ||
        csrfCookie.length < 16 ||
        !timingSafeEqual(csrfHeader, csrfCookie)
      ) {
        res.status(403).json({ error: 'CSRF_INVALID', message: 'CSRF token validation failed' });
        return;
      }
    }

    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
      res.status(401).json({ error: 'AUTH_REQUIRED', message: 'Invalid token payload' });
      return;
    }

    req.user = { userId: payload.sub, email: payload.email };
    req.authMode = authMode;
    next();
  } catch {
    // Do not disclose JWT error reason (e.g., "jwt expired") to prevent oracle attacks
    res.status(401).json({ error: 'AUTH_REQUIRED', message: 'Invalid or expired token' });
  }
};

/**
 * Constant-time comparison to prevent timing-oracle attacks on CSRF tokens.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  try {
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
