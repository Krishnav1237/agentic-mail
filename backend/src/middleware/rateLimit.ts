import { Request, Response, NextFunction } from 'express';
import { redisCache } from '../redis/index.js';
import { AppError, ErrorCode } from '../errors/AppError.js';

interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyPrefix: string;
  /**
   * When true, a Redis error blocks the request (503) instead of the default
   * fail-open behavior. For irreversible actions (Gmail send) where "no rate
   * limit at all during an outage" is a worse failure mode than "briefly
   * unavailable" — see docs/integration-audit.md's Gmail write access design.
   */
  failClosed?: boolean;
}

/**
 * Redis-backed sliding window rate limiter middleware.
 * Uses client IP derived from express req.ip (which obeys trust proxy settings).
 */
export const rateLimiter = (options: RateLimitOptions) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Derive key safely from req.ip or fallback identifier
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `ratelimit:${options.keyPrefix}:${clientIp}`;

    try {
      const current = await redisCache.incr(key);
      if (current === 1) {
        await redisCache.pexpire(key, options.windowMs);
      }

      const ttl = await redisCache.pttl(key);

      res.setHeader('X-RateLimit-Limit', options.max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, options.max - current));
      res.setHeader('X-RateLimit-Reset', Math.ceil((Date.now() + Math.max(0, ttl)) / 1000));

      if (current > options.max) {
        return next(new AppError(ErrorCode.RATE_LIMITED, 'Too many requests, please try again later.', 429));
      }

      next();
    } catch (err) {
      console.error('[RateLimit] Redis error:', err);
      if (options.failClosed) {
        return next(new AppError(ErrorCode.RATE_LIMIT_UNAVAILABLE, 'Sending is temporarily unavailable, try again shortly.', 503));
      }
      // Fail open for everything else, to avoid a Redis blip taking down reads/writes
      // that aren't individually irreversible.
      next();
    }
  };
};
