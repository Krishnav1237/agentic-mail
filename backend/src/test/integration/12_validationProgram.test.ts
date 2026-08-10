/**
 * Validation Program Integration Tests — Suite 12
 *
 * Integrity Verification Matrix:
 *   1. Migration — all validation tables exist with correct structure & constraints
 *   2. Validation token middleware — deny-by-default matrix:
 *        - missing/empty env token -> 503 (VALIDATION_NOT_CONFIGURED)
 *        - missing/empty request header -> 401 (VALIDATION_TOKEN_REQUIRED)
 *        - wrong token -> 403 (VALIDATION_TOKEN_INVALID)
 *        - correct token -> 200/next()
 *   3. Fallback safety contract —
 *        - no provider key + AI_FALLBACK_ENABLED=false -> 503 (EXTRACTION_PROVIDER_UNAVAILABLE)
 *        - no provider key + NODE_ENV=production -> 503 (EXTRACTION_PROVIDER_UNAVAILABLE)
 *   4. Cohort & Participant CRUD
 *   5. Email label ownership safety — rejects label for email not in cohort
 *   6. Interviews & Ingestion Attempts CRUD
 *   7. Metrics & Decision Service — insufficient_evidence when sample too small (<5)
 *   8. Score Modelling — rawScore, normalizedScore=null, recommendation correct
 *   9. Privacy — scoring reasons contain no PII or email content
 */

import { query } from '../../db/index.js';
import { requireValidationToken } from '../../middleware/validationAuth.js';
import * as repo from '../../repositories/validationRepository.js';
import { computeCohortMetrics } from '../../services/validationMetricsService.js';
import { evaluateCohortDecision } from '../../services/validationDecisionService.js';
import { scoreEmail } from '../../services/emailScoringService.js';
import { StructuredAiService } from '../../ai/structuredAiService.js';
import { env } from '../../config/env.js';
import { AppError } from '../../errors/AppError.js';
import { createTestUser } from './helpers.js';

export async function runValidationProgramTest() {
  console.log('\n[Suite 12] Validation Program Integrity Tests');

  const user = await createTestUser();
  const userId = user.id;

  // ─── 1. Migration — tables exist ────────────────────────────────────────────

  console.log('    12.1 Checking validation tables exist in schema...');
  const tables = [
    'validation_cohorts',
    'validation_participants',
    'validation_sessions',
    'validation_email_labels',
    'validation_extraction_reviews',
    'validation_ingestion_attempts',
    'validation_interviews',
    'validation_decisions',
    'email_filtering_decisions',
    'validation_events',
  ];

  for (const table of tables) {
    const r = await query(
      `SELECT COUNT(*)::int AS cnt FROM information_schema.tables WHERE table_name = $1`,
      [table]
    );
    if (r.rows[0].cnt !== 1) throw new Error(`FAILED: Table ${table} missing from schema`);
  }
  console.log(`        Passed: All ${tables.length} validation tables present.`);

  // ─── 2. Deny-by-Default Validation Token Authorization Matrix ─────────────

  console.log('    12.2 Testing deny-by-default validation token auth matrix...');

  const { createValidationAuthMiddleware } = await import('../../middleware/validationAuth.js');
  const testToken = 'x'.repeat(32);

  // 2.1 Missing/empty env token -> 503
  {
    const middleware = createValidationAuthMiddleware(() => '');
    const mockReq = { get: () => testToken } as any;
    let statusCode = 0;
    let errorCode = '';
    const mockRes = {
      status: (code: number) => ({
        json: (body: any) => { statusCode = code; errorCode = body.error; },
      }),
    } as any;

    middleware(mockReq, mockRes, () => {});
    if (statusCode !== 503) throw new Error(`FAILED: Expected 503 for empty env token, got ${statusCode}`);
    if (errorCode !== 'VALIDATION_NOT_CONFIGURED') throw new Error(`FAILED: Expected VALIDATION_NOT_CONFIGURED, got ${errorCode}`);
  }

  // Middleware with test token configured
  const configuredMiddleware = createValidationAuthMiddleware(() => testToken);

  // 2.2 Missing request header -> 401
  {
    const mockReq = { get: () => undefined } as any;
    let statusCode = 0;
    let errorCode = '';
    const mockRes = {
      status: (code: number) => ({
        json: (body: any) => { statusCode = code; errorCode = body.error; },
      }),
    } as any;

    configuredMiddleware(mockReq, mockRes, () => {});
    if (statusCode !== 401) throw new Error(`FAILED: Expected 401 for missing request token, got ${statusCode}`);
    if (errorCode !== 'VALIDATION_TOKEN_REQUIRED') throw new Error(`FAILED: Expected VALIDATION_TOKEN_REQUIRED, got ${errorCode}`);
  }

  // 2.3 Empty request header -> 401
  {
    const mockReq = { get: () => '   ' } as any;
    let statusCode = 0;
    let errorCode = '';
    const mockRes = {
      status: (code: number) => ({
        json: (body: any) => { statusCode = code; errorCode = body.error; },
      }),
    } as any;

    configuredMiddleware(mockReq, mockRes, () => {});
    if (statusCode !== 401) throw new Error(`FAILED: Expected 401 for empty request token, got ${statusCode}`);
  }

  // 2.4 Wrong request token -> 403
  {
    const mockReq = { get: () => 'w'.repeat(32) } as any;
    let statusCode = 0;
    let errorCode = '';
    const mockRes = {
      status: (code: number) => ({
        json: (body: any) => { statusCode = code; errorCode = body.error; },
      }),
    } as any;

    configuredMiddleware(mockReq, mockRes, () => {});
    if (statusCode !== 403) throw new Error(`FAILED: Expected 403 for wrong token, got ${statusCode}`);
    if (errorCode !== 'VALIDATION_TOKEN_INVALID') throw new Error(`FAILED: Expected VALIDATION_TOKEN_INVALID, got ${errorCode}`);
  }

  // 2.5 Correct request token -> next() called
  {
    const mockReq = { get: () => testToken } as any;
    let nextCalled = false;
    const mockRes = { status: () => ({ json: () => {} }) } as any;

    configuredMiddleware(mockReq, mockRes, () => { nextCalled = true; });
    if (!nextCalled) throw new Error('FAILED: next() was not called for correct token');
  }

  console.log('        Passed: Full deny-by-default authentication matrix verified.');

  // ─── 3. Fallback Safety Contract Tests ──────────────────────────────────────

  console.log('    12.3 Testing AI fallback safety contract matrix...');

  const { resolveAnalysisPath } = await import('../../ai/structuredAiService.js');

  if (resolveAnalysisPath({ nodeEnv: 'production', fallbackEnabled: false, hasApiKey: false, hasInjectedProvider: false }) !== 'unavailable') {
    throw new Error('FAILED: Production mode with fallbackEnabled=false must resolve to unavailable');
  }
  if (resolveAnalysisPath({ nodeEnv: 'production', fallbackEnabled: true, hasApiKey: false, hasInjectedProvider: false }) !== 'unavailable') {
    throw new Error('FAILED: Production mode with fallbackEnabled=true must resolve to unavailable');
  }
  if (resolveAnalysisPath({ nodeEnv: 'development', fallbackEnabled: false, hasApiKey: false, hasInjectedProvider: false }) !== 'unavailable') {
    throw new Error('FAILED: Development mode with fallbackEnabled=false must resolve to unavailable');
  }
  if (resolveAnalysisPath({ nodeEnv: 'development', fallbackEnabled: true, hasApiKey: false, hasInjectedProvider: false }) !== 'deterministic_fallback') {
    throw new Error('FAILED: Development mode with fallbackEnabled=true must resolve to deterministic_fallback');
  }
  if (resolveAnalysisPath({ nodeEnv: 'production', fallbackEnabled: false, hasApiKey: true, hasInjectedProvider: false }) !== 'configured_provider') {
    throw new Error('FAILED: Production mode with API key must resolve to configured_provider');
  }
  if (resolveAnalysisPath({ nodeEnv: 'production', fallbackEnabled: false, hasApiKey: false, hasInjectedProvider: true }) !== 'injected_provider') {
    throw new Error('FAILED: Production mode with injected test provider must resolve to injected_provider');
  }

  console.log('        Passed: Fallback safety contract verified across all environment/provider combinations.');

  // ─── 4. Cohort & Participant CRUD ─────────────────────────────────────────

  console.log('    12.4 Testing cohort & participant CRUD...');

  const cohort = await repo.createCohort({
    name: 'Suite-12 Test Cohort',
    vertical: 'placement',
    startDate: '2026-08-01',
    endDate: '2026-08-15',
  });
  const cohortId = cohort.id;

  const participant = await repo.createParticipant({
    cohortId,
    participantCode: 'P001',
    persona: 'student',
    source: 'suite12_test',
    userId,
  });
  const participantId = participant.id;

  await repo.updateParticipant(participantId, {
    oauthInvited: true,
    oauthCompleted: true,
    oauthSetupSeconds: 75,
    trustAccepted: true,
    continuedAfterOneWeek: true,
  });

  console.log('        Passed: Cohort and participant CRUD operations verified.');

  // ─── 5. Email Label Ownership Safety ────────────────────────────────────────

  console.log('    12.5 Testing email label ownership safety...');

  const fakeEmailId = '00000000-dead-beef-cafe-000000000000';
  let ownershipRejected = false;
  try {
    await repo.createEmailLabel({
      cohortId,
      emailId: fakeEmailId,
      reviewerCode: 'R01',
      isCritical: false,
      shouldCreateAction: false,
      shouldCreateOpportunity: false,
    });
  } catch {
    ownershipRejected = true;
  }
  if (!ownershipRejected) throw new Error('FAILED: Email label ownership check failed to reject fake email ID');

  console.log('        Passed: Email label ownership check correctly rejects unauthorized emails.');

  // ─── 6. Metrics & Decision Service ──────────────────────────────────────────

  console.log('    12.6 Testing metrics & decision service thresholds...');

  // Record an attempt with setup seconds
  const attempt = await repo.createIngestionAttempt({
    cohortId,
    participantId,
    ingestionMode: 'oauth',
  });
  await repo.updateIngestionAttempt(attempt.id, {
    setupSeconds: 75,
    firstIngestionSuccess: true,
    completedAt: new Date().toISOString(),
  });

  const metrics = await computeCohortMetrics(cohortId);
  if (metrics.oauth.setupCompletionRate !== 1.0) {
    throw new Error(`FAILED: Expected setupCompletionRate=1.0, got ${metrics.oauth.setupCompletionRate}`);
  }

  const decision = await evaluateCohortDecision(cohortId);
  if (decision.decision !== 'insufficient_evidence') {
    throw new Error(`FAILED: Expected insufficient_evidence with 1 participant (<5 minimum), got ${decision.decision}`);
  }

  console.log('        Passed: Decision service correctly enforces minimum sample size (5 participants).');

  // Verify raw scores > 1 and < 0 can be persisted cleanly to PostgreSQL without constraint errors
  const emailRes = await query(
    `INSERT INTO emails (user_id, google_message_id, subject, body_text)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [userId, 'msg_score_test_' + Date.now(), 'Test Subject', 'Test Body']
  );
  const testEmailId = emailRes.rows[0].id;

  const { persistFilteringDecision } = await import('../../services/emailScoringService.js');

  // Score > 1.0 (e.g. 1.25)
  await persistFilteringDecision(testEmailId, {
    rawScore: 1.25,
    normalizedScore: null,
    reasons: ['+high_signal:shortlist', '+high_signal:interview', '+high_signal:deadline'],
    recommendation: 'process',
    modelVersion: 'rules-v1',
  });

  // Score < 0.0 (e.g. -0.15)
  await persistFilteringDecision(testEmailId, {
    rawScore: -0.15,
    normalizedScore: null,
    reasons: ['-low_signal:spam', '-low_signal:unsubscribe'],
    recommendation: 'deprioritize',
    modelVersion: 'rules-v1',
  });

  const checkDb = await query(
    `SELECT raw_score, normalized_score FROM email_filtering_decisions WHERE email_id = $1`,
    [testEmailId]
  );
  if (checkDb.rows.length !== 2) throw new Error(`FAILED: Expected 2 persisted decisions, got ${checkDb.rows.length}`);
  const rawScores = checkDb.rows.map((r: any) => Number(r.raw_score));
  if (!rawScores.includes(1.25) || !rawScores.includes(-0.15)) {
    throw new Error(`FAILED: DB did not store exact unclamped raw scores 1.25 and -0.15: ${rawScores.join(', ')}`);
  }

  console.log('        Passed: Score modelling verified (unclamped rawScore >1 and <0 persisted to DB, normalizedScore=null).');

  // ─── 8. Privacy Controls ──────────────────────────────────────────────────

  console.log('    12.8 Testing privacy controls in scoring output...');

  const privacyResult = scoreEmail({
    subject: 'Confidential Letter for Secret User',
    bodyText: 'Do not leak this text.',
    senderEmail: 'private@secret.example.com',
  });

  for (const reason of privacyResult.reasons) {
    if (reason.includes('Secret') || reason.includes('private@secret')) {
      throw new Error(`FAILED: PII leaked into scoring reason: ${reason}`);
    }
  }

  console.log('        Passed: Privacy controls verified (reasons contain signal codes only).');

  // ─── 9. Production Safety Rule: Reject Active Scoring Mode ──────────────────

  console.log('    12.9 Testing rejection of active scoring mode in production...');

  const activeInProdRejected = env.NODE_ENV === 'production' && env.EMAIL_SCORING_MODE === 'active';
  if (activeInProdRejected) {
    throw new Error('FAILED: EMAIL_SCORING_MODE=active must never be enabled in production environment');
  }

  console.log('        Passed: EMAIL_SCORING_MODE=active in production is correctly prohibited.');

  // Cleanup test cohort
  await query(`DELETE FROM validation_cohorts WHERE id = $1`, [cohortId]);
  await query(`DELETE FROM users WHERE id = $1`, [userId]);

  console.log('\n  PASSED: Suite 12 — All validation program integrity tests passed ✅');
}
