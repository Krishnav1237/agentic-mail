import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createHash } from 'crypto';
import { ingestionQueue } from '../queues/index.js';
import { query } from '../db/index.js';
import { asyncRoute } from '../middleware/asyncRoute.js';
import { env } from '../config/env.js';
import {
  applyPlanToEntitlement,
  createOrUpdateInvoice,
  isBillingWebhookTimestampFresh,
  trackProductEvent,
  updateSubscriptionState,
  verifyBillingWebhookSignature,
  recordBillingWebhookEvent,
} from '../services/billing.js';
import { ConflictError, ValidationError } from '../errors/domain.js';
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
        {
          jobId: `sync-user:${row.user_id}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 200,
          removeOnFail: 500,
        }
      );
    }

    return res.json({ ok: true });
  })
);

webhooksRouter.post(
  '/billing',
  asyncRoute(async (req, res) => {
    if (!env.billingWebhookSecret) {
      return res.status(503).json({
        error: {
          code: 'billing_webhook_disabled',
          message: 'Billing webhook processing is disabled on this environment.',
        },
      });
    }

    const rawBodyBuffer = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === 'string' ? req.body : '');
    const rawBody = rawBodyBuffer.toString('utf8');
    if (!rawBody) {
      throw new ValidationError('Empty billing webhook payload');
    }

    const signature = req.header('x-billing-signature')?.trim();
    const timestamp = req.header('x-billing-timestamp')?.trim();
    const eventId = req.header('x-billing-event-id')?.trim();
    if (!signature || !timestamp || !eventId) {
      return res.status(401).json({
        error: {
          code: 'invalid_billing_webhook_headers',
          message:
            'Missing required billing webhook headers (signature, timestamp, event id)',
        },
      });
    }

    if (!isBillingWebhookTimestampFresh(timestamp)) {
      return res.status(401).json({
        error: { code: 'stale_billing_webhook', message: 'Stale billing webhook timestamp' },
      });
    }

    const valid = verifyBillingWebhookSignature({
      rawBody,
      timestamp,
      signature,
      secret: env.billingWebhookSecret,
    });
    if (!valid) {
      return res.status(401).json({
        error: { code: 'invalid_billing_signature', message: 'Invalid billing signature' },
      });
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      throw new ValidationError('Invalid JSON billing webhook payload');
    }

    const type = String(payload?.type ?? '').trim();
    const data = (payload?.data ?? {}) as Record<string, unknown>;
    const userId = String(data.userId ?? '').trim();
    if (!type || !userId) {
      throw new ValidationError('Missing type or userId in billing webhook payload');
    }

    const accepted = await recordBillingWebhookEvent({
      eventId,
      eventType: type,
      userId,
      signature,
      timestamp,
      payloadHash: createHash('sha256').update(rawBody).digest('hex'),
    });
    if (!accepted) {
      throw new ConflictError('Duplicate billing webhook event', 'billing_event_replayed', {
        eventId,
      });
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
