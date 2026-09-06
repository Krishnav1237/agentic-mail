import { teardownIntegration } from './helpers.js';
import { runMigrationsTest } from './01_migrations.test.js';
import { runRedisLocksTest } from './02_redisLocks.test.js';
import { runOwnershipTest } from './03_ownership.test.js';
import { runIdempotencyTest } from './04_idempotency.test.js';
import { runSyncConcurrencyTest } from './05_syncConcurrency.test.js';
import { runCursorCrashSafetyTest } from './06_cursorCrashSafety.test.js';
import { runHttpRoutesTest } from './07_httpRoutes.test.js';
import { runPromptInjectionTest } from './08_promptInjection.test.js';
import { runAiTimeoutTest } from './09_aiTimeout.test.js';
import { runErrorSanitizationTest } from './10_errorSanitization.test.js';
import { runRateLimitingTest } from './11_rateLimiting.test.js';
import { runValidationProgramTest } from './12_validationProgram.test.js';

async function main() {
  console.log('================================================================');
  console.log('  OBLIGO INTEGRATION TEST GATE (PHASES 1–4 + VALIDATION)');
  console.log('  Running against real PostgreSQL and real Redis...');
  console.log('================================================================\n');

  try {
    await runMigrationsTest();
    await runRedisLocksTest();
    await runOwnershipTest();
    await runIdempotencyTest();
    await runSyncConcurrencyTest();
    await runCursorCrashSafetyTest();
    await runHttpRoutesTest();
    await runPromptInjectionTest();
    await runAiTimeoutTest();
    await runErrorSanitizationTest();
    await runRateLimitingTest();
    await runValidationProgramTest();

    console.log('\n================================================================');
    console.log('  ALL 12 INTEGRATION SUITES PASSED SUCCESSFULLY! 🎉');
    console.log('================================================================\n');
  } catch (err) {
    console.error('\n❌ INTEGRATION GATE FAILED:', err);
    process.exitCode = 1;
  } finally {
    await teardownIntegration();
    process.exit(process.exitCode || 0);
  }
}

main();
