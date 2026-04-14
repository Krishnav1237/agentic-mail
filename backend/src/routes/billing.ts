import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncRoute } from '../middleware/asyncRoute.js';
import { env } from '../config/env.js';
import {
  createCheckoutUrl,
  createPortalUrl,
  getBillingStatus,
  getCurrentEntitlement,
  getCurrentPlan,
  getCurrentQuotaWindows,
  getQuotaWarnings,
  trackProductEvent,
} from '../services/billing.js';

export const billingRouter = Router();

const checkoutSchema = z.object({
  planSlug: z.enum(['free', 'pro', 'power']),
});

const downgradeSchema = z.object({
  planSlug: z.enum(['free', 'pro']),
});

billingRouter.get(
  '/plan',
  authMiddleware,
  asyncRoute(async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const plan = await getCurrentPlan(userId);
    return res.json(plan);
  })
);

billingRouter.get(
  '/usage',
  authMiddleware,
  asyncRoute(async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const usage = await getCurrentQuotaWindows(userId);
    return res.json({ usage });
  })
);

billingRouter.get(
  '/limits',
  authMiddleware,
  asyncRoute(async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const entitlement = await getCurrentEntitlement(userId);
    return res.json({
      planSlug: entitlement.plan_slug,
      planName: entitlement.plan_name,
      limits: entitlement.limits,
      features: entitlement.features,
    });
  })
);

billingRouter.get(
  '/status',
  authMiddleware,
  asyncRoute(async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const status = await getBillingStatus(userId);
    return res.json({ subscriptions: status });
  })
);

billingRouter.get(
  '/warnings',
  authMiddleware,
  asyncRoute(async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const warnings = await getQuotaWarnings(userId);
    return res.json({ warnings });
  })
);

billingRouter.post(
  '/checkout',
  authMiddleware,
  validate(checkoutSchema),
  asyncRoute(async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { planSlug } = req.body as z.infer<typeof checkoutSchema>;
    const checkoutUrl = await createCheckoutUrl({
      userId,
      planSlug,
      checkoutBaseUrl: env.billingCheckoutBaseUrl,
    });

    await trackProductEvent({
      userId,
      eventName: 'billing_checkout_started',
      properties: { planSlug },
    });

    return res.json({ ok: true, checkoutUrl });
  })
);

billingRouter.post(
  '/portal',
  authMiddleware,
  asyncRoute(async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const portalUrl = await createPortalUrl({
      userId,
      portalBaseUrl: env.billingPortalBaseUrl,
    });
    return res.json({ ok: true, portalUrl });
  })
);

billingRouter.post(
  '/subscription/downgrade',
  authMiddleware,
  validate(downgradeSchema),
  asyncRoute(async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { planSlug } = req.body as z.infer<typeof downgradeSchema>;
    await trackProductEvent({
      userId,
      eventName: 'billing_downgrade_requested',
      properties: { planSlug },
    });

    return res.status(409).json({
      error: {
        code: 'provider_confirmation_required',
        message:
          'Subscription changes are applied only after provider-confirmed billing webhooks.',
      },
    });
  })
);

billingRouter.post(
  '/subscription/cancel',
  authMiddleware,
  asyncRoute(async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    await trackProductEvent({ userId, eventName: 'billing_cancel_requested' });
    return res.status(409).json({
      error: {
        code: 'provider_confirmation_required',
        message:
          'Subscription changes are applied only after provider-confirmed billing webhooks.',
      },
    });
  })
);

billingRouter.post(
  '/subscription/resume',
  authMiddleware,
  asyncRoute(async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    await trackProductEvent({ userId, eventName: 'billing_resume_requested' });
    return res.status(409).json({
      error: {
        code: 'provider_confirmation_required',
        message:
          'Subscription changes are applied only after provider-confirmed billing webhooks.',
      },
    });
  })
);
