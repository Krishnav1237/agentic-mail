import { Worker } from 'bullmq';
import { queueRedisConnection } from '../config/redis.js';
import { syncUserInbox } from '../services/ingestion.js';
import { query, withTransaction } from '../db/index.js';
import { ingestionQueue } from '../queues/index.js';
import { logger } from '../config/logger.js';
import { randomUUID } from 'crypto';
import { env } from '../config/env.js';
import { getAuthContext } from '../services/tokens.js';
import { createSubscription } from '../services/graph.js';
import { runRetentionCleanup } from '../services/privacy.js';

const SUBSCRIPTION_EXPIRATION_1H_MS = 60 * 60 * 1000;
const SUBSCRIPTION_RENEWAL_THRESHOLD_MINUTES = 20;

const CONNECTED_USERS_CLAUSE = `(
  (primary_provider = 'google' AND google_access_token IS NOT NULL)
  OR
  (primary_provider = 'microsoft' AND ms_access_token IS NOT NULL)
)`;

const enqueueSyncUsers = async (mode: 'active' | 'backfill' | 'all') => {
  const where =
    mode === 'active'
      ? `WHERE ${CONNECTED_USERS_CLAUSE}
         AND (
           last_sync_at IS NULL
           OR last_sync_at >= now() - interval '6 hours'
           OR updated_at >= now() - interval '6 hours'
         )`
      : mode === 'backfill'
        ? `WHERE ${CONNECTED_USERS_CLAUSE}
           AND (
             last_sync_at IS NULL
             OR last_sync_at < now() - interval '6 hours'
           )`
        : `WHERE ${CONNECTED_USERS_CLAUSE}`;

  const result = await query<{ id: string }>(`SELECT id FROM users ${where}`);
  if (result.rowCount) {
    await ingestionQueue.addBulk(
      result.rows.map((row) => ({
        name: 'sync-user',
        data: { userId: row.id },
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 200,
          removeOnFail: 500,
        },
      }))
    );
  }
  return { queued: result.rowCount };
};

const renewGraphSubscriptions = async () => {
  if (!env.msWebhookNotificationUrl) {
    return { renewed: 0, skipped: true };
  }

  const expiring = await query<{
    user_id: string;
    subscription_id: string;
    resource: string;
  }>(
    `SELECT user_id, subscription_id, resource
     FROM graph_subscriptions
     WHERE expiration_date_time <= now() + interval '${SUBSCRIPTION_RENEWAL_THRESHOLD_MINUTES} minutes'`
  );

  let renewed = 0;
  for (const row of expiring.rows) {
    try {
      const auth = await getAuthContext(row.user_id, 'microsoft');
      const clientState = randomUUID();
      const expirationDateTime = new Date(
        Date.now() + SUBSCRIPTION_EXPIRATION_1H_MS
      ).toISOString();

      const subscription = await createSubscription(auth.accessToken, {
        resource: row.resource,
        changeType: 'created,updated',
        notificationUrl: env.msWebhookNotificationUrl,
        expirationDateTime,
        clientState,
      });

      await withTransaction(async (client) => {
        await client.query(
          `INSERT INTO graph_subscriptions (user_id, subscription_id, resource, expiration_date_time, client_state)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (user_id, subscription_id)
           DO UPDATE SET
             resource = EXCLUDED.resource,
             expiration_date_time = EXCLUDED.expiration_date_time,
             client_state = EXCLUDED.client_state`,
          [
            row.user_id,
            subscription.id,
            subscription.resource,
            subscription.expirationDateTime,
            clientState,
          ]
        );

        await client.query(
          `DELETE FROM graph_subscriptions
           WHERE user_id = $1
             AND resource = $2
             AND subscription_id <> $3`,
          [row.user_id, row.resource, subscription.id]
        );
      });
      renewed += 1;
    } catch (error) {
      logger.error(
        { userId: row.user_id, subscriptionId: row.subscription_id, err: error },
        'Failed renewing Graph subscription'
      );
    }
  }

  return { renewed, skipped: false };
};

export const startIngestionWorker = () => {
  const worker = new Worker(
    'email-ingestion',
    async (job) => {
      if (job.name === 'sync-all') {
        return enqueueSyncUsers('all');
      }

      if (job.name === 'sync-active') {
        return enqueueSyncUsers('active');
      }

      if (job.name === 'sync-backfill') {
        return enqueueSyncUsers('backfill');
      }

      if (job.name === 'renew-graph-subscriptions') {
        return renewGraphSubscriptions();
      }

      if (job.name === 'purge-retention') {
        return runRetentionCleanup();
      }

      const { userId } = job.data as { userId: string };
      return syncUserInbox(userId, String(job.id ?? `${Date.now()}`));
    },
    { connection: queueRedisConnection }
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Ingestion job failed');
  });

  return worker;
};
