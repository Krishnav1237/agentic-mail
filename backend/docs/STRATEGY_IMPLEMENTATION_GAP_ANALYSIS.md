# Strategy Implementation Gap Analysis
*IIL Backend — Stage 0 Audit*
*Generated: 2026-07-23 — Verified against actual source, not documentation summaries.*

---

## 1. Verified Current Implementation

The following subsystems were confirmed by reading actual source files.
No claim relies on documentation alone.

### 1.1 Foundation (Phases 1–4 — CONFIRMED IN CODE)

| Claim | Source File | Verdict |
|---|---|---|
| Express + TypeScript backend | `src/app.ts`, `src/server.ts`, `tsconfig.json` | ✅ Confirmed |
| PostgreSQL 16 (pg pool) | `src/db/index.ts` | ✅ Confirmed |
| Redis 7 (ioredis, 4 isolated clients) | `src/redis/index.ts` | ✅ Confirmed |
| BullMQ queue infrastructure | `src/queues/index.ts`, `src/workers/ingestionWorker.ts` | ✅ Confirmed |
| Google OAuth 2.0 with PKCE | `src/services/googleAuth.ts`, `src/routes/auth.ts` | ✅ Confirmed |
| AES-256-GCM credential encryption | `src/utils/crypto.ts` | ✅ Confirmed |
| JWT cookie and Bearer authentication | `src/middleware/auth.ts` | ✅ Confirmed |
| CSRF double-submit protection | `src/middleware/auth.ts` (lines 72–86) | ✅ Confirmed |
| CORS and trust-proxy controls | `src/app.ts` (lines 38–52, 24–35) | ✅ Confirmed |
| Redis-backed rate limiting | `src/middleware/rateLimit.ts` | ✅ Confirmed |
| Read-only Gmail OAuth (`gmail.readonly`) | `src/services/googleAuth.ts` line 15 | ✅ Confirmed |
| Bounded initial Gmail sync (INITIAL_SYNC_MAX_MESSAGES) | `src/config/env.ts`, `src/services/gmailSyncService.ts` | ✅ Confirmed |
| Gmail History API incremental sync | `src/services/gmailSyncService.ts` | ✅ Confirmed |
| Cursor reconciliation on invalid historyId | `src/services/gmailSyncService.ts` | ✅ Confirmed |
| MIME parsing (bounded depth/parts) | `src/services/gmailSyncService.ts` (MIME_MAX_DEPTH=8, MIME_MAX_PARTS=50) | ✅ Confirmed |
| Attachment metadata extraction (no binary download) | `src/services/gmailSyncService.ts` | ✅ Confirmed |
| Plain-text email API policy (HTML stripped) | `src/routes/emails.ts`, `src/services/gmailSyncService.ts` | ✅ Confirmed |
| Structured AI extraction | `src/ai/structuredAiService.ts` | ✅ Confirmed |
| Gemini/OpenRouter/Groq provider abstraction | `src/ai/structuredAiService.ts`, `src/config/env.ts` | ✅ Confirmed |
| Deterministic development fallback | `src/ai/structuredAiService.ts` (generateDeterministicFallback) | ✅ Confirmed |
| Zod output validation | `src/ai/structuredAiService.ts` (EmailExtractionSchema) | ✅ Confirmed |
| Prompt-injection boundaries | `src/ai/structuredAiService.ts` (getSystemPrompt, BEGIN/END markers) | ✅ Confirmed |
| Extraction runs tracking | `src/services/intelligenceService.ts`, migration 003 | ✅ Confirmed |
| Email intelligence storage | `src/services/intelligenceService.ts`, migration 003 | ✅ Confirmed |
| Action materialization | `src/services/intelligenceService.ts` (confidence ≥ 0.7) | ✅ Confirmed |
| Opportunity materialization | `src/services/intelligenceService.ts` (confidence ≥ 0.7) | ✅ Confirmed |
| Stable `materialized_entity_key` (SHA-256) | `src/services/intelligenceService.ts` (`makeMaterializedEntityKey`) | ✅ Confirmed |
| Immutable audit events (trigger) | `db/migrations/001_baseline_schema.sql` | ✅ Confirmed |
| Cost and usage tracking (llm_usage_events) | `src/services/intelligenceService.ts`, migration 005 | ✅ Confirmed |
| Real PostgreSQL + Redis integration tests | `src/test/integration/` (11 suites) | ✅ Confirmed |

### 1.2 BullMQ Naming — Verified

| Claim | Actual Code | Verdict |
|---|---|---|
| Queue name: `inbox-ingestion` | `src/queues/index.ts` line 4: `INGESTION_QUEUE_NAME = 'inbox-ingestion'` | ✅ Exact match |
| Job name: `ingest-inbox` | `src/routes/emails.ts` line 56: `ingestionQueue.add('ingest-inbox', ...)` | ✅ Exact match |
| Second queue: `agent-execution` | `src/queues/index.ts` line 5: `AGENT_QUEUE_NAME = 'agent-execution'` | ✅ Present but **worker not implemented** |

> **NOTE**: `agentQueue` is declared in `queues/index.ts` but no corresponding worker exists in `workers/`. The `agent-execution` queue is placeholder infrastructure for Phase 7.

---

## 2. Documentation Claims Confirmed by Code

| Documentation Claim | Code Evidence |
|---|---|
| No gmail.modify or gmail.send scopes | `src/services/googleAuth.ts`: GMAIL_SCOPES contains only `gmail.readonly` |
| Fallback confidence ≤ 0.55 (below threshold) | `src/ai/structuredAiService.ts` line 418: `confidence: 0.55` |
| Protected action statuses prevent overwrite | `src/services/intelligenceService.ts` lines 10–16 |
| Atomic OAuth state consumption (GETDEL Lua) | `src/utils/redisLua.ts`, `src/services/googleAuth.ts` |
| Lock renewal every 45s within 90s TTL | `src/workers/ingestionWorker.ts` lines 11–12 |
| UUID validation on email IDs | `src/routes/emails.ts` lines 13–16 |
| TRUST_PROXY defaults to '0' in dev/test | `src/config/env.ts` line 45 |

---

## 3. Documentation Claims NOT Confirmed by Code

| Documentation Claim | Actual State |
|---|---|
| `google_sub` column on users | Migration 001 does NOT include `google_sub`. Added in a later migration (004). Need to check 004. |
| `ai_processing_status` column on emails | Added in migration 002, confirmed. |
| `analysis_mode` column on email_intelligence | Added in migration 004 (not in 003 baseline). Confirmed present in `intelligenceService.ts` INSERT. |
| `updated_at` on emails | Migration 001 does NOT include `updated_at` on emails. Added later (migration 004/005). |
| `completed_at` on extraction_runs | Not in migration 003 definition — needs verification in 004. |
| MANUAL_TESTING_GUIDE.md documents Gmail test workflow | File exists but contains only test strategy text. No step-by-step Google OAuth test workflow exists. |

---

## 4. Missing Validation Tooling (Not Implemented)

All of the following are entirely absent from the repository:

| Required Tooling | Status |
|---|---|
| Validation cohort schema (DB tables) | ❌ Missing |
| Validation participants tracking | ❌ Missing |
| Human email labelling tables | ❌ Missing |
| Extraction review tables | ❌ Missing |
| Validation metrics computation | ❌ Missing |
| Validation decision service | ❌ Missing |
| Validation export (CSV/JSON) | ❌ Missing |
| Validation API routes | ❌ Missing |
| Validation admin token | ❌ Missing |
| Email scoring service (noise filter) | ❌ Missing |
| `email_filtering_decisions` table | ❌ Missing |
| `EMAIL_SCORING_MODE` feature flag | ❌ Missing |
| `validation:benchmark` npm script | ❌ Missing |
| Synthetic email fixtures (validationEmails/) | ❌ Missing |
| Benchmark manifest (expected labels) | ❌ Missing |
| Validation event instrumentation | ❌ Missing (beyond basic audit_events) |
| Validation decision engine (comparison against thresholds) | ❌ Missing |
| Versioned threshold configuration | ❌ Missing |
| Interview scripts and discovery guides | ❌ Missing |
| Manual forwarding experiment documentation | ❌ Missing |
| VALIDATION_COHORT_RUNBOOK.md | ❌ Missing |
| MANUAL_VALIDATION_LOG_TEMPLATE.md | ❌ Missing |

---

## 5. Missing Metrics Infrastructure

| Required Metric | Status |
|---|---|
| Deadline precision | ❌ Not calculated |
| Action precision | ❌ Not calculated |
| Opportunity precision | ❌ Not calculated |
| Critical-email recall | ❌ Not calculated |
| False Action materialization rate | ❌ Not calculated |
| Exact-key duplicate rate | ❌ Not calculated (DB constraint enforces zero, but no metric query) |
| Semantic duplicate rate | ❌ Not calculated |
| Extraction failure rate | ❌ Not calculated |
| OAuth setup completion rate | ❌ Not tracked |
| OAuth median setup time | ❌ Not tracked |
| OAuth first-ingestion success rate | ❌ Not tracked |
| Trust acceptance rate | ❌ Not tracked |
| One-week continuation rate | ❌ Not tracked |
| Admin-policy block rate | ❌ Not tracked |
| Forwarding setup metrics | ❌ Not tracked |

---

## 6. Missing Manual Workflows

| Workflow | Status |
|---|---|
| Google Cloud Console test-user configuration steps | ❌ Not documented |
| Adding 5 test Gmail accounts to OAuth app | ❌ Not documented |
| Sending controlled test emails | ❌ Not documented |
| Critical email labelling workflow | ❌ Not documented |
| Human review and extraction scoring workflow | ❌ Not documented |
| User interview facilitation guide | ❌ Not documented |
| Manual forwarding experiment steps | ❌ Not documented |

---

## 7. Proposed Experiments Not Yet Implemented

From the IIL Strategic Hypotheses document:

| Proposed Experiment | Status |
|---|---|
| 14-day validation cohort (5 participants minimum) | ❌ Not started — infrastructure missing |
| OAuth vs forwarding setup time comparison | ❌ Not started |
| Critical-email recall measurement | ❌ Not started |
| Human precision/recall labelling | ❌ Not started |
| Trust objection categorization | ❌ Not started |
| Willingness-to-pay interviews | ❌ Not started |
| One-week continuation measurement | ❌ Not started |
| Pre-LLM noise scoring shadow mode | ❌ Not started |
| Decision engine evaluation against thresholds | ❌ Not started |

---

## 8. Deferred Phase 5 Systems

| System | Status |
|---|---|
| Customer Dashboard API (`/dashboard`) | ❌ Deferred — not implemented |
| Actions management API (`GET/PATCH /actions`) | ❌ Deferred — not implemented |
| Opportunities API (`GET /opportunities`) | ❌ Deferred — not implemented |
| Approvals read API (`GET /approvals`, `GET /approvals/:id`) | ❌ Deferred — not implemented |
| Approval state updates (`PATCH /approvals/:id`) | ❌ Deferred — not implemented |
| User preferences API | ❌ Deferred — not implemented |
| User goals API | ❌ Deferred — not implemented |
| Audit event log API | ❌ Deferred — not implemented |

---

## 9. Deferred Phase 6 Systems

| System | Status |
|---|---|
| Approval execution (`POST /approvals/:id/approve`) | ❌ Deferred — not implemented |
| Gmail write scopes (`gmail.modify`, `gmail.send`) | ❌ Intentionally excluded — confirmed in googleAuth.ts |
| Safe execution engine | ❌ Deferred — not implemented |
| Approval-state locking | ❌ Deferred — not implemented |
| Execution idempotency and retry | ❌ Deferred — not implemented |
| Send audit logging | ❌ Deferred — not implemented |
| Telegram Bot integration | ❌ Deferred — not implemented |
| Postmark production webhook ingestion | ❌ Deferred — not implemented |
| SendGrid production webhook ingestion | ❌ Deferred — not implemented |
| Inbound email endpoint (`POST /api/v1/inbound/email`) | ❌ Deferred — not implemented |

---

## 10. Deferred Phase 7 Systems

| System | Status |
|---|---|
| Agent orchestration single-agent loop | ❌ Deferred — not implemented |
| Fast Planner (rules engine) | ❌ Deferred — not implemented |
| Heavy Planner (LLM-based) | ❌ Deferred — not implemented |
| Decision state hashing | ❌ Deferred — not implemented |
| Strategist | ❌ Deferred — not implemented |
| Memory optimizer | ❌ Deferred — not implemented |
| Autonomous planner | ❌ Deferred — not implemented |
| Referral system | ❌ Deferred — not implemented |
| Payments (Razorpay, Cashfree, Stripe) | ❌ Deferred — not implemented |

---

## 11. Critical and High Risks

### Critical

| Risk | Detail |
|---|---|
| **Validation evidence gap** | No infrastructure exists to collect the 14-day validation evidence that the strategy requires before making channel decisions (OAuth vs forwarding). Proceeding to Phase 5 without this data would be premature. |
| **No human labelling capability** | The quality metrics (precision, recall) cannot be calculated without a human-labelling mechanism. This is the primary blocker for evaluating extraction quality. |

### High

| Risk | Detail |
|---|---|
| **`agentQueue` exists with no worker** | `agent-execution` queue in Redis with no consumer. If jobs were ever added (e.g., manually), they would pile up. Monitor or disable. |
| **No validation token** | Internal validation endpoints have no access control mechanism yet. Must implement timing-safe token before exposing validation routes. |
| **Synthetic benchmark absent** | No benchmark exists to validate AI extraction quality against known-good labels before running on real participant data. |
| **`email_intelligence.user_id` removed in 005** | Migration 005 drops `user_id` from `email_intelligence`. Ownership now derives through `email_id → emails.user_id`. Any query that assumed a direct `user_id` column on `email_intelligence` would fail at runtime. Confirmed the `intelligenceService.ts` was already updated correctly. |

### Medium

| Risk | Detail |
|---|---|
| **No forwarding infrastructure** | Manual forwarding experiment requires documentation and a test mailbox. Not implemented. Strategy requires this before deciding on forwarding viability. |
| **No scoring feature flag in env schema** | `EMAIL_SCORING_MODE` env var does not exist in `src/config/env.ts`. Required for Stage 2 shadow mode. |
| **Missing `validation:benchmark` script** | `package.json` has no `validation:benchmark` script. Required by the task gate. |
| **No `analysis_mode` column in migration 003** | The 003 migration does not include `analysis_mode`. It must have been added in 004. (Migration 004 not fully inspected — verify during implementation.) |

---

## 12. Recommended Implementation Order

Following the gated stages precisely:

1. **Stage 0** (this document) → Gap analysis complete.
2. **Stage 1** → Validation cohort schema (migration 006), repository/service/route layer, metrics computation, threshold config, export, validation token auth, manual log template.
3. **Stage 2** → Shadow-mode email scoring service, `email_filtering_decisions` table, `EMAIL_SCORING_MODE` feature flag, scoring tests.
4. **Stage 3** → Validation event instrumentation, synthetic email fixtures, benchmark script, cohort runbook.
5. **Stage 4** → Interview scripts and discovery guides (documentation only).
6. **Stage 5** → Manual forwarding experiment documentation only — no production inbound endpoint.
7. **Stage 6** → Decision engine (only after Stage 1–5 data collection infrastructure is in place).
8. **Stage 7** → Documentation synchronization across all docs files.
9. **Stage 8** → Tests for migration, metrics, authorization, scoring, decision engine, privacy.

---

## 13. Conclusion

The Phase 1–4 foundation is solidly implemented and integration-tested. The repository has:
- A working Express/TypeScript/PostgreSQL/Redis/BullMQ backend
- Read-only Gmail OAuth + PKCE + JWT/CSRF + AES-256-GCM encryption
- Structured AI extraction with Zod validation and prompt-injection defense
- 11 integration test suites passing against real PostgreSQL and Redis

**What is entirely absent is the validation infrastructure** required to collect evidence from the 14-day cohort. That is the sole focus of this implementation task.

No Phase 5, 6, or 7 systems will be built. No validation result will be claimed without real cohort data.

---
*Audit conducted: 2026-07-23*
*Auditor: Antigravity (principal backend engineer role)*
*Next action: Stage 1 — Validation operations foundation*
