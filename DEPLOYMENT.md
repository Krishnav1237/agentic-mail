# Production Deployment Guide
*Inbox Intelligence Layer (IIL) Backend*

---

## Target Topology

- **Frontend**: Vercel
- **Backend API**: Railway / Container Platform
- **Background Worker**: Railway / Container Platform
- **Database**: PostgreSQL 16 (Railway / Neon / Supabase)
- **Cache & Queue**: Redis 7 (Railway / Upstash / Redis Cloud)

---

## 1. Frontend Configuration (Vercel)

1. Connect Vercel to your GitHub repository and set the root directory to `frontend/`.
2. Configure build settings:
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. Add Environment Variables:
   - `VITE_API_BASE=https://your-api.up.railway.app`
4. Deploy.

---

## 2. Backend API Configuration

1. Create a service pointing to the `backend/` directory.
2. Build & Start Settings:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start`
3. Required Environment Variables:
   - `NODE_ENV=production`
   - `PORT=4000`
   - `DATABASE_URL=postgres://...`
   - `REDIS_URL=redis://...`
   - `FRONTEND_URL=https://your-app.vercel.app`
   - `TRUST_PROXY=1` (Requires explicit `1` setting for single-hop proxy topology; ignores spoofed `X-Forwarded-For`)
   - `AUTH_JWT_SECRET=<32_char_random_secret>` (Must NOT use development default)
   - `AUTH_JWT_ISSUER=iil-api`
   - `AUTH_JWT_AUDIENCE=iil-app`
   - `TOKEN_ENC_KEY=<base64_32_byte_key>` (Must NOT use development default)
   - `GOOGLE_CLIENT_ID=<google_client_id>`
   - `GOOGLE_CLIENT_SECRET=<google_client_secret>`
   - `GOOGLE_REDIRECT_URI=https://your-api.up.railway.app/auth/google/callback`
   - `AI_PROVIDER=gemini`
   - `AI_MODEL=gemini-1.5-flash`
   - `GEMINI_API_KEY=<gemini_api_key>`
   - `AI_FALLBACK_ENABLED=false` (Production mode NEVER executes fallback when no API key exists; throws 503)
   - `VALIDATION_TOKEN=<32_char_pre_shared_secret>` (Protects internal validation tooling routes, NOT public customer APIs. Missing/empty token returns 503 VALIDATION_NOT_CONFIGURED)
   - `EMAIL_SCORING_MODE=off` or `shadow` (`active` mode is REJECTED during production startup until extraction quality is measured)
   - `VALIDATION_HELDOUT_CORPUS_PATH=/secure/local/path/heldout-corpus.json` (Must point to an external gitignored path outside tracked repository root)

---

## 3. Background Ingestion Worker

Create a second service from the same `backend/` directory:

- **Build Command**: `npm install && npm run build`
- **Start Command**: `node dist/workers/index.js`

Use identical environment variables as the Backend API service.

---

## 4. Database Migrations (001–007)

Apply migrations 001 through 007 sequentially on your production PostgreSQL database:

```bash
psql "$DATABASE_URL" -f db/migrations/001_baseline_schema.sql
psql "$DATABASE_URL" -f db/migrations/002_gmail_ingestion.sql
psql "$DATABASE_URL" -f db/migrations/003_intelligence_extraction.sql
psql "$DATABASE_URL" -f db/migrations/004_phase1_4_audit_fixes.sql
psql "$DATABASE_URL" -f db/migrations/005_runtime_integrity_fixes.sql
psql "$DATABASE_URL" -f db/migrations/006_validation_program.sql
psql "$DATABASE_URL" -f db/migrations/007_validation_scoring_integrity.sql
```

---

## 5. Google OAuth Consent Screen Configuration

1. In Google Cloud Console, add your production API redirect URI:
   `https://your-api.up.railway.app/auth/google/callback`
2. Requested scope:
   `https://www.googleapis.com/auth/gmail.readonly`

---

## 6. Production Security Rules & Validation API Notes

1. **Validation API Authorization**: Internal validation tooling routes (`/api/v1/validation/*`) are protected by `X-Validation-Token` compared via timing-safe equality (`crypto.timingSafeEqual`). They are disabled (HTTP 503) when `VALIDATION_TOKEN` is unconfigured. They are NOT Phase 5 customer APIs.
2. **Production Fallback Prohibition**: Deterministic fallback (`generateDeterministicFallback`) is disabled in production. If no live AI provider key is configured, calls return HTTP 503 `EXTRACTION_PROVIDER_UNAVAILABLE`.
3. **Production Active Scoring Rejection**: Setting `EMAIL_SCORING_MODE=active` when `NODE_ENV=production` causes environment parsing to fail at startup, preventing accidental active scheduling changes before extraction quality is measured.

---

## 7. Deployment Smoke-Test Verification

After deployment, run the following verification checks:

1. **Liveness Check**: `GET /health/live` $\rightarrow$ `{"status": "ok"}`
2. **Readiness Check**: `GET /health/ready` $\rightarrow$ `{"status": "ok", "db": true, "redis": true}`
3. **Validation Route Fail-Closed**: `GET /api/v1/validation/cohorts` without header $\rightarrow$ HTTP 401 `VALIDATION_TOKEN_REQUIRED`
4. **Invalid Token Protection**: `GET /api/v1/validation/cohorts` with invalid `X-Validation-Token` header $\rightarrow$ HTTP 403 `VALIDATION_TOKEN_INVALID`
5. **Session Endpoint**: `GET /auth/session` $\rightarrow$ `{"authenticated": false}`
