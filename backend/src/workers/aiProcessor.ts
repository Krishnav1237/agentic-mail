import { Worker } from 'bullmq';
import { queueRedisConnection } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { runCoreLoop } from '../agent/coreLoop.js';
import { query } from '../db/index.js';
import { agentQueue } from '../queues/index.js';

const CONNECTED_USERS_CLAUSE = `(
  (primary_provider = 'google' AND google_access_token IS NOT NULL)
  OR
  (primary_provider = 'microsoft' AND ms_access_token IS NOT NULL)
)`;

const enqueueAgentUsers = async (mode: 'active' | 'backfill' | 'all') => {
  const where =
    mode === 'active'
      ? `WHERE ${CONNECTED_USERS_CLAUSE}
         AND (
           EXISTS (
             SELECT 1 FROM emails e
             WHERE e.user_id = users.id AND e.status = 'pending'
           )
           OR EXISTS (
             SELECT 1 FROM agent_actions a
             WHERE a.user_id = users.id
               AND a.status IN ('preview', 'suggest', 'suggested', 'modified')
           )
           OR last_sync_at IS NULL
           OR last_sync_at >= now() - interval '6 hours'
         )`
      : mode === 'backfill'
        ? `WHERE ${CONNECTED_USERS_CLAUSE}
           AND (
             last_sync_at IS NULL
             OR last_sync_at < now() - interval '6 hours'
           )`
        : `WHERE ${CONNECTED_USERS_CLAUSE}`;

  let queued = 0;
  let offset = 0;
  const pageSize = 250;
  while (true) {
    const result = await query<{ id: string }>(
      `SELECT id FROM users ${where} ORDER BY id ASC LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    );
    if (!result.rowCount) break;
    await agentQueue.addBulk(
      result.rows.map((row) => ({
        name: 'run-user',
        data: { userId: row.id },
        opts: {
          jobId: `run-user:${row.id}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 200,
          removeOnFail: 500,
        },
      }))
    );
    queued += result.rowCount;
    offset += result.rowCount;
  }
  return { queued };
};

export const startAiWorker = () => {
  const worker = new Worker(
    'agent-core',
    async (job) => {
      if (job.name === 'run-all') {
        return enqueueAgentUsers('all');
      }
      if (job.name === 'run-active') {
        return enqueueAgentUsers('active');
      }
      if (job.name === 'run-backfill') {
        return enqueueAgentUsers('backfill');
      }
      const { userId } = job.data as { userId: string };
      return runCoreLoop(userId);
    },
    {
      connection: queueRedisConnection,
      concurrency: 4,
      limiter: { max: 60, duration: 1000 },
    }
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Agent loop failed');
  });

  return worker;
};
