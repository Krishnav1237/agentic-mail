import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { recordFeedback } from '../services/feedback.js';

export const feedbackRouter = Router();

const feedbackSchema = z.object({
  emailId: z.string().uuid().optional(),
  action: z.string().min(1).max(50),
  category: z.string().max(50).optional(),
  metadata: z.record(z.any()).optional()
});

feedbackRouter.post('/', authMiddleware, validate(feedbackSchema), async (req: AuthRequest, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { emailId, action, category, metadata } = req.body as z.infer<typeof feedbackSchema>;

  await recordFeedback({ userId, emailId, action, category, metadata });
  return res.json({ ok: true });
});
