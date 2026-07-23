/**
 * Validation Token Authentication Middleware
 *
 * Protects internal validation APIs. Uses dependency injection to avoid global test setters.
 *
 * Security properties:
 *   - Token retrieved via injected provider function (() => env.VALIDATION_TOKEN in production).
 *   - Compared using crypto.timingSafeEqual to prevent timing oracle attacks.
 *   - Never logged (masked in all log output, errors, exports, DB).
 *   - Rate limited via standard rate limiter.
 *   - Deny-by-default: disabled (503) when token is not configured or empty (< 32 chars).
 *   - Request header missing or empty -> 401.
 *   - Incorrect token -> 403.
 *   - Never a weak ?isAdmin=true query parameter.
 */

import { RequestHandler } from 'express';
import crypto from 'crypto';
import { env } from '../config/env.js';

/**
 * Timing-safe string comparison handling length mismatch safely.
 */
export function safeTokenEquals(provided: string, expected: string): boolean {
  if (!provided || !expected || expected.length < 32) return false;

  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');

  if (a.length !== b.length) return false;

  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Factory function creating validation auth middleware with injected token provider.
 * Allows test suites to inject token providers cleanly without mutating global state.
 */
export function createValidationAuthMiddleware(getToken: () => string): RequestHandler {
  return (req, res, next) => {
    const expected = (getToken() ?? '').trim();

    if (expected.length < 32) {
      res.status(503).json({
        error: 'VALIDATION_NOT_CONFIGURED',
        message: 'Validation API is disabled. VALIDATION_TOKEN is missing or invalid in environment.',
      });
      return;
    }

    const provided = (req.get('x-validation-token') ?? '').trim();

    if (!provided) {
      res.status(401).json({
        error: 'VALIDATION_TOKEN_REQUIRED',
        message: 'Missing or empty X-Validation-Token header',
      });
      return;
    }

    if (!safeTokenEquals(provided, expected)) {
      res.status(403).json({
        error: 'VALIDATION_TOKEN_INVALID',
        message: 'Invalid validation token',
      });
      return;
    }

    next();
  };
}

/** Default production middleware reading from env.VALIDATION_TOKEN */
export const requireValidationToken: RequestHandler = createValidationAuthMiddleware(
  () => env.VALIDATION_TOKEN
);
