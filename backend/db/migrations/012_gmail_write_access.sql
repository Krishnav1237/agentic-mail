-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 012: Gmail write access — approvals execution support
--
-- Backs the delayed-send hold (5-minute auto-send window) and manual-send
-- idempotency described in docs/integration-audit.md's Gmail write access
-- design. `approvals` (migration 001) already has the shape this needs —
-- prepared_payload, scheduled_at, snoozed_until, and an action_type comment
-- that literally lists send_reply/archive_email as examples — and nothing
-- writes to it yet, so this migration extends it rather than introducing a
-- new table. `agent_executions` is deliberately left untouched.
--
-- Idempotent (IF EXISTS / IF NOT EXISTS guards, DROP+ADD for constraints),
-- wrapped in BEGIN/COMMIT, safe on a clean install or on top of 001–011.
-- Purely additive — no columns dropped, no rows rewritten.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 'sending' is a required state, not an optional addition: the conditional
-- UPDATE ... WHERE status = 'pending' -> 'sending' is the entire mechanism
-- that makes a cancel arriving at the same instant the 5-minute hold fires
-- resolve to exactly one outcome. See workers/agentExecutionWorker.ts.
ALTER TABLE approvals
  DROP CONSTRAINT IF EXISTS chk_approvals_status;

ALTER TABLE approvals
  ADD CONSTRAINT chk_approvals_status
  CHECK (status IN (
    'pending', 'approved', 'modified', 'rejected',
    'executed', 'cancelled', 'failed', 'sending'
  ));

-- send_reply only, for this stage. Not locked tight enough to block
-- draft_reply/archive_email being added later — those get their own
-- ALTER ... DROP CONSTRAINT / ADD CONSTRAINT when they start writing rows,
-- the same way migration 009 grew opportunities.status.
ALTER TABLE approvals
  DROP CONSTRAINT IF EXISTS chk_approvals_action_type;

ALTER TABLE approvals
  ADD CONSTRAINT chk_approvals_action_type
  CHECK (action_type IN ('send_reply'));

-- Cancel token, reusing the telegram_integration.link_code shape (single-use,
-- expiring, atomically consumed) rather than inventing a new pattern.
-- Expiry starts equal to scheduled_at and is pushed forward on each retry —
-- see agentExecutionWorker.ts's revert-to-pending path — so the token never
-- outlives the send it can actually still cancel.
ALTER TABLE approvals
  ADD COLUMN IF NOT EXISTS cancel_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS cancel_token_expires_at TIMESTAMPTZ;

-- Client-supplied idempotency, scoped to the send endpoint only (per-user, so
-- two different users can coincidentally pick the same key string). This is a
-- new convention for this schema: every existing idempotency_key is a
-- server-computed materialized-entity hash (see migration 005's comment on
-- actions.idempotency_key), never a client-supplied request-replay token.
ALTER TABLE approvals
  ADD COLUMN IF NOT EXISTS client_idempotency_key TEXT;

ALTER TABLE approvals
  DROP CONSTRAINT IF EXISTS uq_approvals_user_client_idempotency;

ALTER TABLE approvals
  ADD CONSTRAINT uq_approvals_user_client_idempotency
  UNIQUE (user_id, client_idempotency_key);

CREATE INDEX IF NOT EXISTS idx_approvals_user_status
  ON approvals(user_id, status);

COMMENT ON COLUMN approvals.cancel_token IS
  'Single-use cancel token for a held send, same shape as telegram_integration.link_code. NULL once the row leaves pending (no longer cancellable).';

COMMENT ON COLUMN approvals.cancel_token_expires_at IS
  'Starts equal to scheduled_at; bumped forward by the worker on each non-final retry so the token stays valid exactly as long as the send is still pending.';

COMMENT ON COLUMN approvals.client_idempotency_key IS
  'Client-supplied Idempotency-Key header value for POST /emails/:id/send only. Server-computed keys elsewhere in this schema (actions/opportunities) are a different mechanism — see migration 005.';

COMMIT;
