import { Pool } from 'pg';
import { env } from './env.js';

const getSslConfig = () => {
  // Explicit opt-out via env var
  if (process.env.DATABASE_SSL === 'false') return false;

  // Explicit opt-in with full verification (recommended for production)
  if (process.env.DATABASE_SSL === 'verify')
    return { rejectUnauthorized: true };

  // Auto-detect: Supabase and cloud providers need SSL but their poolers
  // don't always provide verifiable certs, so we allow unverified in dev
  const needsSsl =
    env.databaseUrl.includes('supabase') ||
    env.databaseUrl.includes('neon.tech') ||
    env.databaseUrl.includes('ssl=true');

  if (!needsSsl) return false;

  // In production, default to verifying certificates
  if (env.nodeEnv === 'production') {
    return { rejectUnauthorized: true };
  }

  // In development, allow unverified SSL for managed DB services
  return { rejectUnauthorized: false };
};

export const db = new Pool({
  connectionString: env.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  ssl: getSslConfig(),
});

export const dbPing = async () => {
  const result = await db.query('SELECT 1 as ok');
  return result.rows[0]?.ok === 1;
};
