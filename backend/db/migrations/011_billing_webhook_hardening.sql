CREATE TABLE IF NOT EXISTS billing_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  signature text NOT NULL,
  billing_timestamp text NOT NULL,
  payload_hash text,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_webhook_events_received_idx
  ON billing_webhook_events (received_at DESC);
