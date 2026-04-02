import { Redis } from 'ioredis';
import { env } from './env.js';

/**
 * Parse Redis URL into connection options for BullMQ.
 * BullMQ requires explicit host/port/password — it does NOT accept a `url` field.
 */
const parseRedisUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || '127.0.0.1',
      port: Number(parsed.port) || 6379,
      password: parsed.password
        ? decodeURIComponent(parsed.password)
        : undefined,
      db: parsed.pathname ? Number(parsed.pathname.slice(1)) || 0 : 0,
      maxRetriesPerRequest: null as null,
    };
  } catch {
    // Fallback for simple redis://localhost:6379 style URLs
    return {
      host: '127.0.0.1',
      port: 6379,
      maxRetriesPerRequest: null as null,
    };
  }
};

const resolveRedisUrl = (preferredUrl?: string) => preferredUrl || env.redisUrl;

export const cacheRedis = new Redis(resolveRedisUrl(env.cacheRedisUrl), {
  maxRetriesPerRequest: 3,
});

export const queueRedisConnection = parseRedisUrl(
  resolveRedisUrl(env.queueRedisUrl)
);
