# Local Development & Environment Setup Guide
*Inbox Intelligence Layer (IIL) Backend*

---

> **Implementation Baseline**: Backend Phases 1–4 and the validation operations infrastructure are implemented and structurally verified through automated tests. Real Google OAuth, live Gmail synchronization, real-provider extraction quality, manual forwarding feasibility, user demand, willingness to pay, and vertical selection still require owner-led validation. Phase 5–7 remain deferred.

---

## 1. System Requirements

Before setting up the IIL backend, ensure your environment meets the following specifications:

- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **npm**: v9.0.0 or higher
- **PostgreSQL**: v14.0 or higher (v16 recommended)
- **Redis**: v6.0 or higher (v7 recommended)
- **Docker & Docker Compose**: Optional, for running containerized database & Redis.

---

## 2. Infrastructure Setup (PostgreSQL & Redis)

You can run PostgreSQL and Redis either natively or via Docker Compose.

From the repository root directory (`agentic-mail/`):

```bash
# Start PostgreSQL and Redis containers
docker compose up -d

# Verify containers are running
docker compose ps
```

---

## 3. Backend Installation & Environment Configuration

Navigate to the `backend/` directory:

```bash
cd backend

# Install dependencies (cross-env is installed as a devDependency for portable script execution)
npm install
```

Create your local `.env` configuration file from `.env.example`:

```bash
cp .env.example .env
```

### Environment Variables Checklist

```env
PORT=4000
NODE_ENV=development
TRUST_PROXY=0
FRONTEND_URL=http://localhost:3000

DATABASE_URL=postgres://HP@localhost:5432/iil_test
REDIS_URL=redis://localhost:6379

AUTH_JWT_SECRET=development-jwt-secret-min-32-chars-long-key
AUTH_JWT_ISSUER=iil-api
AUTH_JWT_AUDIENCE=iil-app
TOKEN_ENC_KEY=MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=

GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:4000/auth/google/callback

AI_PROVIDER=gemini
AI_MODEL=gemini-1.5-flash
GEMINI_API_KEY=your_gemini_api_key
AI_FALLBACK_ENABLED=true

VALIDATION_TOKEN=development-validation-token-min-32-chars-long
EMAIL_SCORING_MODE=shadow
VALIDATION_HELDOUT_CORPUS_PATH=/secure/local/path/heldout-corpus.json
```

---

## 4. Applying Database Migrations (001–007)

Apply migrations 001 through 007 sequentially on your local database:

```bash
export DB_URL="postgres://HP@localhost:5432/iil_test"

psql "$DB_URL" -f db/migrations/001_baseline_schema.sql
psql "$DB_URL" -f db/migrations/002_gmail_ingestion.sql
psql "$DB_URL" -f db/migrations/003_intelligence_extraction.sql
psql "$DB_URL" -f db/migrations/004_phase1_4_audit_fixes.sql
psql "$DB_URL" -f db/migrations/005_runtime_integrity_fixes.sql
psql "$DB_URL" -f db/migrations/006_validation_program.sql
psql "$DB_URL" -f db/migrations/007_validation_scoring_integrity.sql
```

---

## 5. Local Runtime Execution

Terminal 1 (API Server):
```bash
cd backend
npm run dev
```

Terminal 2 (Background Ingestion Worker):
```bash
cd backend
npm run worker
```

---

## 6. Verification Gate & Benchmark Execution

To run the complete verification suite from `backend/`:

```bash
cd backend

# 1. TypeScript build check
npm run build

# 2. Security & Phase unit gates
npx tsx src/test/security_gate_phase1_2.ts
npx tsx src/test/phase3_ingestion.test.ts
npx tsx src/test/phase4_extraction.test.ts

# 3. Integration test gate (12 suites against PostgreSQL 16 & Redis 7)
npm run test:integration

# 4. Structural & safety regression benchmark (20 synthetic fixtures)
npm run validation:regression

# 5. Extraction quality benchmark (Requires live AI key & external corpus)
npm run validation:quality
```

### Note on Benchmark Package Scripts
Package scripts in `package.json` use `cross-env` directly (e.g. `"test:integration": "cross-env NODE_ENV=test AI_FALLBACK_ENABLED=true tsx src/test/integration/run.ts"`). `cross-env` is installed as a standard devDependency to ensure repository portability without relying on `npx cross-env`.
