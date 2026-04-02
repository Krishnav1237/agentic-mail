import { Worker } from 'bullmq';
import { queueRedisConnection } from '../config/redis.js';
import { syncUserInbox } from '../services/ingestion.js';
import { query } from '../db/index.js';
import { ingestionQueue } from '../queues/index.js';
import { logger } from '../config/logger.js';

export const startIngestionWorker = () => {
  const worker = new Worker(
    'email-ingestion',
    async (job) => {
      if (job.name === 'sync-all') {
        const result = await query<{ id: string }>('SELECT id FROM users');
        for (const row of result.rows) {
          await ingestionQueue.add(
            'sync-user',
            { userId: row.id },
            { attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
          );
        }
        return { queued: result.rowCount };
      }

      const { userId } = job.data as { userId: string };
      return syncUserInbox(userId);
    },
    { connection: queueRedisConnection }
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Ingestion job failed');
  });

  return worker;
};
