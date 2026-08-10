import { applyMigrationsClean, createTestUser } from './helpers.js';
import { toSafeCode, ErrorCode, AppError } from '../../errors/AppError.js';
import { query } from '../../db/index.js';

export async function runErrorSanitizationTest() {
  console.log('  [Suite 10] Error Sanitization & Token Leak Prevention Test...');
  await applyMigrationsClean();

  const user = await createTestUser('sanitization_user@example.com');

  // 1. Test toSafeCode mapping on dirty error messages
  console.log('    10.1 Testing toSafeCode() mapping on dirty error payloads...');

  const dirtyErrors = [
    {
      input: new Error('invalid_grant: Refresh token ya29.secret_token_12345 has been revoked'),
      expected: ErrorCode.GOOGLE_TOKEN_REFRESH_FAILED,
    },
    {
      input: new Error('LOCK_OWNERSHIP_LOST: lost lock at /var/app/locks/user1.lock'),
      expected: ErrorCode.LOCK_OWNERSHIP_LOST,
    },
    {
      input: new Error('PGERROR: SELECT * FROM users WHERE id = 123 -- syntax error'),
      expected: ErrorCode.INTERNAL_ERROR,
    },
    {
      input: new AppError(ErrorCode.EXTRACTION_PROVIDER_UNAVAILABLE, 'Sensitive internal details', 503),
      expected: ErrorCode.EXTRACTION_PROVIDER_UNAVAILABLE,
    },
  ];

  for (const item of dirtyErrors) {
    const safe = toSafeCode(item.input);
    if (safe !== item.expected) {
      throw new Error(`FAILED: toSafeCode returned "${safe}", expected "${item.expected}"`);
    }
  }
  console.log('        Passed: All dirty errors mapped to bounded safe error codes.');

  // 2. Test database persistence sanitization
  console.log('    10.2 Verifying database fields store only safe bounded error codes...');
  const dirtySecretMsg = 'invalid_grant: secret_token_ya29.abcdef123456 failed at /Users/HP/backend/src/auth.ts:42';
  const safeCode = toSafeCode(new Error(dirtySecretMsg));

  await query(
    `INSERT INTO sync_runs (user_id, sync_type, status, error_message)
     VALUES ($1, 'manual', 'failed', $2)`,
    [user.id, safeCode]
  );

  const dbRes = await query(`SELECT error_message FROM sync_runs WHERE user_id = $1`, [user.id]);
  const storedMsg = dbRes.rows[0].error_message;

  if (storedMsg.includes('ya29') || storedMsg.includes('/Users/') || storedMsg.includes(':')) {
    throw new Error(`FAILED: DB stored raw secret message content! (got: "${storedMsg}")`);
  }
  if (storedMsg !== ErrorCode.GOOGLE_TOKEN_REFRESH_FAILED) {
    throw new Error(`FAILED: DB stored incorrect error code (got "${storedMsg}")`);
  }

  console.log('        Passed: Database fields contained ONLY safe bounded error code.');
}
