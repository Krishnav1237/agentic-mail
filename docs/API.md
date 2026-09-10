# API Reference
*Obligo Backend — Phases 1–4 + Settings/Profile/Integrations + Validation Infrastructure*

---

> [!NOTE]
> **VALIDATION OPERATIONS & STRATEGY STATUS**
> - **Validation Infrastructure:** Implemented (`/api/v1/validation/*` internal endpoints, deny-by-default token auth).
> - **Synthetic Regression Benchmark:** Implemented (`npm run validation:regression`).
> - **Real Quality Benchmark:** NOT YET COMPLETED (requires live LLM provider key and external held-out human corpus; returns `QUALITY_BENCHMARK_NOT_RUN`).
> - **Placement Vertical / OAuth vs Forwarding Path:** UNVALIDATED (pending 14-day cohort study execution).
> - **Phase 5–7 APIs:** PARTIAL. Settings, Profile and Telegram (§4) are built — see §10 item 1 of `integration-audit.md`. Mail/Actions/Opportunities/Approvals/Dashboard/Drafts APIs, Gmail write execution, and agent planners remain unbuilt.

---

## 1. Global Conventions

### 1.1 Base URL
- **Local Development**: `http://localhost:4000`
- **Production API**: `https://your-api.up.railway.app`

### 1.2 Request ID Correlation
Every HTTP response includes an `x-request-id` header containing a 16-character hexadecimal correlation ID for request tracing:
```http
HTTP/1.1 200 OK
x-request-id: a1b2c3d4e5f67890
```

### 1.3 Standard Response Envelopes

#### Success Response
Success responses return JSON objects or arrays directly with HTTP status `200 OK` or `202 Accepted`.

#### Error Response Envelope
All error responses return standard JSON matching this structure:
```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable description of what went wrong",
  "requestId": "a1b2c3d4e5f67890"
}
```

---

## 2. Security & Authentication Rules

### 2.1 Supported Authentication Modes
Protected application endpoints accept either:
1. **HttpOnly Session Cookie**: `auth_token=<jwt>`
2. **Authorization Header**: `Authorization: Bearer <jwt>`

Internal validation tooling endpoints accept:
1. **Validation Header**: `X-Validation-Token: <token>`

---

## 3. Core Application Endpoints (Phases 1–4)

### 3.1 Health & Readiness

#### `GET /health/live`
- **Auth**: Public
- **Response `200 OK`**: `{"status": "ok"}`

#### `GET /health/ready`
- **Auth**: Public
- **Response `200 OK`**: `{"status": "ok", "db": true, "redis": true}`

---

### 3.2 Authentication & Google OAuth

#### `GET /auth/google`
- **Auth**: Public
- **Purpose**: Initiates Google OAuth 2.0 PKCE authorization flow (`gmail.readonly`).

#### `GET /auth/google/callback`
- **Auth**: Public
- **Purpose**: Consumes PKCE authorization code and state token, exchanges code for Google tokens, encrypts tokens at rest, and sets session cookie.

#### `GET /auth/session`
- **Auth**: Protected
- **Purpose**: Check current session state and connected account details.

#### `POST /auth/logout`
- **Auth**: Protected
- **Purpose**: Clears session cookie and invalidates session token.

#### `POST /auth/google/disconnect`
- **Auth**: Protected
- **Purpose**: Revokes and deletes stored Google OAuth credentials for the user.

---

### 3.3 Synchronization Operations

#### `POST /emails/sync`
- **Auth**: Protected
- **Purpose**: Trigger an asynchronous Gmail sync job for the authenticated user.

#### `GET /sync/status`
- **Auth**: Protected
- **Purpose**: Inspect current provider sync status and active run details.

---

### 3.4 Email & Intelligence Operations

#### `GET /emails`
- **Auth**: Protected
- **Query Parameters**:
  - `limit`: Number (1–100, default 50)
  - `offset`: Number (default 0)
  - `status`: String (optional)
  - `classification`: String (optional)
- **Safety Policy**: Returns plain `body_text` only. Executable HTML tags are stripped during ingestion. Raw HTML is **not** exposed in API responses.

#### `POST /emails/:id/extract`
- **Auth**: Protected
- **Path Parameters**: `:id` (UUID format)
- **Rate Limit**: 30 req / 1 min
- **Purpose**: Execute structured AI extraction on a specific email.

#### `GET /emails/:id/intelligence`
- **Auth**: Protected
- **Path Parameters**: `:id` (UUID format)
- **Purpose**: Retrieve the latest structured AI intelligence snapshot for an email.

---

## 4. Settings, Profile & Integrations

These three resources are **singletons per user**. There is no `:id` in any path, and none of them 404 for a user who has simply never saved — a missing row reads back as the documented defaults. Each response body is exactly the shape the corresponding frontend store's `hydrate()` consumes, with no wrapper key.

### 4.1 Agent Preferences

#### `GET /preferences`
- **Auth**: Protected
- **Returns**: a complete `AgentPreferences` object — `replyDrafting`, `replyTone`, `automation.{archive,followup}`, `cleanup.{promotions,newsletters,marketing,banking}`, `highPriorityTopics[]`, `beta`, `urgencyColor`, `importanceColor`, `quickAccessCollapsed`.
- **Defaults**: a user with no stored preferences (the column defaults to `{}`) reads back the shipped defaults, never a partial object. Unrecognised stored fields fall back per-field.

#### `PUT /preferences`
- **Auth**: Protected
- **Rate Limit**: 60 req / 1 min
- **Body**: a **complete** `AgentPreferences` object — replace, not merge. Unknown keys and invalid enum values are rejected with `400 VALIDATION_ERROR`.
- **Returns**: the normalized stored object, identical in shape to `GET`.
- **Storage**: `user_preferences.preferences` (JSONB, migration 009). `iana_timezone` on the same table is never touched by this route.

### 4.2 Profile

#### `GET /profile`
- **Auth**: Protected
- **Returns**: `displayName`, `profilePhoto`, `email`, `emailChange`.
- **`emailChange`** is always `{"status":"none"}`. Email-change verification is not implemented — auth is Google-OAuth-only and `users.email` is upserted from Google on every login.
- **404** if the JWT names a user that no longer exists.

#### `PUT /profile`
- **Auth**: Protected
- **Rate Limit**: 30 req / 1 min
- **Body**: `{ displayName, profilePhoto }` — the writable subset. Both required.
- **Rejected with `400`**: `email` (changes only through a verified flow), `emailChange` (not implemented), and `profilePhoto.kind = "uploaded"` (no image storage is configured — use `{"kind":"none"}` or `{"kind":"provider","url":…}`).
- **Returns**: the full `UserProfile`, a superset of the request, so one round-trip re-hydrates complete state.
- **Storage**: `users.display_name` and `users.profile_photo` (migration 011). `users.full_name` stays the Google-supplied value and is deliberately **not** written here — it is overwritten on every login.

### 4.3 Telegram Integration

`connected` is **derived**, never stored: it is true exactly when a Telegram chat is linked. It is not writable through `PUT`.

> [!NOTE]
> Linking is asynchronous. `POST /connect` returns a deep link with `connected` still `false`; the integration only becomes connected once the user presses Start in Telegram and the bot webhook delivers the code back.

#### `GET /integrations/telegram`
- **Auth**: Protected
- **Returns**: `provider`, `connected`, `notificationPreferences.{urgentEmails,followUps}`, `deliveryPreferences.{preferredTime,deadlineReminder}`.
- A user with no integration row reads back the defaults with `connected: false` — never a `404`.
- The linked chat id, username and link code are **never** included in any response.

#### `PUT /integrations/telegram`
- **Auth**: Protected
- **Rate Limit**: 30 req / 1 min
- **Body**: `{ notificationPreferences, deliveryPreferences }`. `preferredTime` must be 24-hour `HH:MM`; `deadlineReminder` must be one of `1h|3h|1d|2d|3d`. Sending `connected` is a `400`.
- **Returns**: the full `TelegramIntegration`.

#### `POST /integrations/telegram/connect`
- **Auth**: Protected
- **Rate Limit**: 30 req / 1 min
- **Returns**: `{ linkUrl, expiresAt, integration }`. `linkUrl` is a `t.me` deep link valid for 15 minutes; `integration.connected` is still `false`.
- **`503 TELEGRAM_NOT_CONFIGURED`** when no bot is configured on the server.
- Issuing a new code invalidates any previous one for the same user.

#### `POST /integrations/telegram/disconnect`
- **Auth**: Protected
- **Rate Limit**: 30 req / 1 min
- Clears link state only. **Notification and delivery preferences are preserved**, so reconnecting does not ask the user to reconfigure. This is why it is `POST /disconnect` rather than `DELETE` on the resource.
- Disconnecting a never-connected integration is a no-op, not an error.
- Writes a `telegram_disconnected` audit event when something was actually disconnected.

#### `POST /integrations/telegram/test`
- **Auth**: Protected
- **Rate Limit**: 5 req / 1 min
- **Returns**: `{ "ok": true }` once Telegram accepts the message.
- **`409 TELEGRAM_NOT_CONNECTED`** when no chat is linked; **`502 TELEGRAM_SEND_FAILED`** when Telegram rejects or is unreachable; **`503 TELEGRAM_NOT_CONFIGURED`** when no bot is configured.

#### `POST /integrations/telegram/webhook`
- **Auth**: **Not** JWT-protected — Telegram has no session. Authenticated solely by the `X-Telegram-Bot-Api-Secret-Token` header, compared timing-safe against `TELEGRAM_WEBHOOK_SECRET`.
- **Rate Limit**: 120 req / 1 min
- Handles `/start <code>` only; every other update is acknowledged and ignored. Link codes are single-use and expire after 15 minutes, enforced in SQL.
- Always returns `200` once the secret validates, so Telegram does not retry updates that will never become valid. A genuine server fault returns `500`, where retrying is desirable.
- Writes a `telegram_connected` audit event on a successful link.

---

## 5. Internal Validation Tooling Endpoints

> [!IMPORTANT]
> **Internal Validation Tooling Notice**
> - Protected by `X-Validation-Token` pre-shared secret.
> - **NOT Phase 5 Customer APIs**.
> - Disabled (HTTP 503) when `VALIDATION_TOKEN` is unconfigured or < 32 characters in environment.

### Authorization Behavior

| Environment `VALIDATION_TOKEN` | Request Header `X-Validation-Token` | HTTP Status | Response Error Code |
|---|---|---|---|
| Unconfigured or < 32 chars | Any | `503` | `VALIDATION_NOT_CONFIGURED` |
| Configured | Missing or empty | `401` | `VALIDATION_TOKEN_REQUIRED` |
| Configured | Incorrect token | `403` | `VALIDATION_TOKEN_INVALID` |
| Configured | Correct token | `200` / `next()` | Access Permitted |

### Endpoint Summary

- `POST /validation/cohorts`: Create a validation cohort (`name`, `vertical`, `startDate`, `endDate`).
- `GET /validation/cohorts`: List validation cohorts.
- `GET /validation/cohorts/:id`: Get validation cohort details.
- `PATCH /validation/cohorts/:id`: Update validation cohort details or status (`planning`, `active`, `completed`, `cancelled`).
- `POST /validation/cohorts/:id/participants`: Add a participant code (`participantCode`, `persona`, `source`).
- `GET /validation/cohorts/:id/participants`: List participants in a cohort.
- `PATCH /validation/participants/:id`: Update participant onboarding, retention, or willingness-to-pay.
- `POST /validation/cohorts/:id/ingestion-attempts`: Record an ingestion attempt (`participantId`, `ingestionMode`).
- `POST /validation/cohorts/:id/email-labels`: Record a human email label (`emailId`, `reviewerCode`, `isCritical`, `shouldCreateAction`, `shouldCreateOpportunity`, `correctDeadline`).
- `POST /validation/cohorts/:id/extraction-reviews`: Record an extraction candidate review (`emailId`, `reviewerCode`, `actionValid`, `opportunityValid`).
- `POST /validation/cohorts/:id/interviews`: Record discovery interview data (`participantId`, `problemSeverity`, `currentWorkaround`, `priceResponse`).
- `GET /validation/cohorts/:id/metrics`: Compute cohort metrics against ground-truth reviews.
- `POST /validation/cohorts/:id/decision`: Evaluate cohort Go/No-Go decision rules against versioned thresholds (`v1`).
- `GET /validation/cohorts/:id/export`: Export sanitized cohort validation data for analysis (excludes email bodies, prompts, raw tokens, and personal interview transcripts).
