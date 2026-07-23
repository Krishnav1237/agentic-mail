-- Migration 002: Gmail Ingestion Engine & Sync Runs

-- Sync Runs table (initial, incremental, reconciliation tracking)
CREATE TABLE IF NOT EXISTS sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL, -- initial, incremental, reconciliation
  status TEXT NOT NULL DEFAULT 'pending', -- pending, running, completed, failed
  history_id_start TEXT,
  history_id_end TEXT,
  messages_processed INTEGER DEFAULT 0,
  threads_processed INTEGER DEFAULT 0,
  created_count INTEGER DEFAULT 0,
  updated_count INTEGER DEFAULT 0,
  deleted_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  is_truncated BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique index ensuring only one active (pending/running) sync run per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_runs_active_user
  ON sync_runs (user_id)
  WHERE status IN ('pending', 'running');

-- Add ingestion & AI statuses, deletion flag, labels, and attachment metadata to emails
ALTER TABLE emails
  ADD COLUMN IF NOT EXISTS ingestion_status TEXT NOT NULL DEFAULT 'ingested',
  ADD COLUMN IF NOT EXISTS ai_processing_status TEXT NOT NULL DEFAULT 'unprocessed',
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS labels TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS attachment_metadata JSONB DEFAULT '[]'::jsonb;

-- Indexes for ingestion queries
CREATE INDEX IF NOT EXISTS idx_sync_runs_user_created ON sync_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_emails_user_ingestion_ai ON emails(user_id, ingestion_status, ai_processing_status);
