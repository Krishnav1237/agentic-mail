ALTER TABLE agent_actions ADD COLUMN IF NOT EXISTS workflow_id text;
ALTER TABLE agent_actions ADD COLUMN IF NOT EXISTS workflow_name text;

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
