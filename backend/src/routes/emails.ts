import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ingestionQueue } from '../queues/index.js';
import { query } from '../db/index.js';
import { asyncRoute } from '../middleware/asyncRoute.js';

export const emailsRouter = Router();

const listSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
    status: z.string().optional(),
    classification: z.string().optional(),
    query: z.string().max(200).optional(),
  })
  .strip();

emailsRouter.post(
  '/sync',
  authMiddleware,
  asyncRoute(async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    await ingestionQueue.add(
      'sync-user',
      { userId },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
    );
    return res.json({ status: 'queued' });
  })
);

emailsRouter.get(
  '/',
  authMiddleware,
  validate(listSchema, 'query'),
  asyncRoute(async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const {
      limit,
      offset,
      status,
      classification,
      query: queryText,
    } = req.query as unknown as z.infer<typeof listSchema>;

    const conditions: string[] = ['user_id = $1'];
    const params: Array<string | number> = [userId];
    const addParam = (value: string | number) => {
      params.push(value);
      return `$${params.length}`;
    };

    if (status) {
      conditions.push(`status = ${addParam(status)}`);
    }
    if (classification) {
      conditions.push(`classification = ${addParam(classification)}`);
    }
    if (queryText) {
      const value = `%${queryText}%`;
      conditions.push(`(
      concat_ws(' ', coalesce(subject, ''), coalesce(sender_name, ''), coalesce(sender_email, '')) ILIKE ${addParam(value)}
    )`);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const countResult = await query<{ total: number }>(
      `SELECT COUNT(*)::int as total
     FROM emails
     ${whereClause}`,
      params
    );

    const limitParam = params.length + 1;
    const offsetParam = params.length + 2;
    const listResult = await query(
      `SELECT id, message_id, subject, sender_email, sender_name, received_at, classification, ai_score, status
     FROM emails
     ${whereClause}
     ORDER BY received_at DESC NULLS LAST
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
      [...params, limit, offset]
    );

    return res.json({
      emails: listResult.rows,
      total: countResult.rows[0]?.total ?? 0,
      limit,
      offset,
    });
  })
);
