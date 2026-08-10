-- Migration 005: Runtime Integrity Fixes
-- Addresses runtime gate findings: ownership model, idempotency key separation,
-- cost model, trust proxy, and constraint alignment.
--
-- This migration is safe to apply both:
--   a) On a clean install (after 001–004)
--   b) On an existing schema with 004 already applied
--
-- All changes use IF EXISTS / IF NOT EXISTS guards for idempotency.

BEGIN;

-- ─── 1. Model A: Ownership derives from email_id → emails.user_id ─────────────
--
-- email_intelligence.user_id is redundant because:
--   - emails.id is a globally unique UUID (gen_random_uuid()) — no two tenants
--     share an email_id.
--   - email_intelligence.email_id has a FK → emails(id) ON DELETE CASCADE, so
--     ownership is implicitly enforced through that FK.
--   - Keeping a denormalized user_id that could diverge from the email's actual
--     owner is a correctness hazard.
--
-- Step 1a: Drop the 3-column uniqueness constraint (added in 004)
ALTER TABLE email_intelligence
  DROP CONSTRAINT IF EXISTS unique_user_email_extraction_version;

-- Step 1b: Add correct 2-column uniqueness constraint
ALTER TABLE email_intelligence
  DROP CONSTRAINT IF EXISTS unique_email_extraction_version;

ALTER TABLE email_intelligence
  ADD CONSTRAINT unique_email_extraction_version
  UNIQUE (email_id, extraction_version);

-- Step 1c: Drop redundant user_id index (from 004)
DROP INDEX IF EXISTS idx_email_intelligence_user_version;

-- Step 1d: Drop the user_id FK constraint
ALTER TABLE email_intelligence
  DROP CONSTRAINT IF EXISTS email_intelligence_user_id_fkey;

-- Step 1e: Drop user_id column from email_intelligence
ALTER TABLE email_intelligence
  DROP COLUMN IF EXISTS user_id;

-- ─── 2. Materialized entity key separation ────────────────────────────────────
COMMENT ON COLUMN actions.idempotency_key IS
  'Stable materialized entity key: SHA-256 of canonical JSON(userId, sourceEmailId, entityType, normalizedTitle, normalizedDeadline, normalizedTarget, normalizedCategory). Stable across extraction versions.';

COMMENT ON COLUMN opportunities.idempotency_key IS
  'Stable materialized entity key: SHA-256 of canonical JSON(userId, sourceEmailId, entityType, normalizedTitle, normalizedTarget). Stable across extraction versions.';

-- ─── 3. Cost model & extraction_runs token nullability ─────────────────────────
ALTER TABLE llm_usage_events
  ADD COLUMN IF NOT EXISTS pricing_status TEXT NOT NULL DEFAULT 'calculated';

ALTER TABLE llm_usage_events
  ADD COLUMN IF NOT EXISTS pricing_version TEXT;

ALTER TABLE llm_usage_events
  DROP CONSTRAINT IF EXISTS chk_llm_usage_pricing_status;

ALTER TABLE llm_usage_events
  ADD CONSTRAINT chk_llm_usage_pricing_status
  CHECK (pricing_status IN ('calculated', 'unknown_model', 'usage_unavailable'));

-- Make extraction_runs token and cost columns nullable (for fallback / unavailable usage)
ALTER TABLE extraction_runs
  ALTER COLUMN prompt_tokens DROP NOT NULL,
  ALTER COLUMN completion_tokens DROP NOT NULL,
  ALTER COLUMN estimated_cost DROP NOT NULL;

UPDATE llm_usage_events
  SET total_cost = NULL, pricing_status = 'unknown_model'
  WHERE total_cost < 0;

-- ─── 4. Trust proxy: configurable via environment ─────────────────────────────
COMMENT ON TABLE users IS
  'IIL users table. trust_proxy is configured via TRUST_PROXY env var (default: 1 for Railway single-hop).';

-- ─── 5. Tighten email_intelligence intent/sender classification enums ──────────
ALTER TABLE email_intelligence
  DROP CONSTRAINT IF EXISTS chk_email_intelligence_intent;

ALTER TABLE email_intelligence
  ADD CONSTRAINT chk_email_intelligence_intent
  CHECK (intent_classification IN (
    'recruiter', 'internship', 'newsletter', 'spam',
    'operational', 'meeting', 'task'
  ));

ALTER TABLE email_intelligence
  DROP CONSTRAINT IF EXISTS chk_email_intelligence_sender;

ALTER TABLE email_intelligence
  ADD CONSTRAINT chk_email_intelligence_sender
  CHECK (sender_classification IN (
    'recruiter', 'peer', 'institution', 'automated', 'spam'
  ));

-- ─── 6. Add explicit index on email_intelligence for clean lookup ─────────────
DROP INDEX IF EXISTS idx_email_intelligence_email_version;
CREATE INDEX IF NOT EXISTS idx_email_intelligence_email_version
  ON email_intelligence (email_id, extraction_version DESC);

-- ─── 7. Backfill NULL updated_at on emails ────────────────────────────────────
UPDATE emails SET updated_at = created_at WHERE updated_at IS NULL;

-- ─── 8. Audit: ensure actions.idempotency_key index covers user_id via join ───
COMMENT ON INDEX actions_idempotency_key_key IS
  'Enforces uniqueness of materialized_entity_key across all actions.';

COMMENT ON INDEX opportunities_idempotency_key_key IS
  'Enforces uniqueness of materialized_entity_key across all opportunities.';

COMMIT;
