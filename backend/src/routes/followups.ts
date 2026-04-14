import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncRoute } from '../middleware/asyncRoute.js';
import {
  approveFollowupSchedule,
  cancelFollowupSchedule,
  getFollowupPolicy,
  listFollowupTimeline,
  updateFollowupPolicy,
  type FollowupPolicy,
} from '../services/followups.js';
import {
  ConflictError,
  NotFoundError,
  QuotaExceededError,
  ValidationError,
} from '../errors/domain.js';

export const followupsRouter = Router();

const policySchema = z.object({
  mode: z.enum(['suggest', 'draft', 'auto_send']),
  defaultDelayDays: z.number().int().min(1).max(30),
  recruiterDelayDays: z.number().int().min(1).max(30),
  cooldownHours: z.number().int().min(1).max(336),
  autoSendEnabled: z.boolean(),
  allowedSenderDomains: z.array(z.string().max(255)).default([]),
  blockedSenderDomains: z.array(z.string().max(255)).default([]),
  quietHours: z.record(z.any()).default({}),
});

const timelineSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strip();

const scheduleIdSchema = z.string().uuid();

followupsRouter.get(
  '/policy',
  authMiddleware,
  asyncRoute(async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const policy = await getFollowupPolicy(userId);
    return res.json(policy);
  })
);

followupsRouter.post(
  '/:id/cancel',
  authMiddleware,
  asyncRoute(async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const id = scheduleIdSchema.safeParse(req.params.id);
    if (!id.success) {
      throw new ValidationError('Invalid follow-up schedule ID');
    }
    const ok = await cancelFollowupSchedule({ userId, scheduleId: id.data });
    if (!ok) throw new NotFoundError('Follow-up schedule not found');
    return res.json({ ok: true, status: 'cancelled' });
  })
);

followupsRouter.post(
  '/:id/approve',
  authMiddleware,
  asyncRoute(async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const id = scheduleIdSchema.safeParse(req.params.id);
    if (!id.success) {
      throw new ValidationError('Invalid follow-up schedule ID');
    }
    const result = await approveFollowupSchedule({ userId, scheduleId: id.data });

    if (!result.ok && result.reason === 'not_found') {
      throw new NotFoundError('Follow-up schedule not found');
    }
    if (!result.ok && result.reason === 'quota_exhausted') {
      throw new QuotaExceededError({
        metric: result.metric,
        used: result.used ?? 0,
        limit: result.limit ?? 0,
        message: 'Follow-up quota exhausted for current billing window',
      });
    }
    if (!result.ok) {
      throw new ConflictError(`Cannot approve follow-up: ${result.reason}`);
    }

    return res.json({ ok: true, status: 'sent' });
  })
);

followupsRouter.put(
  '/policy',
  authMiddleware,
  validate(policySchema),
  asyncRoute(async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const policy = req.body as FollowupPolicy;
    await updateFollowupPolicy(userId, policy);
    return res.json({ ok: true });
  })
);

followupsRouter.get(
  '/timeline',
  authMiddleware,
  validate(timelineSchema, 'query'),
  asyncRoute(async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { limit, offset } = req.query as unknown as z.infer<typeof timelineSchema>;
    const timeline = await listFollowupTimeline({ userId, limit, offset });
    return res.json(timeline);
  })
);
