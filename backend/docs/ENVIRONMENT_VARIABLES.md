# Environment Variables & Configuration Reference
*Inbox Intelligence Layer (IIL) Backend*

---

> **Implementation Baseline**: Backend Phases 1–4 and the validation operations infrastructure are implemented and structurally verified through automated tests. Real Google OAuth, live Gmail synchronization, real-provider extraction quality, manual forwarding feasibility, user demand, willingness to pay, and vertical selection still require owner-led validation. Phase 5–7 remain deferred.

---

## 1. Overview & Validation Rules

Environment configuration for the IIL backend is defined and validated in [`src/config/env.ts`](../src/config/env.ts) using **Zod**. If any environment variable fails parsing or validation, the backend prints detailed diagnostic issues and terminates immediately with exit code `1`.

In **production mode** (`NODE_ENV=production`), strict safety checks enforce that default development keys (`AUTH_JWT_SECRET`, `TOKEN_ENC_KEY`), `EMAIL_SCORING_MODE=active`, and disabled proxy settings (`TRUST_PROXY=0`) cause an immediate startup failure.

---

## 2. Environment Variable Matrix

| Variable Name | Dev Default | Production Rule | Purpose & Description |
|---|---|---|---|
| `PORT` | `4000` | Optional | Server HTTP listening port (1–65535). |
| `NODE_ENV` | `development` | Required | Runtime mode (`development`, `production`, `test`). |
| `FRONTEND_URL` | `http://localhost:5173` | Required | Allowed CORS origin & post-OAuth redirect target base. |
| `DATABASE_URL` | Local DB | Required | PostgreSQL 16 connection string. |
| `REDIS_URL` | Local Redis | Required | Redis 7 connection URL for queues, cache, workers. |
| `TRUST_PROXY` | `'0'` | Required (`1`) | Express `trust proxy` setting (`0` disabled in dev; set `1` in prod). |
| `AUTH_JWT_SECRET` | Dev secret | Required ($\ge 32$ chars) | HMAC-SHA256 key for signing JWTs. Must NOT use dev default in prod. |
| `AUTH_JWT_ISSUER` | `iil-api` | Required | Standard `iss` claim in session JWTs. |
| `AUTH_JWT_AUDIENCE` | `iil-app` | Required | Standard `aud` claim in session JWTs. |
| `TOKEN_ENC_KEY` | Dev base64 key | Required (Base64 32 bytes) | Base64-encoded key for AES-256-GCM token encryption at rest. |
| `GOOGLE_CLIENT_ID` | `""` | Required | Google Cloud OAuth 2.0 Web Client ID. |
| `GOOGLE_CLIENT_SECRET` | `""` | Required | Google Cloud OAuth 2.0 Web Client Secret. |
| `GOOGLE_REDIRECT_URI` | `http://...` | Required | OAuth redirect URI registered in Google Console. |
| `AI_PROVIDER` | `gemini` | Required | Provider selection (`gemini`, `openrouter`, `groq`, `disabled`). |
| `AI_MODEL` | `gemini-1.5-flash` | Required | Model identifier string sent to provider. |
| `GEMINI_API_KEY` | `""` | Optional | Google Gemini API key. |
| `OPENROUTER_API_KEY` | `""` | Optional | OpenRouter API key. |
| `GROQ_API_KEY` | `""` | Optional | Groq API key. |
| `AI_FALLBACK_ENABLED` | `'false'` | Must be `false` | Enables deterministic fallback when AI key is missing. Permitted ONLY in non-production environments. |
| `AI_MAX_INPUT_CHARS` | `'6000'` | Optional | Maximum body text length passed to AI model (1–50000). |
| `INITIAL_SYNC_MAX_MESSAGES` | `'500'` | Optional | Maximum messages imported during initial sync (1–5000). |
| `AI_REQUEST_TIMEOUT_MS` | `'30000'` | Optional | Provider API request timeout in ms (1000–120000). |
| `VALIDATION_TOKEN` | `""` | Required ($\ge 32$ chars) | Pre-shared secret for internal `/validation/*` APIs. Deny-by-default (HTTP 503) when missing/invalid. |
| `EMAIL_SCORING_MODE` | `'off'` | `off` or `shadow` | Pre-LLM noise scoring mode (`off`, `shadow`, `active`). `active` mode is REJECTED in production. |
| `VALIDATION_HELDOUT_CORPUS_PATH` | `""` | Optional | Local path to external held-out human corpus for `validation:quality`. Must live outside tracked repo root. |

---

## 3. Detailed Subsystem Rules

### 3.1 Validation API Pre-Shared Secret (`VALIDATION_TOKEN`)
- Must be at least 32 characters long.
- Protects internal validation tooling routes (`/validation/*`).
- Requests must pass header `X-Validation-Token: <token>`.
- Evaluated via timing-safe comparison (`crypto.timingSafeEqual`).
- If missing, empty, or shorter than 32 characters, validation routes fail closed with HTTP 503 `VALIDATION_NOT_CONFIGURED`.

### 3.2 Pre-LLM Noise Scoring Mode (`EMAIL_SCORING_MODE`)
- `off`: Scoring engine is disabled.
- `shadow`: Scorer computes additive `raw_score` and records recommendations in `email_filtering_decisions` without altering queue order.
- `active`: Would affect queue processing order. **Hard-blocked in production startup** until extraction quality is validated.

### 3.3 AI Fallback Safety (`AI_FALLBACK_ENABLED`)
- Deterministic fallback (`generateDeterministicFallback`) executes ONLY if `resolveAnalysisPath()` resolves to `'deterministic_fallback'`.
- Fallback is permitted ONLY when `NODE_ENV !== 'production'` and `AI_FALLBACK_ENABLED=true`.
- In production (`NODE_ENV=production`), missing AI provider keys throw HTTP 503 `EXTRACTION_PROVIDER_UNAVAILABLE`.

### 3.4 Held-Out Human Quality Corpus (`VALIDATION_HELDOUT_CORPUS_PATH`)
- Points to an external held-out human-labelled corpus JSON file.
- Must be stored outside the git repository directory to prevent committing sensitive PII.
- Paths pointing inside the tracked repository root directory are refused by `validation:quality`.
