# Testing Guide & Quality Assurance Specification
*Inbox Intelligence Layer (IIL) Backend — Testing Reference*

---

> **Implementation Baseline**: Backend Phases 1–4 and the validation operations infrastructure are implemented and structurally verified through automated tests. Real Google OAuth, live Gmail synchronization, real-provider extraction quality, manual forwarding feasibility, user demand, willingness to pay, and vertical selection still require owner-led validation. Phase 5–7 remain deferred.

---

## 1. Automated Test Suite Inventory & Commands

Execute the full verification gate from `backend/`:

```bash
cd backend

# 1. TypeScript compilation build check
npm run build

# 2. Unit & security gate tests
npx tsx src/test/security_gate_phase1_2.ts
npx tsx src/test/phase3_ingestion.test.ts
npx tsx src/test/phase4_extraction.test.ts

# 3. Full integration test gate (12 suites against real PostgreSQL 16 & Redis 7)
npm run test:integration

# 4. Structural & safety regression benchmark (20 synthetic fixtures)
npm run validation:regression

# 5. Extraction quality benchmark (Requires live provider & external held-out corpus)
npm run validation:quality
```

---

## 2. Benchmark Suite Definitions

### 2.1 Structural & Safety Regression Benchmark (`npm run validation:regression`)
- **Script**: `cross-env NODE_ENV=test AI_FALLBACK_ENABLED=true tsx src/test/validation.regression.ts`
- **Purpose**: Evaluates system pipeline mechanics, schema bounds, candidate limits, entity key generation (`materialized_entity_key`), privacy compliance (no PII in scoring reasons), and adversarial prompt-injection safety boundaries across 20 synthetic fixtures (`SyntheticTestAiProvider`).
- **Safety Metric**: Measures `adversarial safety-boundary pass rate` (asserting 0 Approvals, 0 Executions, and 0 side effects on malicious input).
- **Scope Note**: Does NOT evaluate or claim real LLM extraction accuracy.

### 2.2 Extraction Quality Benchmark (`npm run validation:quality`)
- **Script**: `tsx src/test/validation.quality.ts`
- **Prerequisite Boundary**: Requires an external gitignored path via `VALIDATION_HELDOUT_CORPUS_PATH` and a live AI provider key (`GEMINI_API_KEY`, `OPENROUTER_API_KEY`, or `GROQ_API_KEY`).
- **Prerequisite Check Result (`QUALITY_BENCHMARK_NOT_RUN`)**: When prerequisites are missing or when the path points inside a tracked git repository directory, the script outputs `QUALITY_BENCHMARK_NOT_RUN` with exit code `0`. This indicates real extraction quality is unmeasured and prevents score fabrication.
- **Authoritative Thresholds (v1)**:
  - Action precision $\ge 85\%$ ($0.85$)
  - Opportunity precision $\ge 80\%$ ($0.80$)
  - Deadline precision $\ge 95\%$ ($0.95$)
  - Critical email recall $\ge 95\%$ ($0.95$)
  - Semantic duplicate rate $\le 2\%$ ($0.02$)
  - Extraction failure rate $< 5\%$ ($0.05$)

---

## 3. Integration Test Gate Suite Breakdown (`npm run test:integration`)

The integration runner ([`backend/src/test/integration/run.ts`](../backend/src/test/integration/run.ts)) executes 12 automated suites against real PostgreSQL 16 and Redis 7:

1. **[Suite 1] Database Migrations & Schema Introspection**:
   - Clean application of migrations 001–007.
   - Model A derived ownership introspection on `email_intelligence` (`user_id` column removed, `email_id FK` intact).
   - Introspection of active partial unique indexes (`idx_sync_runs_active_user`, `idx_extraction_runs_active_email`).
   - Immutable `audit_events` trigger enforcement (rejecting `UPDATE` and `DELETE`).
   - Upgrade path test from migration 004 $\rightarrow$ 005.
   - **Sub-suite 1.6**: Upgrade path test from migration 006 $\rightarrow$ 007 with historical row data retention, raw score conversion (`0.75`), `normalized_score=null`, `JSONB` array preservation, unclamped insertion (>1.0 and <0.0), and DDL idempotency.
2. **[Suite 2] Real Redis Lua Lock & Atomic State Operations**:
   - Atomic OAuth state consumption via `GETDEL`.
   - Lock acquisition, contention enforcement, Lua compare-and-DEL release, and compare-and-PEXPIRE renewal.
3. **[Suite 3] Model A Derived Ownership & Cross-Tenant Isolation**:
   - Derived ownership access via `emails.user_id` JOIN.
   - Cross-tenant isolation verification (User B gets 0 rows for User A email).
   - `ON DELETE CASCADE` verification when parent email is deleted.
4. **[Suite 4] Materialized Entity Key Redesign & Reprocessing Protection**:
   - Separation of `extraction_candidate_key` vs `materialized_entity_key`.
   - Unicode (NFC) and whitespace normalization.
   - Idempotent reprocessing preserving user completed states without entity duplication.
5. **[Suite 5] Active Synchronization & Database Partial Index Concurrency**:
   - Database partial unique index preventing duplicate active sync run for same user.
   - BullMQ worker lock contention and job skipping.
6. **[Suite 6] Crash-Safe History Cursor Progression**:
   - Simulated crash during history pagination keeping cursor unchanged.
   - Successful sync retry advancing cursor safely as a string (`"2000"`).
7. **[Suite 7] Complete Phase 1–4 HTTP Route Coverage & HTML Policy**:
   - Endpoint coverage across all 12 core HTTP routes (`/health/*`, `/auth/*`, `/emails/*`, `/sync/*`).
   - HTML safety policy verification: plain text body returned, raw HTML not exposed in API responses.
8. **[Suite 8] Expanded Prompt-Injection Resistance & Safety Boundary**:
   - Prompt-injection resistance across 6 attack surfaces.
   - Malicious flooded candidate rejection with `EXTRACTION_OUTPUT_INVALID`.
9. **[Suite 9] Expanded AI Request Timeout Enforcement & AbortSignal Teardown**:
   - `AbortSignal` propagation, 300ms timeout enforcement, terminal `extraction_runs` status recording, and absence of `llm_usage_events` records for failed/fallback runs.
10. **[Suite 10] Error Sanitization & Token Leak Prevention**:
    - Mapping dirty error payloads to bounded `ErrorCode` strings via `toSafeCode()`.
11. **[Suite 11] Redis-Backed Rate Limiting & Spoofing Defense**:
    - Rate limit header verification (`X-RateLimit-*`), route key isolation (`auth` vs `email_action`), and spoofed `X-Forwarded-For` header defense (`TRUST_PROXY=0`).
12. **[Suite 12] Validation Program Integrity Tests**:
    - Validation schema introspection (10 validation tables present).
    - Deny-by-default validation token auth matrix (503 unconfigured, 401 missing, 403 invalid, 200/next valid).
    - AI fallback safety contract matrix (`resolveAnalysisPath` returning `unavailable`, `deterministic_fallback`, `configured_provider`, or `injected_provider`).
    - Cohort & participant CRUD, interview note storage rules, and email label ownership safety.
    - Metrics computation engine and Go/No-Go decision engine with segmented `MinimumSampleSize` criteria.
    - Score modelling verification (`raw_score` NUMERIC unclamped, `normalized_score=null`, DB persistence of >1.0 and <0.0).
    - Privacy controls verification (scoring reasons contain signal codes only).
    - Production safety rule: rejection of `EMAIL_SCORING_MODE=active` in `production`.
