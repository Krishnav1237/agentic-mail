# Contributing & Engineering Guidelines
*Inbox Intelligence Layer (IIL)*

---

## 1. Prerequisites

- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **npm**: v9.0.0 or higher
- **PostgreSQL**: v16 recommended (v14+ supported)
- **Redis**: v7 recommended (v6+ supported)
- **Docker / Docker Compose**: For containerized database & Redis infrastructure

---

## 2. Local Repository Setup

1. **Start Infrastructure**:
   ```bash
   docker compose up -d
   ```
2. **Configure Environment**:
   ```bash
   cd backend
   cp .env.example .env
   ```
   *Supply required local credentials (`DATABASE_URL`, `REDIS_URL`, `AUTH_JWT_SECRET`, `TOKEN_ENC_KEY`).*

3. **Install Dependencies**:
   ```bash
   npm install
   ```

---

## 3. Database Migration Rules

1. Apply migrations sequentially (`001` through `007`):
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
2. **Schema Integrity**:
   - New migrations must be numbered sequentially (`008_...sql`).
   - Every migration must be idempotent and preserve existing historical row data.
   - Test migration upgrade paths in `src/test/integration/01_migrations.test.ts`.

---

## 4. Mandatory Build & Test Gate

Before submitting changes or committing code, run the full verification gate from `backend/`:

```bash
cd backend

# 1. TypeScript compilation build check
npm run build

# 2. Security & Phase unit gates
npx tsx src/test/security_gate_phase1_2.ts
npx tsx src/test/phase3_ingestion.test.ts
npx tsx src/test/phase4_extraction.test.ts

# 3. Integration test gate (12 suites against PostgreSQL 16 & Redis 7)
npm run test:integration

# 4. Structural & safety regression benchmark (20 synthetic fixtures)
npm run validation:regression

# 5. Extraction quality benchmark
npm run validation:quality
```

---

## 5. Documentation & Code Conventions

- **Documentation Synchronization**: Any changes to endpoints, database tables, environment variables, error codes, or security rules MUST be documented in `docs/` and `backend/docs/`.
- **TypeScript First**: Write strictly typed code. Avoid `any` or broad untyped helpers.
- **Zod Boundaries**: Validate all HTTP request bodies, query strings, and environment variables using Zod schemas.
- **Model A Ownership**: Scope user data via derived ownership (`emails.user_id` JOIN or `email_id FK`).
- **No Absolute Local Links**: Use repository-relative links (`docs/...`, `backend/...`) in markdown files instead of absolute local file paths (`file:///Users/...`).

---

## 6. Security & Data Privacy Safeguards

- **Zero Secret Commits**: Never commit `.env` files, API keys (`GEMINI_API_KEY`, etc.), or pre-shared secrets (`VALIDATION_TOKEN`).
- **No Real Validation Data or PII**: Held-out human evaluation corpora (`VALIDATION_HELDOUT_CORPUS_PATH`), participant interview transcripts, and real email payloads must stay strictly outside the git repository.
- **Timing-Safe Comparison**: Use timing-safe equality functions (`safeTokenEquals` / `crypto.timingSafeEqual`) for token authentication.
- **Safe Error Codes**: Never expose raw SQL error traces or stack traces in HTTP responses; use `toSafeCode()` to map errors to bounded `ErrorCode` strings.
