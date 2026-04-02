import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  getUserPreferences,
  updateUserPreferences,
} from '../services/preferences.js';
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
