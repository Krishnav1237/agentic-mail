import { createHmac } from 'crypto';
import { query, withTransaction } from '../db/index.js';

export const usageMetrics = [
  'emails_processed',
  'actions_suggested',
  'actions_executed',
  'followups_sent',
] as const;

export type UsageMetric = (typeof usageMetrics)[number];

type EntitlementRow = {
  user_id: string;
  plan_id: string | null;
  plan_slug: string;
  plan_name: string;
  status: string;
  limits: Record<string, number>;
  features: Record<string, unknown>;
  current_period_start: string | null;
  current_period_end: string | null;
  grace_until: string | null;
};

type PlanRow = {
  id: string;
  slug: string;
  name: string;
  limits: Record<string, number>;
  features: Record<string, unknown>;
};

const THRESHOLDS = [0.7, 0.85, 1] as const;

export const quotaSeverity = (percentage: number) => {
  if (percentage >= 1) return 'hard_stop' as const;
  if (percentage >= 0.85) return 'high' as const;
  if (percentage >= 0.7) return 'warning' as const;
  return 'none' as const;
};

const nowIso = () => new Date().toISOString();

const addDaysIso = (baseIso: string, days: number) => {
  const d = new Date(baseIso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
};

const parseJson = <T>(value: unknown, fallback: T): T => {
  if (!value) return fallback;
  if (typeof value === 'object') return value as T;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
};

const defaultPlanFallback = {
  slug: 'free',
  name: 'Free',
  limits: {
    emails_processed: 300,
    actions_suggested: 60,
    actions_executed: 20,
    followups_sent: 10,
  },
  features: {
    mailbox_count: 1,
    automation_level: 'manual',
    memory_depth_days: 14,
    support: 'community',
    followup_auto_send: false,
  },
};

const getPlanBySlug = async (slug: string) => {
  const result = await query<{
    id: string;
    slug: string;
    name: string;
    limits: unknown;
    features: unknown;
  }>(
    `SELECT id, slug, name, limits, features
     FROM billing_plans
     WHERE slug = $1
       AND active = true
     LIMIT 1`,
    [slug]
  );

  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    limits: parseJson<Record<string, number>>(row.limits, {}),
    features: parseJson<Record<string, unknown>>(row.features, {}),
  } satisfies PlanRow;
};

const getFreePlan = async () => {
  const free = await getPlanBySlug('free');
  if (free) return free;
  return {
    id: null,
    slug: defaultPlanFallback.slug,
    name: defaultPlanFallback.name,
    limits: defaultPlanFallback.limits,
    features: defaultPlanFallback.features,
  };
};

const bootstrapEntitlement = async (userId: string) => {
  const freePlan = await getFreePlan();
  const periodStart = nowIso();
  const periodEnd = addDaysIso(periodStart, 30);

  await query(
    `INSERT INTO user_entitlements (
      user_id, plan_id, plan_slug, plan_name, status, limits, features,
      current_period_start, current_period_end, grace_until, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8, NULL, now(), now())
    ON CONFLICT (user_id) DO NOTHING`,
    [
      userId,
      freePlan.id,
      freePlan.slug,
      freePlan.name,
      JSON.stringify(freePlan.limits),
      JSON.stringify(freePlan.features),
      periodStart,
      periodEnd,
    ]
  );
};

export const getCurrentEntitlement = async (userId: string) => {
  let result = await query<{
    user_id: string;
    plan_id: string | null;
    plan_slug: string;
    plan_name: string;
    status: string;
    limits: unknown;
    features: unknown;
    current_period_start: string | null;
    current_period_end: string | null;
    grace_until: string | null;
  }>(
    `SELECT user_id, plan_id, plan_slug, plan_name, status, limits, features,
            current_period_start, current_period_end, grace_until
     FROM user_entitlements
     WHERE user_id = $1`,
    [userId]
  );

  if (!result.rowCount) {
    await bootstrapEntitlement(userId);
    result = await query(
      `SELECT user_id, plan_id, plan_slug, plan_name, status, limits, features,
              current_period_start, current_period_end, grace_until
       FROM user_entitlements
       WHERE user_id = $1`,
      [userId]
    );
  }

  const row = result.rows[0];
  return {
    user_id: row.user_id,
    plan_id: row.plan_id,
    plan_slug: row.plan_slug,
    plan_name: row.plan_name,
    status: row.status,
    limits: parseJson<Record<string, number>>(row.limits, {}),
    features: parseJson<Record<string, unknown>>(row.features, {}),
    current_period_start: row.current_period_start,
    current_period_end: row.current_period_end,
    grace_until: row.grace_until,
  } satisfies EntitlementRow;
};

export const getCurrentPlan = async (userId: string) => {
  const entitlement = await getCurrentEntitlement(userId);
  const pricing = await query<{ price_usd_cents: number; interval: string }>(
    `SELECT price_usd_cents, interval
     FROM billing_plans
     WHERE slug = $1
     LIMIT 1`,
    [entitlement.plan_slug]
  );

  const price = pricing.rows[0] ?? { price_usd_cents: 0, interval: 'month' };
  return {
    ...entitlement,
    priceUsdCents: price.price_usd_cents,
    interval: price.interval,
  };
};

export const getCurrentQuotaWindows = async (userId: string) => {
  const entitlement = await getCurrentEntitlement(userId);

  const result = await query<{
    metric: string;
    used: number;
    quota_limit: number | null;
    window_start: string;
    window_end: string;
    warn_70_sent: boolean;
    warn_85_sent: boolean;
    warn_100_sent: boolean;
  }>(
    `SELECT metric, used, quota_limit, window_start, window_end,
            warn_70_sent, warn_85_sent, warn_100_sent
     FROM quota_windows
     WHERE user_id = $1
       AND window_end >= now()
     ORDER BY window_end DESC`,
    [userId]
  );

  const byMetric = new Map(result.rows.map((row) => [row.metric, row]));
  return usageMetrics.map((metric) => {
    const limit = entitlement.limits[metric] ?? null;
    const row = byMetric.get(metric);
    const used = row?.used ?? 0;
    const quotaLimit = row?.quota_limit ?? limit;
    const percentage =
      quotaLimit && quotaLimit > 0 ? Number((used / quotaLimit).toFixed(4)) : 0;
    return {
      metric,
      used,
      quotaLimit,
      percentage,
      remaining:
        quotaLimit && quotaLimit > 0 ? Math.max(quotaLimit - used, 0) : null,
      windowStart:
        row?.window_start ?? entitlement.current_period_start ?? nowIso(),
      windowEnd:
        row?.window_end ?? entitlement.current_period_end ?? addDaysIso(nowIso(), 30),
      warn70Sent: row?.warn_70_sent ?? false,
      warn85Sent: row?.warn_85_sent ?? false,
      warn100Sent: row?.warn_100_sent ?? false,
    };
  });
};

export const getQuotaWarnings = async (userId: string) => {
  const windows = await getCurrentQuotaWindows(userId);
  return windows
    .filter((window) => window.quotaLimit && window.quotaLimit > 0)
    .filter((window) => window.percentage >= 0.7)
    .map((window) => ({
      metric: window.metric,
      used: window.used,
      quotaLimit: window.quotaLimit,
      percentage: window.percentage,
      severity: quotaSeverity(window.percentage),
    }));
};

export const getRemainingQuota = async (userId: string, metric: UsageMetric) => {
  const windows = await getCurrentQuotaWindows(userId);
  const item = windows.find((window) => window.metric === metric);
  return item?.remaining ?? null;
};

export const checkQuota = async (
  userId: string,
  metric: UsageMetric,
  units = 1
) => {
  const entitlement = await getCurrentEntitlement(userId);
  const limit = entitlement.limits[metric] ?? null;
  if (!limit || limit <= 0) {
    return { allowed: true, remaining: null, limit: null, used: 0, percentage: 0 };
  }

  const windows = await getCurrentQuotaWindows(userId);
  const item = windows.find((window) => window.metric === metric);
  const used = item?.used ?? 0;
  const allowed = used + units <= limit;
  const remaining = Math.max(limit - used, 0);
  return {
    allowed,
    remaining,
    limit,
    used,
    percentage: limit > 0 ? used / limit : 0,
  };
};

const inGracePeriod = (entitlement: EntitlementRow) => {
  if (!entitlement.grace_until) return false;
  return new Date(entitlement.grace_until).getTime() >= Date.now();
};

export const consumeUsageMetric = async (input: {
  userId: string;
  metric: UsageMetric;
  units?: number;
  idempotencyKey: string;
  source?: string;
  metadata?: Record<string, unknown>;
  enforce?: boolean;
}) => {
  const units = Math.max(1, Math.trunc(input.units ?? 1));

  return withTransaction(async (client) => {
    const duplicate = await client.query<{ id: string; accepted: boolean }>(
      `SELECT id, accepted
       FROM usage_events
       WHERE user_id = $1 AND idempotency_key = $2
       LIMIT 1`,
      [input.userId, input.idempotencyKey]
    );

    if (duplicate.rowCount) {
      return {
        allowed: duplicate.rows[0].accepted,
        duplicate: true,
        idempotencyKey: input.idempotencyKey,
      };
    }

    const entitlement = await getCurrentEntitlement(input.userId);
    const limit = entitlement.limits[input.metric] ?? null;
    const periodStart = entitlement.current_period_start ?? nowIso();
    const periodEnd = entitlement.current_period_end ?? addDaysIso(periodStart, 30);

    const window = await client.query<{
      id: string;
      used: number;
      quota_limit: number | null;
      warn_70_sent: boolean;
      warn_85_sent: boolean;
      warn_100_sent: boolean;
    }>(
      `INSERT INTO quota_windows (
        user_id, metric, window_start, window_end, used, quota_limit,
        warn_70_sent, warn_85_sent, warn_100_sent, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, 0, $5, false, false, false, now(), now())
      ON CONFLICT (user_id, metric, window_start, window_end)
      DO UPDATE SET quota_limit = EXCLUDED.quota_limit, updated_at = now()
      RETURNING id, used, quota_limit, warn_70_sent, warn_85_sent, warn_100_sent`,
      [input.userId, input.metric, periodStart, periodEnd, limit]
    );

    const current = window.rows[0];
    const nextUsed = current.used + units;
    const enforce = input.enforce ?? true;
    const exceeded =
      Boolean(limit && limit > 0 && nextUsed > limit) && !inGracePeriod(entitlement);

    const accepted = !(enforce && exceeded);

    await client.query(
      `INSERT INTO usage_events (
        user_id, metric, units, accepted, idempotency_key, source, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
      [
        input.userId,
        input.metric,
        accepted ? units : 0,
        accepted,
        input.idempotencyKey,
        input.source ?? null,
        JSON.stringify(input.metadata ?? {}),
      ]
    );

    const baseUsed = accepted ? nextUsed : current.used;
    const ratio = limit && limit > 0 ? baseUsed / limit : 0;

    await client.query(
      `UPDATE quota_windows
       SET used = $2,
           warn_70_sent = warn_70_sent OR $3,
           warn_85_sent = warn_85_sent OR $4,
           warn_100_sent = warn_100_sent OR $5,
           updated_at = now()
       WHERE id = $1`,
      [
        current.id,
        baseUsed,
        ratio >= THRESHOLDS[0],
        ratio >= THRESHOLDS[1],
        ratio >= THRESHOLDS[2],
      ]
    );

    return {
      allowed: accepted,
      duplicate: false,
      idempotencyKey: input.idempotencyKey,
      used: baseUsed,
      limit,
      remaining: limit && limit > 0 ? Math.max(limit - baseUsed, 0) : null,
      percentage: limit && limit > 0 ? baseUsed / limit : 0,
      exceeded,
    };
  });
};

export const ensureBillingCustomer = async (userId: string) => {
  const existing = await query<{ id: string; provider_customer_id: string | null }>(
    `SELECT id, provider_customer_id
     FROM billing_customers
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );

  if (existing.rowCount) return existing.rows[0];

  const created = await query<{ id: string; provider_customer_id: string }>(
    `INSERT INTO billing_customers (user_id, provider, provider_customer_id, created_at, updated_at)
     VALUES ($1, 'stripe', $2, now(), now())
     RETURNING id, provider_customer_id`,
    [userId, `cus_local_${userId.replace(/-/g, '')}`]
  );

  return created.rows[0];
};

export const createCheckoutUrl = async (input: {
  userId: string;
  planSlug: string;
  checkoutBaseUrl?: string;
}) => {
  const customer = await ensureBillingCustomer(input.userId);
  const url = new URL(
    input.checkoutBaseUrl || 'https://billing.example.local/checkout'
  );
  url.searchParams.set('plan', input.planSlug);
  url.searchParams.set('customer', customer.provider_customer_id ?? customer.id);
  url.searchParams.set('user', input.userId);
  return url.toString();
};

export const createPortalUrl = async (input: {
  userId: string;
  portalBaseUrl?: string;
}) => {
  const customer = await ensureBillingCustomer(input.userId);
  const url = new URL(input.portalBaseUrl || 'https://billing.example.local/portal');
  url.searchParams.set('customer', customer.provider_customer_id ?? customer.id);
  url.searchParams.set('user', input.userId);
  return url.toString();
};

export const getBillingStatus = async (userId: string) => {
  const subscriptions = await query<{
    id: string;
    provider_subscription_id: string | null;
    status: string;
    current_period_start: string | null;
    current_period_end: string | null;
    cancel_at: string | null;
    cancelled_at: string | null;
    grace_until: string | null;
    plan_slug: string | null;
    plan_name: string | null;
  }>(
    `SELECT s.id, s.provider_subscription_id, s.status, s.current_period_start,
            s.current_period_end, s.cancel_at, s.cancelled_at, s.grace_until,
            p.slug as plan_slug, p.name as plan_name
     FROM billing_subscriptions s
     LEFT JOIN billing_plans p ON p.id = s.plan_id
     WHERE s.user_id = $1
     ORDER BY s.updated_at DESC
     LIMIT 5`,
    [userId]
  );

  return subscriptions.rows;
};

export const applyPlanToEntitlement = async (input: {
  userId: string;
  planSlug: string;
  status?: string;
  graceUntil?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  subscriptionId?: string | null;
}) => {
  const plan = await getPlanBySlug(input.planSlug);
  const selectedPlan = plan ?? (await getFreePlan());

  const periodStart = input.periodStart ?? nowIso();
  const periodEnd = input.periodEnd ?? addDaysIso(periodStart, 30);

  await query(
    `INSERT INTO user_entitlements (
      user_id, plan_id, plan_slug, plan_name, status, limits, features,
      current_period_start, current_period_end, grace_until,
      updated_from_subscription_id, updated_at, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), now())
    ON CONFLICT (user_id) DO UPDATE SET
      plan_id = EXCLUDED.plan_id,
      plan_slug = EXCLUDED.plan_slug,
      plan_name = EXCLUDED.plan_name,
      status = EXCLUDED.status,
      limits = EXCLUDED.limits,
      features = EXCLUDED.features,
      current_period_start = EXCLUDED.current_period_start,
      current_period_end = EXCLUDED.current_period_end,
      grace_until = EXCLUDED.grace_until,
      updated_from_subscription_id = EXCLUDED.updated_from_subscription_id,
      updated_at = now()`,
    [
      input.userId,
      selectedPlan.id,
      selectedPlan.slug,
      selectedPlan.name,
      input.status ?? 'active',
      JSON.stringify(selectedPlan.limits),
      JSON.stringify(selectedPlan.features),
      periodStart,
      periodEnd,
      input.graceUntil ?? null,
      input.subscriptionId ?? null,
    ]
  );
};

export const updateSubscriptionState = async (input: {
  userId: string;
  planSlug: string;
  providerSubscriptionId?: string | null;
  status: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  cancelAt?: string | null;
  cancelledAt?: string | null;
  graceUntil?: string | null;
}) => {
  const customer = await ensureBillingCustomer(input.userId);
  const plan = await getPlanBySlug(input.planSlug);

  const result = await query<{ id: string }>(
    `INSERT INTO billing_subscriptions (
      user_id, billing_customer_id, plan_id, provider, provider_subscription_id,
      status, current_period_start, current_period_end, cancel_at, cancelled_at,
      grace_until, created_at, updated_at
    ) VALUES ($1, $2, $3, 'stripe', $4, $5, $6, $7, $8, $9, $10, now(), now())
    ON CONFLICT (provider_subscription_id)
    DO UPDATE SET
      user_id = EXCLUDED.user_id,
      billing_customer_id = EXCLUDED.billing_customer_id,
      plan_id = EXCLUDED.plan_id,
      status = EXCLUDED.status,
      current_period_start = EXCLUDED.current_period_start,
      current_period_end = EXCLUDED.current_period_end,
      cancel_at = EXCLUDED.cancel_at,
      cancelled_at = EXCLUDED.cancelled_at,
      grace_until = EXCLUDED.grace_until,
      updated_at = now()
    RETURNING id`,
    [
      input.userId,
      customer.id,
      plan?.id ?? null,
      input.providerSubscriptionId ?? null,
      input.status,
      input.periodStart ?? null,
      input.periodEnd ?? null,
      input.cancelAt ?? null,
      input.cancelledAt ?? null,
      input.graceUntil ?? null,
    ]
  );

  await applyPlanToEntitlement({
    userId: input.userId,
    planSlug: input.planSlug,
    status: input.status,
    graceUntil: input.graceUntil,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    subscriptionId: result.rows[0]?.id ?? null,
  });

  return result.rows[0]?.id ?? null;
};

export const createOrUpdateInvoice = async (input: {
  userId: string;
  subscriptionId?: string | null;
  providerInvoiceId?: string | null;
  amountDueCents: number;
  amountPaidCents: number;
  status: string;
  paidAt?: string | null;
  dueAt?: string | null;
  metadata?: Record<string, unknown>;
}) => {
  await query(
    `INSERT INTO billing_invoices (
      user_id, subscription_id, provider, provider_invoice_id,
      amount_due_cents, amount_paid_cents, currency, status, paid_at, due_at, metadata, updated_at
    ) VALUES ($1, $2, 'stripe', $3, $4, $5, 'usd', $6, $7, $8, $9, now())
    ON CONFLICT (provider_invoice_id)
    DO UPDATE SET
      amount_due_cents = EXCLUDED.amount_due_cents,
      amount_paid_cents = EXCLUDED.amount_paid_cents,
      status = EXCLUDED.status,
      paid_at = EXCLUDED.paid_at,
      due_at = EXCLUDED.due_at,
      metadata = EXCLUDED.metadata,
      updated_at = now()`,
    [
      input.userId,
      input.subscriptionId ?? null,
      input.providerInvoiceId ?? null,
      input.amountDueCents,
      input.amountPaidCents,
      input.status,
      input.paidAt ?? null,
      input.dueAt ?? null,
      JSON.stringify(input.metadata ?? {}),
    ]
  );
};

export const verifyBillingWebhookSignature = (input: {
  payload: string;
  signature: string;
  secret: string;
}) => {
  const digest = createHmac('sha256', input.secret)
    .update(input.payload)
    .digest('hex');
  return digest === input.signature;
};

export const trackProductEvent = async (input: {
  userId?: string | null;
  eventName: string;
  eventValue?: number;
  properties?: Record<string, unknown>;
}) => {
  await query(
    `INSERT INTO product_events (user_id, event_name, event_value, properties, occurred_at, created_at)
     VALUES ($1, $2, $3, $4, now(), now())`,
    [
      input.userId ?? null,
      input.eventName,
      input.eventValue ?? null,
      JSON.stringify(input.properties ?? {}),
    ]
  );
};
