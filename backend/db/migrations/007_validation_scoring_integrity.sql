-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 007: Validation Scoring Integrity
-- Aligns email_filtering_decisions table schema with raw additive score model.
-- Replaces clamped 'score' with unconstrained 'raw_score' and nullable 'normalized_score'.
-- ─────────────────────────────────────────────────────────────────────────────

-- Rename score -> raw_score and adjust type/constraints
ALTER TABLE email_filtering_decisions DROP CONSTRAINT IF EXISTS chk_email_filtering_score_range;

-- Add raw_score column if not existing, migrate data if score exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_filtering_decisions' AND column_name = 'score'
  ) THEN
    ALTER TABLE email_filtering_decisions RENAME COLUMN score TO raw_score;
    ALTER TABLE email_filtering_decisions ALTER COLUMN raw_score TYPE NUMERIC;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'email_filtering_decisions' AND column_name = 'raw_score'
    ) THEN
      ALTER TABLE email_filtering_decisions ADD COLUMN raw_score NUMERIC NOT NULL DEFAULT 0.50;
    END IF;
  END IF;
END $$;

-- Add normalized_score column if not existing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_filtering_decisions' AND column_name = 'normalized_score'
  ) THEN
    ALTER TABLE email_filtering_decisions ADD COLUMN normalized_score NUMERIC NULL;
  END IF;
END $$;

-- Rename reasons_json -> reasons if reasons_json exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_filtering_decisions' AND column_name = 'reasons_json'
  ) THEN
    ALTER TABLE email_filtering_decisions RENAME COLUMN reasons_json TO reasons;
  END IF;
END $$;

-- Enforce check constraint on normalized_score (null or between 0 and 1)
ALTER TABLE email_filtering_decisions DROP CONSTRAINT IF EXISTS chk_email_filtering_normalized_score;
ALTER TABLE email_filtering_decisions ADD CONSTRAINT chk_email_filtering_normalized_score
  CHECK (normalized_score IS NULL OR (normalized_score >= 0.0 AND normalized_score <= 1.0));
