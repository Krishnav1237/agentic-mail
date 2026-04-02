CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS emails_user_status_received_idx
  ON emails (user_id, status, received_at DESC);

CREATE INDEX IF NOT EXISTS emails_user_classification_received_idx
  ON emails (user_id, classification, received_at DESC);

CREATE INDEX IF NOT EXISTS emails_search_idx
  ON emails
  USING gin (((coalesce(subject, '') || ' ' || coalesce(sender_name, '') || ' ' || coalesce(sender_email, ''))) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS extracted_tasks_user_status_priority_due_idx
  ON extracted_tasks (user_id, status, priority_score DESC, due_at ASC);

CREATE INDEX IF NOT EXISTS extracted_tasks_user_category_priority_due_idx
  ON extracted_tasks (user_id, category, priority_score DESC, due_at ASC);

CREATE INDEX IF NOT EXISTS extracted_tasks_search_idx
  ON extracted_tasks
  USING gin (((coalesce(title, '') || ' ' || coalesce(description, ''))) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS agent_actions_user_status_created_idx
  ON agent_actions (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_user_status_scheduled_idx
  ON notifications (user_id, status, scheduled_for);
