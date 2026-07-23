CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User Credentials (encrypted OAuth tokens)
CREATE TABLE IF NOT EXISTS user_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'google',
  key_version INTEGER NOT NULL DEFAULT 1,
  encrypted_access_token TEXT NOT NULL,
  encrypted_refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  scopes TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user_provider UNIQUE(user_id, provider)
);

-- Provider Sync States (Gmail cursors & status)
CREATE TABLE IF NOT EXISTS provider_sync_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'google',
  history_id TEXT,
  last_synced_at TIMESTAMPTZ,
  sync_status TEXT NOT NULL DEFAULT 'idle', -- idle, syncing, error
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user_sync_provider UNIQUE(user_id, provider)
);

-- Email Threads table
CREATE TABLE IF NOT EXISTS email_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  google_thread_id TEXT NOT NULL,
  snippet TEXT,
  history_id TEXT,
  message_count INTEGER DEFAULT 1,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user_google_thread UNIQUE(user_id, google_thread_id)
);

-- Emails table with message uniqueness constraint
CREATE TABLE IF NOT EXISTS emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  google_message_id TEXT NOT NULL,
  google_thread_id TEXT,
  thread_id UUID REFERENCES email_threads(id) ON DELETE SET NULL,
  sender_email TEXT,
  sender_name TEXT,
  subject TEXT,
  body_text TEXT,
  received_at TIMESTAMPTZ,
  classification TEXT, -- recruiter, newsletter, action_required, etc.
  ai_score INTEGER DEFAULT 0,
  status TEXT DEFAULT 'unread',
  raw_payload JSONB,
  processed_at TIMESTAMPTZ,
  extraction_version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user_google_message UNIQUE(user_id, google_message_id)
);

-- Unified Actions table (obligations & follow-ups)
CREATE TABLE IF NOT EXISTS actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_id UUID REFERENCES emails(id) ON DELETE SET NULL,
  idempotency_key TEXT UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  due_at TIMESTAMPTZ,
  has_exact_time BOOLEAN NOT NULL DEFAULT FALSE,
  iana_timezone TEXT NOT NULL DEFAULT 'UTC',
  priority_score INTEGER DEFAULT 50,
  status TEXT NOT NULL DEFAULT 'open', -- open, snoozed, completed, archived, cancelled
  is_gold BOOLEAN DEFAULT FALSE,
  gold_reason TEXT,
  prepared_work JSONB,
  deadline_state JSONB,
  dependency_context JSONB,
  source_context JSONB,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Opportunities table
CREATE TABLE IF NOT EXISTS opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_id UUID REFERENCES emails(id) ON DELETE SET NULL,
  idempotency_key TEXT UNIQUE,
  title TEXT NOT NULL,
  company_or_source TEXT,
  description TEXT,
  opportunity_type TEXT, -- internship, recruiter, event, introduction
  status TEXT NOT NULL DEFAULT 'surfaced', -- surfaced, saved, applied, dismissed
  is_gold BOOLEAN DEFAULT FALSE,
  gold_reason TEXT,
  source_context JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Approvals table (prepared AI executions awaiting permission)
CREATE TABLE IF NOT EXISTS approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_id UUID REFERENCES emails(id) ON DELETE SET NULL,
  idempotency_key TEXT UNIQUE,
  action_type TEXT NOT NULL, -- draft_reply, send_reply, archive_email, etc.
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, modified, rejected, executed, cancelled, failed
  prepared_payload JSONB NOT NULL,
  decision_reason TEXT,
  confidence DOUBLE PRECISION,
  scheduled_at TIMESTAMPTZ,
  snoozed_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Agent Executions (separate from product actions)
CREATE TABLE IF NOT EXISTS agent_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT UNIQUE,
  trigger_type TEXT NOT NULL,
  input_state_hash TEXT,
  execution_log JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Immutable Audit Events table
CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL, -- system, user, agent
  details JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit Events Immutability Trigger
CREATE OR REPLACE FUNCTION prevent_audit_events_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit events are immutable and cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_events_immutable_trigger ON audit_events;
CREATE TRIGGER audit_events_immutable_trigger
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_audit_events_mutation();

-- User Preferences & Automation Policies
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  autopilot_level INTEGER NOT NULL DEFAULT 1, -- 0: Manual, 1: Proactive, 2: Autonomous
  personality_mode TEXT NOT NULL DEFAULT 'proactive',
  reply_tone TEXT NOT NULL DEFAULT 'learn',
  iana_timezone TEXT NOT NULL DEFAULT 'UTC',
  automation_policies JSONB NOT NULL DEFAULT '{
    "drafting": "ask_me",
    "archiving": "suggest_only",
    "labeling": "auto",
    "follow_ups": "suggest_only"
  }'::jsonb,
  priority_weights JSONB NOT NULL DEFAULT '{
    "academic": 1.0,
    "career": 1.0,
    "personal": 0.8
  }'::jsonb,
  sync_interval_minutes INTEGER NOT NULL DEFAULT 15,
  action_retention_days INTEGER NOT NULL DEFAULT 7,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Memory Store
CREATE TABLE IF NOT EXISTS memory_store (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  memory_type TEXT NOT NULL, -- episodic, policy, pattern
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- LLM Usage Events & Cost Tracking
CREATE TABLE IF NOT EXISTS llm_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  total_cost NUMERIC(10, 6) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_emails_user_received ON emails(user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_actions_user_status_due ON actions(user_id, status, due_at ASC);
CREATE INDEX IF NOT EXISTS idx_opportunities_user_status ON opportunities(user_id, status);
CREATE INDEX IF NOT EXISTS idx_approvals_user_status ON approvals(user_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_events_user_created ON audit_events(user_id, created_at DESC);
