# Backend Implementation Status & Subsystem Inventory
*Inbox Intelligence Layer (IIL) Backend — Phases 1–4 Implementation State*

---

> **Status Baseline**: Backend Phases 1–4 and the validation operations infrastructure are implemented and structurally verified through automated tests. Real Google OAuth, live Gmail synchronization, real-provider extraction quality, manual forwarding feasibility, user demand, willingness to pay, and vertical selection still require owner-led validation. Phase 5–7 remain deferred.

---

## 1. Subsystem Inventory Matrix

| Subsystem / Feature | Classification | Relevant Source Files | Summary |
|---|---|---|---|
| **Backend initialization** | Implemented and runtime-tested | `src/server.ts`, `src/app.ts` | Express server factory, Helmet security headers, JSON/URL-encoded body limits (512kb). |
| **Environment validation** | Implemented and runtime-tested | `src/config/env.ts` | Zod schema validation for all env vars. Strict production checks for secret keys, active mode rejection, and `TRUST_PROXY`. |
| **PostgreSQL connection** | Implemented and runtime-tested | `src/db/index.ts` | `pg` connection pool with max 20 clients, idle timeout 30s. Health probe check. Migrations 001–007 applied. |
| **Redis connection** | Implemented and runtime-tested | `src/redis/index.ts` | 4 isolated `ioredis` clients (`redisCache`, `redisQueue`, `redisWorker`, `redisQueueEvents`). Ping health check. |
| **BullMQ queue engine** | Implemented and runtime-tested | `src/queues/index.ts`, `src/workers/ingestionWorker.ts` | BullMQ worker & queue setup for asynchronous `ingest-inbox` background jobs. |
| **Liveness probe (`/health/live`)** | Implemented and runtime-tested | `src/app.ts` | Public 200 HTTP health check probe. |
| **Readiness probe (`/health/ready`)** | Implemented and runtime-tested | `src/app.ts` | Public 200/503 HTTP health probe verifying DB and Redis ping connections. |
| **Request IDs (`x-request-id`)** | Implemented and runtime-tested | `src/app.ts` | Middleware generating 16-char hex random correlation ID attached to request and response headers. |
| **Typed error handling** | Implemented and runtime-tested | `src/errors/AppError.ts`, `src/app.ts` | Bounded `AppError` class and `ErrorCode` enum. `toSafeCode()` sanitizes secrets/SQL from outputs. |
| **CORS configuration** | Implemented and runtime-tested | `src/app.ts` | Whitelist verification against `FRONTEND_URL`. Disallowed origins receive no credential headers. |
| **Trust proxy (`TRUST_PROXY`)** | Implemented and runtime-tested | `src/config/env.ts`, `src/app.ts` | Configurable trust proxy setting. Default `'0'` (disabled) in dev/test; requires explicit setting in prod. |
| **Rate limiting** | Implemented and runtime-tested | `src/middleware/rateLimit.ts` | Redis-backed sliding window rate limiter (`X-RateLimit-*` headers, 429 `RATE_LIMITED` responses). |
| **Google OAuth 2.0** | Implemented and runtime-tested | `src/routes/auth.ts`, `src/services/googleAuth.ts` | Initiates Google OAuth redirect URL with PKCE challenge and state parameter. |
| **PKCE flow** | Implemented and runtime-tested | `src/services/googleAuth.ts` | Cryptographic SHA-256 PKCE code challenge and 128-byte verifier generation & verification. |
| **OAuth state validation** | Implemented and runtime-tested | `src/services/googleAuth.ts`, `src/utils/redisLua.ts` | State stored in Redis with 10-min TTL. Atomic Lua `GETDEL` prevents OAuth state replay attacks. |
| **JWT authentication** | Implemented and runtime-tested | `src/middleware/auth.ts` | `signUserJwt()` and `authenticateJwt()` enforcing explicit `HS256` algorithm, issuer, and audience. |
| **Cookie authentication** | Implemented and runtime-tested | `src/middleware/auth.ts` | `auth_token` HttpOnly, Secure, SameSite cookie reading and validation. |
| **Bearer authentication** | Implemented and runtime-tested | `src/middleware/auth.ts` | `Authorization: Bearer <jwt>` reading and validation. |
| **Conflicting auth rejection** | Implemented and runtime-tested | `src/middleware/auth.ts` | Requests presenting BOTH cookie AND Bearer token are rejected with 401 `AUTH_CONFLICT`. |
| **CSRF double-submit protection** | Implemented and runtime-tested | `src/middleware/auth.ts` | Cookie-authenticated state-changing requests (POST/PUT/DELETE) require matching `x-csrf-token` header. |
| **Credential token encryption** | Implemented and runtime-tested | `src/utils/crypto.ts` | AES-256-GCM authenticated encryption at rest with 12-byte IV, 16-byte auth tag, and key versioning (`v1`). |
| **Google token refresh** | Implemented and runtime-tested | `src/services/googleAuth.ts` | Atomic Redis lock (`lock:token_refresh:userId`) prevents concurrent token refresh races. |
| **Google account disconnect** | Implemented and runtime-tested | `src/routes/auth.ts` | `POST /auth/google/disconnect` revokes tokens with Google, deletes credentials, and audits event. |
| **Gmail initial sync** | Implemented and runtime-tested | `src/services/gmailSyncService.ts` | Bounded import of up to `INITIAL_SYNC_MAX_MESSAGES` (default 500) messages, tracking truncation. |
| **Gmail incremental sync** | Implemented and runtime-tested | `src/services/gmailSyncService.ts` | History-based synchronization via `historyId`, processing added/deleted/labeled messages. |
| **History cursor recovery** | Implemented and runtime-tested | `src/services/gmailSyncService.ts` | Inspection of confirmed 404/400 invalid history cursor errors (`isInvalidHistoryCursorError`). |
| **Reconciliation sync** | Implemented and runtime-tested | `src/services/gmailSyncService.ts` | Failover to reconciliation sync when history cursor is invalid (resets historyId and re-runs initial). |
| **MIME parsing** | Implemented and runtime-tested | `src/services/gmailSyncService.ts` | Bounded recursive MIME parser (`MIME_MAX_DEPTH=8`, `MIME_MAX_PARTS=50`, `BODY_MAX_DECODED_CHARS=50000`). |
| **Attachment metadata** | Implemented and runtime-tested | `src/services/gmailSyncService.ts` | Extracts filename, mimeType, sizeBytes without downloading binary payload. Sanitizes path traversal. |
| **Email listing (`GET /emails`)** | Implemented and runtime-tested | `src/routes/emails.ts` | Paginated listing with `limit`, `offset`, `status`, `classification` filters. Returns plain text body only. |
| **Validation Infrastructure** | Implemented and runtime-tested | `src/routes/validation.ts`, `src/repositories/validationRepository.ts` | Cohorts, participants, interviews, ingestion attempts, labels, reviews, metrics computation, decision service. |
| **Deny-by-Default Validation Auth** | Implemented and runtime-tested | `src/middleware/validationAuth.ts` | Dependency-injected middleware factory (`createValidationAuthMiddleware`), timing-safe comparison. |
| **Pre-LLM Shadow Scoring** | Implemented and runtime-tested | `src/services/emailScoringService.ts` | Pre-LLM additive scoring returning unclamped `raw_score` (`NUMERIC NOT NULL`) and `normalized_score=null`. |
| **Structural Regression Suite** | Implemented and runtime-tested | `src/test/validation.regression.ts` | `npm run validation:regression` checking schema bounds, NFC normalization, privacy, and safety pass rate across 20 synthetic fixtures. |
| **Extraction Quality Harness** | Implemented and runtime-tested | `src/test/validation.quality.ts` | `npm run validation:quality` evaluating live LLM quality against external `VALIDATION_HELDOUT_CORPUS_PATH`. Returns `QUALITY_BENCHMARK_NOT_RUN` when idle. |

---

## 2. Deferred Subsystems (Phases 5–7)

- **Phase 5**: Customer Dashboard & Product APIs (`/dashboard`, `/actions`, `/opportunities`, `/approvals`).
- **Phase 6**: Approval Execution (`POST /approvals/:id/approve`), Gmail write scopes (`gmail.modify`, `gmail.send`), safe execution loop, idempotency, retry.
- **Phase 7**: Agent loop, Fast/Heavy planners, strategist, memory optimization.
- **Other**: Telegram bot, Postmark/SendGrid webhook parse, payments, referrals, Microsoft Graph API.
