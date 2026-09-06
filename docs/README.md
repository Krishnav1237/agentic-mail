# Obligo Documentation Index

Welcome to the Obligo documentation repository.

---

## 1. Documentation Map by Reader Role

### Founder & Product Operator
- [Root Readme](../README.md): High-level overview, strategy roadmap, current validation status, and quickstart.
- [Strategy Implementation Gap Analysis](../backend/docs/STRATEGY_IMPLEMENTATION_GAP_ANALYSIS.md): Baseline strategy hypotheses vs. verified codebase state.
- [Validation Decision Rules](../backend/docs/VALIDATION_DECISION_RULES.md): Transparent Go/No-Go decision rules, thresholds, and decision flowchart.
- [User Interview Discovery Guide](../backend/docs/USER_INTERVIEW_DISCOVERY_GUIDE.md): Protocol for qualitative user discovery without storing sensitive PII.

### Backend & Infrastructure Engineer
- [Local Development Guide](../backend/docs/LOCAL_DEVELOPMENT.md): Setup instructions, database migration execution, worker loop, and environment startup.
- [Architecture Overview](ARCHITECTURE.md): System layout, data flows, job queues, lock management, and component separation.
- [Data Model & Schema Reference](../backend/docs/DATA_MODEL.md): Complete PostgreSQL schema reference for migrations 001–007, table constraints, and Model A derived ownership.
- [Environment Variables Reference](../backend/docs/ENVIRONMENT_VARIABLES.md): Authoritative list of all environment configuration variables, defaults, and validation rules.
- [Error Codes Reference](../backend/docs/ERROR_CODES.md): Bounded typed error code reference safe for persistence and client responses.

### Security Reviewer
- [Security Architecture & Safeguards](SECURITY.md): Credential encryption, PKCE, timing-safe auth comparison, fail-closed validation tokens, and prompt-injection defenses.
- [Phase 1–4 Audit Ledger](../backend/docs/PHASE_1_4_AUDIT.md): Historical verification record for core security, isolation, and teardown gates.

### Validation Researcher & Data Auditor
- [Validation Implementation Status](../backend/docs/VALIDATION_IMPLEMENTATION_STATUS.md): Current validation infrastructure capabilities, implementation matrix, and explicit unvalidated claims.
- [Validation Metrics Specification](../backend/docs/VALIDATION_METRICS.md): Formulas, data sources, and precision/recall calculations for cohort evaluation.
- [Validation Cohort Runbook](../backend/docs/VALIDATION_COHORT_RUNBOOK.md): Operational guide for conducting 14-day cohort validation studies.
- [Manual Forwarding Experiment Guide](../backend/docs/MANUAL_FORWARDING_EXPERIMENT_GUIDE.md): Protocol for testing human forwarding friction.
- [Manual Validation Log Template](../backend/docs/MANUAL_VALIDATION_LOG_TEMPLATE.md): Template for logging participant milestone progress cleanly.
- [Validation Results Template](../backend/docs/VALIDATION_RESULTS_TEMPLATE.md): Template for reporting final cohort results and decision outcomes.

### Deployment & DevOps Operator
- [Deployment Guide](../DEPLOYMENT.md): Production installation, PostgreSQL 16 & Redis 7 configuration, environment variable requirements, trust-proxy settings, and deployment smoke tests.
- [API Contract Specification](API.md): OpenAPI-style specification for active HTTP routes, internal validation tooling endpoints, and error formats.
- [Testing & Quality Assurance Guide](TESTING.md): Verification commands, integration suite runner, structural regression suite (`validation:regression`), and quality benchmark (`validation:quality`).

---

## 2. Implementation Baseline Summary

> **Status Statement**: Backend Phases 1–4 and the validation operations infrastructure are implemented and structurally verified through automated tests. Real Google OAuth, live Gmail synchronization, real-provider extraction quality, manual forwarding feasibility, user demand, willingness to pay, and vertical selection still require owner-led validation. Phase 5–7 remain deferred.
