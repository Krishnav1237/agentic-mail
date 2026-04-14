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
import {
  getSenderPolicyRules,
  updateSenderPolicyRules,
} from '../services/policyRules.js';
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

const senderPolicyRuleSchema = z.object({
  senderKey: z.string().min(3).max(320),
  mode: z.enum(['always', 'never', 'suggest_only']),
  actionTypes: z.array(z.string().min(1).max(120)).max(50).optional(),
});

const senderPolicyRulesSchema = z.object({
  rules: z.array(senderPolicyRuleSchema).max(500),
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

preferencesRouter.get(
  '/policy-rules',
  authMiddleware,
  asyncRoute(async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const rules = await getSenderPolicyRules(userId);
    return res.json({ rules });
  })
);

preferencesRouter.put(
  '/policy-rules',
  authMiddleware,
  validate(senderPolicyRulesSchema),
  asyncRoute(async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { rules } = req.body as z.infer<typeof senderPolicyRulesSchema>;
    const updated = await updateSenderPolicyRules(userId, rules);
    return res.json({ ok: true, rules: updated });
  })
);
