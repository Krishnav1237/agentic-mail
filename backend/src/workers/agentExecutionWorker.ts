import { Worker, Job } from 'bullmq';
import { redisWorker, redisCache } from '../redis/index.js';
import { acquireLock, releaseLock } from '../utils/redisLua.js';
import { AGENT_QUEUE_NAME, EXECUTE_APPROVAL_SEND_JOB } from '../queues/index.js';
import { executeQueuedSend } from '../services/googleWriteService.js';
import crypto from 'crypto';

/**
 * Consumes the delayed auto-send jobs queued by
 * services/googleWriteService.ts's queueAutoSend. Mirrors
 * workers/ingestionWorker.ts's lock-guarded structure, but the actual
 * race-safety against a concurrent cancel lives in executeQueuedSend's
 * conditional UPDATE, not in this lock — the lock here only prevents two
 * workers from processing the same job concurrently (BullMQ itself already
 * mostly guarantees this via its own job lock, but the approval-scoped Redis
 * lock is cheap defense in depth against a duplicate enqueue).
 */
export function startAgentExecutionWorker(): Worker {
  const worker = new Worker(
    AGENT_QUEUE_NAME,
    async (job: Job) => {
      if (job.name !== EXECUTE_APPROVAL_SEND_JOB) return;

      const { approvalId } = job.data as { approvalId: string };
      const lockKey = `lock:approval:${approvalId}`;
      const lockToken = crypto.randomBytes(16).toString('hex');

      const acquired = await acquireLock(redisCache, lockKey, lockToken, 30_000);
      if (!acquired) return; // another process already holds it — safe to skip

      try {
        const maxAttempts = job.opts.attempts ?? 1;
        await executeQueuedSend(approvalId, job.attemptsMade, maxAttempts);
      } finally {
        await releaseLock(redisCache, lockKey, lockToken);
      }
    },
    { connection: redisWorker }
  );

  worker.on('failed', (job, err) => {
    console.error(`[Agent Execution Worker] Job ${job?.id} failed:`, err instanceof Error ? err.message : err);
  });

  return worker;
}
