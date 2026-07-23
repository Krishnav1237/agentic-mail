# Security Safeguards & Risk Controls
*Inbox Intelligence Layer (IIL) Backend — Security Reference*

---

> **Security Baseline**: Backend Phases 1–4 and the validation operations infrastructure are implemented and structurally verified through automated tests. Real Google OAuth, live Gmail synchronization, real-provider extraction quality, manual forwarding feasibility, user demand, willingness to pay, and vertical selection still require owner-led validation. Phase 5–7 remain deferred.

---

## 1. Verified Security Controls

### 1.1 Authentication & Session Security
- **JWT Verification**: Session tokens use HMAC-SHA256 (`HS256`) signed with `AUTH_JWT_SECRET` (min 32 chars). Verification enforces explicit algorithm validation, `iss` (`AUTH_JWT_ISSUER`), and `aud` (`AUTH_JWT_AUDIENCE`).
- **Cookie Security**: Auth cookies (`auth_token`) use `HttpOnly`, `SameSite=lax` (or `SameSite=none` in production HTTPS), and `path='/'`.
- **Conflicting Auth Rejection**: Presenting BOTH session cookie AND Bearer authorization headers results in immediate rejection with HTTP `401 Unauthorized` (`AUTH_CONFLICT`).
- **CSRF Double-Submit Protection**: Cookie-authenticated state-changing requests (`POST`/`PUT`/`DELETE`) require a matching `x-csrf-token` header (`CSRF_INVALID`).

### 1.2 OAuth 2.0 & Credential Storage
- **PKCE Flow**: Google OAuth uses PKCE (Proof Key for Code Exchange) with cryptographically random 128-byte verifiers and SHA-256 code challenges.
- **Atomic State Consumption**: OAuth state parameters are stored in Redis with 10-minute TTL. State verification uses an atomic Redis Lua script (`atomicGetDel`) to prevent state replay attacks.
- **AES-256-GCM Encryption at Rest**: Provider access and refresh tokens are stored encrypted in `user_credentials` using AES-256-GCM with a 12-byte initialization vector, 16-byte authentication tag, and key versioning (`v1`).
- **Atomic Refresh Lock**: Provider token refreshes are protected by a per-user Redis lock (`lock:token_refresh:userId`).

### 1.3 Internal Validation API Authorization
- **Dependency-Injected Middleware**: Validation auth uses `createValidationAuthMiddleware(getToken: () => string)` without global mutable test setters.
- **Timing-Safe Token Comparison**: Request tokens (`X-Validation-Token`) are compared against configured pre-shared secrets using `safeTokenEquals` (`crypto.timingSafeEqual` with safe pre-check buffer length validation).
- **Deny-by-Default Authorization Matrix**:
  - Missing/empty `VALIDATION_TOKEN` in env $\rightarrow$ HTTP 503 (`VALIDATION_NOT_CONFIGURED`).
  - Missing/empty request header $\rightarrow$ HTTP 401 (`VALIDATION_TOKEN_REQUIRED`).
  - Incorrect token $\rightarrow$ HTTP 403 (`VALIDATION_TOKEN_INVALID`).
  - Correct token $\rightarrow$ Access permitted.
- **Not Customer APIs**: Internal validation routes are not exposed to customer UI flows and are disabled by default.

### 1.4 Hardening, Proxy Topology & Rate Limiting
- **CORS Defense**: Whitelist verification matches `FRONTEND_URL`. Disallowed origins receive no credentialed headers (`credentials: true`).
- **Trust Proxy (`TRUST_PROXY`)**: Default is `'0'` (disabled) in dev/test, ignoring untrusted `X-Forwarded-For` headers. Production requires explicit proxy hop configuration (`TRUST_PROXY=1`).
- **Redis-Backed Rate Limiting**: Sliding-window rate limiter attached to auth, email action, and validation endpoints (`X-RateLimit-*` headers, 429 `RATE_LIMITED`).
- **Error Code Sanitization**: `toSafeCode()` ensures raw SQL errors, stack traces, file paths, and tokens are converted to bounded `ErrorCode` strings before storage or HTTP response.

### 1.5 Content Boundary & Execution Safety
- **Read-Only Scope**: Requested Google OAuth scope is strictly `https://www.googleapis.com/auth/gmail.readonly`.
- **No Production Fallback**: `resolveAnalysisPath()` permits deterministic fallback ONLY in non-production environments when `AI_FALLBACK_ENABLED=true`. In production, missing API keys return HTTP 503 `EXTRACTION_PROVIDER_UNAVAILABLE`.
- **Production Active Mode Rejection**: Setting `EMAIL_SCORING_MODE=active` when `NODE_ENV=production` causes environment parsing to fail at startup.
- **External Held-Out Corpus Boundary**: Quality benchmarks (`validation:quality`) read from external path `VALIDATION_HELDOUT_CORPUS_PATH`. Paths inside tracked git repository directories are refused to prevent PII leaks.
- **Sanitized Exports**: Validation data exports (`validationExportService.ts`) explicitly exclude email bodies, prompts, raw tokens, and personal interview notes. Raw interview transcript storage is forbidden.

### 1.6 Prompt Injection Safeguards
- **Untrusted Content Isolation**: Incoming email subjects and bodies are treated as untrusted data wrapped in distinct system delimiter boundaries.
- **Strict Schema Enforcement**: Candidate outputs are validated against strict Zod schemas (`EmailExtractionSchema`). Flooded candidate outputs (>20 actions/opps) trigger immediate rejection with `EXTRACTION_OUTPUT_INVALID`.
- **Side-Effect Isolation**: Extraction runs create candidate entities in PostgreSQL only. No emails are dispatched, drafted, modified, or deleted during extraction.
- **Automated Adversarial Safety Suite**: The structural regression suite (`npm run validation:regression`) tests prompt injection resistance across 6 attack surfaces (plain text, quoted history `>`, forwarded headers, HTML comments `<!-- -->`, hidden HTML `display:none`, signature blocks `-- \n`), asserting 0 Approvals and 0 Agent Executions created.

> [!CAUTION]
> **Prompt Injection Defenses**: The backend enforces strict untrusted-content boundaries, Zod schema validation, candidate limits, side-effect isolation, and automated adversarial safety tests. Complete prompt-injection prevention in LLMs remains an open research problem; no claim of absolute prevention is made.

---

## 2. Security Checklist for Deployment

Before deploying to staging or production:

1. **Secret Management**: Ensure `AUTH_JWT_SECRET` and `TOKEN_ENC_KEY` use cryptographically strong, 32-byte random values stored in environment secrets.
2. **Reverse Proxy Configuration**: Verify load balancers strip incoming untrusted `X-Forwarded-For` headers and configure `TRUST_PROXY=1`.
3. **Validation Pre-Shared Secret**: Set `VALIDATION_TOKEN` to a random $\ge 32$-character secret. Do not expose this token in client bundles or repositories.
4. **Scoring Mode**: Keep `EMAIL_SCORING_MODE=off` or `shadow` in production until extraction quality is validated.
