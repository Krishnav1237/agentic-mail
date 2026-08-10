import { clearRedisData } from './helpers.js';
import { redisCache } from '../../redis/index.js';
import { acquireLock, releaseLock, renewLock, atomicGetDel } from '../../utils/redisLua.js';

export async function runRedisLocksTest() {
  console.log('  [Suite 2] Real Redis Lua Lock & Atomic State Operations Test...');
  await clearRedisData();

  // 1. Atomic OAuth state consumption
  console.log('    2.1 Testing atomic OAuth state consumption (GETDEL)...');
  const stateKey = 'oauth:state:test_state_123';
  await redisCache.set(stateKey, JSON.stringify({ verifier: 'pkce_verifier_val' }), 'EX', 60);

  const consumed1 = await atomicGetDel(redisCache, stateKey);
  if (!consumed1 || !consumed1.includes('pkce_verifier_val')) {
    throw new Error('FAILED: First OAuth state consumption did not return state value');
  }

  const consumed2 = await atomicGetDel(redisCache, stateKey);
  if (consumed2 !== null) {
    throw new Error('FAILED: Second OAuth state consumption did not return null (replay possible!)');
  }
  console.log('        Passed: Atomic state consumption verified (replay prevented).');

  // 2. Lock Acquisition & Contended Acquisition
  console.log('    2.2 Testing lock acquisition & contention...');
  const lockKey = 'lock:sync:user_111';
  const ownerA = 'token_owner_a';
  const ownerB = 'token_owner_b';

  const acquiredA = await acquireLock(redisCache, lockKey, ownerA, 5000);
  if (!acquiredA) throw new Error('FAILED: Owner A could not acquire lock');

  const acquiredB = await acquireLock(redisCache, lockKey, ownerB, 5000);
  if (acquiredB) throw new Error('FAILED: Owner B acquired an already held lock!');
  console.log('        Passed: Lock contention enforced.');

  // 3. Wrong-owner vs Correct-owner release
  console.log('    2.3 Testing Lua compare-and-DEL release...');
  const releasedWrong = await releaseLock(redisCache, lockKey, ownerB);
  if (releasedWrong) throw new Error('FAILED: Wrong owner released the lock!');

  const releasedCorrect = await releaseLock(redisCache, lockKey, ownerA);
  if (!releasedCorrect) throw new Error('FAILED: Correct owner failed to release the lock');
  console.log('        Passed: Compare-and-DEL ownership check verified.');

  // 4. Renewal (compare-and-PEXPIRE)
  console.log('    2.4 Testing Lua compare-and-PEXPIRE renewal...');
  const lockKey2 = 'lock:token_refresh:user_222';
  await acquireLock(redisCache, lockKey2, ownerA, 2000);

  const renewedWrong = await renewLock(redisCache, lockKey2, ownerB, 10000);
  if (renewedWrong) throw new Error('FAILED: Wrong owner successfully renewed lock!');

  const renewedCorrect = await renewLock(redisCache, lockKey2, ownerA, 10000);
  if (!renewedCorrect) throw new Error('FAILED: Correct owner failed to renew lock');

  const ttl = await redisCache.pttl(lockKey2);
  if (ttl < 5000) throw new Error(`FAILED: Lock TTL was not extended (got ${ttl}ms)`);
  console.log(`        Passed: Compare-and-PEXPIRE extended TTL to ${ttl}ms.`);

  // 5. Expiry test
  console.log('    2.5 Testing lock TTL expiration...');
  const lockKey3 = 'lock:sync:user_333';
  await acquireLock(redisCache, lockKey3, ownerA, 200); // 200ms short TTL
  await new Promise((r) => setTimeout(r, 300)); // wait for expire

  const acquiredAfterExpire = await acquireLock(redisCache, lockKey3, ownerB, 5000);
  if (!acquiredAfterExpire) throw new Error('FAILED: Could not acquire lock after expiration');
  console.log('        Passed: Expired lock was re-acquired.');
}
