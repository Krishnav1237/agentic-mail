import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { env } from '../config/env.js';
import {
  getUserPreferences,
  updateUserPreferences,
} from '../services/preferences.js';
import {
  getUserRetentionDays,
  setUserRetentionDays,
} from '../services/privacy.js';
import { asyncRoute } from '../middleware/asyncRoute.js';

export const preferencesRouter = Router();

preferencesRouter.get(
  '/',
  authMiddleware,
  asyncRoute(async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const weights = await getUserPreferences(userId);
    return res.json({ weights });
  })
);

const preferencesSchema = z.object({
  weights: z.record(z.number().min(0).max(10)),
});

preferencesRouter.put(
  '/',
  authMiddleware,
  validate(preferencesSchema),
  asyncRoute(async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { weights } = req.body as z.infer<typeof preferencesSchema>;

    await updateUserPreferences(userId, weights);
    return res.json({ ok: true });
  })
);

preferencesRouter.get(
  '/privacy',
  authMiddleware,
  asyncRoute(async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const retentionDays = await getUserRetentionDays(userId);
    return res.json({ retentionDays });
  })
);

const privacySchema = z.object({
  retentionDays: z
    .number()
    .int()
    .min(env.dataRetentionMinDays)
    .max(env.dataRetentionMaxDays),
});

preferencesRouter.put(
  '/privacy',
  authMiddleware,
  validate(privacySchema),
  asyncRoute(async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { retentionDays } = req.body as z.infer<typeof privacySchema>;
    const updated = await setUserRetentionDays(userId, retentionDays);
    return res.json({ ok: true, retentionDays: updated });
  })
);
