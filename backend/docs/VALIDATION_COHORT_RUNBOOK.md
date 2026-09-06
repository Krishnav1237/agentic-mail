# Validation Cohort Runbook
*Obligo Validation Program — Stage 3*
*Operational guide for conducting the 14-day validation study.*

---

## 1. Pre-Cohort Readiness Gates

All of the following MUST be true before starting a cohort.

### 1.1 Infrastructure Gates

- [ ] Migration 006 applied to staging database
- [ ] `npm run build` exits with 0 errors
- [ ] `npm run test:integration` exits with 0 errors
- [ ] `npm run validation:regression` exits with 0 errors (structural suite MUST pass)
- [ ] `VALIDATION_TOKEN` is set in staging environment (≥32 characters)
- [ ] `EMAIL_SCORING_MODE=shadow` set in staging environment
- [ ] Google Cloud Console: 5 test Gmail accounts added as test users
- [ ] At least 5 participants recruited and briefed

### 1.2 Google Cloud Console Setup

```
1. Navigate to https://console.cloud.google.com
2. Select the Obligo project
3. Navigate to APIs & Services → OAuth consent screen
4. Set Publishing Status to "Testing" (NOT Production)
5. Under "Test users", add all 5 participant Gmail addresses
6. Verify that the app can now be authorized by those users only
```

**Why "Testing" mode:**
Keeps the OAuth app unverified. Participants will see a "Google hasn't verified this app" warning.
This is expected and acceptable for validation — it is disclosed to participants upfront.
Do NOT submit for Google verification until Phase 6.

### 1.3 Participant Briefing Checklist

- [ ] Purpose of the study explained (email intelligence categorization)
- [ ] Data handling disclosed: emails are read by the system, AI processes content
- [ ] No email content is stored beyond what's needed for AI extraction
- [ ] Participant can revoke access at any time via `/auth/google/disconnect`
- [ ] Validation is time-limited (14 days)
- [ ] Participant code assigned (P001–P005 minimum)
- [ ] Cohort record created via Validation API

---

## 2. Starting a Cohort

### 2.1 Create Cohort Record

```bash
curl -X POST https://<staging-host>/validation/cohorts \
  -H "Content-Type: application/json" \
  -H "X-Validation-Token: <VALIDATION_TOKEN>" \
  -d '{
    "name": "Placement Vertical — July 2026 Cohort 1",
    "vertical": "placement",
    "startDate": "2026-07-28",
    "endDate": "2026-08-11",
    "decisionThresholdVersion": "v1"
  }'
```

Save the returned `cohort.id` — you will use it for all subsequent API calls.

### 2.2 Create Participant Records

```bash
# Repeat for each participant
curl -X POST https://<staging-host>/validation/cohorts/<cohort_id>/participants \
  -H "Content-Type: application/json" \
  -H "X-Validation-Token: <VALIDATION_TOKEN>" \
  -d '{
    "participantCode": "P001",
    "persona": "student",
    "source": "whatsapp_placement_group"
  }'
```

### 2.3 Update Cohort Status to Active

```bash
curl -X PATCH https://<staging-host>/validation/cohorts/<cohort_id> \
  -H "Content-Type: application/json" \
  -H "X-Validation-Token: <VALIDATION_TOKEN>" \
  -d '{"status": "active"}'
```

---

## 3. OAuth Session Workflow

For each participant who attempts OAuth setup:

### 3.1 Before the Session

1. Confirm the participant's Gmail address is in Google Cloud Console test users.
2. Open the log template: `MANUAL_VALIDATION_LOG_TEMPLATE.md`.
3. Note the session start time.

### 3.2 During the Session

1. Have the participant navigate to `<staging-host>/auth/google` in their browser.
2. Record time when they click the Google authorization link.
3. Observe whether the "Google hasn't verified this app" screen appears.
4. Observe whether admin policy blocks authorization (Workspace accounts).
5. Record time when OAuth completes and first sync is queued.
6. Confirm at least one email appears in the participant's inbox list.

### 3.3 After the Session

Update the participant record with observed times and outcomes:

```bash
curl -X PATCH https://<staging-host>/validation/participants/<participant_id> \
  -H "Content-Type: application/json" \
  -H "X-Validation-Token: <VALIDATION_TOKEN>" \
  -d '{
    "userId": "<user_uuid_assigned_on_oauth_complete>",
    "oauthInvited": true,
    "oauthCompleted": true,
    "oauthSetupSeconds": 87
  }'
```

Record the ingestion attempt:

```bash
curl -X POST https://<staging-host>/validation/cohorts/<cohort_id>/ingestion-attempts \
  -H "Content-Type: application/json" \
  -H "X-Validation-Token: <VALIDATION_TOKEN>" \
  -d '{
    "participantId": "<participant_id>",
    "ingestionMode": "oauth"
  }'

# Then update with results:
curl -X PATCH https://<staging-host>/validation/ingestion-attempts/<attempt_id> \
  -H "Content-Type: application/json" \
  -H "X-Validation-Token: <VALIDATION_TOKEN>" \
  -d '{
    "setupSeconds": 87,
    "firstIngestionSuccess": true,
    "messagesIngested": 142,
    "criticalMessagesExpected": 5,
    "criticalMessagesIngested": 4,
    "completedAt": "2026-07-28T10:23:45Z"
  }'
```

---

## 4. Forwarding Session Workflow

For each participant who attempts forwarding setup:

### 4.1 Participant Instructions to Read Aloud

```
"To use the forwarding approach, you'll need to set up a forwarding rule in Gmail.
 Here's what to do:
 1. Open Gmail settings (gear icon → See all settings)
 2. Click 'Forwarding and POP/IMAP'
 3. Click 'Add a forwarding address' and enter: <inbound-email-address>
 4. Check your inbox for a confirmation PIN from Google
 5. Enter the PIN on the settings page
 6. Select 'Forward a copy of incoming mail' and Save
 7. Send a test email to your own address and confirm it appears in our system"
```

### 4.2 Time and Record

Same procedure as OAuth sessions — note times, observe admin policy blocks, update participant and ingestion attempt records.

### 4.3 Admin Policy Block Handling

If the participant's organization blocks forwarding rules:
1. Record `adminPolicyBlocked: true` on both participant and ingestion attempt.
2. Note the error type (coded, not verbatim).
3. Do NOT attempt workarounds.

---

## 5. Email Labelling Workflow

Conducted 5–7 days after OAuth setup, when enough emails have been ingested.

### 5.1 Retrieve Participant's Emails

```bash
curl https://<staging-host>/emails?limit=100 \
  -H "Authorization: Bearer <participant_jwt>"
```

Note: This requires the participant's authenticated session.
Do NOT use the validation token to access user data directly.

### 5.2 For Each Email

Using the `MANUAL_VALIDATION_LOG_TEMPLATE.md` review worksheet:
1. Record the email ID only (not subject, sender, or body).
2. Mark whether it is critical, should have an action, should have an opportunity.
3. Note expected deadline (absolute date or "relative" or "none").
4. Flag if the email contains sensitive personal data.

Submit via API:

```bash
curl -X POST https://<staging-host>/validation/cohorts/<cohort_id>/email-labels \
  -H "Content-Type: application/json" \
  -H "X-Validation-Token: <VALIDATION_TOKEN>" \
  -d '{
    "emailId": "<email_uuid>",
    "reviewerCode": "R01",
    "isCritical": true,
    "shouldCreateAction": true,
    "shouldCreateOpportunity": false,
    "correctDeadline": "2026-08-05",
    "deadlineKind": "absolute",
    "correctActionTitle": "Submit assignment to professor by August 5"
  }'
```

---

## 6. Extraction Review Workflow

After email labelling, compare human labels to AI extraction output.

```bash
# Get the intelligence for a specific email
curl https://<staging-host>/emails/<email_id>/intelligence \
  -H "Authorization: Bearer <participant_jwt>"
```

For each email, compare AI output to human labels and submit a review:

```bash
curl -X POST https://<staging-host>/validation/cohorts/<cohort_id>/extraction-reviews \
  -H "Content-Type: application/json" \
  -H "X-Validation-Token: <VALIDATION_TOKEN>" \
  -d '{
    "emailId": "<email_uuid>",
    "extractionRunId": "<extraction_run_uuid>",
    "reviewerCode": "R01",
    "actionValid": true,
    "opportunityValid": false,
    "deadlineValid": true,
    "semanticDuplicate": false,
    "failureCategory": null
  }'
```

---

## 7. Interview Workflow

Conduct after at least 7 days of usage. Use the log template interview section.
Submit coded responses only:

```bash
curl -X POST https://<staging-host>/validation/cohorts/<cohort_id>/interviews \
  -H "Content-Type: application/json" \
  -H "X-Validation-Token: <VALIDATION_TOKEN>" \
  -d '{
    "participantId": "<participant_id>",
    "missedEmailFrequency": "weekly",
    "problemSeverity": "high",
    "currentWorkaround": "manual_check",
    "preferredIngestionMode": "oauth",
    "trustConcernCategory": "privacy_oauth",
    "priceResponse": "willing_trial",
    "continuationIntent": "conditional",
    "notesRedacted": "Expressed hesitation about OAuth due to company IT policy concern. No personal data mentioned."
  }'
```

---

## 8. One-Week Follow-Up

At day 7 and day 14:

```bash
curl -X PATCH https://<staging-host>/validation/participants/<participant_id> \
  -H "Content-Type: application/json" \
  -H "X-Validation-Token: <VALIDATION_TOKEN>" \
  -d '{"continuedAfterOneWeek": true}'
```

---

## 9. Computing Metrics

At any point during or after the study:

```bash
curl https://<staging-host>/validation/cohorts/<cohort_id>/metrics \
  -H "X-Validation-Token: <VALIDATION_TOKEN>"
```

---

## 10. Making a Decision

Only after all participants have completed the study and all reviews are submitted:

```bash
curl -X POST https://<staging-host>/validation/cohorts/<cohort_id>/decision \
  -H "Content-Type: application/json" \
  -H "X-Validation-Token: <VALIDATION_TOKEN>" \
  -d '{
    "financialInputsJson": {
      "medianWTPAmountINR": 299,
      "willingToPayCount": 3,
      "totalInterviewed": 5
    },
    "rationale": "OAuth setup completion exceeded threshold. Critical email recall met minimum bar. Admin policy blocked 1/5 Workspace accounts. Quality thresholds passed on synthetic corpus but not yet on real data — requires human review count increase before promoting to beta."
  }'
```

---

## 11. Exporting Results

```bash
# JSON export
curl https://<staging-host>/validation/cohorts/<cohort_id>/export \
  -H "X-Validation-Token: <VALIDATION_TOKEN>"

# CSV export
curl "https://<staging-host>/validation/cohorts/<cohort_id>/export?format=csv" \
  -H "X-Validation-Token: <VALIDATION_TOKEN>" \
  -o cohort-results.csv
```

---

## 12. Privacy and Data Handling

- Validation sessions MUST NOT record personal names, email addresses, or raw email content.
- All forms use participant codes only.
- Interview notes are coded observations, not transcripts.
- OAuth tokens are handled exclusively by the existing auth subsystem.
- Ingestion decisions are logged at the category level, never at the content level.
- After the study, all participant raw notes must be destroyed.
- Only coded records submitted via API are retained.

---

## 13. Escalation Criteria

Stop the cohort early and escalate to decision review if:
- Three or more consecutive OAuth failures (admin policy blocks)
- Any evidence of an AI extraction producing sensitive data in output
- Any participant requests data deletion mid-study
- A prompt-injection attempt is detected in participant emails

---
*Runbook version: 1*
*Last updated: 2026-07-23*
