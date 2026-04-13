import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { ingestionQueue } from '../queues/index.js';
import { query } from '../db/index.js';
import { asyncRoute } from '../middleware/asyncRoute.js';

export const webhooksRouter = Router();

webhooksRouter.use(
  rateLimit({
    windowMs: 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

webhooksRouter.post(
  '/graph',
  asyncRoute(async (req, res) => {
    const validationToken = req.query.validationToken as string | undefined;
    if (validationToken) {
      return res.status(200).send(validationToken);
    }

    const notifications = (req.body?.value ?? []) as Array<{
      subscriptionId: string;
      clientState?: string;
    }>;

    for (const notification of notifications) {
      const result = await query<{ user_id: string; client_state: string }>(
        'SELECT user_id, client_state FROM graph_subscriptions WHERE subscription_id = $1',
        [notification.subscriptionId]
      );

      const row = result.rows[0];
      if (!row) continue;
      if (
        !notification.clientState ||
        !row.client_state ||
        notification.clientState !== row.client_state
      )
        continue;

      await ingestionQueue.add(
        'sync-user',
        { userId: row.user_id },
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
      );
    }

    return res.json({ ok: true });
  })
);
