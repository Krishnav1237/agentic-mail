import { Worker, Job } from 'bullmq';
import crypto from 'crypto';
import { redisWorker, redisCache } from '../redis/index.js';
import { INGESTION_QUEUE_NAME } from '../queues/index.js';
import { GmailSyncService } from '../services/gmailSyncService.js';
import { query } from '../db/index.js';
import { acquireLock, releaseLock, renewLock } from '../utils/redisLua.js';
import { z } from 'zod';
import { AppError, ErrorCode, toSafeCode } from '../errors/AppError.js';

const SYNC_LOCK_TTL_MS = 90_000;   // 90 seconds
const LOCK_RENEWAL_INTERVAL_MS = 45_000; // Renew every 45s

const IngestionJobDataSchema = z.object({
  userId: z.string().uuid('userId must be a valid UUID'),
  syncRunId: z.string().uuid().optional(),
  triggeredBy: z.string().max(50).default('unknown'),
});

export type IngestionJobData = z.infer<typeof IngestionJobDataSchema>;

export const startIngestionWorker = () => {
  const worker = new Worker<IngestionJobData>(
    INGESTION_QUEUE_NAME,
    async (job: Job<IngestionJobData>) => {
      const parseResult = IngestionJobDataSchema.safeParse(job.data);
      if (!parseResult.success) {
        throw new AppError(
          ErrorCode.VALIDATION_ERROR,
          `Invalid job payload: ${parseResult.error.message}`,
          400
        );
      }

      const { userId, triggeredBy } = parseResult.data;
      let syncRunId = parseResult.data.syncRunId;

      const lockKey = `lock:sync:${userId}`;
      const lockToken = crypto.randomBytes(16).toString('hex');

      const acquired = await acquireLock(redisCache, lockKey, lockToken, SYNC_LOCK_TTL_MS);
      if (!acquired) {
        console.log(`[Ingestion Worker] Sync already running for user ${userId}. Skipping job ${job.id}.`);
        if (syncRunId) {
          await query(
            `UPDATE sync_runs SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2`,
            [ErrorCode.GMAIL_SYNC_ALREADY_RUNNING, syncRunId]
          );
        }
        return { status: 'skipped', reason: 'concurrent_sync_locked' };
      }

      let lockLost = false;
      const renewalTimer = setInterval(async () => {
        try {
          const renewed = await renewLock(redisCache, lockKey, lockToken, SYNC_LOCK_TTL_MS);
          if (!renewed) {
            console.error(`[Ingestion Worker] Lock ownership lost for user ${userId}. Will abort sync.`);
            lockLost = true;
          }
        } catch (err: unknown) {
          console.error(`[Ingestion Worker] Lock renewal failed for user ${userId}:`, err instanceof Error ? err.message : 'unknown');
          lockLost = true;
        }
      }, LOCK_RENEWAL_INTERVAL_MS);

      try {
        console.log(`[Ingestion Worker] Starting sync for user ${userId} (triggered_by: ${triggeredBy})`);

        if (!syncRunId) {
          const runRes = await query(
            `INSERT INTO sync_runs (user_id, sync_type, status, started_at)
             VALUES ($1, 'background', 'running', NOW()) RETURNING id`,
            [userId]
          );
          syncRunId = runRes.rows[0].id as string;
        }

        await query(
          `UPDATE provider_sync_states SET sync_status = 'syncing', updated_at = NOW()
           WHERE user_id = $1 AND provider = 'google'`,
          [userId]
        );

        await GmailSyncService.performSync(userId, syncRunId!, lockKey, lockToken);

        if (lockLost) {
          throw new AppError(ErrorCode.LOCK_OWNERSHIP_LOST, 'Lock ownership lost during sync', 500);
        }

        console.log(`[Ingestion Worker] Completed sync for user ${userId}. RunId: ${syncRunId}`);
        return { status: 'success', syncRunId };
      } catch (error: unknown) {
        const safeCode = toSafeCode(error);
        console.error(`[Ingestion Worker] Sync failed for user ${userId}: ${safeCode}`);

        if (
          safeCode === ErrorCode.GOOGLE_TOKEN_REFRESH_FAILED ||
          safeCode === ErrorCode.GOOGLE_ACCOUNT_DISCONNECTED
        ) {
          await query(
            `INSERT INTO audit_events (user_id, event_type, actor, details)
             VALUES ($1, 'google_sync_auth_failed', 'system', $2)`,
            [userId, JSON.stringify({ error: safeCode })]
          );
        }

        throw error;
      } finally {
        clearInterval(renewalTimer);
        await releaseLock(redisCache, lockKey, lockToken);
      }
    },
    {
      connection: redisWorker,
      concurrency: 3,
    }
  );

  worker.on('failed', (job, err) => {
    const safeCode = toSafeCode(err);
    console.error(`[Ingestion Worker] Job ${job?.id} failed with code: ${safeCode}`);
  });

  return worker;
};
