-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 013: Reply drafting
--
-- Backs the reply-detection/drafting/routing design in
-- docs/integration-audit.md's reply-drafting section. Three independent
-- additive pieces, bundled into one migration because they share one
-- motivating feature (the same "one migration per motivating reason" rule
-- 004/005/009/010/011/012 already follow):
--
--   1. `approvals.action_type` grows to admit 'draft_reply' — the 'review'
--      path's output, and 'auto''s fallback when a draft clears the
--      reply-worthy bar but misses the stricter auto-send confidence bar.
--      Migration 012 deliberately left this CHECK narrow ("not locked tight
--      enough to block draft_reply ... being added later") — this is that
--      later migration.
--   2. `emails` gains the two headers (`Message-ID`, `References`) needed to
--      thread an outgoing reply correctly. Nothing needed these before there
--      was anything to reply to; `gmailSyncService.ts` only ever parsed
--      From/Subject/Date.
--   3. `email_intelligence` gains `reply_worthy`/`reply_worthy_confidence` —
--      typed columns, not JSONB, matching how `priority_score`/`urgency_score`
--      /`is_noise` are already modeled: queried directly, not just carried.
--
-- Idempotent (DROP+ADD constraints, IF NOT EXISTS columns), wrapped in
-- BEGIN/COMMIT, safe on a clean install or on top of 001–012. Purely
-- additive — no columns dropped, no rows rewritten.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── 1. approvals.action_type grows ──────────────────────────────────────────
ALTER TABLE approvals
  DROP CONSTRAINT IF EXISTS chk_approvals_action_type;

ALTER TABLE approvals
  ADD CONSTRAINT chk_approvals_action_type
  CHECK (action_type IN ('send_reply', 'draft_reply'));

COMMENT ON COLUMN approvals.confidence IS
  'Draft-quality confidence (0-1) for action_type IN (draft_reply, send_reply) — the drafting model''s confidence in the GENERATED TEXT, distinct from email_intelligence.reply_worthy_confidence, which only says a reply is warranted at all. The auto-send threshold in services/replyDraftingService.ts gates on THIS column.';

COMMENT ON COLUMN approvals.decision_reason IS
  'For action_type IN (draft_reply, send_reply): the drafting model''s one-line reasoning for the draft it produced. Both this and the confidence column above were unused prior to migration 013.';

-- ─── 2. emails — reply-threading headers ─────────────────────────────────────
ALTER TABLE emails
  ADD COLUMN IF NOT EXISTS message_id_header TEXT,
  ADD COLUMN IF NOT EXISTS references_header TEXT;

COMMENT ON COLUMN emails.message_id_header IS
  'RFC 5322 Message-ID header, verbatim (e.g. "<abc123@mail.gmail.com>"). Captured for reply threading: an outgoing reply''s In-Reply-To is the parent message''s Message-ID. NULL for messages ingested before migration 013 — never backfilled, since the header is only available from Gmail at ingestion time, not derivable after the fact.';

COMMENT ON COLUMN emails.references_header IS
  'RFC 5322 References header, verbatim (space-separated Message-IDs of the whole ancestor chain). An outgoing reply''s own References is this value with the parent''s Message-ID appended.';

-- ─── 3. email_intelligence — reply-worthiness classification ─────────────────
ALTER TABLE email_intelligence
  ADD COLUMN IF NOT EXISTS reply_worthy BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reply_worthy_confidence DOUBLE PRECISION;

COMMENT ON COLUMN email_intelligence.reply_worthy IS
  'Whether this INBOUND email genuinely expects a reply from the user — the opposite direction from frontend responseExpected (which is about the user''s OWN outbound messages, for follow-up nagging). Always computed as part of the main extraction call regardless of the user''s replyDrafting setting. Defaults false for rows extracted before migration 013 — never retroactively classified.';

COMMENT ON COLUMN email_intelligence.reply_worthy_confidence IS
  'Confidence (0-1) behind reply_worthy. Gates whether services/replyDraftingService.ts even attempts a draft — distinct from approvals.confidence, which scores the draft itself once one is attempted.';

COMMIT;
