import { cacheRedis } from '../config/redis.js';
import { env } from '../config/env.js';

export const cacheGet = async <T>(key: string): Promise<T | null> => {
  const value = await cacheRedis.get(key);
  if (!value) return null;
  return JSON.parse(value) as T;
};

export const cacheSet = async (
  key: string,
  value: unknown,
  ttlSeconds = env.cacheTtlSeconds
) => {
  await cacheRedis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
};

export const cacheDel = async (key: string) => {
  await cacheRedis.del(key);
};
