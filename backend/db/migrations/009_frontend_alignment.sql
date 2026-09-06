-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 009: Frontend Alignment (pre-integration prep)
--
-- The frontend and backend were built independently and merged without any
-- integration pass. Per product decision, the backend adopts the frontend's
-- shapes where the two disagree. This migration is idempotent
-- (IF EXISTS/IF NOT EXISTS guards throughout, wrapped in BEGIN/COMMIT) and
-- safe to apply on a clean install or on top of 001–008.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── 1. Opportunity status enum — align to frontend's Lifecycle values ───────
-- frontend/src/lib/workspaceData.ts: type Lifecycle = 'new' | 'saved' | 'pursuing' | 'passed'.
-- Backend previously used surfaced | saved | applied | dismissed.
--
-- Data mapping applied before the new CHECK constraint is added, so existing
-- rows remain valid rather than violating the new constraint outright:
--   surfaced  -> new       (freshly surfaced, not yet acted on)
--   applied   -> pursuing  (closest existing "actively engaged" state)
--   dismissed -> passed    (terminal — the frontend's resolved/closed state)
--   saved     -> saved     (unchanged)
UPDATE opportunities SET status = 'new' WHERE status = 'surfaced';
UPDATE opportunities SET status = 'pursuing' WHERE status = 'applied';
UPDATE opportunities SET status = 'passed' WHERE status = 'dismissed';

ALTER TABLE opportunities
  DROP CONSTRAINT IF EXISTS chk_opportunities_status;

ALTER TABLE opportunities
  ALTER COLUMN status SET DEFAULT 'new';

ALTER TABLE opportunities
  ADD CONSTRAINT chk_opportunities_status
  CHECK (status IN ('new', 'saved', 'pursuing', 'passed'));

-- ─── 2. user_preferences — replace ad hoc columns with a single JSONB blob ───
-- Backend's autopilot_level / personality_mode / reply_tone /
-- automation_policies (with a stale 'labeling' key) / priority_weights have
-- no correspondence to frontend/src/lib/agentPreferences.ts's AgentPreferences
-- shape at all. Rather than restructure into one column per AgentPreferences
-- field, this uses a single `preferences JSONB` column holding exactly what
-- sanitizePreferences() produces/accepts — AgentPreferences is a nested
-- object (automation: {archive, followup}, cleanup: a per-category map,
-- highPriorityTopics: an ordered array, two color enums, two booleans), and
-- flattening that into typed columns would either lose the nesting or
-- require several new tables for what is, on the frontend, one serialisable
-- settings blob. A single JSONB column is also the pattern this same table
-- already used for structured settings (automation_policies, priority_weights),
-- so this isn't a new convention for this schema, just the field contents
-- changing to match the frontend's actual shape.
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE user_preferences
  DROP COLUMN IF EXISTS autopilot_level,
  DROP COLUMN IF EXISTS personality_mode,
  DROP COLUMN IF EXISTS reply_tone,
  DROP COLUMN IF EXISTS automation_policies,
  DROP COLUMN IF EXISTS priority_weights;

-- sync_interval_minutes / action_retention_days are dropped as part of this
-- same cleanup: grepping backend/src turns up no reference to either column
-- outside this table's own definition, so they are genuinely dead rather
-- than merely absent from AgentPreferences.
ALTER TABLE user_preferences
  DROP COLUMN IF EXISTS sync_interval_minutes,
  DROP COLUMN IF EXISTS action_retention_days;

COMMIT;
