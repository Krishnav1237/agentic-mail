import { applyMigrationsClean, createTestUser, createTestEmail } from './helpers.js';
import { query } from '../../db/index.js';
import { IntelligenceService } from '../../services/intelligenceService.js';
import { AppError } from '../../errors/AppError.js';

export async function runOwnershipTest() {
  console.log('  [Suite 3] Model A Derived Ownership & Cross-Tenant Isolation Test...');
  await applyMigrationsClean();

  const userA = await createTestUser('user_a@example.com');
  const userB = await createTestUser('user_b@example.com');

  const emailA = await createTestEmail(userA.id, 'User A Job Offer', 'Please accept the software engineering offer by Friday.');

  // 1. Process intelligence for User A's email
  console.log('    3.1 Processing intelligence for User A email...');
  const runId = await IntelligenceService.processEmailIntelligence(emailA.id);
  if (!runId) throw new Error('FAILED: Extraction runId not returned');

  // 2. Introspect Model A derived ownership
  console.log('    3.2 Introspecting email_intelligence derived ownership via JOIN...');
  const intelRes = await query(
    `SELECT ei.id, ei.email_id, e.user_id
     FROM email_intelligence ei
     JOIN emails e ON e.id = ei.email_id
     WHERE ei.email_id = $1 AND e.user_id = $2`,
    [emailA.id, userA.id]
  );
  if (intelRes.rows.length === 0) {
    throw new Error('FAILED: Derived ownership query returned no rows for User A');
  }
  console.log('        Passed: Derived ownership verified via emails.user_id JOIN.');

  // 3. Test cross-tenant isolation (User B querying User A's email)
  console.log('    3.3 Testing cross-tenant isolation (User B accessing User A email)...');
  const crossRes = await query(
    `SELECT ei.id
     FROM email_intelligence ei
     JOIN emails e ON e.id = ei.email_id
     WHERE ei.email_id = $1 AND e.user_id = $2`,
    [emailA.id, userB.id] // User B ID with User A email
  );
  if (crossRes.rows.length !== 0) {
    throw new Error('FAILED: Cross-tenant query returned User A intelligence for User B!');
  }
  console.log('        Passed: User B received 0 rows for User A email.');

  // 4. Test extraction trigger on mismatched email/user pair
  console.log('    3.4 Testing extraction trigger attempt on non-existent email ID...');
  let errorCaught = false;
  try {
    await IntelligenceService.processEmailIntelligence('00000000-0000-0000-0000-000000000000');
  } catch (err: any) {
    if (err instanceof AppError && err.code === 'NOT_FOUND') {
      errorCaught = true;
    }
  }
  if (!errorCaught) throw new Error('FAILED: Non-existent email processing did not throw NOT_FOUND AppError');
  console.log('        Passed: Non-existent email processing rejected with NOT_FOUND AppError.');

  // 5. Test ON DELETE CASCADE on email deletion
  console.log('    3.5 Testing ON DELETE CASCADE of email_intelligence when email is deleted...');
  await query(`DELETE FROM emails WHERE id = $1`, [emailA.id]);
  const deletedIntelRes = await query(`SELECT id FROM email_intelligence WHERE email_id = $1`, [emailA.id]);
  if (deletedIntelRes.rows.length !== 0) {
    throw new Error('FAILED: Deleting email did not CASCADE delete email_intelligence row!');
  }
  console.log('        Passed: Cascade deletion verified.');
}
