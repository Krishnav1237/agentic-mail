import { Worker } from 'bullmq';
import { queueRedisConnection } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { productQueue } from '../queues/index.js';
import { query } from '../db/index.js';
import { recomputeMustActForUser } from '../services/mustAct.js';
import { runDueFollowups } from '../services/followups.js';

const CONNECTED_USERS_CLAUSE = `(
  (primary_provider = 'google' AND google_access_token IS NOT NULL)
  OR
  (primary_provider = 'microsoft' AND ms_access_token IS NOT NULL)
)`;

const enqueueMustActRefresh = async () => {
  const users = await query<{ id: string }>(
    `SELECT id FROM users WHERE ${CONNECTED_USERS_CLAUSE}`
  );

  if (users.rowCount) {
    await productQueue.addBulk(
      users.rows.map((row) => ({
        name: 'must-act-user',
        data: { userId: row.id },
        opts: {
          jobId: `must-act:${row.id}`,
          attempts: 2,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 200,
          removeOnFail: 200,
        },
      }))
    );
  }

  return { queued: users.rowCount ?? 0 };
};

export const startProductWorker = () => {
  const worker = new Worker(
    'product-ops',
    async (job) => {
      if (job.name === 'must-act-active') {
        return enqueueMustActRefresh();
      }

      if (job.name === 'must-act-user') {
        const { userId } = job.data as { userId: string };
        return recomputeMustActForUser(userId);
      }

      if (job.name === 'followups-active') {
        return runDueFollowups();
      }

      return { skipped: true };
    },
    { connection: queueRedisConnection }
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Product worker job failed');
  });

  return worker;
};
