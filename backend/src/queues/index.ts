import { Queue } from 'bullmq';
import { redisQueue } from '../redis/index.js';

export const INGESTION_QUEUE_NAME = 'inbox-ingestion';
export const AGENT_QUEUE_NAME = 'agent-execution';

export const ingestionQueue = new Queue(INGESTION_QUEUE_NAME, {
  connection: redisQueue,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

export const agentQueue = new Queue(AGENT_QUEUE_NAME, {
  connection: redisQueue,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});
