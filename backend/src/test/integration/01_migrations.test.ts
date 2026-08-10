import { applyMigrationsClean } from './helpers.js';
import { query } from '../../db/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrationsTest() {
  console.log('  [Suite 1] Database Migrations & Schema Introspection Test...');

  // 1. Clean apply test
  console.log('    1.1 Testing clean installation of migrations 001–005...');
  await applyMigrationsClean();
  console.log('        Passed: Clean installation succeeded.');

  // 2. Introspect Model A schema for email_intelligence
  console.log('    1.2 Introspecting Model A ownership schema on email_intelligence...');
  const colsRes = await query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'email_intelligence' AND column_name = 'user_id'
  `);
  if (colsRes.rows.length > 0) {
    throw new Error('FAILED: email_intelligence still has user_id column (Model A violation)');
  }

  const constraintRes = await query(`
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE table_name = 'email_intelligence' AND constraint_name = 'unique_email_extraction_version'
  `);
  if (constraintRes.rows.length === 0) {
    throw new Error('FAILED: unique_email_extraction_version constraint missing on email_intelligence');
  }
  console.log('        Passed: Model A derived ownership verified (user_id removed, email_id FK intact).');

  // 3. Introspect partial unique indexes
  console.log('    1.3 Introspecting partial unique indexes...');
  const idxRes = await query(`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN ('idx_sync_runs_active_user', 'idx_extraction_runs_active_email')
  `);
  if (idxRes.rows.length < 2) {
    throw new Error(`FAILED: Expected 2 active partial unique indexes, found ${idxRes.rows.length}`);
  }
  console.log('        Passed: Active partial unique indexes verified.');

  // 4. Test audit immutability trigger
  console.log('    1.4 Testing immutable audit_events trigger (UPDATE and DELETE rejection)...');
  const userRes = await query(`INSERT INTO users (email) VALUES ('audit_test@example.com') RETURNING id`);
  const userId = userRes.rows[0].id;

  const auditRes = await query(`
    INSERT INTO audit_events (user_id, event_type, actor, details)
    VALUES ($1, 'test_event', 'system', '{"test": true}')
    RETURNING id
  `, [userId]);
  const auditId = auditRes.rows[0].id;

  let updateFailed = false;
  try {
    await query(`UPDATE audit_events SET event_type = 'mutated' WHERE id = $1`, [auditId]);
  } catch (err: any) {
    if (err.message.includes('Audit events are immutable')) {
      updateFailed = true;
    }
  }
  if (!updateFailed) throw new Error('FAILED: audit_events UPDATE was not blocked by trigger!');

  let deleteFailed = false;
  try {
    await query(`DELETE FROM audit_events WHERE id = $1`, [auditId]);
  } catch (err: any) {
    if (err.message.includes('Audit events are immutable')) {
      deleteFailed = true;
    }
  }
  if (!deleteFailed) throw new Error('FAILED: audit_events DELETE was not blocked by trigger!');

  console.log('        Passed: Audit immutability trigger rejected both UPDATE and DELETE.');

  // 5. Test upgrade path from migration 004 -> 005
  console.log('    1.5 Testing upgrade path: Apply 001-004, then apply 005...');
  await query('DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;');
  const migrationsDir = path.resolve(__dirname, '../../../db/migrations');
  for (const file of ['001_baseline_schema.sql', '002_gmail_ingestion.sql', '003_intelligence_extraction.sql', '004_phase1_4_audit_fixes.sql']) {
    await query(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
  // Now apply 005 on top of 004
  await query(fs.readFileSync(path.join(migrationsDir, '005_runtime_integrity_fixes.sql'), 'utf8'));

  const upgradeColCheck = await query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'email_intelligence' AND column_name = 'user_id'
  `);
  if (upgradeColCheck.rows.length > 0) {
    throw new Error('FAILED: Upgrade from 004 to 005 failed to drop user_id column');
  }
  console.log('        Passed: Upgrade path from existing 004 database to 005 verified.');

  // 6. Test migration 006 -> 007 data-integrity upgrade path
  console.log('    1.6 Testing migration 006 -> 007 data-integrity upgrade path...');
  await query('DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;');
  for (const file of ['001_baseline_schema.sql', '002_gmail_ingestion.sql', '003_intelligence_extraction.sql', '004_phase1_4_audit_fixes.sql', '005_runtime_integrity_fixes.sql', '006_validation_program.sql']) {
    await query(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
  }

  // Insert historical user, email, and decision under migration 006 schema
  const uRes = await query(`INSERT INTO users (email) VALUES ('m006_test@example.com') RETURNING id`);
  const uId = uRes.rows[0].id;
  const eRes = await query(`INSERT INTO emails (user_id, google_message_id) VALUES ($1, 'msg_006_test') RETURNING id`, [uId]);
  const eId = eRes.rows[0].id;

  await query(`
    INSERT INTO email_filtering_decisions (email_id, model_version, score, recommendation, reasons_json, mode)
    VALUES ($1, 'rules-v1', 0.75, 'process', '["+high_signal:shortlist"]'::jsonb, 'shadow')
  `, [eId]);

  // Apply migration 007 on top of populated 006 database
  await query(fs.readFileSync(path.join(migrationsDir, '007_validation_scoring_integrity.sql'), 'utf8'));

  // Introspect converted table
  const convertedRes = await query(
    `SELECT raw_score, normalized_score, reasons, recommendation, mode FROM email_filtering_decisions WHERE email_id = $1`,
    [eId]
  );
  if (convertedRes.rows.length !== 1) {
    throw new Error('FAILED: Migration 007 dropped historical decision row!');
  }
  const row007 = convertedRes.rows[0];
  if (Number(row007.raw_score) !== 0.75) {
    throw new Error(`FAILED: Expected raw_score=0.75, got ${row007.raw_score}`);
  }
  if (row007.normalized_score !== null) {
    throw new Error(`FAILED: Expected normalized_score=null, got ${row007.normalized_score}`);
  }
  if (!Array.isArray(row007.reasons) || row007.reasons[0] !== '+high_signal:shortlist') {
    throw new Error(`FAILED: Reasons JSONB array not preserved: ${JSON.stringify(row007.reasons)}`);
  }

  // Insert new raw scores >1.0 and <0.0
  await query(`
    INSERT INTO email_filtering_decisions (email_id, model_version, raw_score, normalized_score, recommendation, reasons, mode)
    VALUES ($1, 'rules-v1', 1.50, NULL, 'process', '["+high_signal:interview"]'::jsonb, 'shadow'),
           ($1, 'rules-v1', -0.25, NULL, 'deprioritize', '["-low_signal:spam"]'::jsonb, 'shadow')
  `, [eId]);

  // Test idempotency: re-running 007 must not fail or alter existing rows
  await query(fs.readFileSync(path.join(migrationsDir, '007_validation_scoring_integrity.sql'), 'utf8'));

  const countRes = await query(`SELECT COUNT(*)::int as count FROM email_filtering_decisions WHERE email_id = $1`, [eId]);
  if (countRes.rows[0].count !== 3) {
    throw new Error(`FAILED: Re-applying migration 007 altered row count! Expected 3, got ${countRes.rows[0].count}`);
  }

  console.log('        Passed: Migration 006 -> 007 data-integrity upgrade & idempotency verified.');
}
