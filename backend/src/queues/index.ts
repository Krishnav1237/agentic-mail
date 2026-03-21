import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis.js';

export const ingestionQueue = new Queue('email-ingestion', { connection: redisConnection });
export const agentQueue = new Queue('agent-core', { connection: redisConnection });
