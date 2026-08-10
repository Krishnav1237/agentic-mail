-- Migration 006: Validation Program Infrastructure
-- Implements the 14-day validation cohort tracking schema.
-- Supports: cohorts, participants, email labelling, extraction reviews,
--           ingestion attempt tracking, interview data, decision records,
--           and email noise scoring.
--
-- Design principles:
--   - Ownership always derives through a FK chain to users.id — never denormalized.
--   - No unrestricted free-text columns for PII. Notes fields are redacted at the
--     application layer before storage.
--   - All enums enforced by CHECK constraints.
--   - This migration is idempotent (IF NOT EXISTS / IF EXISTS guards throughout).
--   - Safe on fresh install (after 001–005) or on a live schema.
--
-- This migration is internal validation tooling only.
-- It does NOT implement Phase 5 customer product APIs.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. VALIDATION COHORTS
-- Tracks each validation study (e.g., "Placement Vertical - July 2026 Cohort 1")
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS validation_cohorts (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        TEXT NOT NULL,
  vertical                    TEXT NOT NULL,                      -- e.g. 'placement', 'freelancer'
  start_date                  DATE,
  end_date                    DATE,
  status                      TEXT NOT NULL DEFAULT 'planning',   -- planning, active, completed, cancelled
  decision_threshold_version  TEXT NOT NULL DEFAULT 'v1',
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_validation_cohorts_status
    CHECK (status IN ('planning', 'active', 'completed', 'cancelled')),
  CONSTRAINT chk_validation_cohorts_threshold_version
    CHECK (decision_threshold_version ~ '^v[0-9]+$')
);

CREATE INDEX IF NOT EXISTS idx_validation_cohorts_status
  ON validation_cohorts (status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. VALIDATION PARTICIPANTS
-- One row per participant within a cohort.
-- user_id is nullable: we track the attempt even before OAuth is completed.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS validation_participants (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id                       UUID NOT NULL REFERENCES validation_cohorts(id) ON DELETE CASCADE,
  user_id                         UUID REFERENCES users(id) ON DELETE SET NULL,   -- populated on OAuth success
  participant_code                TEXT NOT NULL,                                  -- anonymized handle, e.g. P001
  persona                         TEXT NOT NULL,                                  -- student, class_rep, freelancer
  source                          TEXT,                                           -- referral channel
  oauth_invited                   BOOLEAN NOT NULL DEFAULT FALSE,
  oauth_completed                 BOOLEAN NOT NULL DEFAULT FALSE,
  oauth_setup_seconds             INTEGER,                                        -- NULL until measured
  forwarding_attempted            BOOLEAN NOT NULL DEFAULT FALSE,
  forwarding_completed            BOOLEAN NOT NULL DEFAULT FALSE,
  forwarding_setup_seconds        INTEGER,
  admin_policy_blocked            BOOLEAN NOT NULL DEFAULT FALSE,
  trust_accepted                  BOOLEAN,                                        -- NULL until asked
  continued_after_one_week        BOOLEAN,                                        -- NULL until measured
  willingness_to_pay_amount       NUMERIC(8,2),
  willingness_to_pay_currency     TEXT DEFAULT 'INR',
  notes_redacted                  TEXT,                                           -- only redacted observations
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_cohort_participant_code UNIQUE (cohort_id, participant_code),
  CONSTRAINT chk_validation_participants_persona
    CHECK (persona IN ('student', 'class_representative', 'freelancer')),
  CONSTRAINT chk_validation_participants_wtp_currency
    CHECK (willingness_to_pay_currency IS NULL OR length(willingness_to_pay_currency) = 3)
);

CREATE INDEX IF NOT EXISTS idx_validation_participants_cohort
  ON validation_participants (cohort_id);

CREATE INDEX IF NOT EXISTS idx_validation_participants_user
  ON validation_participants (user_id)
  WHERE user_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. VALIDATION SESSIONS
-- Optional: track individual validation sessions for time-on-task measurement.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS validation_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id       UUID NOT NULL REFERENCES validation_cohorts(id) ON DELETE CASCADE,
  participant_id  UUID NOT NULL REFERENCES validation_participants(id) ON DELETE CASCADE,
  session_type    TEXT NOT NULL,  -- oauth_setup, forwarding_setup, review, interview
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  duration_seconds INTEGER,
  notes_redacted  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_validation_sessions_type
    CHECK (session_type IN ('oauth_setup', 'forwarding_setup', 'review', 'interview', 'observation'))
);

CREATE INDEX IF NOT EXISTS idx_validation_sessions_participant
  ON validation_sessions (participant_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. VALIDATION EMAIL LABELS
-- Human ground-truth labels for computing precision and recall.
-- Ownership: cohort_id + email_id. Email ownership verified via emails.user_id.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS validation_email_labels (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id                 UUID NOT NULL REFERENCES validation_cohorts(id) ON DELETE CASCADE,
  email_id                  UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  reviewer_code             TEXT NOT NULL,                    -- anonymized reviewer handle
  is_critical               BOOLEAN NOT NULL DEFAULT FALSE,   -- should this email have been surfaced?
  should_create_action      BOOLEAN NOT NULL DEFAULT FALSE,
  should_create_opportunity BOOLEAN NOT NULL DEFAULT FALSE,
  correct_deadline          DATE,
  deadline_kind             TEXT,                             -- absolute, relative, none
  correct_action_title      TEXT,
  correct_opportunity_title TEXT,
  contains_sensitive_data   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_label_per_reviewer_email UNIQUE (cohort_id, email_id, reviewer_code),
  CONSTRAINT chk_validation_label_deadline_kind
    CHECK (deadline_kind IS NULL OR deadline_kind IN ('absolute', 'relative', 'none'))
);

CREATE INDEX IF NOT EXISTS idx_validation_email_labels_cohort_email
  ON validation_email_labels (cohort_id, email_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. VALIDATION EXTRACTION REVIEWS
-- Human assessment of actual extracted entities against labels.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS validation_extraction_reviews (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id             UUID NOT NULL REFERENCES validation_cohorts(id) ON DELETE CASCADE,
  email_id              UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  extraction_run_id     UUID REFERENCES extraction_runs(id) ON DELETE SET NULL,
  action_valid          BOOLEAN,                        -- NULL = not yet reviewed
  opportunity_valid     BOOLEAN,
  deadline_valid        BOOLEAN,
  semantic_duplicate    BOOLEAN NOT NULL DEFAULT FALSE,
  failure_category      TEXT,                           -- missed, false_positive, wrong_deadline, duplicate
  reviewer_code         TEXT NOT NULL,
  review_notes_redacted TEXT,                           -- only anonymized observations
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_validation_review_failure_category
    CHECK (failure_category IS NULL OR failure_category IN (
      'missed_critical', 'false_positive_action', 'false_positive_opportunity',
      'wrong_deadline', 'duplicate_action', 'duplicate_opportunity',
      'prompt_injection_risk', 'other'
    ))
);

CREATE INDEX IF NOT EXISTS idx_validation_extraction_reviews_cohort_email
  ON validation_extraction_reviews (cohort_id, email_id);

CREATE INDEX IF NOT EXISTS idx_validation_extraction_reviews_run
  ON validation_extraction_reviews (extraction_run_id)
  WHERE extraction_run_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. VALIDATION INGESTION ATTEMPTS
-- Records setup and first-ingestion success for both OAuth and forwarding paths.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS validation_ingestion_attempts (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id                   UUID NOT NULL REFERENCES validation_cohorts(id) ON DELETE CASCADE,
  participant_id              UUID NOT NULL REFERENCES validation_participants(id) ON DELETE CASCADE,
  ingestion_mode              TEXT NOT NULL,           -- oauth, forwarding
  started_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at                TIMESTAMPTZ,
  setup_seconds               INTEGER,
  first_ingestion_success     BOOLEAN,
  messages_ingested           INTEGER DEFAULT 0,
  critical_messages_expected  INTEGER DEFAULT 0,       -- from human labels
  critical_messages_ingested  INTEGER DEFAULT 0,       -- actually received
  failure_code                TEXT,                    -- bounded error code or NULL
  admin_policy_blocked        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_validation_ingestion_mode
    CHECK (ingestion_mode IN ('oauth', 'forwarding')),
  CONSTRAINT chk_validation_ingestion_failure_code
    CHECK (failure_code IS NULL OR length(failure_code) <= 100)
);

CREATE INDEX IF NOT EXISTS idx_validation_ingestion_participant
  ON validation_ingestion_attempts (participant_id);

CREATE INDEX IF NOT EXISTS idx_validation_ingestion_cohort_mode
  ON validation_ingestion_attempts (cohort_id, ingestion_mode);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. VALIDATION INTERVIEWS
-- Structured interview fields only. No free-form transcript storage.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS validation_interviews (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id                 UUID NOT NULL REFERENCES validation_cohorts(id) ON DELETE CASCADE,
  participant_id            UUID NOT NULL REFERENCES validation_participants(id) ON DELETE CASCADE,
  missed_email_frequency    TEXT,   -- daily, weekly, monthly, rarely, never
  problem_severity          TEXT,   -- critical, high, medium, low, none
  current_workaround        TEXT,   -- manual_check, calendar, notes_app, none, other
  preferred_ingestion_mode  TEXT,   -- oauth, forwarding, no_preference, unsure
  trust_concern_category    TEXT,   -- privacy_oauth, privacy_forwarding, accuracy, none, other
  price_response            TEXT,   -- willing_any, willing_trial, resistant, refused
  continuation_intent       TEXT,   -- yes, conditional, no, undecided
  notes_redacted            TEXT,   -- anonymized coded observations only
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_validation_interview_missed_freq
    CHECK (missed_email_frequency IS NULL OR missed_email_frequency IN (
      'daily', 'weekly', 'monthly', 'rarely', 'never'
    )),
  CONSTRAINT chk_validation_interview_severity
    CHECK (problem_severity IS NULL OR problem_severity IN (
      'critical', 'high', 'medium', 'low', 'none'
    )),
  CONSTRAINT chk_validation_interview_workaround
    CHECK (current_workaround IS NULL OR current_workaround IN (
      'manual_check', 'calendar', 'notes_app', 'none', 'other'
    )),
  CONSTRAINT chk_validation_interview_preferred_mode
    CHECK (preferred_ingestion_mode IS NULL OR preferred_ingestion_mode IN (
      'oauth', 'forwarding', 'no_preference', 'unsure'
    )),
  CONSTRAINT chk_validation_interview_trust_concern
    CHECK (trust_concern_category IS NULL OR trust_concern_category IN (
      'privacy_oauth', 'privacy_forwarding', 'accuracy', 'none', 'other'
    )),
  CONSTRAINT chk_validation_interview_price_response
    CHECK (price_response IS NULL OR price_response IN (
      'willing_any', 'willing_trial', 'resistant', 'refused'
    )),
  CONSTRAINT chk_validation_interview_continuation
    CHECK (continuation_intent IS NULL OR continuation_intent IN (
      'yes', 'conditional', 'no', 'undecided'
    ))
);

CREATE INDEX IF NOT EXISTS idx_validation_interviews_participant
  ON validation_interviews (participant_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. VALIDATION DECISIONS
-- The final evidence-backed go/no-go decision for a cohort.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS validation_decisions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id               UUID NOT NULL UNIQUE REFERENCES validation_cohorts(id) ON DELETE CASCADE,
  decision                TEXT NOT NULL,
  threshold_version       TEXT NOT NULL DEFAULT 'v1',
  oauth_metrics_json      JSONB,    -- snapshot of OAuth metrics at decision time
  forwarding_metrics_json JSONB,    -- snapshot of forwarding metrics at decision time
  quality_metrics_json    JSONB,    -- snapshot of extraction quality metrics
  financial_inputs_json   JSONB,    -- WTP summary, cost estimates
  passed_checks           TEXT[],   -- list of threshold checks that passed
  failed_checks           TEXT[],   -- list of threshold checks that failed
  missing_data            TEXT[],   -- list of required data points that were missing
  rationale               TEXT NOT NULL,
  decided_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_validation_decision_value
    CHECK (decision IN (
      'oauth_beta', 'forwarding_alpha', 'hybrid_design',
      'insufficient_evidence', 'vertical_rejected'
    )),
  CONSTRAINT chk_validation_decision_threshold_version
    CHECK (threshold_version ~ '^v[0-9]+$')
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. EMAIL FILTERING DECISIONS (Noise Scoring — Shadow Mode)
-- Records the pre-LLM scoring result for every email processed.
-- Ownership derives through emails.user_id.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_filtering_decisions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id        UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  model_version   TEXT NOT NULL DEFAULT 'rules-v1',
  score           REAL NOT NULL,
  recommendation  TEXT NOT NULL,       -- process, deprioritize
  reasons_json    JSONB NOT NULL DEFAULT '[]'::jsonb,
  mode            TEXT NOT NULL,       -- off, shadow, active
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_email_filtering_recommendation
    CHECK (recommendation IN ('process', 'deprioritize')),
  CONSTRAINT chk_email_filtering_mode
    CHECK (mode IN ('off', 'shadow', 'active')),
  CONSTRAINT chk_email_filtering_score_range
    CHECK (score >= 0.0 AND score <= 1.0)
);

CREATE INDEX IF NOT EXISTS idx_email_filtering_email
  ON email_filtering_decisions (email_id);

CREATE INDEX IF NOT EXISTS idx_email_filtering_mode_created
  ON email_filtering_decisions (mode, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. VALIDATION EVENTS (Instrumentation)
-- Bounded event log for validation-specific pipeline events.
-- More granular than audit_events; does not replace them.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS validation_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id       UUID REFERENCES validation_cohorts(id) ON DELETE SET NULL,
  participant_id  UUID REFERENCES validation_participants(id) ON DELETE SET NULL,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type      TEXT NOT NULL,
  details_json    JSONB NOT NULL DEFAULT '{}'::jsonb,  -- MUST NOT contain tokens, email bodies, prompts
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_validation_event_type
    CHECK (event_type IN (
      'oauth_start', 'oauth_success', 'oauth_failure',
      'initial_sync_queued', 'initial_sync_completed',
      'incremental_sync_completed',
      'messages_ingested', 'messages_updated', 'messages_soft_deleted',
      'extraction_started', 'extraction_completed', 'extraction_failed',
      'action_materialized', 'opportunity_materialized',
      'google_disconnected',
      'forwarding_test_started', 'forwarding_test_completed', 'forwarding_test_failed',
      'benchmark_run_started', 'benchmark_run_completed'
    ))
);

CREATE INDEX IF NOT EXISTS idx_validation_events_cohort
  ON validation_events (cohort_id)
  WHERE cohort_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_validation_events_participant
  ON validation_events (participant_id)
  WHERE participant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_validation_events_user_type
  ON validation_events (user_id, event_type, created_at DESC)
  WHERE user_id IS NOT NULL;

COMMIT;
