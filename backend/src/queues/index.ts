import { Queue } from 'bullmq';
import { queueRedisConnection } from '../config/redis.js';

export const ingestionQueue = new Queue('email-ingestion', {
  connection: queueRedisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 200,
    removeOnFail: 500,
  },
});
export const agentQueue = new Queue('agent-core', {
  connection: queueRedisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 200,
    removeOnFail: 500,
  },
});
export const productQueue = new Queue('product-ops', {
  connection: queueRedisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 200,
    removeOnFail: 500,
  },
});
