import { Queue } from 'bullmq';
import { queueRedisConnection } from '../config/redis.js';

export const ingestionQueue = new Queue('email-ingestion', {
  connection: queueRedisConnection,
});
export const agentQueue = new Queue('agent-core', {
  connection: queueRedisConnection,
});
