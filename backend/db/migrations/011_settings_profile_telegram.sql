-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 011: Settings / Profile / Telegram persistence
--
-- Backs §10 item 1 of docs/integration-audit.md — the three stores that are
-- entirely client-side (`localStorage`) today and that §8 names as the ones
-- needing a real GET/PUT pair each. Migration 009 already reshaped
-- `user_preferences` for Settings, so nothing here touches it: this migration
-- only supplies the two things that had no backend representation at all —
-- profile identity fields on `users`, and the `telegram_integration` table.
--
-- Both changes land in one migration rather than two because they exist for a
-- single motivating reason (item 1), which is the same "one migration per
-- motivating reason" rule 004/005/009/010 follow — not a departure from it.
--
-- Idempotent (IF EXISTS / IF NOT EXISTS guards), wrapped in BEGIN/COMMIT, safe
-- on a clean install or on top of 001–010.
--
-- PURELY ADDITIVE. Unlike 009, this drops no columns and rewrites no rows, so
-- the "check before running against non-fresh data" warning on that migration
-- does not apply here.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── 1. users — profile identity fields ──────────────────────────────────────
-- frontend/src/lib/userProfile.ts's UserProfile has four fields. `email` maps
-- to users.email already; the other three need homes:
--
--   displayName  -> users.display_name  (new, below)
--   profilePhoto -> users.profile_photo (new, below)
--   emailChange  -> nothing. Deliberately out of scope: auth is Google-OAuth-
--                   only, users.email is upserted from Google on every login,
--                   and a real verification flow needs a token table plus
--                   outbound email infrastructure, neither of which exists.
--                   GET /profile always reports {status:'none'} and
--                   PUT /profile rejects the field, rather than persisting a
--                   pending state nothing can ever confirm.

-- WHY A NEW COLUMN AND NOT A REUSE OF full_name.
-- The OAuth callback runs `full_name = EXCLUDED.full_name` on EVERY login
-- (routes/auth.ts). Had displayName mapped onto full_name, a user-set name
-- would be silently reverted to the Google account name at the next sign-in —
-- a bug that appears the moment GET/PUT /profile ships, not later. Keeping
-- full_name as the Google-supplied value and reading
-- COALESCE(display_name, full_name) also preserves DEFAULT_PROFILE's
-- documented intent ("seeded from the same identity ... exactly what a real
-- OAuth handshake would hand this page on first login") with no seeding step:
-- a user who has never renamed themselves reads back their Google name.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS display_name TEXT;

-- ProfilePhoto is a discriminated union whose payload key differs per variant
-- ({kind:'none'} | {kind:'uploaded', dataUrl} | {kind:'provider', url}), so it
-- does not flatten into typed columns without losing the tag/payload pairing.
-- JSONB for the same reason migration 009 chose it for `preferences`, and the
-- CHECK on the discriminant follows the audit §9 convention of constraining
-- enum-like columns (as 004 did for actions/opportunities/sync_runs).
--
-- SCOPE NOTE: only 'none' and 'provider' are reachable in this phase. The
-- 'uploaded' variant carries a client-side data URL, which has no storage
-- behind it (no object store is configured) and would not survive
-- express.json's 512kb body limit for most real photos. The constraint still
-- admits 'uploaded' so that adding real blob storage later is a route change
-- rather than a second migration; PUT /profile is what rejects it today.
-- 'provider' costs nothing to populate: `profile` is already in GMAIL_SCOPES,
-- so getGoogleUserInfo already returns `picture` with no re-consent.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile_photo JSONB NOT NULL DEFAULT '{"kind":"none"}'::jsonb;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS chk_users_profile_photo_kind;

ALTER TABLE users
  ADD CONSTRAINT chk_users_profile_photo_kind
  CHECK (profile_photo->>'kind' IN ('none', 'uploaded', 'provider'));

COMMENT ON COLUMN users.display_name IS
  'User-editable display name (PUT /profile). NULL means "never renamed" — '
  'readers use COALESCE(display_name, full_name). full_name stays the '
  'Google-supplied value and is overwritten on every login; this column is not.';

COMMENT ON COLUMN users.profile_photo IS
  'frontend ProfilePhoto union, verbatim. Only {kind:none} and '
  '{kind:provider,url} are written today; {kind:uploaded,dataUrl} awaits real '
  'blob storage and is rejected by PUT /profile until then.';

-- ─── 2. telegram_integration ─────────────────────────────────────────────────
-- Backs frontend/src/lib/telegramIntegration.ts's TelegramIntegration.
-- Follows the audit §9 conventions for new tables: UUID PK, user_id FK with
-- ON DELETE CASCADE, CHECK constraints on enum-like columns.
--
-- ONE ROW PER USER (UNIQUE on user_id). V1 supports exactly one integration —
-- telegramIntegrationStore holds a single object, not a keyed collection, and
-- promoting it to a map is explicitly deferred "until there's a second real
-- one to shape it against". The UNIQUE constraint is what lets every route
-- here upsert on user_id.
--
-- FLAT COLUMNS, NOT A JSONB BLOB — a deliberate departure from migration 009's
-- choice for `preferences`, on the reasoning 009 itself gives. That reasoning
-- was that AgentPreferences is nested (a per-category map, an ordered array)
-- and flattening would lose structure. It does not transfer: this is four
-- scalars, two of them enum-like, which this schema's own convention says
-- should carry CHECK constraints. These fields will also be QUERIED rather
-- than merely round-tripped — a reminder scheduler asks "which users want a
-- 1d-before reminder, at 09:00", which is a WHERE clause wanting real columns.
--
-- NO idempotency_key COLUMN — also a deliberate departure, from §9's "an
-- idempotency key wherever a client might retry a mutation". The retryable
-- mutation here (send-test) is not a row on this table; the table is an
-- upserted per-user singleton with nothing to deduplicate. One-time semantics
-- for linking come from link_code being UNIQUE and consumed on use.
CREATE TABLE IF NOT EXISTS telegram_integration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'telegram',

  -- Link state. `connected` is NOT stored: it is derived per-response as
  -- (telegram_chat_id IS NOT NULL). A stored boolean can disagree with whether
  -- a chat is actually addressable; a derived one cannot. This is the only
  -- field of the three frontend stores that has no column behind it.
  telegram_chat_id TEXT,
  telegram_username TEXT,          -- display only; never used for addressing
  link_code TEXT UNIQUE,           -- single-use, consumed by the bot webhook
  link_code_expires_at TIMESTAMPTZ,
  linked_at TIMESTAMPTZ,

  -- TelegramNotificationPreferences
  notify_urgent_emails BOOLEAN NOT NULL DEFAULT TRUE,
  notify_follow_ups BOOLEAN NOT NULL DEFAULT TRUE,

  -- TelegramDeliveryPreferences
  preferred_time TEXT NOT NULL DEFAULT '09:00',
  deadline_reminder TEXT NOT NULL DEFAULT '1d',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_telegram_provider
    CHECK (provider IN ('telegram')),

  -- Same 24-hour HH:MM shape the frontend's PREFERRED_TIME_RE enforces.
  CONSTRAINT chk_telegram_preferred_time
    CHECK (preferred_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),

  CONSTRAINT chk_telegram_deadline_reminder
    CHECK (deadline_reminder IN ('1h', '3h', '1d', '2d', '3d'))
);

-- No separate index for the webhook's link_code lookup: the `link_code TEXT
-- UNIQUE` column constraint above already creates one covering that exact
-- equality predicate. A second partial index on the same column would add
-- write cost for no read benefit.

-- A Telegram chat belongs to at most ONE Obligo account.
--
-- Without this, a user who links their chat to account A and later to account
-- B would leave both rows pointing at the same chat, and that chat would then
-- receive a second person's email notifications. The webhook already displaces
-- the prior owner before linking; this index is the backstop that stops a
-- future code path from silently recreating the cross-delivery bug.
--
-- Partial, so the many not-yet-connected rows (telegram_chat_id IS NULL) do
-- not collide with each other — same pattern as idx_users_google_sub (004).
CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_integration_chat_id
  ON telegram_integration (telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;

COMMENT ON COLUMN telegram_integration.telegram_chat_id IS
  'The linked Telegram chat. NULL means not connected — this column IS the '
  'source of truth the API derives `connected` from.';

COMMENT ON COLUMN telegram_integration.preferred_time IS
  'Local 24h HH:MM per the frontend contract. NOTE: no scheduler resolves this '
  'yet, and the only timezone the backend holds is user_preferences.'
  'iana_timezone, which defaults to UTC and nothing currently writes. Stored '
  'faithfully; not yet resolvable to a real instant.';

COMMIT;
