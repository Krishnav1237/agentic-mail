import { query } from '../db/index.js';

export type MemoryScope = 'short' | 'long';

export const getMemory = async <T>(userId: string, scope: MemoryScope, key: string): Promise<T | null> => {
  const result = await query<{ value: T }>(
    'SELECT value FROM memory_store WHERE user_id = $1 AND scope = $2 AND key = $3',
    [userId, scope, key]
  );
  return result.rowCount ? result.rows[0].value : null;
};

export const upsertMemory = async (userId: string, scope: MemoryScope, key: string, value: unknown, expiresAt?: string) => {
  await query(
    `INSERT INTO memory_store (user_id, scope, key, value, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, scope, key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at, updated_at = now()`,
    [userId, scope, key, JSON.stringify(value), expiresAt ?? null]
  );
};

export const appendMemoryList = async (userId: string, scope: MemoryScope, key: string, item: unknown, limit = 20) => {
  const current = (await getMemory<unknown[]>(userId, scope, key)) ?? [];
  const updated = [item, ...current].slice(0, limit);
  await upsertMemory(userId, scope, key, updated);
  return updated;
};
