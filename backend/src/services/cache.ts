import { redis } from '../config/redis.js';
import { env } from '../config/env.js';

export const cacheGet = async <T>(key: string): Promise<T | null> => {
  const value = await redis.get(key);
  if (!value) return null;
  return JSON.parse(value) as T;
};

export const cacheSet = async (key: string, value: unknown, ttlSeconds = env.cacheTtlSeconds) => {
  await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
};

export const cacheDel = async (key: string) => {
  await redis.del(key);
};
