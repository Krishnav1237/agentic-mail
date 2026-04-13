import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { ingestionQueue } from '../queues/index.js';
import { query } from '../db/index.js';
import { asyncRoute } from '../middleware/asyncRoute.js';
import {
  type GraphNotification,
  type GraphSubscriptionRow,
  shouldEnqueueGraphNotification,
} from './webhooksGuard.js';

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

    const notifications = (req.body?.value ?? []) as GraphNotification[];

    for (const notification of notifications) {
      const result = await query<GraphSubscriptionRow>(
        'SELECT user_id, client_state FROM graph_subscriptions WHERE subscription_id = $1',
        [notification.subscriptionId]
      );

      const row = result.rows[0];
      if (!shouldEnqueueGraphNotification(notification, row)) continue;

      await ingestionQueue.add(
        'sync-user',
        { userId: row.user_id },
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
      );
    }

    return res.json({ ok: true });
  })
);
