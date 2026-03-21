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
  USING gin ((concat_ws(' ', coalesce(subject, ''), coalesce(sender_name, ''), coalesce(sender_email, ''))) gin_trgm_ops);

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
  USING gin ((concat_ws(' ', coalesce(title, ''), coalesce(description, ''))) gin_trgm_ops);

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
