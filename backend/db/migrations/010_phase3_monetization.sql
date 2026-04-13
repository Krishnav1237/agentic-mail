CREATE TABLE IF NOT EXISTS billing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  price_usd_cents integer NOT NULL DEFAULT 0,
  interval text NOT NULL DEFAULT 'month',
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'stripe',
  provider_customer_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  billing_customer_id uuid REFERENCES billing_customers(id) ON DELETE SET NULL,
  plan_id uuid REFERENCES billing_plans(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'stripe',
  provider_subscription_id text,
  status text NOT NULL DEFAULT 'inactive',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at timestamptz,
  cancelled_at timestamptz,
  grace_until timestamptz,
  downgrade_to_plan_id uuid REFERENCES billing_plans(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_subscriptions_user_status_idx
  ON billing_subscriptions (user_id, status, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS billing_subscriptions_provider_sub_unique_idx
  ON billing_subscriptions (provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS billing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES billing_subscriptions(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'stripe',
  provider_invoice_id text,
  amount_due_cents integer NOT NULL DEFAULT 0,
  amount_paid_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  due_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_invoices_user_created_idx
  ON billing_invoices (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS billing_invoices_provider_invoice_unique_idx
  ON billing_invoices (provider_invoice_id)
  WHERE provider_invoice_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_entitlements (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES billing_plans(id) ON DELETE SET NULL,
  plan_slug text NOT NULL DEFAULT 'free',
  plan_name text NOT NULL DEFAULT 'Free',
  status text NOT NULL DEFAULT 'active',
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_period_start timestamptz,
  current_period_end timestamptz,
  grace_until timestamptz,
  updated_from_subscription_id uuid REFERENCES billing_subscriptions(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metric text NOT NULL,
  units integer NOT NULL DEFAULT 0,
  accepted boolean NOT NULL DEFAULT true,
  idempotency_key text NOT NULL,
  source text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS usage_events_user_metric_created_idx
  ON usage_events (user_id, metric, created_at DESC);

CREATE TABLE IF NOT EXISTS quota_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metric text NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  used integer NOT NULL DEFAULT 0,
  quota_limit integer,
  warn_70_sent boolean NOT NULL DEFAULT false,
  warn_85_sent boolean NOT NULL DEFAULT false,
  warn_100_sent boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, metric, window_start, window_end)
);

CREATE INDEX IF NOT EXISTS quota_windows_user_metric_window_idx
  ON quota_windows (user_id, metric, window_end DESC);

CREATE TABLE IF NOT EXISTS must_act_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_id uuid REFERENCES emails(id) ON DELETE SET NULL,
  task_id uuid REFERENCES extracted_tasks(id) ON DELETE SET NULL,
  source_type text NOT NULL DEFAULT 'task',
  title text NOT NULL,
  subject text,
  sender_name text,
  sender_email text,
  why_reason text,
  risk_tier text NOT NULL DEFAULT 'medium',
  confidence numeric(4,3) NOT NULL DEFAULT 0,
  score numeric(8,4) NOT NULL DEFAULT 0,
  deadline_at timestamptz,
  suggested_bundle jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'open',
  deferred_until timestamptz,
  acted_at timestamptz,
  action_result jsonb,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS must_act_items_user_task_unique_idx
  ON must_act_items (user_id, task_id)
  WHERE task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS must_act_items_user_status_score_idx
  ON must_act_items (user_id, status, score DESC, deadline_at ASC);

CREATE TABLE IF NOT EXISTS followup_policies (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'suggest',
  default_delay_days integer NOT NULL DEFAULT 3,
  recruiter_delay_days integer NOT NULL DEFAULT 2,
  cooldown_hours integer NOT NULL DEFAULT 24,
  auto_send_enabled boolean NOT NULL DEFAULT false,
  allowed_sender_domains jsonb NOT NULL DEFAULT '[]'::jsonb,
  blocked_sender_domains jsonb NOT NULL DEFAULT '[]'::jsonb,
  quiet_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS followup_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id text NOT NULL,
  email_id uuid REFERENCES emails(id) ON DELETE SET NULL,
  thread_type text NOT NULL DEFAULT 'general',
  state text NOT NULL DEFAULT 'open',
  last_contact_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  waiting_on text,
  next_action_at timestamptz,
  outcome_status text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, thread_id)
);

CREATE TABLE IF NOT EXISTS followup_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_state_id uuid REFERENCES followup_threads(id) ON DELETE CASCADE,
  email_id uuid REFERENCES emails(id) ON DELETE SET NULL,
  action text NOT NULL DEFAULT 'draft_followup',
  status text NOT NULL DEFAULT 'pending',
  scheduled_for timestamptz NOT NULL,
  sent_at timestamptz,
  cancelled_at timestamptz,
  idempotency_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS followup_schedules_user_status_scheduled_idx
  ON followup_schedules (user_id, status, scheduled_for);

CREATE TABLE IF NOT EXISTS product_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  event_name text NOT NULL,
  event_value numeric(12,4),
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_events_name_occurred_idx
  ON product_events (event_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS product_events_user_occurred_idx
  ON product_events (user_id, occurred_at DESC);

INSERT INTO billing_plans (slug, name, price_usd_cents, interval, limits, features, active)
VALUES
  ('free', 'Free', 0, 'month',
    '{"emails_processed":300,"actions_suggested":60,"actions_executed":20,"followups_sent":10}'::jsonb,
    '{"mailbox_count":1,"automation_level":"manual","memory_depth_days":14,"support":"community","followup_auto_send":false}'::jsonb,
    true),
  ('pro', 'Pro', 1900, 'month',
    '{"emails_processed":3000,"actions_suggested":600,"actions_executed":250,"followups_sent":120}'::jsonb,
    '{"mailbox_count":1,"automation_level":"guarded","memory_depth_days":90,"support":"email_48h","followup_auto_send":true}'::jsonb,
    true),
  ('power', 'Power', 4900, 'month',
    '{"emails_processed":10000,"actions_suggested":2000,"actions_executed":1000,"followups_sent":500}'::jsonb,
    '{"mailbox_count":2,"automation_level":"advanced","memory_depth_days":365,"support":"priority_24h","followup_auto_send":true}'::jsonb,
    true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  price_usd_cents = EXCLUDED.price_usd_cents,
  interval = EXCLUDED.interval,
  limits = EXCLUDED.limits,
  features = EXCLUDED.features,
  active = EXCLUDED.active,
  updated_at = now();
