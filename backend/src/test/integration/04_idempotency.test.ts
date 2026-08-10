import { applyMigrationsClean, createTestUser, createTestEmail } from './helpers.js';
import { query } from '../../db/index.js';
import {
  makeMaterializedEntityKey,
  makeExtractionCandidateKey,
  IntelligenceService,
} from '../../services/intelligenceService.js';

export async function runIdempotencyTest() {
  console.log('  [Suite 4] Materialized Entity Key Redesign & Reprocessing Protection Test...');
  await applyMigrationsClean();

  const userA = await createTestUser('idempotency_a@example.com');
  const userB = await createTestUser('idempotency_b@example.com');
  const emailA = await createTestEmail(userA.id, 'Project Deadline', 'Please submit report');

  // 1. Separation of extraction_candidate_key vs materialized_entity_key
  console.log('    4.1 Testing extraction_candidate_key vs materialized_entity_key...');
  const candKeyV1 = makeExtractionCandidateKey({
    userId: userA.id,
    emailId: emailA.id,
    entityType: 'action',
    title: 'Submit Report',
    extractionVersion: 1,
  });
  const candKeyV2 = makeExtractionCandidateKey({
    userId: userA.id,
    emailId: emailA.id,
    entityType: 'action',
    title: 'Submit Report',
    extractionVersion: 2,
  });
  if (candKeyV1 === candKeyV2) {
    throw new Error('FAILED: extraction_candidate_key must differ across extraction versions');
  }

  const matKeyV1 = makeMaterializedEntityKey({
    userId: userA.id,
    sourceEmailId: emailA.id,
    entityType: 'action',
    title: 'Submit Report',
    deadline: '2026-07-25T17:00:00Z',
    target: null,
    category: 'academic',
  });
  const matKeyV2 = makeMaterializedEntityKey({
    userId: userA.id,
    sourceEmailId: emailA.id,
    entityType: 'action',
    title: 'Submit Report',
    deadline: '2026-07-25T17:00:00Z',
    target: null,
    category: 'academic',
  });
  if (matKeyV1 !== matKeyV2) {
    throw new Error('FAILED: materialized_entity_key must remain stable across extractions');
  }
  console.log('        Passed: Key separation verified.');

  // 2. Distinction tests: Deadline, Target, Category
  console.log('    4.2 Testing key distinction for deadline, target, and category...');
  const keyDeadline1 = makeMaterializedEntityKey({
    userId: userA.id, sourceEmailId: emailA.id, entityType: 'action', title: 'Submit', deadline: '2026-07-25', target: null, category: null,
  });
  const keyDeadline2 = makeMaterializedEntityKey({
    userId: userA.id, sourceEmailId: emailA.id, entityType: 'action', title: 'Submit', deadline: '2026-08-01', target: null, category: null,
  });
  if (keyDeadline1 === keyDeadline2) throw new Error('FAILED: Different deadlines produced identical key!');

  const keyTarget1 = makeMaterializedEntityKey({
    userId: userA.id, sourceEmailId: emailA.id, entityType: 'opportunity', title: 'Interview', deadline: null, target: 'Google', category: null,
  });
  const keyTarget2 = makeMaterializedEntityKey({
    userId: userA.id, sourceEmailId: emailA.id, entityType: 'opportunity', title: 'Interview', deadline: null, target: 'Meta', category: null,
  });
  if (keyTarget1 === keyTarget2) throw new Error('FAILED: Different targets produced identical key!');
  console.log('        Passed: Deadlines and targets produce distinct keys.');

  // 3. Normalization tests: Unicode (NFC) & Whitespace
  console.log('    4.3 Testing Unicode (NFC) & Whitespace normalization...');
  const keyNorm1 = makeMaterializedEntityKey({
    userId: userA.id, sourceEmailId: emailA.id, entityType: 'action', title: '  Review   Café   Menu ', deadline: null, target: null, category: null,
  });
  const keyNorm2 = makeMaterializedEntityKey({
    userId: userA.id, sourceEmailId: emailA.id, entityType: 'action', title: 'review café menu', deadline: null, target: null, category: null,
  });
  if (keyNorm1 !== keyNorm2) throw new Error('FAILED: NFC/whitespace normalization failed!');
  console.log('        Passed: Unicode & whitespace normalization verified.');

  // 4. Cross-user isolation
  console.log('    4.4 Testing cross-user key isolation...');
  const keyUserA = makeMaterializedEntityKey({
    userId: userA.id, sourceEmailId: emailA.id, entityType: 'action', title: 'Task', deadline: null, target: null, category: null,
  });
  const keyUserB = makeMaterializedEntityKey({
    userId: userB.id, sourceEmailId: emailA.id, entityType: 'action', title: 'Task', deadline: null, target: null, category: null,
  });
  if (keyUserA === keyUserB) throw new Error('FAILED: Different users produced identical key!');
  console.log('        Passed: Cross-user key isolation verified.');

  // 5. Reprocessing without duplication & protected state protection
  // Use a second extraction pass on the same email — entity keys must be stable so
  // counts do not grow. Do not assume a hard-coded title matches live/fallback extraction.
  console.log('    4.5 Testing reprocessing without duplication & user state protection...');
  const emailRecruiter = await createTestEmail(
    userA.id,
    'Software Engineering Internship Offer',
    'We invite you to apply for our internship. Please submit by Friday deadline.'
  );

  // Seed a completed action with a stable key (simulates prior materialization + user completion)
  const matKey = makeMaterializedEntityKey({
    userId: userA.id,
    sourceEmailId: emailRecruiter.id,
    entityType: 'action',
    title: 'Submit Application',
    deadline: '2026-07-25',
    target: null,
    category: 'career',
  });

  await query(
    `INSERT INTO actions (user_id, email_id, idempotency_key, title, status, priority_score)
     VALUES ($1, $2, $3, 'Submit Application', 'completed', 90)`,
    [userA.id, emailRecruiter.id, matKey]
  );

  // First extraction may create additional entities with different keys; that is allowed.
  await IntelligenceService.processEmailIntelligence(emailRecruiter.id);

  const actionsAfterFirst = await query(
    `SELECT COUNT(*)::int AS count FROM actions WHERE user_id = $1 AND email_id = $2`,
    [userA.id, emailRecruiter.id]
  );
  const oppsAfterFirst = await query(
    `SELECT COUNT(*)::int AS count FROM opportunities WHERE user_id = $1 AND email_id = $2`,
    [userA.id, emailRecruiter.id]
  );

  // Second extraction must be idempotent for the same candidates
  await IntelligenceService.processEmailIntelligence(emailRecruiter.id);

  const actionsAfterSecond = await query(
    `SELECT COUNT(*)::int AS count FROM actions WHERE user_id = $1 AND email_id = $2`,
    [userA.id, emailRecruiter.id]
  );
  const oppsAfterSecond = await query(
    `SELECT COUNT(*)::int AS count FROM opportunities WHERE user_id = $1 AND email_id = $2`,
    [userA.id, emailRecruiter.id]
  );

  if (actionsAfterSecond.rows[0].count !== actionsAfterFirst.rows[0].count) {
    throw new Error(
      `FAILED: Reprocessing created duplicate action rows (before: ${actionsAfterFirst.rows[0].count}, after: ${actionsAfterSecond.rows[0].count})`
    );
  }
  if (oppsAfterSecond.rows[0].count !== oppsAfterFirst.rows[0].count) {
    throw new Error(
      `FAILED: Reprocessing created duplicate opportunity rows (before: ${oppsAfterFirst.rows[0].count}, after: ${oppsAfterSecond.rows[0].count})`
    );
  }

  const completedActions = await query(`SELECT status FROM actions WHERE idempotency_key = $1`, [matKey]);
  if (completedActions.rows[0].status !== 'completed') {
    throw new Error('FAILED: Reprocessing reopened user completed action!');
  }
  console.log('        Passed: Reprocessing preserved user completed state and did not duplicate entities.');
}
