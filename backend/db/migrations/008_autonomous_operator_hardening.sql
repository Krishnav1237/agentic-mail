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

CREATE INDEX IF NOT EXISTS llm_usage_events_user_created_idx
  ON llm_usage_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS llm_usage_events_user_workflow_idx
  ON llm_usage_events (user_id, workflow_key, created_at DESC);

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

CREATE INDEX IF NOT EXISTS llm_cost_daily_user_summary_idx
  ON llm_cost_daily_aggregates (user_id, summary_date DESC);
