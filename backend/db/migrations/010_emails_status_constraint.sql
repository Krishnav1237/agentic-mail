-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 010: emails.status CHECK constraint
--
-- actions.status and opportunities.status both have CHECK constraints
-- enforcing their valid enum values (see migration 004). emails.status was a
-- bare TEXT column with no constraint at all — inconsistent with how every
-- other status-like column in this schema is handled. This is a distinct,
-- narrowly-scoped consistency fix discovered separately from 009's frontend
-- shape alignment, so it gets its own migration rather than being folded into
-- that one — same reasoning migrations 004/005 already follow (one migration
-- per motivating reason).
--
-- Idempotent (IF EXISTS/IF NOT EXISTS guards), wrapped in BEGIN/COMMIT, safe
-- on a clean install or on top of 001–009.
--
-- ─── Allowed values, and why this is NOT a union with the frontend's enum ───
-- frontend/src/lib/mailStore.ts's StoredMailRow.status is a *mailbox
-- location*: 'inbox' | 'archived' | 'trash' | 'spam' | 'snoozed'. Read/unread
-- is a wholly separate field there (`unread: boolean`).
--
-- Backend emails.status has never tracked mailbox location — grepping
-- backend/src turns up exactly three literal values ever written to it:
--   'unread'  — the column's own DEFAULT (migration 001), set on every
--               ingested message (gmailSyncService.ingestSingleMessage)
--   'read'    — the natural counterpart to 'unread' (no route flips it yet,
--               but it's the same axis, not a new concept)
--   'deleted' — set alongside is_deleted=TRUE on Gmail-side deletion
--               (gmailSyncService.performIncrementalSync)
-- Nothing in this codebase has ever written 'inbox'/'archived'/'trash'/
-- 'spam'/'snoozed' to emails.status, because that mailbox-location concept
-- doesn't exist on this table yet — it's a future Phase B/C concern (a real
-- archive/trash/spam/snooze action against a stored email), not something to
-- pre-populate into a CHECK constraint speculatively.
--
-- So the allowed list here is the read-state axis the column actually
-- represents today, not the frontend's location axis. GET /threads (and any
-- future GET /emails consumer) surfaces this raw value as `status`; a
-- frontend adapter must map it onto MailRow.unread (via `status === 'unread'`)
-- rather than expect it to equal StoredMailRow.status directly — the two are
-- different questions about the same email, not the same field under two
-- names.

BEGIN;

ALTER TABLE emails
  DROP CONSTRAINT IF EXISTS chk_emails_status;

ALTER TABLE emails
  ADD CONSTRAINT chk_emails_status
  CHECK (status IN ('unread', 'read', 'deleted'));

COMMIT;
