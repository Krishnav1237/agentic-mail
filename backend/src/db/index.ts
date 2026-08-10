import pg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pg;

export const db = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export const query = (text: string, params?: any[]) => db.query(text, params);

export const checkDatabaseHealth = async (): Promise<boolean> => {
  try {
    const res = await db.query('SELECT 1 as alive');
    return res.rows[0]?.alive === 1;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
};
