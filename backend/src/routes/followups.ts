import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncRoute } from '../middleware/asyncRoute.js';
import {
  getFollowupPolicy,
  listFollowupTimeline,
  updateFollowupPolicy,
  type FollowupPolicy,
} from '../services/followups.js';

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
