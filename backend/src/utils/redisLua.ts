/**
 * Atomic Redis lock operations using Lua scripts.
 * These guarantee compare-and-delete / compare-and-PEXPIRE atomicity —
 * no other process can interleave between the check and the mutate.
 */
import type { Redis } from 'ioredis';

/**
 * SET key token NX PX ttlMs
 * Returns 'OK' if acquired, null if already held.
 */
export const acquireLock = async (
  redis: Redis,
  key: string,
  token: string,
  ttlMs: number
): Promise<boolean> => {
  const result = await redis.set(key, token, 'PX', ttlMs, 'NX');
  return result === 'OK';
};

/**
 * Atomically delete key only if its value equals token.
 * Lua: if redis.call('GET', key) == token then DEL end
 * Returns 1 if deleted, 0 if not owner or already expired.
 */
const RELEASE_SCRIPT = `
  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
  else
    return 0
  end
`;

export const releaseLock = async (
  redis: Redis,
  key: string,
  token: string
): Promise<boolean> => {
  const result = (await redis.eval(RELEASE_SCRIPT, 1, key, token)) as number;
  return result === 1;
};

/**
 * Atomically extend TTL only if we still own the lock.
 * Lua: if redis.call('GET', key) == token then PEXPIRE key ttlMs end
 * Returns 1 if renewed, 0 if ownership lost.
 */
const RENEW_SCRIPT = `
  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("PEXPIRE", KEYS[1], ARGV[2])
  else
    return 0
  end
`;

export const renewLock = async (
  redis: Redis,
  key: string,
  token: string,
  ttlMs: number
): Promise<boolean> => {
  const result = (await redis.eval(RENEW_SCRIPT, 1, key, token, String(ttlMs))) as number;
  return result === 1;
};

/**
 * Atomically consume a key (GET then DEL), returning its value.
 * Prevents replay by consuming in a single atomic operation.
 */
const GETDEL_SCRIPT = `
  local v = redis.call("GET", KEYS[1])
  if v then redis.call("DEL", KEYS[1]) end
  return v
`;

export const atomicGetDel = async (
  redis: Redis,
  key: string
): Promise<string | null> => {
  const result = (await redis.eval(GETDEL_SCRIPT, 1, key)) as string | null;
  return result || null;
};
