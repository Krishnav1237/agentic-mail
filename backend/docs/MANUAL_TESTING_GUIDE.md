# Manual Backend Testing Guide & Lifecycle Testing Runbook
*Obligo Backend — Owner-Led Verification Manual*

---

> **Implementation Baseline**: Backend Phases 1–4 and the validation operations infrastructure are implemented and structurally verified through automated tests. Real Google OAuth, live Gmail synchronization, real-provider extraction quality, manual forwarding feasibility, user demand, willingness to pay, and vertical selection still require owner-led validation. Phase 5–7 remain deferred.

---

## 1. Overview & Approach

Instead of testing endpoints randomly, this guide walks through the complete email and validation lifecycle across 12 manual testing sessions.

---

## Session 1: Understand the Infrastructure

Read these documents in order before running manual tests:
1. [Backend Implementation Status](BACKEND_IMPLEMENTATION_STATUS.md)
2. [Architecture Overview](../../docs/ARCHITECTURE.md)
3. [Data Model & Schema Reference](DATA_MODEL.md)
4. [Local Setup Manual](LOCAL_DEVELOPMENT.md)
5. [Manual Testing Runbook](MANUAL_TESTING_GUIDE.md)

---

## Session 2 through 11: Core Lifecycle Verification

1. **Session 2**: Start Local Infrastructure (PostgreSQL 16 & Redis 7).
2. **Session 3**: Verify Liveness and Readiness Probes (`GET /health/live`, `GET /health/ready`).
3. **Session 4**: Verify Google OAuth Redirect & PKCE Generation (`GET /auth/google`).
4. **Session 5**: Verify OAuth Callback & Token Encryption (`GET /auth/google/callback`).
5. **Session 6**: Verify Authenticated Session & Disconnection (`GET /auth/session`, `POST /auth/logout`, `POST /auth/google/disconnect`).
6. **Session 7**: Trigger Ingestion & Inspect BullMQ Worker Logs (`POST /emails/sync`, `GET /sync/status`).
7. **Session 8**: Verify Email Persistence & Raw HTML Non-Exposure Policy (`GET /emails`).
8. **Session 9**: Trigger Structured AI Extraction & Materialization (`POST /emails/:id/extract`, `GET /emails/:id/intelligence`).
9. **Session 10**: Test Concurrent Sync Locking & History Cursor Reconciliation.
10. **Session 11**: Test Security Hardening, CORS, Rate Limiting, and Fail-Closed Validation Auth (`X-Validation-Token`).

---

## Session 12: Validation Program & Cohort Testing Lifecycle

Follow this protocol to manually verify the internal validation tooling subsystem:

### Step 1: Create a Validation Cohort
```bash
curl -s -X POST http://localhost:4000/validation/cohorts \
  -H "X-Validation-Token: $VALIDATION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Manual Placement Cohort 1",
    "vertical": "placement",
    "startDate": "2026-08-01",
    "endDate": "2026-08-15"
  }'
```

### Step 2: Add Cohort Participants
```bash
curl -s -X POST http://localhost:4000/validation/cohorts/<COHORT_ID>/participants \
  -H "X-Validation-Token: $VALIDATION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "participantCode": "P001",
    "persona": "student",
    "source": "campus_referral"
  }'
```

### Step 3: Record Ingestion Attempts
```bash
curl -s -X POST http://localhost:4000/validation/cohorts/<COHORT_ID>/ingestion-attempts \
  -H "X-Validation-Token: $VALIDATION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "participantId": "<PARTICIPANT_ID>",
    "ingestionMode": "oauth"
  }'
```

### Step 4: Submit Human Email Ground-Truth Labels
```bash
curl -s -X POST http://localhost:4000/validation/cohorts/<COHORT_ID>/email-labels \
  -H "X-Validation-Token: $VALIDATION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "emailId": "<EMAIL_ID>",
    "reviewerCode": "R01",
    "isCritical": true,
    "shouldCreateAction": true,
    "shouldCreateOpportunity": false,
    "correctDeadline": "2026-08-10"
  }'
```

### Step 5: Submit Extraction Reviews
```bash
curl -s -X POST http://localhost:4000/validation/cohorts/<COHORT_ID>/extraction-reviews \
  -H "X-Validation-Token: $VALIDATION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "emailId": "<EMAIL_ID>",
    "reviewerCode": "R01",
    "actionValid": true,
    "opportunityValid": false
  }'
```

### Step 6: Record Discovery Interview
```bash
curl -s -X POST http://localhost:4000/validation/cohorts/<COHORT_ID>/interviews \
  -H "X-Validation-Token: $VALIDATION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "participantId": "<PARTICIPANT_ID>",
    "problemSeverity": "high",
    "currentWorkaround": "calendar",
    "preferredIngestionMode": "oauth",
    "priceResponse": "willing_trial"
  }'
```

### Step 7: Evaluate Cohort Decision & Metrics
```bash
# Compute metrics
curl -s http://localhost:4000/validation/cohorts/<COHORT_ID>/metrics \
  -H "X-Validation-Token: $VALIDATION_TOKEN"

# Evaluate decision rules
curl -s -X POST http://localhost:4000/validation/cohorts/<COHORT_ID>/decision \
  -H "X-Validation-Token: $VALIDATION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Step 8: Run Extraction Quality Benchmark
```bash
export VALIDATION_HELDOUT_CORPUS_PATH=/secure/path/heldout-corpus.json
export GEMINI_API_KEY=your_live_key

npm run validation:quality
```

---

## 4. Manual Test Log Template

When conducting manual verification, record test execution notes using this template:

```text
Date: 2026-07-23
Git commit: <commit_hash>
Environment: Local Development (PostgreSQL 16 + Redis 7)
Endpoint/workflow: POST /validation/cohorts/:id/email-labels
Input: cohortId="...", emailId="...", reviewerCode="R01"
Expected result: HTTP 201 Created, label record persisted.
Actual result: HTTP 201 Created, label record created with ID.
Database changes: validation_email_labels +1 row.
Unexpected behavior: None.
Decision: PASSED.
```

> [!CAUTION]
> **Data Privacy Notice**: Do NOT store tokens, cookies, email bodies, prompts, or personal interview transcripts in manual logs or commit them to git repositories.
