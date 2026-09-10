# Obligo — Frontend/Backend Integration Status

Repository: `github.com/Krishnav1237/agentic-mail`, branch `main`.

**What this document is.** It began as a Phase A contract audit — a pure
mapping exercise, no implementation — comparing a frontend built entirely on
in-memory stores against a backend that had never been wired to it. It has
since become the running record of that integration: what was found, what was
decided, what has actually been built and verified, and what remains open.

It is written to be read by whoever picks this up next. Where a decision could
have gone another way, the reasoning is recorded rather than just the outcome,
so the next mismatch of the same kind doesn't have to be re-argued from
scratch.

**Structure changed in this revision.** The original layout described a
codebase where nothing was integrated, so it separated "current frontend
model" from "current backend model" and listed the gap between them. Now that
the first integration item is complete, that split obscures more than it
clarifies — the interesting question is no longer "what do the two sides look
like separately" but "what is wired, what isn't, and why." Sections are
renumbered accordingly. §1 is the status summary; §2–4 cover what's built;
§5–7 cover what's decided, deferred and open.

## Standing decision: frontend wins

Where frontend and backend disagree on shape or semantics, **the backend
adapts to the frontend** — the frontend's model was built by the person
leading the mail workflow and is not renegotiated to match the backend. This
governed every resolved mismatch below and should govern the next one.

It has one important limit, discovered while building Telegram: it resolves
disagreements about *shape*, but not about *what is possible*. Where the
frontend's model assumes something the backend physically cannot do — a
synchronous bot link, an instant photo upload with no storage behind it — the
frontend has to grow, because there is no shape the backend can adopt. Those
cases are called out individually in §5.

---

## 1. Status at a glance

**Resolved and shipped.**

| Finding | Resolution |
|---|---|
| `GET /emails` count query threw on `status`/`classification` filters | Fixed — it was building its WHERE clause against a mismatched parameter array; it now builds its own |
| Opportunity status enum didn't match the frontend's lifecycle | Aligned to `new\|saved\|pursuing\|passed` (migration 009) |
| `user_preferences` shape bore no relation to `AgentPreferences` | Replaced with a single `preferences JSONB` holding that shape verbatim (migration 009) |
| No thread-level endpoint, though `email_threads` was already populated | `GET /threads` added |
| `emails.status` was unconstrained, unlike every other status column | CHECK constraint added (migration 010) |
| Settings / Profile / Telegram had no backend at all | **Fully implemented and verified end-to-end** — migration 011, three new routers, frontend API client, store wiring (§2–4) |

**Open, in the order it blocks things.**

1. **Mailbox location has no backend representation.** The single concrete
   blocker on the next integration item — see §7.
2. **Approvals materialization** doesn't exist. Needs new backend logic, not
   just a route (§6).
3. **Gmail write scope** (`gmail.modify`/`gmail.send`) still not requested;
   requires existing users to re-consent whenever it lands (§6).
4. **Dashboard, Drafts, Scheduling, Feedback** — unbuilt (§6).
5. **`audit_events` immutability makes user deletion impossible** — a real
   pre-existing schema tension, flagged and deliberately not fixed (§6).

---

## 2. Backend: what exists now

### Schema

Migrations `001`–`011`. `008` is a comment-only rebrand.

Core tables carried over from Phase A: `users`, `user_credentials`,
`provider_sync_states`, `sync_runs`, `email_threads`, `emails`,
`extraction_runs`, `email_intelligence`, `actions`, `opportunities`,
`approvals`, `agent_executions`, `audit_events`, `user_preferences`,
`memory_store`, `llm_usage_events`, plus the migration-006 validation program
tables (internal tooling only — explicitly *not* customer product APIs, and
not relevant to this integration).

Changed or added during integration:

- **`opportunities.status`** (009) — now `new|saved|pursuing|passed`, matching
  the frontend exactly. Existing rows migrated `surfaced→new`,
  `applied→pursuing`, `dismissed→passed`; `saved` unchanged. Default moved
  `'surfaced'` → `'new'`. `intelligenceService.ts`'s
  `PROTECTED_OPPORTUNITY_STATUSES` is now `{saved, pursuing, passed}` — every
  state except `new` is protected from being overwritten by re-extraction,
  matching how the frontend treats `new` as the only re-surfaceable state.

  `applied` folded into `pursuing` rather than `passed`: someone who applied
  to something hasn't given up on it, and `passed` would have misrepresented
  their state. This mapping was effectively forced by "frontend wins," not a
  free choice.

- **`user_preferences`** (009) — `autopilot_level`, `personality_mode`,
  `reply_tone`, `automation_policies`, `priority_weights`,
  `sync_interval_minutes` and `action_retention_days` dropped
  (grep-verified unreferenced), replaced by one
  `preferences JSONB NOT NULL DEFAULT '{}'`. JSONB rather than flat columns
  because `AgentPreferences` is nested — a per-category `cleanup` map, an
  ordered `highPriorityTopics` array, two colour enums — and flattening it
  would either lose the structure or require several tables for what is, on
  the frontend, one serialisable settings blob. `iana_timezone` on this table
  was deliberately left alone.

  ⚠️ This migration drops those columns outright. Fine on a dev database;
  worth a manual check before running against anything holding real rows.

- **`emails.status`** (010) — CHECK constrained to `unread|read|deleted`.
  Deliberately **not** a union with the frontend's `MailRow.status`; see §7
  for why those are different questions, not the same field under two names.

- **`users`** (011) — two new columns:
  - `display_name TEXT NULL` — the user-editable name. A **new column, not a
    reuse of `full_name`**, because the OAuth callback runs
    `full_name = EXCLUDED.full_name` on every login; mapping `displayName`
    onto it would have silently reverted user renames at the next sign-in.
    Readers use `COALESCE(display_name, full_name)`, so a user who has never
    renamed themselves reads back their Google name with no seeding step.
  - `profile_photo JSONB NOT NULL DEFAULT '{"kind":"none"}'` with a CHECK on
    the discriminant — holds the frontend's `ProfilePhoto` union verbatim. The
    constraint admits `uploaded` even though nothing writes it, so enabling
    uploads later is a route change rather than a second migration.

- **`telegram_integration`** (011) — new table, one row per user
  (`UNIQUE(user_id)`, `ON DELETE CASCADE`). Columns: `provider` (CHECK
  `'telegram'`), `telegram_chat_id`, `telegram_username`, `link_code`
  (UNIQUE), `link_code_expires_at`, `linked_at`, `notify_urgent_emails`,
  `notify_follow_ups`, `preferred_time` (CHECK: 24h `HH:MM` regex),
  `deadline_reminder` (CHECK: `1h|3h|1d|2d|3d`), timestamps.

  Three choices worth recording:
  - **Flat columns, not JSONB** — a deliberate departure from 009's choice,
    on 009's own reasoning. That reasoning was that `AgentPreferences` is
    nested and wouldn't flatten; it doesn't transfer here. This is four
    scalars, two of them enum-like, which this schema's convention says get
    CHECK constraints. They will also be *queried* rather than merely
    round-tripped — a reminder scheduler asks "who wants a 1d-before
    reminder at 09:00", which is a WHERE clause wanting real columns.
  - **`connected` is derived, never stored** — it is
    `telegram_chat_id IS NOT NULL`, computed per response. A stored boolean
    can disagree with whether a chat is actually addressable; a derived one
    cannot. This is the only field across the three wired stores with no
    column behind it.
  - **No `idempotency_key`** — a departure from the "idempotency key wherever
    a client might retry" convention. The retryable mutation here
    (send-test) isn't a row on this table; the table is an upserted per-user
    singleton with nothing to deduplicate. One-time linking semantics come
    from `link_code` being UNIQUE and consumed.

  Plus a **partial unique index on `telegram_chat_id`** — see §3 for the bug
  it prevents.

Still absent from the schema: `drafts`, `feedback`, and any mailbox-location
column.

### Endpoints

| Method & path | Auth | Behavior |
|---|---|---|
| `GET /auth/google` | none (rate-limited) | Redirects into Google OAuth w/ PKCE |
| `GET /auth/google/callback` | none | Exchanges code, upserts user, stores encrypted tokens + Google `picture` as a `provider` photo, sets `auth_token` (httpOnly JWT, 7d) + `csrf_token` cookies, redirects to `FRONTEND_URL/auth/callback` |
| `GET /auth/session` | cookie or Bearer | `{authenticated, user:{userId,email}, authMode}`. Answers **200 with `authenticated:false`**, never 401 — which is what lets `/auth/callback` ask the question without tripping the client's sign-in redirect |
| `POST /auth/logout` | none | Clears both cookies |
| `POST /auth/google/disconnect` | JWT | Revokes + deletes Google credentials and sync state |
| `POST /emails/sync` | JWT | Enqueues Gmail ingestion (idempotent per user per minute); 409 if a run is active |
| `GET /emails` | JWT | Paginated flat messages; plain `body_text` + metadata, **never raw HTML** |
| `GET /emails/:id/intelligence` | JWT | Latest `email_intelligence` row for an owned email |
| `POST /emails/:id/extract` | JWT (rate-limited) | Runs extraction synchronously for one owned email |
| `GET /sync/status` | JWT | `provider_sync_states` row + any active `sync_runs` entry |
| `GET /threads` | JWT | One row per `email_threads` record, LATERAL-joined to its most recent message, with `message_count`/`last_message_at`. Same ownership/pagination/no-HTML contract as `GET /emails` |
| `GET`/`PUT /preferences` | JWT | §3 |
| `GET`/`PUT /profile` | JWT | §3 |
| `GET`/`PUT /integrations/telegram` + `/connect`, `/disconnect`, `/test`, `/webhook` | JWT (webhook: secret header) | §3 |
| `/validation/*` | `X-Validation-Token` | Internal tooling. Not a customer surface |

Documented in `API.md` §4 (the three new resources) and §5 (validation).

### Auth and session

Google OAuth 2.0 with PKCE end to end, state validated and single-use.
**Gmail scope is `gmail.readonly` only** — `gmail.modify`/`gmail.send` are
explicitly not requested. Session is an HS256 JWT (`sub`, `email`), 7-day
expiry, issuer/audience checked, accepted via either an httpOnly cookie or a
`Bearer` header but never both (sending both is a 401).

State-changing cookie-authenticated requests require a double-submit CSRF
header (`X-CSRF-Token`) matching the non-httpOnly `csrf_token` cookie,
timing-safe compared. This pattern generalizes to every new route and needed
no extension for the three added here.

**Verified behaviour** (curl against the live API, all four combinations):
cookie GET with no CSRF header → 200; PUT with no header → 403 `CSRF_INVALID`;
PUT with a mismatched header → 403; PUT with a matching header → 200; cookie
and Bearer together → 401.

### Error envelope

`{error, message, requestId}` from `app.ts`'s global handler, with `error`
drawn from the bounded `ErrorCode` list in `errors/AppError.ts`.

**`requestId` is genuinely optional**, and this matters for any client parsing
it: `middleware/auth.ts` answers `AUTH_REQUIRED`, `AUTH_CONFLICT` and
`CSRF_INVALID` directly, and `app.ts`'s 404 handler does too — none pass
through the error handler that attaches `requestId`. Confirmed empirically: a
401 from `GET /preferences` returns `{"error":"AUTH_REQUIRED","message":
"Missing authentication token"}` with no `requestId`. So the responses a client
is *most* likely to hit are exactly the ones missing the field.

Three codes were added for Telegram: `TELEGRAM_NOT_CONFIGURED` (503),
`TELEGRAM_NOT_CONNECTED` (409), `TELEGRAM_SEND_FAILED` (502), each with a
matching `httpStatusForCode` branch.

### What the backend already materializes

`services/intelligenceService.ts` does real, idempotent candidate-to-record
materialization for **Actions and Opportunities**: each candidate above a
confidence threshold (0.7 for LLM output, 0.8 for deterministic fallback) is
upserted via a stable SHA-256 materialized-entity key — `(userId,
sourceEmailId, entityType, normalizedTitle, normalizedDeadline/target,
normalizedCategory)` — so re-running extraction never duplicates a record. A
protected-status set prevents the materializer from reopening or overwriting
something the human already resolved, enforced in the SQL `WHERE` clause
rather than in application code.

**There is no equivalent for Approvals.** Nothing builds a `prepared_payload`
or writes to that table. It is the one workflow entity where "the backend
already has more than you'd think" does not hold.

---

## 3. Item 1: Settings, Profile, Telegram — implemented and verified

The three routes exist, the frontend is wired to them, and the whole path has
been exercised against a live backend. Details below are as implemented, not
as planned.

### `GET`/`PUT /preferences`

Request and response are both **exactly `AgentPreferences`** — same key names,
same nesting, same allowed values: `replyDrafting`, `replyTone`,
`automation.{archive,followup}`, `cleanup.{promotions,newsletters,marketing,
banking}`, `highPriorityTopics[]`, `beta`, `urgencyColor`, `importanceColor`,
`quickAccessCollapsed`. No adapter layer in either direction — that is the
whole payoff of migration 009.

`PUT` takes the **complete** object, replace-not-merge, because
`settingsActions.update()` already merges locally and hands `save()` a whole
object, and `hydrate()` is documented replace-not-merge. A second server-side
merge semantics could disagree with the store's, so there is only one.

**Validation is deliberately asymmetric.** Reads are lenient — every missing
or unrecognised field falls back to its default, because the column defaults
to `{}` and a blob written by an older deploy may be incomplete; the response
is always a full `AgentPreferences`, never a partial. Writes are strict —
unknown keys and invalid enum values are 400s, because the only writer is our
own client, which sanitises before saving and structurally cannot send a bad
enum. If one arrives it's a bug worth surfacing.

Storage is the `preferences` column only; `iana_timezone` on the same table is
never touched.

### `GET`/`PUT /profile`

`GET` returns `{displayName, profilePhoto, email, emailChange}`.

`PUT` accepts **only the writable subset** `{displayName, profilePhoto}`, and
**rejects the read-only fields rather than ignoring them** — `email` and
`emailChange` each produce a named 400. Accepting a field and silently
discarding it leaves the caller with no way to learn the write did nothing.
`profilePhoto.kind === 'uploaded'` is also a named 400 (§5).

The response is a **superset** of the request, carrying the server-owned
`email` and `emailChange` too, so one round trip re-hydrates a complete
`UserProfile`.

`displayName` reads back as `COALESCE(display_name, full_name)` and falls
through to the email local-part if both are null. That third fallback matters:
`sanitizeProfile` substitutes `DEFAULT_PROFILE.displayName` for anything empty,
and that default is seeded from `mailAdapters`' demo constant `'Alex Rivera'` —
so an empty string from the server would render a real user as a fictional
person.

### Telegram

- `GET /integrations/telegram` → `{provider, connected,
  notificationPreferences:{urgentEmails,followUps},
  deliveryPreferences:{preferredTime,deadlineReminder}}`. **No row is not a
  404** — it returns the defaults with `connected:false`, because
  `sanitizeTelegramIntegration` has exactly two outcomes and the UI has no
  "integration does not exist" state distinct from "not connected". The chat
  id, username and link code are never in any response.
- `PUT` accepts the two preference groups only; `connected` is a named 400.
- `POST /connect` → `{linkUrl, expiresAt, integration}`. `linkUrl` is a
  `t.me/<bot>?start=<code>` deep link; the code is 32 CSPRNG bytes, base64url,
  single-use, 15-minute TTL. **`integration.connected` is still `false`** —
  returning true would be a lie the next `GET` contradicts.
- `POST /disconnect` → clears link state only. **Preferences are preserved**,
  because the frontend's own contract says so: "reconnecting doesn't ask the
  user to redo them." That is also why this is `POST /disconnect` and not
  `DELETE` on the resource — DELETE implies removing what must survive.
  Disconnecting a never-connected integration is a no-op, not a 404.
- `POST /test` → `{ok:true}` when Telegram accepts the message; otherwise the
  standard error envelope. Kept in one error channel rather than inventing a
  200-with-`ok:false`; the client adapter maps non-2xx into the `{ok:false,
  reason}` half of its own type.
- `POST /webhook` → **not JWT-authenticated**; Telegram has no session. Its
  only credential is `X-Telegram-Bot-Api-Secret-Token`, compared timing-safe.
  Handles `/start <code>` only and **always answers 200 once the secret
  validates**, whatever the payload — Telegram retries non-2xx, so erroring on
  an update we don't handle would earn an indefinite redelivery loop. A genuine
  server fault returns 500, where retrying is what we want.

**Double-linking protection.** Found while reviewing, not in the original
plan. Nothing prevented one Telegram chat being linked to two Obligo accounts:
link chat X to account A, then to account B, and *both* rows would point at X —
so that chat would receive a second person's email notifications. The webhook
now displaces any prior owner inside the same transaction before linking, and
rolls the whole thing back if the code turns out to be invalid or expired (an
unknown code must not disconnect a working integration as a side effect). The
partial unique index on `telegram_chat_id` is the backstop against a future
code path recreating the bug silently. Both displaced and new owners get audit
events.

Audit trail: `telegram_connected` on a successful link,
`telegram_disconnected` on disconnect and on displacement (with
`reason: 'chat_relinked'`). Written only when state actually changed, so the
trail records changes rather than button presses.

New env: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`,
`TELEGRAM_WEBHOOK_SECRET` — all optional-with-empty-default so an environment
without a bot still boots and still serves `GET`/`PUT` for preferences, with
`connect` and `test` returning `TELEGRAM_NOT_CONFIGURED`. Production refuses
to start if a bot token is set without a webhook secret or bot username: a
configured bot with an unauthenticated webhook is worse than no bot.

### Verified end to end

Against the live API with a real JWT and the compose Postgres/Redis stack:

- All three `GET`s return byte-for-byte the shapes the client is typed against.
- All three `PUT`s accept the client's exact payloads and echo the normalized
  object.
- Every rejection path confirmed: `uploaded` photo, `email`, `emailChange`,
  `connected`.
- **Full link flow**: `connect` → deep link with `connected:false` → webhook
  with the correct secret → `connected:true`. Wrong secret → 401. Replayed
  code → 200 acknowledged, no re-link. Disconnect preserved both preference
  groups.
- Test-send with a deliberately invalid bot token → 502
  `TELEGRAM_SEND_FAILED` with a bounded message and no token leakage.
- `display_name` and `full_name` confirmed independent in the database after a
  rename.
- Backend integration suite: 12/12 suites pass with migrations 001–011 applied
  to a clean schema.
- Frontend: typecheck clean, lint 0 errors, build succeeds, 364/364 tests pass.

**Not verified:** a real browser session. `GOOGLE_CLIENT_ID`/`SECRET` are
empty locally, so no actual OAuth round trip was completed — the cookie/CSRF
contract is proven at the protocol level with curl, not through cookies a live
callback set. And vitest runs `environment: 'node'` with no jsdom, so the
loading gate, the error banner and demo mode are verified by construction and
typecheck, not visually rendered. **Both are worth a manual pass once OAuth
credentials are configured.**

---

## 4. Frontend: the integration layer

Phase A recorded that the frontend had **no API client at all**. It has one
now.

### `lib/apiClient.ts` — transport

Base URL from `VITE_API_BASE`, falling back to `http://localhost:4000` in dev
and throwing a named configuration error otherwise. Every request sends
`credentials: 'include'`; the `auth_token` cookie is httpOnly so the client
never sees it. `X-CSRF-Token` is read from the non-httpOnly `csrf_token`
cookie and attached on mutating methods only, matching exactly what
`middleware/auth.ts` checks.

`ApiError` normalizes the envelope, treating `requestId` as optional and
distinguishing "the server said no" from "there is no server" — a fetch that
throws becomes `NETWORK_UNREACHABLE`, kept separate from `INTERNAL_ERROR`
precisely so the 401 redirect can fire for the first and never the second.

Import-safe under Node: nothing touches `document` or `window` at module
scope, and the cookie reader is a pure function over a cookie string, so the
existing `environment: 'node'` test setup needs no jsdom.

### `VITE_API_BASE` is the demo-mode switch

**Unset** — no request is ever made, the three stores run on shipped defaults
for the session, and a 401 cannot bounce anyone out of the workspace. This is
how the app behaved before the backend existed and remains useful for
frontend-only work; it is also the committed default, so a fresh checkout runs
with no backend required.

**Set** — hydration on shell mount, write-through on change, and an expired
session redirects to Landing.

Gating on configuration rather than making the redirect unconditional was a
deliberate call: without it, a backend that simply isn't running would make
local frontend development impossible.

### The commit/persist split

Each store previously had one `save()` doing three jobs: set memory, write
`localStorage`, notify. That became:

- **`commit(next)`** — memory + subscribers. No network. **`hydrate()` uses
  this.**
- **`persist(next)`** — commit, then schedule the write.

If `hydrate()` had kept calling the same function that gained the PUT, every
GET would immediately echo a PUT of what the server just sent — a bug that is
invisible in testing because the round trip succeeds.

### The `hydrated` write guard

Each store tracks whether it holds the server's copy or merely the defaults,
and **`persist()` refuses to write unless it does.** This is not a nicety: if
the initial GET failed, the store is rendering defaults, and writing them back
would overwrite whatever the user actually had saved with a blank slate they
never chose. A local change still applies for the session — it just never
leaves the tab.

### `reset()` vs `clearLocalState()`

The highest-consequence detail in this layer. Two operations that look
identical had been sharing one function:

- **`reset()`** — "restore defaults," a deliberate user action, so it
  **writes**.
- **`clearLocalState()`** — "drop local state," the sign-out path, so it must
  **never write**, and cancels any queued write too.

`sessionActions.signOut()` calls the latter. Had it called `reset()`, signing
out would have PUT the defaults over everything the user had saved — the exact
opposite of signing out. `signOut()` now flushes pending writes first, then
calls `POST /auth/logout`, then clears local state; both call sites
(`AccountMenu`, `Profile`) were changed to `await` it, since navigating out
from under it would abort both the flush and the logout.

### Writes are optimistic and debounced

The commit is synchronous so every Settings control stays instant; the network
write is debounced ~400ms behind it, latest-wins (each endpoint takes the
complete resource, so an older payload carries nothing the newer one lacks).
This preserves the store's own long-standing contract — "a failed write is not
a failed change; the new value still takes effect for this session" — with the
network in place of storage. Failures surface in a banner rather than rolling
back, because reverting a control under the user's cursor is worse than a
stale write.

### Eager bootstrap in `AppShell`

`lib/storeBootstrap.ts` fires all three GETs in parallel on shell mount,
idempotently (safe under StrictMode's double-invoked effects).

Eager rather than lazy because two of the three are read on *every* workspace
route, not just their own page: `AppShell` itself reads preferences for the
root `data-urgency`/`data-importance` attributes, and `AccountMenu` reads the
profile for the topbar avatar. "First access" is therefore immediately, on
every route, so laziness would buy nothing and cost a second code path.
Telegram rides along — one more small parallel request is cheaper than a
second hydration lifecycle.

`Promise.allSettled`, and the phase ends on **settled, not succeeded**: a
store whose GET failed is marked unavailable and left on defaults with writing
disabled. Blocking until success would turn one backend blip into a
permanently blank workspace.

### The loading gate

Before the backend, the stores were populated at module load, so the very
first paint carried real values. A round trip would otherwise have shown three
wrong things at once:

1. the whole surface in default attention colours before repainting in the
   user's — a full-app colour flash, since those two root attributes drive
   every rail, wash, dot, badge and label through `index.css`;
2. a **demo identity** in the topbar avatar, since `DEFAULT_PROFILE` seeds
   from `CURRENT_USER_NAME` — showing a real user a fictional person's
   initials;
3. worst, controls a user could touch during the gap, whose change `hydrate()`
   would then silently overwrite, because hydration is replace-not-merge.

One gate at the shell removes all three, and costs a single round trip since
the GETs are parallel. It renders a neutral splash that reads no attention
token, so it can't itself flash a colour it exists to prevent. `lib/syncStatus.ts`
holds the aggregate phase; a non-blocking banner reports both a degraded load
("changes here won't be saved") and a failed write.

`syncStatus` is its own module for a structural reason: the stores report write
failures into it, and `storeBootstrap` imports those stores, so anything the
stores import must not import them back. It imports nothing.

### `localStorage` is gone

Removed from all three stores, and the three retired keys
(`obligo-agent-preferences`, `obligo-user-profile`,
`obligo-telegram-integration`) are actively deleted on bootstrap — no longer
reading them would still leave the data in every existing browser
indefinitely, and it is exactly the stale user-scoped state `signOut()` exists
to stop leaking between accounts.

Dropped rather than migrated, and rather than kept as an offline fallback:

- A fallback creates two sources of truth with no reconciliation rule. If
  local and server disagree, which wins? `hydrate()` is replace-not-merge
  precisely so that question never has to be answered.
- No migration is owed, because this app has never had a backend to sync to —
  nothing in those keys can be authoritative user data, only demo browsing.

Note this is **not** a blanket removal: `useQuickAccess` keeps its own
`localStorage` for the pinned-views list, and theme keeps its own. Only
`quickAccessCollapsed` lives in preferences, not the list itself.

### `/auth/callback`

**This route did not exist.** The backend has always redirected to
`${FRONTEND_URL}/auth/callback`, which hit `App.tsx`'s catch-all and bounced
the user to Landing — login worked, but silently deposited people on the
marketing page.

It now exists, outside `AppShell` (the shell's bootstrap assumes a session;
this route is what establishes there is one). On mount it calls
`GET /auth/session` and hard-redirects to `/dashboard` if authenticated or `/`
if not. Hard navigation rather than router `navigate()`, for the same reason
`signOut()` documents: the stores are module singletons seeded at import, so a
fresh module graph is what guarantees a new session starts clean.

### Tests

364/364 pass. Six tests in `attentionColors.test.ts` and
`settingsIntegration.test.ts` had asserted `localStorage` persistence across a
module reload; each was ported to assert the same intent against the API wire
— "sends the semantic name over the wire" now inspects the captured PUT
payload, and "survives a reload" now round-trips through `hydrate()` with what
the store actually sent. Every assertion's meaning is preserved; none were
deleted, and `backendReadiness.test.ts` was not touched.

That file remains the most reliable single statement of what each store's
backend counterpart must satisfy — replace-not-merge hydration, ISO-only
timestamps, one draft per thread, idempotent completion, reactivation
restoring pre-completion state. Check any new adapter shape against it
directly.

---

## 5. Product decisions taken during implementation

These were product/UX calls, not engineering ones, and each closed a control
that would otherwise have failed or misled.

**`profilePhoto` supports `none` and `provider` only.** `uploaded` carries a
client-side data URL with no storage behind it, and would exceed
`express.json`'s 512kb body limit for most real photos. `provider` cost
nothing: the `profile` scope was already requested, so the OAuth callback
already receives Google's `picture`. The Profile row is now read-only, showing
the current avatar with copy explaining the picture comes from Google.

Removal was withheld too, for a subtler reason than upload: `{kind:'none'}`
*is* writable, but with uploads unavailable and the Google picture only
re-applied to a photo that is already `provider`, removing one is a door that
doesn't reopen. A control that works once and then strands the user is worse
than one plainly marked not-ready.

**`emailChange` is out of scope.** `GET /profile` always reports
`{status:'none'}` and `PUT` rejects the field. A real flow needs a
verification-token table and outbound email, neither of which exists — and
more fundamentally the address is the Google account's, re-read at every
login, so a local change would be undone at the next sign-in even if it
persisted. Storing an unconfirmable pending state would have been worse than
not having the feature. The row is read-only with copy saying so.

**`changePassword` replaced by a read-only "Sign-in: Google" row.** This was
the most misleading control on the page: a full current/new/confirm form that
reported "Password updated." for a password that does not exist.

Its framing deliberately differs from the two above. Pictures and email
changes are **deferred** — the backend can't do them yet and one day will. A
password is different in kind: sign-in is Google OAuth only, so the account has
no Obligo credential to rotate. Nothing ships here later, so the copy says
what's true ("Sign-in uses your Google account, so there's no separate
password to change") rather than "not available yet." The masked `••••••••`
was dropped for the same reason — dots imply a stored secret. The
`changePassword()` stub is retained, marked inert and called by nothing, as
the shape a `POST /account/password` seam would take *if* a non-Google
credential path is ever added.

**Telegram: `connected` cannot be synchronous, so the frontend grew.** This is
the one place "frontend wins" couldn't resolve the disagreement.
`connectIntegration()` was a synchronous, argument-less, void boolean flip.
Real linking is asynchronous by nature: issue a code, the user leaves for
Telegram, a webhook completes the binding seconds later. No backend shape
collapses that into a boolean flip.

**Status: the linking UI is now fully wired — this is no longer an open gap.**
An earlier revision of this document flagged it as outstanding; that is stale.
`TelegramIntegrationModal.tsx` now carries a four-state machine
(`idle`/`working`/`awaiting`/`error`), opens the deep link, renders it as a
fallback if the popup is blocked, polls `telegramActions.refresh()` every 3s
while awaiting, stops on connection or code expiry, and clears itself when the
store reports a connection — including one completed in another tab. The store
functions are `connect()`/`disconnect()`/`refresh()`, all async and all
returning result objects rather than throwing.

What genuinely remains for Telegram is **operational, not code**: no bot has
been registered, so `TELEGRAM_BOT_TOKEN`/`USERNAME`/`WEBHOOK_SECRET` are
unset in every real environment and the webhook has never been registered with
Telegram via `setWebhook`. The flow was verified with a deliberately fake
token, which exercises everything except Telegram's own delivery. Standing up
a real bot is the remaining step.

---

## 6. Findings surfaced but not fixed

Recorded so they aren't rediscovered from scratch.

**Local-environment config drift — now fixed, but worth knowing it happened.**
The project's compose file published Postgres on host **5433**, which collided
with a natively-installed PostgreSQL service already holding that port on a
developer machine, so `docker compose up` couldn't bind. Worse, the connection
values disagreed in three places: compose said `postgres/postgres/inbox_intel`
on 5433, `.env.example` said `postgres/postgres/obligo` on **5432**, and
`env.ts`'s default said `HP@localhost:5432/obligo_test` — a username from
someone's personal machine. Nothing was listening on 5432 at all, so anything
using either default failed outright.

Resolved by moving compose to host **5434** and making all three agree on
`postgres://postgres:postgres@localhost:5434/inbox_intel`, with the `HP`
default removed. The same stale URL was also in `README.md`,
`CONTRIBUTING.md` and `backend/docs/LOCAL_DEVELOPMENT.md`, all of which
additionally told developers to apply migrations `001`–`007` and stop — which
would have left 008–011 unapplied. All four now carry the canonical URL and
the full migration list. **If a fresh clone can't reach the database, check
this class of drift before debugging anything else.**

**`audit_events` immutability makes user deletion impossible. Still open.**
`audit_events` has a trigger blocking UPDATE and DELETE, but
`audit_events.user_id` is `ON DELETE CASCADE`. Deleting a user cascades into
`audit_events`, the trigger raises, and the delete fails. Since every user
gets a `user_login` event at first sign-in, **no user row can ever be
deleted.** Hit while trying to clean up a seeded test user.

Pre-existing since migration 001 and out of scope for this work, but it has
obvious implications if account deletion or a data-subject erasure request
ever becomes a requirement. Resolving it means choosing between anonymising
audit rows in place, exempting deletion from the trigger, or severing the FK —
a decision, not a patch.

**A stale doc reference in application code.** `lib/userProfile.ts`'s
`ProfilePhoto` comment still points at `profileActions.setUploadedPhoto`,
which no longer exists (the photo mutations were removed with the UI). Noted
rather than fixed, since this revision was documentation-only.

**Audit coverage on mutations is still thin.** `audit_events` now records
Telegram connect/disconnect alongside `user_login` and `google_disconnected`,
but no workflow mutation is audited, and preference/profile edits deliberately
aren't either (the convention here audits auth-lifecycle events, not ordinary
data edits). Worth revisiting when Actions/Approvals routes land, rather than
as a second pass afterwards.

**The rate limiter keys on IP, not user.** `middleware/rateLimit.ts` builds
its key from `req.ip`, so users behind one NAT share a bucket and one user
across two networks gets two. Pre-existing; it means the per-route limits on
the new write endpoints are weaker than they read. A `keyBy: 'user'` option
would fix it.

---

## 7. What's open, in blocking order

### Blocking item 2: mailbox location has no backend representation

`emails.status` (constrained to `unread|read|deleted`, migration 010) and the
frontend's `MailRow.status` (`inbox|archived|trash|spam|snoozed`) look like the
same field because both are called "status," but they answer different
questions — read state vs. mailbox location — the same way Gmail treats them as
orthogonal (a message can be read *and* still in the inbox).

Grep-verified: nothing in the backend has ever written
`inbox`/`archived`/`trash`/`spam`/`snoozed` anywhere. That concept does not
exist on `emails` at all. This isn't a naming clash to rename away; it's an
unbuilt feature — a real archive/trash/spam/snooze action against a stored
email.

**It blocks the `GET /threads` → `MailRow` adapter.** `unread` maps cleanly
today (`status === 'unread'`); the location values have nothing to map onto.
Needs a decision — new column vs. repurposing `emails.status` — **before** that
adapter is written, not during.

A second question rides along: mutations that would set the column
(archive/trash/snooze/star) can get simple routes with no Gmail write scope,
*if* the product accepts Obligo's view of location diverging from Gmail's own
labels until write scope lands. That's an explicit call, not a silent default.

### Then: Actions & Opportunities routes

The highest-leverage step after the Inbox, since materialization already exists
server-side. `GET /actions`, `PATCH /actions/:id` (complete/snooze/cancel),
`GET /opportunities`, `PATCH /opportunities/:id` (lifecycle transition — the
enum already matches). Wire `workflowStore.hydrate()` and its three mutation
functions to these. The frontend patterns from item 1 — commit/persist,
`hydrated` guard, bootstrap, optimistic debounced writes — should transfer
directly.

### Still unbuilt

- **Approvals** — the `approvals` table exists but nothing writes to it. Needs
  materialization logic from scratch, not just a route. And it's downstream of
  Gmail write scope: the whole Action-vs-Approval distinction ("human must
  act" vs "Obligo already did the work, just approve/send") is only meaningful
  once the backend can draft or send. Until then any Approval it produced would
  be fictional.
- **Gmail write scope** — `gmail.modify`/`gmail.send` not requested. The single
  biggest blocker: real send/schedule, execution, and any Gmail-reflected
  archive/trash/snooze all sit behind it, and adding it forces **existing users
  to re-consent**. Scope this early rather than discovering it mid-integration.
- **Dashboard** — aggregation only, no new persistence, but nothing to build
  against until Actions/Opportunities/Approvals have routes.
- **Drafts** — no table, no route. Independent of write scope, since drafts
  aren't sent. Frontend model is one draft per thread, upserted; currently
  in-memory only, so a refresh loses it.
- **Scheduling** — no persistence beyond `approvals.scheduled_at`, which
  nothing populates. Also needs send scope.
- **Feedback** — no table or route. Low-risk, no dependencies, slot in
  anywhere.
- **Attachments** — backend stores `attachment_metadata` JSONB only; no
  retrieval endpoint and no signed-URL generation. The frontend's
  `StoredAttachment` has no URL field yet either, so both sides are
  consistent about this being unbuilt.

### Settled but worth restating

**`emails.id` vs the frontend's mail-row `id`.** Now that `GET /threads`
exists: `email_threads.id` is the canonical id for Inbox and workflow rows
(threads), and `emails.id` addresses an individual message within a thread.
Still needs to be made explicit in the adapter, but which table is no longer
in question.

---

## 8. What should remain frontend-only

- `LocalAttachment` handling during composition — only the eventual
  `StoredAttachment` needs a backend counterpart.
- Derived/display-only computation: `attention` derivation, deadline bucketing
  (`dueBucketFor`), relative time formatting, avatar initials and resolution.
  Presentation logic over backend data, not data the backend should compute or
  store.
- The composer's discard/cancel/save-as-draft *interaction* state machine —
  only the final save/send/schedule crosses the network.
- The Telegram modal's link-state machine and polling — the pending UI is
  frontend interaction state over a backend fact (`connected`), not state the
  backend should model.
- Theme, and the Quick Access pinned list (membership and order). Note the
  distinction: `quickAccessCollapsed`, `beta`, `urgencyColor` and
  `importanceColor` **are** carried by `PUT /preferences` — they're fields of
  `AgentPreferences`, which `agentPreferences.ts` documents as the
  backend-ready settings object and which migration 009 stores wholesale.
  Splitting them out would require a merge layer the store's replace-not-merge
  `hydrate()` deliberately does not have. An earlier revision of this document
  listed Quick Access collapse state as frontend-only; that was wrong.
