import { applyMigrationsClean, createTestUser, clearRedisData } from './helpers.js';
import { query } from '../../db/index.js';
import { GmailSyncService } from '../../services/gmailSyncService.js';
import { acquireLock } from '../../utils/redisLua.js';
import { redisCache } from '../../redis/index.js';

export async function runCursorCrashSafetyTest() {
  console.log('  [Suite 6] Crash-Safe History Cursor Progression Test...');
  await applyMigrationsClean();
  await clearRedisData();

  const user = await createTestUser('cursor_crash@example.com');
  const lockKey = `lock:sync:${user.id}`;
  const lockToken = 'test_lock_token';

  await query(
    `INSERT INTO provider_sync_states (user_id, provider, history_id, sync_status)
     VALUES ($1, 'google', '1000', 'idle')`,
    [user.id]
  );

  const createMockGmail = (shouldFailAtStep: number) => {
    return {
      users: {
        getProfile: async () => ({ data: { historyId: '2000' } }),
        history: {
          list: async () => {
            if (shouldFailAtStep === 1) {
              throw new Error('SIMULATED_CRASH_DURING_HISTORY_LIST');
            }
            return {
              data: {
                historyId: '2000',
                history: [
                  {
                    messagesAdded: [{ message: { id: 'msg_crash_1', threadId: 'thread_crash_1' } }],
                  },
                ],
              },
            };
          },
        },
        messages: {
          get: async ({ id }: { id: string }) => {
            return {
              data: {
                id,
                threadId: 'thread_crash_1',
                historyId: '2000',
                snippet: 'Crash Test Snippet',
                labelIds: ['INBOX', 'UNREAD'],
                payload: {
                  headers: [
                    { name: 'From', value: 'sender@example.com' },
                    { name: 'Subject', value: 'Crash Safety Subject' },
                    { name: 'Date', value: new Date().toISOString() },
                  ],
                  mimeType: 'text/plain',
                  body: { data: Buffer.from('Crash safety test body').toString('base64') },
                },
              },
            };
          },
        },
      },
    };
  };

  // 1. Crash during history listing
  console.log('    6.1 Injecting failure during history list (step 1)...');
  await acquireLock(redisCache, lockKey, lockToken, 90000);

  const run1Res = await query(
    `INSERT INTO sync_runs (user_id, sync_type, status) VALUES ($1, 'incremental', 'running') RETURNING id`,
    [user.id]
  );
  const syncRunId1 = run1Res.rows[0].id;

  let crash1Caught = false;
  try {
    await GmailSyncService.performSync(user.id, syncRunId1, lockKey, lockToken, createMockGmail(1));
  } catch {
    crash1Caught = true;
  }
  if (!crash1Caught) throw new Error('FAILED: Simulated crash did not throw error');

  const stateRes1 = await query(`SELECT history_id, sync_status FROM provider_sync_states WHERE user_id = $1`, [user.id]);
  if (stateRes1.rows[0].history_id !== '1000') {
    throw new Error(`FAILED: History cursor advanced despite crash! (got: ${stateRes1.rows[0].history_id})`);
  }
  if (stateRes1.rows[0].sync_status !== 'error') {
    throw new Error('FAILED: Provider sync status was not set to error after crash');
  }
  console.log('        Passed: History cursor remained unchanged at 1000 after crash.');

  // 2. Successful retry after crash
  console.log('    6.2 Retrying sync successfully (step 4)...');
  await acquireLock(redisCache, lockKey, lockToken, 90000);

  const run2Res = await query(
    `INSERT INTO sync_runs (user_id, sync_type, status) VALUES ($1, 'incremental', 'running') RETURNING id`,
    [user.id]
  );
  const syncRunId2 = run2Res.rows[0].id;

  await GmailSyncService.performSync(user.id, syncRunId2, lockKey, lockToken, createMockGmail(4));

  const stateRes2 = await query(`SELECT history_id, sync_status FROM provider_sync_states WHERE user_id = $1`, [user.id]);
  if (stateRes2.rows[0].history_id !== '2000') {
    throw new Error(`FAILED: History cursor failed to advance to 2000 after clean completion (got: ${stateRes2.rows[0].history_id})`);
  }
  if (typeof stateRes2.rows[0].history_id !== 'string') {
    throw new Error('FAILED: History cursor was converted to number instead of string!');
  }
  console.log('        Passed: Cursor safely advanced to "2000" as a string.');

  // 3. Replay safety
  console.log('    6.3 Verifying replay idempotency (running sync again)...');
  await acquireLock(redisCache, lockKey, lockToken, 90000);

  const run3Res = await query(
    `INSERT INTO sync_runs (user_id, sync_type, status) VALUES ($1, 'incremental', 'running') RETURNING id`,
    [user.id]
  );
  await GmailSyncService.performSync(user.id, run3Res.rows[0].id, lockKey, lockToken, createMockGmail(4));

  const emailCountRes = await query(`SELECT COUNT(*)::int AS count FROM emails WHERE user_id = $1`, [user.id]);
  if (emailCountRes.rows[0].count !== 1) {
    throw new Error(`FAILED: Replaying history created duplicate email rows! (count: ${emailCountRes.rows[0].count})`);
  }
  console.log('        Passed: Replaying history range was completely idempotent (1 email row total).');
}
