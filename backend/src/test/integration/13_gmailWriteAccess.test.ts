import { query } from '../../db/index.js';
import { createTestUser } from './helpers.js';
import { cancelApproval, executeQueuedSend } from '../../services/googleWriteService.js';

const DUMMY_PAYLOAD = '{"threadId":"t1","to":"a@b.com","subject":"s","bodyText":"b"}';

export async function runGmailWriteAccessTest() {
  console.log('  [Suite 13] Gmail Write Access — migration constraints & delayed-send concurrency...');

  // 1. CHECK constraints (chk_approvals_status, chk_approvals_action_type)
  console.log('    13.1 Testing chk_approvals_status and chk_approvals_action_type...');
  const user = await createTestUser();

  let rejectedStatus = false;
  try {
    await query(
      `INSERT INTO approvals (user_id, action_type, status, prepared_payload) VALUES ($1, 'send_reply', 'bogus', '{}')`,
      [user.id]
    );
  } catch (err: any) {
    if (err.code === '23514') rejectedStatus = true;
  }
  if (!rejectedStatus) throw new Error('FAILED: chk_approvals_status did not reject an invalid status');

  const sendingRes = await query(
    `INSERT INTO approvals (user_id, action_type, status, prepared_payload) VALUES ($1, 'send_reply', 'sending', '{}') RETURNING status`,
    [user.id]
  );
  if (sendingRes.rows[0].status !== 'sending') {
    throw new Error('FAILED: "sending" should be a valid approvals.status value — it is the race-safety mechanism, not optional');
  }

  let rejectedActionType = false;
  try {
    await query(
      `INSERT INTO approvals (user_id, action_type, status, prepared_payload) VALUES ($1, 'archive_email', 'pending', '{}')`,
      [user.id]
    );
  } catch (err: any) {
    if (err.code === '23514') rejectedActionType = true;
  }
  if (!rejectedActionType) throw new Error('FAILED: chk_approvals_action_type did not reject a not-yet-supported action_type');
  console.log('        Passed.');

  // 2. Client idempotency uniqueness, scoped per user
  console.log('    13.2 Testing uq_approvals_user_client_idempotency...');
  const key = `idem_${Date.now()}`;
  await query(
    `INSERT INTO approvals (user_id, action_type, status, prepared_payload, client_idempotency_key) VALUES ($1, 'send_reply', 'sending', '{}', $2)`,
    [user.id, key]
  );
  let rejectedDupeKey = false;
  try {
    await query(
      `INSERT INTO approvals (user_id, action_type, status, prepared_payload, client_idempotency_key) VALUES ($1, 'send_reply', 'sending', '{}', $2)`,
      [user.id, key]
    );
  } catch (err: any) {
    if (err.code === '23505') rejectedDupeKey = true;
  }
  if (!rejectedDupeKey) throw new Error('FAILED: duplicate client_idempotency_key for the same user was not rejected');

  const otherUser = await createTestUser();
  const otherUserSameKey = await query(
    `INSERT INTO approvals (user_id, action_type, status, prepared_payload, client_idempotency_key) VALUES ($1, 'send_reply', 'sending', '{}', $2) RETURNING id`,
    [otherUser.id, key]
  );
  if (otherUserSameKey.rows.length !== 1) throw new Error('FAILED: same idempotency key for a different user should be allowed');
  console.log('        Passed.');

  // 3. A cancel arriving AFTER the worker's claim must not resolve the row a second time
  console.log('    13.3 Testing pending->sending atomic claim rejects a late cancel...');
  const raceUser = await createTestUser();
  const raceApproval = await query(
    `INSERT INTO approvals (user_id, action_type, status, prepared_payload, scheduled_at, cancel_token, cancel_token_expires_at)
     VALUES ($1, 'send_reply', 'pending', $2::jsonb, now(), $3, now() + interval '5 minutes')
     RETURNING id`,
    [raceUser.id, DUMMY_PAYLOAD, `tok_${Date.now()}_1`]
  );
  const raceApprovalId = raceApproval.rows[0].id;

  // Simulate the worker's claim (the first half of executeQueuedSend) directly.
  const claimRes = await query(
    `UPDATE approvals SET status = 'sending', updated_at = now() WHERE id = $1 AND status = 'pending' RETURNING id`,
    [raceApprovalId]
  );
  if (claimRes.rows.length !== 1) throw new Error('FAILED: worker claim should have succeeded on a pending row');

  let cancelRejected = false;
  try {
    await cancelApproval(raceApprovalId, raceUser.id);
  } catch (err: any) {
    if (err.code === 'APPROVAL_ALREADY_RESOLVED') cancelRejected = true;
  }
  if (!cancelRejected) throw new Error('FAILED: cancel should be rejected once the worker has claimed the row (status=sending)');
  console.log('        Passed: a cancel arriving after the worker claims the row cannot resolve it a second time.');

  // 4. A cancel arriving BEFORE the claim must prevent the send
  console.log('    13.4 Testing a cancel that arrives before the claim prevents the send...');
  const earlyCancelUser = await createTestUser();
  const earlyCancelApproval = await query(
    `INSERT INTO approvals (user_id, action_type, status, prepared_payload, scheduled_at, cancel_token, cancel_token_expires_at)
     VALUES ($1, 'send_reply', 'pending', $2::jsonb, now(), $3, now() + interval '5 minutes')
     RETURNING id`,
    [earlyCancelUser.id, DUMMY_PAYLOAD, `tok_${Date.now()}_2`]
  );
  const earlyCancelId = earlyCancelApproval.rows[0].id;

  await cancelApproval(earlyCancelId, earlyCancelUser.id);

  const noopClaim = await query(
    `UPDATE approvals SET status = 'sending', updated_at = now() WHERE id = $1 AND status = 'pending' RETURNING id`,
    [earlyCancelId]
  );
  if (noopClaim.rows.length !== 0) throw new Error('FAILED: the worker claim should find zero rows once cancelled');
  console.log('        Passed.');

  // 5. Non-final failed attempt reverts to pending AND bumps cancel_token_expires_at
  //    forward — this is the specific bug fix under test: without it, a cancel
  //    arriving during retry backoff would hit an already-expired token even
  //    though the row is genuinely still pending.
  console.log('    13.5 Testing non-final attempt failure reopens a genuinely usable cancel window...');
  const retryUser = await createTestUser();
  const originalExpiry = new Date(Date.now() + 1000);
  const retryApproval = await query(
    `INSERT INTO approvals (user_id, action_type, status, prepared_payload, scheduled_at, cancel_token, cancel_token_expires_at)
     VALUES ($1, 'send_reply', 'pending', $2::jsonb, now(), $3, $4)
     RETURNING id`,
    [retryUser.id, DUMMY_PAYLOAD, `tok_${Date.now()}_3`, originalExpiry]
  );
  const retryApprovalId = retryApproval.rows[0].id;

  // retryUser has no user_credentials row, so getGmailClientForUser inside
  // executeQueuedSend throws deterministically (GOOGLE_ACCOUNT_DISCONNECTED)
  // with no network call — this is what lets the failure path be exercised
  // without a real Gmail account.
  let threw = false;
  try {
    await executeQueuedSend(retryApprovalId, 0, 2); // attemptsMade=0 of 2 -> not the final attempt
  } catch {
    threw = true;
  }
  if (!threw) throw new Error('FAILED: executeQueuedSend should rethrow on a non-final failed attempt so BullMQ retries');

  const afterRetry = await query(`SELECT status, cancel_token_expires_at FROM approvals WHERE id = $1`, [retryApprovalId]);
  if (afterRetry.rows[0].status !== 'pending') {
    throw new Error(`FAILED: expected status='pending' after a non-final failure, got '${afterRetry.rows[0].status}'`);
  }
  const newExpiry = new Date(afterRetry.rows[0].cancel_token_expires_at);
  if (!(newExpiry.getTime() > originalExpiry.getTime())) {
    throw new Error('FAILED: cancel_token_expires_at was not bumped forward on retry — the fix did not take effect');
  }

  // And the reopened window is genuinely usable, not just a later timestamp:
  await cancelApproval(retryApprovalId, retryUser.id); // must not throw
  const cancelledCheck = await query(`SELECT status FROM approvals WHERE id = $1`, [retryApprovalId]);
  if (cancelledCheck.rows[0].status !== 'cancelled') {
    throw new Error('FAILED: cancel during retry backoff should succeed now that the row is pending again');
  }
  console.log('        Passed: retry reopens a genuinely usable cancel window, not just a stated one.');

  // 6. Final failed attempt terminates the row; cancel no longer applies
  console.log('    13.6 Testing final attempt failure terminates as failed...');
  const finalUser = await createTestUser();
  const finalApproval = await query(
    `INSERT INTO approvals (user_id, action_type, status, prepared_payload, scheduled_at, cancel_token, cancel_token_expires_at)
     VALUES ($1, 'send_reply', 'pending', $2::jsonb, now(), $3, now() + interval '5 minutes')
     RETURNING id`,
    [finalUser.id, DUMMY_PAYLOAD, `tok_${Date.now()}_4`]
  );
  const finalApprovalId = finalApproval.rows[0].id;

  let finalThrew = false;
  try {
    await executeQueuedSend(finalApprovalId, 1, 2); // attemptsMade=1 of 2 -> this IS the final attempt
  } catch {
    finalThrew = true;
  }
  if (!finalThrew) throw new Error('FAILED: executeQueuedSend should still rethrow on the final attempt');

  const finalCheck = await query(`SELECT status FROM approvals WHERE id = $1`, [finalApprovalId]);
  if (finalCheck.rows[0].status !== 'failed') {
    throw new Error(`FAILED: expected status='failed' after the final attempt, got '${finalCheck.rows[0].status}'`);
  }

  let cancelAfterFailedRejected = false;
  try {
    await cancelApproval(finalApprovalId, finalUser.id);
  } catch (err: any) {
    if (err.code === 'APPROVAL_ALREADY_RESOLVED') cancelAfterFailedRejected = true;
  }
  if (!cancelAfterFailedRejected) throw new Error('FAILED: cancel should be rejected once a send has terminally failed');
  console.log('        Passed.');
}
