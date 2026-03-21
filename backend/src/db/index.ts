import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { db } from '../config/db.js';

export const query = async <T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<QueryResult<T>> => {
  return db.query<T>(text, params);
};

export const withTransaction = async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
