import { Pool } from 'pg';
import { env } from './env.js';

export const db = new Pool({
  connectionString: env.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000
});

export const dbPing = async () => {
  const result = await db.query('SELECT 1 as ok');
  return result.rows[0]?.ok === 1;
};
