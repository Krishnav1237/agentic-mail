CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ms_user_id text,
  email text NOT NULL,
  display_name text,
  tenant_id text,
  ms_access_token text,
  ms_refresh_token text,
  ms_token_expires_at timestamptz,
  google_user_id text,
  google_access_token text,
  google_refresh_token text,
  google_token_expires_at timestamptz,
  primary_provider text NOT NULL DEFAULT 'microsoft',
  data_retention_days integer NOT NULL DEFAULT 180,
  last_sync_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users (email);

CREATE TABLE IF NOT EXISTS emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id text NOT NULL,
  thread_id text,
  subject text,
  sender_email text,
  sender_name text,
  received_at timestamptz,
  body_preview text,
  importance text,
  raw_json jsonb,
  ai_json jsonb,
  classification text,
  ai_score numeric(5,4),
  processed_at timestamptz,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, message_id)
);

CREATE INDEX IF NOT EXISTS emails_user_received_idx ON emails (user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS emails_message_idx ON emails (message_id);
CREATE INDEX IF NOT EXISTS emails_user_status_received_idx ON emails (user_id, status, received_at DESC);
CREATE INDEX IF NOT EXISTS emails_user_classification_received_idx ON emails (user_id, classification, received_at DESC);
CREATE INDEX IF NOT EXISTS emails_search_idx
  ON emails
  USING gin (((coalesce(subject, '') || ' ' || coalesce(sender_name, '') || ' ' || coalesce(sender_email, ''))) gin_trgm_ops);

CREATE TABLE IF NOT EXISTS extracted_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_id uuid NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  due_at timestamptz,
  link text,
  category text,
  status text DEFAULT 'open',
  priority_score numeric(6,4) DEFAULT 0,
  source_type text DEFAULT 'email',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS extracted_tasks_user_due_idx ON extracted_tasks (user_id, due_at);
CREATE INDEX IF NOT EXISTS extracted_tasks_user_status_priority_due_idx
  ON extracted_tasks (user_id, status, priority_score DESC, due_at ASC);
CREATE INDEX IF NOT EXISTS extracted_tasks_user_category_priority_due_idx
  ON extracted_tasks (user_id, category, priority_score DESC, due_at ASC);
CREATE INDEX IF NOT EXISTS extracted_tasks_search_idx
  ON extracted_tasks
  USING gin (((coalesce(title, '') || ' ' || coalesce(description, ''))) gin_trgm_ops);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_behavior_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_id uuid REFERENCES emails(id) ON DELETE SET NULL,
  action text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS behavior_user_created_idx ON user_behavior_logs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES extracted_tasks(id) ON DELETE CASCADE,
  type text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  sent_at timestamptz,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS graph_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id text NOT NULL,
  resource text NOT NULL,
  expiration_date_time timestamptz NOT NULL,
  client_state text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS graph_subscriptions_user_idx ON graph_subscriptions (user_id, subscription_id);

CREATE TABLE IF NOT EXISTS user_goals (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  goals jsonb NOT NULL DEFAULT '[]'::jsonb,
  autopilot_level smallint NOT NULL DEFAULT 0,
  personality_mode text NOT NULL DEFAULT 'proactive',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_id uuid NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  workflow_id text,
  workflow_name text,
  action_type text NOT NULL,
  action_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric(4,3),
  decision_reason text,
  status text NOT NULL DEFAULT 'pending',
  requires_approval boolean NOT NULL DEFAULT false,
  idempotency_key text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_actions_unique_idx ON agent_actions (user_id, email_id, action_type, idempotency_key);
CREATE INDEX IF NOT EXISTS agent_actions_user_status_created_idx ON agent_actions (user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_type text NOT NULL,
  plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_reflections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES agent_plans(id) ON DELETE SET NULL,
  reflection jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS decision_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES agent_plans(id) ON DELETE SET NULL,
  workflow_id text,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  reasoning jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision jsonb NOT NULL DEFAULT '{}'::jsonb,
  action jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_activity_feed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  summary_date date NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_activity_feed_unique_idx ON agent_activity_feed (user_id, summary_date);

CREATE TABLE IF NOT EXISTS episodic_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcome jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_id uuid REFERENCES emails(id) ON DELETE SET NULL,
  step text NOT NULL,
  message text,
  data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memory_store (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope text NOT NULL,
  key text NOT NULL,
  value jsonb NOT NULL,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, scope, key)
);

CREATE INDEX IF NOT EXISTS memory_scope_idx ON memory_store (user_id, scope);
CREATE INDEX IF NOT EXISTS notifications_user_status_scheduled_idx ON notifications (user_id, status, scheduled_for);

CREATE TABLE IF NOT EXISTS llm_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workflow_key text NOT NULL DEFAULT '__all__',
  provider text NOT NULL,
  model text NOT NULL,
  operation text NOT NULL,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  latency_ms integer NOT NULL DEFAULT 0,
  estimated_cost numeric(12,6) NOT NULL DEFAULT 0,
  actions_created integer NOT NULL DEFAULT 0,
  successful_actions integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS llm_usage_events_user_created_idx ON llm_usage_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS llm_usage_events_user_workflow_idx ON llm_usage_events (user_id, workflow_key, created_at DESC);

CREATE TABLE IF NOT EXISTS llm_cost_daily_aggregates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  summary_date date NOT NULL,
  workflow_key text NOT NULL DEFAULT '__all__',
  total_requests integer NOT NULL DEFAULT 0,
  prompt_tokens bigint NOT NULL DEFAULT 0,
  completion_tokens bigint NOT NULL DEFAULT 0,
  total_tokens bigint NOT NULL DEFAULT 0,
  total_cost numeric(12,6) NOT NULL DEFAULT 0,
  actions_created integer NOT NULL DEFAULT 0,
  successful_actions integer NOT NULL DEFAULT 0,
  cost_per_action numeric(12,6) NOT NULL DEFAULT 0,
  cost_per_successful_action numeric(12,6) NOT NULL DEFAULT 0,
  cost_per_workflow numeric(12,6) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, summary_date, workflow_key)
);

CREATE INDEX IF NOT EXISTS llm_cost_daily_user_summary_idx ON llm_cost_daily_aggregates (user_id, summary_date DESC);

CREATE TABLE IF NOT EXISTS waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);
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
