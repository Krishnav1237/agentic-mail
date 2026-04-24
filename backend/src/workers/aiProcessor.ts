import { Worker } from 'bullmq';
import { queueRedisConnection } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { runCoreLoop } from '../agent/coreLoop.js';
import { query } from '../db/index.js';
import { agentQueue } from '../queues/index.js';

export const startAiWorker = () => {
  const worker = new Worker(
    'agent-core',
    async (job) => {
      if (job.name === 'run-all') {
        const result = await query<{ id: string }>('SELECT id FROM users');
        await agentQueue.addBulk(
          result.rows.map((row) => ({
            name: 'run-user',
            data: { userId: row.id },
            opts: {
              jobId: `agent-core-user-${row.id}`,
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 },
            },
          }))
        );
        return { queued: result.rowCount };
      }

      const { userId } = job.data as { userId: string };
      if (!userId) {
        throw new Error('No userId provided in job data');
      }
      return runCoreLoop(userId);
    },
    { connection: queueRedisConnection }
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Agent loop failed');
  });

  return worker;
};
