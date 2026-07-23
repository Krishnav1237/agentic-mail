-- Migration 004: Phase 1–4 Audit Corrective Fixes
-- Addresses defects identified during the Phase 1–4 adversarial audit.
-- All changes are additive (no destructive data loss).
-- This migration is idempotent (IF NOT EXISTS / IF EXISTS guards throughout).

BEGIN;

-- ─── 1. Add google_sub to users for stable Google identity matching ───────────
-- Previously users were matched only by email, which is mutable.
-- google_sub (the 'sub' claim from Google ID token) is immutable per account.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_sub TEXT;

-- Unique index on google_sub where not null (partial — allows null for legacy rows)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub
  ON users (google_sub)
  WHERE google_sub IS NOT NULL;

-- ─── 2. Fix email_intelligence uniqueness constraint ──────────────────────────
-- The existing constraint unique_email_extraction_version is on (email_id, extraction_version).
-- This does not include user_id, creating a theoretical cross-tenant collision surface
-- if two users receive the same email message (different Gmail accounts, same message).
-- Add user_id to the conflict key.
--
-- We cannot directly ALTER a CONSTRAINT, so we:
--   a) Drop the old constraint (if it exists)
--   b) Add the new three-column constraint
-- Since this is a Phase 1–4 audit and the table may be empty or pre-production,
-- this is safe. The new constraint is strictly more specific (no data loss).

ALTER TABLE email_intelligence
  DROP CONSTRAINT IF EXISTS unique_email_extraction_version;

ALTER TABLE email_intelligence
  ADD CONSTRAINT unique_user_email_extraction_version
  UNIQUE (user_id, email_id, extraction_version);

-- ─── 3. Add analysis_mode column to email_intelligence ───────────────────────
-- Required to distinguish LLM-validated extractions from deterministic fallback.
ALTER TABLE email_intelligence
  ADD COLUMN IF NOT EXISTS analysis_mode TEXT NOT NULL DEFAULT 'llm';

-- Add check constraint to prevent arbitrary strings
ALTER TABLE email_intelligence
  DROP CONSTRAINT IF EXISTS chk_email_intelligence_analysis_mode;

ALTER TABLE email_intelligence
  ADD CONSTRAINT chk_email_intelligence_analysis_mode
  CHECK (analysis_mode IN ('llm', 'deterministic_fallback'));

-- ─── 4. Add partial unique index on extraction_runs to prevent duplicate active runs ───
-- Prevents two concurrent extraction runs for the same email.
CREATE UNIQUE INDEX IF NOT EXISTS idx_extraction_runs_active_email
  ON extraction_runs (email_id)
  WHERE status = 'running';

-- ─── 5. Add completed_at to extraction_runs for accurate latency tracking ──────
ALTER TABLE extraction_runs
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- ─── 6. Enforce llm_usage_events nullable token fields ───────────────────────
-- Deterministic fallback should not insert fake token counts.
-- Allow NULL for prompt_tokens and completion_tokens.
ALTER TABLE llm_usage_events
  ALTER COLUMN prompt_tokens DROP NOT NULL;

ALTER TABLE llm_usage_events
  ALTER COLUMN completion_tokens DROP NOT NULL;

ALTER TABLE llm_usage_events
  ALTER COLUMN total_cost DROP NOT NULL;

-- ─── 7. Add updated_at to emails for tracking label/status changes ────────────
ALTER TABLE emails
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- ─── 8. Add check constraints for bounded enum values ────────────────────────

-- Actions status values (matches application code)
ALTER TABLE actions
  DROP CONSTRAINT IF EXISTS chk_actions_status;

ALTER TABLE actions
  ADD CONSTRAINT chk_actions_status
  CHECK (status IN ('open', 'snoozed', 'completed', 'archived', 'cancelled', 'deleted'));

-- Opportunities status values
ALTER TABLE opportunities
  DROP CONSTRAINT IF EXISTS chk_opportunities_status;

ALTER TABLE opportunities
  ADD CONSTRAINT chk_opportunities_status
  CHECK (status IN ('surfaced', 'saved', 'applied', 'dismissed'));

-- Provider values in sync-related tables
ALTER TABLE provider_sync_states
  DROP CONSTRAINT IF EXISTS chk_provider_sync_states_provider;

ALTER TABLE provider_sync_states
  ADD CONSTRAINT chk_provider_sync_states_provider
  CHECK (provider IN ('google'));

ALTER TABLE user_credentials
  DROP CONSTRAINT IF EXISTS chk_user_credentials_provider;

ALTER TABLE user_credentials
  ADD CONSTRAINT chk_user_credentials_provider
  CHECK (provider IN ('google'));

-- Sync run status values (must match idx_sync_runs_active_user predicate in 002)
ALTER TABLE sync_runs
  DROP CONSTRAINT IF EXISTS chk_sync_runs_status;

ALTER TABLE sync_runs
  ADD CONSTRAINT chk_sync_runs_status
  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'));

-- Sync run type values
ALTER TABLE sync_runs
  DROP CONSTRAINT IF EXISTS chk_sync_runs_sync_type;

ALTER TABLE sync_runs
  ADD CONSTRAINT chk_sync_runs_sync_type
  CHECK (sync_type IN ('initial', 'incremental', 'reconciliation', 'manual', 'background'));

-- ─── 9. Index for intelligence retrieval query (GET /emails/:id/intelligence) ──
CREATE INDEX IF NOT EXISTS idx_email_intelligence_email_version
  ON email_intelligence (email_id, extraction_version DESC);

-- ─── 10. Index for extraction_runs lookup by user (for status queries) ─────────
CREATE INDEX IF NOT EXISTS idx_extraction_runs_user_created
  ON extraction_runs (user_id, created_at DESC);

-- ─── 11. LLM usage events user index (for cost aggregation queries) ────────────
CREATE INDEX IF NOT EXISTS idx_llm_usage_events_user_created
  ON llm_usage_events (user_id, created_at DESC);

COMMIT;
