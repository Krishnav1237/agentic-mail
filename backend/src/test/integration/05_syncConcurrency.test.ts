import { applyMigrationsClean, createTestUser, clearRedisData } from './helpers.js';
import { query } from '../../db/index.js';
import { startIngestionWorker } from '../../workers/ingestionWorker.js';
import { ingestionQueue } from '../../queues/index.js';
import { AppError } from '../../errors/AppError.js';

export async function runSyncConcurrencyTest() {
  console.log('  [Suite 5] Active Synchronization & Database Partial Index Concurrency Test...');
  await applyMigrationsClean();
  await clearRedisData();

  const userA = await createTestUser('sync_a@example.com');
  const userB = await createTestUser('sync_b@example.com');

  // 1. Database partial unique index enforcement
  console.log('    5.1 Testing database partial unique index (idx_sync_runs_active_user)...');
  const run1 = await query(
    `INSERT INTO sync_runs (user_id, sync_type, status, started_at)
     VALUES ($1, 'manual', 'pending', NOW()) RETURNING id`,
    [userA.id]
  );
  if (!run1.rows[0].id) throw new Error('FAILED: Initial sync run insert failed');

  let dbConflictCaught = false;
  try {
    await query(
      `INSERT INTO sync_runs (user_id, sync_type, status, started_at)
       VALUES ($1, 'manual', 'pending', NOW()) RETURNING id`,
      [userA.id]
    );
  } catch (err: any) {
    if (err.code === '23505' && err.message.includes('idx_sync_runs_active_user')) {
      dbConflictCaught = true;
    }
  }
  if (!dbConflictCaught) {
    throw new Error('FAILED: Database allowed duplicate active sync runs for same user!');
  }
  console.log('        Passed: Database partial unique index prevented duplicate active sync run.');

  // 2. Concurrent user isolation (User B can run concurrently)
  console.log('    5.2 Testing concurrent user isolation (User B sync run)...');
  const runB = await query(
    `INSERT INTO sync_runs (user_id, sync_type, status, started_at)
     VALUES ($1, 'manual', 'pending', NOW()) RETURNING id`,
    [userB.id]
  );
  if (!runB.rows[0].id) throw new Error('FAILED: User B sync run was blocked by User A active run');
  console.log('        Passed: User B sync run created concurrently.');

  // 3. Retry after completion
  console.log('    5.3 Testing sync run completion & subsequent run creation...');
  await query(`UPDATE sync_runs SET status = 'completed', completed_at = NOW() WHERE id = $1`, [run1.rows[0].id]);

  const run1New = await query(
    `INSERT INTO sync_runs (user_id, sync_type, status, started_at)
     VALUES ($1, 'manual', 'pending', NOW()) RETURNING id`,
    [userA.id]
  );
  if (!run1New.rows[0].id) throw new Error('FAILED: User A could not start new sync run after completion');
  console.log('        Passed: Completed run allowed new sync run creation.');

  // 4. BullMQ Worker Concurrency & Redis Lock Test
  console.log('    5.4 Testing BullMQ Worker lock contention & job skipping...');
  const worker = startIngestionWorker();

  // Create active lock in Redis to simulate running worker
  const { acquireLock } = await import('../../utils/redisLua.js');
  const { redisCache } = await import('../../redis/index.js');
  const lockKey = `lock:sync:${userA.id}`;
  await acquireLock(redisCache, lockKey, 'existing_worker_lock_token', 60000);

  // Add job to BullMQ queue for userA
  const job = await ingestionQueue.add(
    'ingest-inbox',
    { userId: userA.id, syncRunId: run1New.rows[0].id, triggeredBy: 'test' }
  );

  // Wait for worker to process job and release or skip
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // Verify sync_run status was updated to failed with GMAIL_SYNC_ALREADY_RUNNING code
  const failedRunRes = await query(`SELECT status, error_message FROM sync_runs WHERE id = $1`, [run1New.rows[0].id]);
  if (failedRunRes.rows[0].status !== 'failed' || failedRunRes.rows[0].error_message !== 'GMAIL_SYNC_ALREADY_RUNNING') {
    throw new Error(`FAILED: Worker did not update sync run state properly on lock contention (got: ${failedRunRes.rows[0].status}, msg: ${failedRunRes.rows[0].error_message})`);
  }

  await worker.close();
  console.log('        Passed: Worker lock contention skipped job and updated status safely.');
}
