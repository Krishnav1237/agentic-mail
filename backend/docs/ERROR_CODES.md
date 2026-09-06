# Bounded Public & Persisted Error Code Reference
*Obligo Backend — Error Code System*

---

> **Implementation Baseline**: Backend Phases 1–4 and the validation operations infrastructure are implemented and structurally verified through automated tests. Real Google OAuth, live Gmail synchronization, real-provider extraction quality, manual forwarding feasibility, user demand, willingness to pay, and vertical selection still require owner-led validation. Phase 5–7 remain deferred.

---

## 1. Overview

The Obligo backend enforces a **bounded typed error code system** defined in [`src/errors/AppError.ts`](../src/errors/AppError.ts).

### Core Principles
1. **Zero Secret / Raw Error Leakage**: Raw SQL error tracebacks, file paths, access tokens, and arbitrary provider error messages are **never** returned in API HTTP responses or written to database fields (`sync_runs.error_message`, `extraction_runs.error_code`, `provider_sync_states.error_message`).
2. **Safe Code Mapping**: The `toSafeCode()` helper function maps any caught operational or unexpected exception to one of the bounded codes below.
3. **Structured API Envelope**: API error responses return `{ "error": "<ERROR_CODE>", "message": "<User-friendly description>", "requestId": "<hex_id>" }`.

---

## 2. Error Code Matrix

### 2.1 Authentication & Session
| Error Code | HTTP Status | Subsystem | Meaning & Cause | Retryable | User Action | Persisted |
|---|---|---|---|---|---|---|
| `AUTH_REQUIRED` | 401 | Auth Middleware | Request missing valid session cookie or `Authorization: Bearer` header. | No | Re-authenticate via `/auth/google`. | No |
| `AUTH_CONFLICT` | 401 | Auth Middleware | Request presented both session cookie AND Bearer token simultaneously. | No | Supply cookie OR Bearer token — not both. | No |

### 2.2 Internal Validation API Authorization
| Error Code | HTTP Status | Subsystem | Meaning & Cause | Retryable | User Action | Persisted |
|---|---|---|---|---|---|---|
| `VALIDATION_NOT_CONFIGURED` | 503 | Validation Auth | `VALIDATION_TOKEN` missing, empty, or < 32 characters in server environment. | No | Configure `VALIDATION_TOKEN` in server `.env`. | No |
| `VALIDATION_TOKEN_REQUIRED` | 401 | Validation Auth | Request missing `X-Validation-Token` header. | No | Pass `X-Validation-Token` header. | No |
| `VALIDATION_TOKEN_INVALID` | 403 | Validation Auth | `X-Validation-Token` request header did not match server pre-shared secret. | No | Supply valid pre-shared token. | No |

### 2.3 OAuth & Credentials
| Error Code | HTTP Status | Subsystem | Meaning & Cause | Retryable | User Action | Persisted |
|---|---|---|---|---|---|---|
| `OAUTH_STATE_INVALID` | 400 | OAuth | State parameter missing or corrupted during OAuth callback. | No | Re-initiate Google connection. | No |
| `OAUTH_STATE_EXPIRED` | 400 | OAuth | State token expired or consumed (atomic `GETDEL` replay check). | No | Re-initiate Google connection. | No |
| `OAUTH_CALLBACK_FAILED` | 400 / 500 | OAuth | Google provider authorization denied or token exchange failed. | No | Grant required permissions in Google consent screen. | No |
| `GOOGLE_ACCOUNT_DISCONNECTED` | 400 / 404 | OAuth / Sync | Google account is not connected or credentials were deleted. | No | Connect Google account via `/auth/google`. | Yes (`audit_events`) |
| `GOOGLE_TOKEN_REFRESH_FAILED` | 500 | OAuth / Sync | Token refresh failed (`invalid_grant` or revoked refresh token). | No | Re-authenticate Google account. | Yes (`sync_runs`, `audit_events`) |

### 2.4 Security Controls (CSRF, Rate Limiting)
| Error Code | HTTP Status | Subsystem | Meaning & Cause | Retryable | User Action | Persisted |
|---|---|---|---|---|---|---|
| `CSRF_INVALID` | 403 | CSRF Middleware | `x-csrf-token` header missing or mismatch on cookie mutation request. | No | Pass `x-csrf-token` matching `csrf_token` cookie. | No |
| `RATE_LIMITED` | 429 | Rate Limiter | Request rate limit exceeded for client IP window. | Yes (after reset) | Wait for `X-RateLimit-Reset` timestamp before retrying. | No |
| `GOOGLE_RATE_LIMITED` | 429 | Gmail / AI | Google API or Gemini rate limit exceeded. | Yes (backoff) | Wait for quota window to reset. | Yes (`sync_runs`) |

### 2.5 Gmail Synchronization & Distributed Locking
| Error Code | HTTP Status | Subsystem | Meaning & Cause | Retryable | User Action | Persisted |
|---|---|---|---|---|---|---|
| `GMAIL_SYNC_ALREADY_RUNNING` | 409 | Ingestion | Synchronization run already active for this user account. | Yes (after sync) | Wait for active sync to complete. | Yes (`sync_runs.error_message`) |
| `GMAIL_HISTORY_CURSOR_INVALID` | 500 | Ingestion | Gmail `historyId` cursor expired (>30 days old). | Automatic | System automatically fails over to reconciliation sync. | Yes (`sync_runs`) |
| `GMAIL_MESSAGE_FETCH_FAILED` | 502 | Ingestion | Gmail API message payload fetch failed. | Yes | Retry sync job. | Yes (`sync_runs`) |
| `GMAIL_SYNC_FAILED` | 500 | Ingestion | Ingestion worker encountered an error during sync loop. | Yes | Retry sync job. | Yes (`sync_runs`) |
| `LOCK_OWNERSHIP_LOST` | 500 | Worker | Sync worker lost Redis lock ownership due to TTL expiration. | Yes | Re-queue sync job. | Yes (`sync_runs`) |
| `LOCK_ACQUISITION_TIMEOUT` | 500 | Worker | Distributed lock acquisition timed out. | Yes | Retry after lock expires. | No |

### 2.6 Email Access & Route Validation
| Error Code | HTTP Status | Subsystem | Meaning & Cause | Retryable | User Action | Persisted |
|---|---|---|---|---|---|---|
| `NOT_FOUND` | 404 | Emails / Auth | Email record or requested resource not found for user. | No | Verify email ID UUID string. | No |
| `VALIDATION_ERROR` | 400 | Routes / App | Request body, query string, or path parameter failed Zod validation. | No | Provide parameters matching required format/schema. | No |

### 2.7 AI Extraction Pipeline
| Error Code | HTTP Status | Subsystem | Meaning & Cause | Retryable | User Action | Persisted |
|---|---|---|---|---|---|---|
| `EXTRACTION_PROVIDER_UNAVAILABLE` | 503 | AI Service | AI provider key missing or provider API unreachable in production. | Yes | Configure provider API key or enable dev fallback. | Yes (`extraction_runs`) |
| `EXTRACTION_TIMEOUT` | 504 | AI Service | Structured AI extraction call exceeded 30s timeout threshold. | Yes | Retry extraction for email. | Yes (`extraction_runs`) |
| `EXTRACTION_OUTPUT_INVALID` | 502 | AI Service | Provider output failed Zod schema validation or candidate limits. | Yes | Retry extraction. | Yes (`extraction_runs`) |
| `INTERNAL_ERROR` | 500 | App | Unhandled server exception. | No | Contact support with `requestId`. | Yes (`sync_runs`, `extraction_runs`) |
