import { Redis } from 'ioredis';
import { env } from '../config/env.js';

// Distinct Redis connections for separated workloads
export const redisCache = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});

export const redisQueue = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
});

export const redisWorker = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
});

export const redisQueueEvents = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
});

redisCache.on('error', (err) => console.error('[Redis Cache] Error:', err));
redisQueue.on('error', (err) => console.error('[Redis Queue] Error:', err));
redisWorker.on('error', (err) => console.error('[Redis Worker] Error:', err));
redisQueueEvents.on('error', (err) => console.error('[Redis QueueEvents] Error:', err));

export const checkRedisHealth = async (): Promise<boolean> => {
  try {
    const res = await redisCache.ping();
    return res === 'PONG';
  } catch (error) {
    console.error('Redis health check failed:', error);
    return false;
  }
};
