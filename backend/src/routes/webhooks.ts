import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { ingestionQueue } from '../queues/index.js';
import { query } from '../db/index.js';
import { asyncRoute } from '../middleware/asyncRoute.js';
import { env } from '../config/env.js';
import {
  applyPlanToEntitlement,
  createOrUpdateInvoice,
  trackProductEvent,
  updateSubscriptionState,
  verifyBillingWebhookSignature,
} from '../services/billing.js';
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

webhooksRouter.post(
  '/billing',
  asyncRoute(async (req, res) => {
    const signature = req.header('x-billing-signature');
    if (env.billingWebhookSecret) {
      if (!signature) {
        return res.status(401).json({ error: 'Missing billing signature' });
      }
      const valid = verifyBillingWebhookSignature({
        payload: JSON.stringify(req.body ?? {}),
        signature,
        secret: env.billingWebhookSecret,
      });
      if (!valid) {
        return res.status(401).json({ error: 'Invalid billing signature' });
      }
    }

    const type = String(req.body?.type ?? '').trim();
    const data = req.body?.data ?? {};
    const userId = String(data.userId ?? '').trim();
    if (!type || !userId) {
      return res
        .status(400)
        .json({ error: 'Missing type or userId in billing webhook payload' });
    }

    if (type === 'subscription.updated' || type === 'subscription.created') {
      await updateSubscriptionState({
        userId,
        planSlug: String(data.planSlug ?? 'free'),
        providerSubscriptionId: (data.subscriptionId as string | undefined) ?? null,
        status: String(data.status ?? 'active'),
        periodStart: (data.periodStart as string | undefined) ?? null,
        periodEnd: (data.periodEnd as string | undefined) ?? null,
        cancelAt: (data.cancelAt as string | undefined) ?? null,
        cancelledAt: (data.cancelledAt as string | undefined) ?? null,
        graceUntil: (data.graceUntil as string | undefined) ?? null,
      });
    }

    if (type === 'invoice.paid' || type === 'invoice.payment_failed') {
      await createOrUpdateInvoice({
        userId,
        providerInvoiceId: (data.invoiceId as string | undefined) ?? null,
        subscriptionId: (data.subscriptionId as string | undefined) ?? null,
        amountDueCents: Number(data.amountDueCents ?? 0),
        amountPaidCents: Number(data.amountPaidCents ?? 0),
        status: type === 'invoice.paid' ? 'paid' : 'failed',
        paidAt: type === 'invoice.paid' ? new Date().toISOString() : null,
        dueAt: (data.dueAt as string | undefined) ?? null,
        metadata: data,
      });

      if (type === 'invoice.payment_failed') {
        await applyPlanToEntitlement({
          userId,
          planSlug: String(data.planSlug ?? 'free'),
          status: 'past_due',
          graceUntil: new Date(
            Date.now() + 3 * 24 * 60 * 60 * 1000
          ).toISOString(),
          periodStart: (data.periodStart as string | undefined) ?? null,
          periodEnd: (data.periodEnd as string | undefined) ?? null,
        });
      }
    }

    await trackProductEvent({
      userId,
      eventName: 'billing_webhook_received',
      properties: { type },
    });

    return res.json({ ok: true });
  })
);
