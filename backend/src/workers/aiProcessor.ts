import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { runCoreLoop } from '../agent/coreLoop.js';
import { query } from '../db/index.js';

export const startAiWorker = () => {
  const worker = new Worker(
    'agent-core',
    async (job) => {
      if (job.name === 'run-all') {
        const result = await query<{ id: string }>('SELECT id FROM users');
        for (const row of result.rows) {
          await runCoreLoop(row.id);
        }
        return { users: result.rowCount };
      }
      const { userId } = job.data as { userId: string };
      return runCoreLoop(userId);
    },
    { connection: redisConnection }
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Agent loop failed');
  });

  return worker;
};
