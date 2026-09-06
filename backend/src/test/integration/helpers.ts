import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, query } from '../../db/index.js';
import { redisCache, redisQueue, redisWorker, redisQueueEvents } from '../../redis/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function applyMigrationsClean() {
  const migrationsDir = path.resolve(__dirname, '../../../db/migrations');
  const files = [
    '001_baseline_schema.sql',
    '002_gmail_ingestion.sql',
    '003_intelligence_extraction.sql',
    '004_phase1_4_audit_fixes.sql',
    '005_runtime_integrity_fixes.sql',
    '006_validation_program.sql',
    '007_validation_scoring_integrity.sql',
    '008_obligo_rebrand.sql',
    '009_frontend_alignment.sql',
    '010_emails_status_constraint.sql',
  ];

  // Drop schema public
  await query('DROP SCHEMA public CASCADE;');
  await query('CREATE SCHEMA public;');
  await query('GRANT ALL ON SCHEMA public TO public;');

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    await query(sql);
  }
}

export async function clearRedisData() {
  await redisCache.flushdb();
}

export async function createTestUser(email: string = `test_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`) {
  const res = await query(
    `INSERT INTO users (email, full_name, google_sub)
     VALUES ($1, 'Test User', $2)
     RETURNING id, email, google_sub`,
    [email, `sub_${Date.now()}_${Math.random()}`]
  );
  return res.rows[0] as { id: string; email: string; google_sub: string };
}

export async function createTestEmail(userId: string, subject: string = 'Test Subject', body: string = 'Test Body') {
  const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const res = await query(
    `INSERT INTO emails (user_id, google_message_id, sender_email, sender_name, subject, body_text, received_at)
     VALUES ($1, $2, 'sender@example.com', 'Sender Name', $3, $4, NOW())
     RETURNING id, google_message_id`,
    [userId, msgId, subject, body]
  );
  return res.rows[0] as { id: string; google_message_id: string };
}

export async function teardownIntegration() {
  await db.end();
  await redisCache.quit();
  await redisQueue.quit();
  await redisWorker.quit();
  await redisQueueEvents.quit();
}
