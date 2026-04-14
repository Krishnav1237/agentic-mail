import { Router, type Response } from 'express';
import { z } from 'zod';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncRoute } from '../middleware/asyncRoute.js';
import { reopenMustAct, updateMustAct } from '../services/mustAct.js';

export const mustActRouter = Router();

const actionSchema = z.object({
  deferredUntil: z.string().optional(),
  notes: z.string().max(500).optional(),
  payload: z.record(z.any()).optional(),
});

const validId = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const statusHandler =
  (status: 'approved' | 'rejected' | 'deferred' | 'edited') =>
  async (req: AuthRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const mustActId = req.params.id;
    if (!validId(mustActId)) {
      return res.status(400).json({ error: 'Invalid must-act ID format' });
    }

    const body = req.body as z.infer<typeof actionSchema>;
    const ok = await updateMustAct({
      userId,
      mustActId,
      status,
      deferredUntil: body.deferredUntil,
      actionResult: {
        notes: body.notes ?? null,
        payload: body.payload ?? null,
      },
    });

    if (!ok) return res.status(404).json({ error: 'Must-act item not found' });
    return res.json({ ok: true, status });
  };

mustActRouter.post(
  '/:id/approve',
  authMiddleware,
  validate(actionSchema),
  asyncRoute(statusHandler('approved'))
);
mustActRouter.post(
  '/:id/reject',
  authMiddleware,
  validate(actionSchema),
  asyncRoute(statusHandler('rejected'))
);
mustActRouter.post(
  '/:id/defer',
  authMiddleware,
  validate(actionSchema),
  asyncRoute(statusHandler('deferred'))
);
mustActRouter.post(
  '/:id/edit',
  authMiddleware,
  validate(actionSchema),
  asyncRoute(statusHandler('edited'))
);

mustActRouter.post(
  '/:id/reopen',
  authMiddleware,
  asyncRoute(async (req: AuthRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const mustActId = req.params.id;
    if (!validId(mustActId)) {
      return res.status(400).json({ error: 'Invalid must-act ID format' });
    }

    const ok = await reopenMustAct({ userId, mustActId });
    if (!ok) return res.status(404).json({ error: 'Must-act item not found' });
    return res.json({ ok: true, status: 'open' });
  })
);
