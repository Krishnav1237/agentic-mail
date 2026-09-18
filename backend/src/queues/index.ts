import { Queue } from 'bullmq';
import { redisQueue } from '../redis/index.js';

export const INGESTION_QUEUE_NAME = 'inbox-ingestion';
export const AGENT_QUEUE_NAME = 'agent-execution';

// Job name on AGENT_QUEUE_NAME for the auto-send 5-minute hold.
// approvals.id is used as the BullMQ jobId for this job (see
// services/googleWriteService.ts queueAutoSend) — that's what makes
// `agentQueue.getJob(approvalId)` the cancellation lookup, and what stops a
// second queueAutoSend for the same approval from double-scheduling.
export const EXECUTE_APPROVAL_SEND_JOB = 'execute-approval-send';

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
