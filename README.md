# Obligo

Obligo is an execution layer built on top of communication. It connects to Gmail, ingests emails, parses structure and MIME metadata, runs structured AI classification and extraction, and materializes actionable obligations (`actions`) and career/event opportunities (`opportunities`).

> **Implementation Baseline**: Backend Phases 1–4 and the validation operations infrastructure are implemented and structurally verified through automated tests. Real Google OAuth, live Gmail synchronization, real-provider extraction quality, manual forwarding feasibility, user demand, willingness to pay, and vertical selection still require owner-led validation. Phase 5–7 remain deferred.

---

## What the Backend Currently Supports (Phases 1–4)

- **Gmail OAuth 2.0 & PKCE**: Secure authentication with PKCE code challenges, AES-256-GCM encrypted token storage at rest, and atomic OAuth state validation.
- **Read-Only Gmail Ingestion**: Bounded initial sync, history-based incremental sync, and cursor reconciliation fallback (`gmail.readonly` scope).
- **MIME Parsing & Safety**: Bounded MIME depth and attachment metadata parsing. Executable HTML is stripped; raw HTML is never exposed by the API.
- **Structured AI Extraction**: Classification (intent, sender, priority, urgency) and extraction via Gemini, OpenRouter, Groq, or deterministic fallback.
- **Entity Candidate Materialization**: Idempotent materialization of candidate actions and opportunities into PostgreSQL tables using stable `materialized_entity_key` hashes.
- **Security & Hardening**: Dual cookie/Bearer session authentication, CSRF double-submit protection, configurable trust proxy (`TRUST_PROXY`), Redis-backed rate limiting, and immutable audit event logging.
- **Validation Infrastructure**: Cohort management, participant tracking, human email labelling, extraction reviews, metrics computation engine, deterministic Go/No-Go decision engine, pre-LLM noise scoring in shadow mode, structural regression benchmark, and cohort discovery runbooks.

---

## Product Phase Roadmap

- **Phases 1–4 (Implemented & Verified)**: Foundation, Auth (PKCE/JWT/CSRF), Read-Only Gmail Ingestion, MIME Parsing, Structured AI Extraction, Candidate Materialization (`actions`, `opportunities`), Redis Locking, Rate Limiting, Audit Immutability.
- **Validation Program (Infrastructure Implemented & Structurally Verified)**: Operationalized strategy document with 14-day cohort management, participant tracking, human email labelling, extraction reviews, metrics computation, deterministic Go/No-Go decision engine, pre-LLM noise signal scoring in shadow mode (`raw_score`), synthetic 20-fixture regression suite (`npm run validation:regression`), and real quality benchmark harness (`npm run validation:quality`).
- **Phase 5 (Deferred — Product APIs)**: Customer-facing endpoints for Dashboard (`/dashboard`), Actions (`GET /actions`, `PATCH /actions/:id`), Opportunities (`GET /opportunities`), Approvals management (`GET /approvals`, `GET /approvals/:id`, `PATCH /approvals/:id`, `POST /approvals/:id/reject`, `POST /approvals/:id/snooze`), User Preferences, User Goals, and Audit Event logs.
- **Phase 6 (Deferred — Safe Execution & Approvals)**: Execution approval (`POST /approvals/:id/approve`), Gmail write scopes (`gmail.modify`, `gmail.send`), safe execution engine, approval-state locking, execution idempotency, retry/recovery, and send audit logging.
- **Phase 7 (Deferred — Agent Orchestration & Planners)**: Single-agent loop, Fast Planner (rules), Heavy Planner (LLM), decision state hashing, strategist, and memory optimization.
- **Future**: Microsoft Outlook / Microsoft Graph API integration.

---

## Quick Start (Local Development)

### 1. Start Infrastructure (PostgreSQL 16 & Redis 7)

```bash
cd agentic-mail
docker compose up -d
docker compose ps
```

### 2. Configure Environment

```bash
cd backend
cp .env.example .env
```
*Supply `DATABASE_URL`, `REDIS_URL`, `AUTH_JWT_SECRET`, `TOKEN_ENC_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GEMINI_API_KEY`, and optional `VALIDATION_TOKEN` in `backend/.env`.*

### 3. Apply Migrations (001–011)

```bash
export DB_URL="postgres://postgres:postgres@localhost:5434/inbox_intel"

psql "$DB_URL" -f db/migrations/001_baseline_schema.sql
psql "$DB_URL" -f db/migrations/002_gmail_ingestion.sql
psql "$DB_URL" -f db/migrations/003_intelligence_extraction.sql
psql "$DB_URL" -f db/migrations/004_phase1_4_audit_fixes.sql
psql "$DB_URL" -f db/migrations/005_runtime_integrity_fixes.sql
psql "$DB_URL" -f db/migrations/006_validation_program.sql
psql "$DB_URL" -f db/migrations/007_validation_scoring_integrity.sql
psql "$DB_URL" -f db/migrations/008_obligo_rebrand.sql
psql "$DB_URL" -f db/migrations/009_frontend_alignment.sql
psql "$DB_URL" -f db/migrations/010_emails_status_constraint.sql
psql "$DB_URL" -f db/migrations/011_settings_profile_telegram.sql
```

### 4. Run API & Worker

Terminal 1 (API Server):
```bash
cd backend
npm run dev
```

Terminal 2 (Ingestion Worker):
```bash
cd backend
npm run worker
```

---

## Running Tests & Benchmarks

```bash
cd backend

# 1. Build compilation check
npm run build

# 2. Security & Phase unit gates
npx tsx src/test/security_gate_phase1_2.ts
npx tsx src/test/phase3_ingestion.test.ts
npx tsx src/test/phase4_extraction.test.ts

# 3. Integration Test Gate (12 suites against PostgreSQL 16 & Redis 7)
npm run test:integration

# 4. Structural & Safety Regression Suite (20 synthetic fixtures)
npm run validation:regression

# 5. Extraction Quality Benchmark (Requires live provider key & external held-out corpus)
npm run validation:quality
```

*Note on Quality Benchmark Output*: When live prerequisites (AI key or `VALIDATION_HELDOUT_CORPUS_PATH`) are absent, `npm run validation:quality` outputs `QUALITY_BENCHMARK_NOT_RUN` with exit code `0`. This is the correct behaviour indicating real extraction quality is unmeasured.

---

## Documentation Index

Comprehensive documentation lives in `docs/` and `backend/docs/`:

- [Documentation Index](docs/README.md)
- [Gap Analysis & Strategy Audit](backend/docs/STRATEGY_IMPLEMENTATION_GAP_ANALYSIS.md)
- [Validation Implementation Status](backend/docs/VALIDATION_IMPLEMENTATION_STATUS.md)
- [Validation Decision Rules](backend/docs/VALIDATION_DECISION_RULES.md)
- [Validation Metrics Specification](backend/docs/VALIDATION_METRICS.md)
- [Validation Cohort Runbook](backend/docs/VALIDATION_COHORT_RUNBOOK.md)
- [Manual Validation Log Template](backend/docs/MANUAL_VALIDATION_LOG_TEMPLATE.md)
- [User Interview Discovery Guide](backend/docs/USER_INTERVIEW_DISCOVERY_GUIDE.md)
- [Manual Forwarding Experiment Guide](backend/docs/MANUAL_FORWARDING_EXPERIMENT_GUIDE.md)
- [Backend Implementation Status](backend/docs/BACKEND_IMPLEMENTATION_STATUS.md)
- [Local Setup Manual](backend/docs/LOCAL_DEVELOPMENT.md)
- [Manual Testing Runbook](backend/docs/MANUAL_TESTING_GUIDE.md)
- [Database Schema Reference](backend/docs/DATA_MODEL.md)
- [Environment Variables Reference](backend/docs/ENVIRONMENT_VARIABLES.md)
- [Error Codes Reference](backend/docs/ERROR_CODES.md)
- [API Contract Specification](docs/API.md)
- [Architecture Overview](docs/ARCHITECTURE.md)
- [Security Safeguards](docs/SECURITY.md)
- [Testing & Quality Assurance Guide](docs/TESTING.md)
- [Runtime Audit Ledger](backend/docs/PHASE_1_4_AUDIT.md)
