-- Migration 003: Classification & Structured Extraction Pipeline

-- Extraction Runs table (tracking prompt version, schema, latency & LLM cost per email)
CREATE TABLE IF NOT EXISTS extraction_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  prompt_version TEXT NOT NULL DEFAULT 'v1',
  schema_version TEXT NOT NULL DEFAULT 'v1',
  model TEXT NOT NULL,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost NUMERIC(10, 6) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running', -- running, completed, failed
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Email Intelligence table (persisted structured LLM output)
CREATE TABLE IF NOT EXISTS email_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  extraction_version INTEGER NOT NULL DEFAULT 1,
  intent_classification TEXT NOT NULL, -- recruiter, internship, newsletter, spam, operational, meeting, task
  sender_classification TEXT NOT NULL, -- recruiter, peer, institution, automated, spam
  priority_score INTEGER NOT NULL DEFAULT 50, -- 0 to 100
  urgency_score INTEGER NOT NULL DEFAULT 50, -- 0 to 100
  is_noise BOOLEAN NOT NULL DEFAULT FALSE,
  action_candidates JSONB DEFAULT '[]'::jsonb,
  deadline_candidates JSONB DEFAULT '[]'::jsonb,
  opportunity_candidates JSONB DEFAULT '[]'::jsonb,
  extracted_reasoning TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_email_extraction_version UNIQUE(email_id, extraction_version)
);

-- Indexes for intelligence lookups
CREATE INDEX IF NOT EXISTS idx_extraction_runs_email ON extraction_runs(email_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_intelligence_user_version ON email_intelligence(user_id, extraction_version);
