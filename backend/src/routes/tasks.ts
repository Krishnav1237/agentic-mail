import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  listTasksPaginated,
  dashboardSections,
  type DashboardSections,
} from '../services/tasks.js';
import { cacheGet, cacheSet, cacheDel } from '../services/cache.js';
import { query } from '../db/index.js';
import { summarizeActions } from '../agent/magicOutput.js';
import { asyncRoute } from '../middleware/asyncRoute.js';
import { listMustAct, recomputeMustActForUser } from '../services/mustAct.js';

export const tasksRouter = Router();

const listSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
    status: z.string().optional(),
    category: z.string().optional(),
    query: z.string().max(200).optional(),
    sort: z.enum(['priority', 'due', 'created']).optional(),
    minPriority: z.coerce.number().optional(),
    maxPriority: z.coerce.number().optional(),
    dueOnly: z.coerce.boolean().optional(),
    dueFrom: z.string().optional(),
    dueTo: z.string().optional(),
  })
  .strip();

tasksRouter.get(
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
      category,
      query,
      sort,
      minPriority,
      maxPriority,
      dueOnly,
      dueFrom,
      dueTo,
    } = req.query as unknown as z.infer<typeof listSchema>;

    const result = await listTasksPaginated(userId, {
      limit,
      offset,
      status,
      category,
      query,
      sort,
      minPriority,
      maxPriority,
      dueOnly,
      dueFrom,
      dueTo,
    });

    return res.json(result);
  })
);

tasksRouter.get(
  '/must-act',
  authMiddleware,
  validate(listSchema, 'query'),
  asyncRoute(async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { limit, offset, status } = req.query as unknown as z.infer<
      typeof listSchema
    >;

    await recomputeMustActForUser(userId);
    const result = await listMustAct({ userId, limit, offset, status });
    return res.json(result);
  })
);

tasksRouter.get(
  '/dashboard',
  authMiddleware,
  asyncRoute(async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const cacheKey = `dashboard:${userId}`;
    const cached = await cacheGet<
      DashboardSections & ReturnType<typeof summarizeActions>
    >(cacheKey);
    if (cached) return res.json(cached);

    const sections = await dashboardSections(userId);
    const actions = await query<{
      id: string;
      action_type: string;
      status: string;
      workflow_name: string | null;
      workflow_id: string | null;
    }>(
      `SELECT id, action_type, status, workflow_name, workflow_id
     FROM agent_actions
     WHERE user_id = $1
       AND created_at >= now() - interval '24 hours'
     ORDER BY created_at DESC
     LIMIT 100`,
      [userId]
    );

    const response = {
      ...sections,
      ...summarizeActions(actions.rows),
    };

    await cacheSet(cacheKey, response);
    return res.json(response);
  })
);

const patchSchema = z.object({
  status: z.enum(['open', 'snoozed', 'completed']),
});

tasksRouter.patch(
  '/:id',
  authMiddleware,
  validate(patchSchema),
  asyncRoute(async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const taskId = req.params.id;
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(taskId))
      return res.status(400).json({ error: 'Invalid task ID format' });

    const { status } = req.body as z.infer<typeof patchSchema>;

    await query(
      `UPDATE extracted_tasks SET status = $1, updated_at = now() WHERE id = $2 AND user_id = $3`,
      [status, taskId, userId]
    );

    await cacheDel(`dashboard:${userId}`);

    return res.json({ ok: true });
  })
);
