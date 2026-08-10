# Manual Forwarding Experiment Guide
*IIL Validation Program — Stage 5*
*Protocol for evaluating email forwarding as an alternative ingestion channel.*

---

> [!IMPORTANT]
> **STRATEGY BOUNDARY MANDATE**
> - Inbound webhooks, Postmark/SendGrid inbound parse endpoints, and automated forwarding parsers belong to **Phase 6** (Deferred).
> - This experiment evaluates forwarding manually using controlled test mailboxes and synthetic/anonymized emails.
> - **DO NOT** build production inbound webhook endpoints or request `gmail.modify`/`gmail.send` write permissions.

---

## 1. Experiment Overview & Rationale

### Strategic Question
*Is email forwarding a viable lower-friction ingestion mechanism compared to Google OAuth 2.0 (`gmail.readonly`) for users constrained by corporate/institutional IT policies or OAuth trust concerns?*

### Validation Gate Criteria
To prove forwarding viability, the 14-day cohort evidence must demonstrate:
1. **Setup Completion Rate:** ≥ 70% of invited forwarding participants successfully activate forwarding.
2. **Setup Speed:** Median setup time < 180 seconds.
3. **Admin Block Rate:** < 15% of participants blocked by institutional email policies.
4. **Critical Email Recall:** ≥ 90% of forwarded critical messages successfully ingested.

---

## 2. Experimental Setup & Pre-Requisites

### Test Environment Requirements
1. **Dedicated Inbound Test Mailbox:** A controlled email account (e.g., `inbound-test@inboxintel.example.com`) monitored by the validation team.
2. **5 Participant Volunteers:** Representing student, class rep, or freelancer personas.
3. **Manual Log Worksheet:** Section for forwarding setup observation in `MANUAL_VALIDATION_LOG_TEMPLATE.md`.

---

## 3. Step-by-Step Execution Protocol

### Step 1: Participant Briefing & Forwarding Request
1. Provide the participant with the dedicated inbound forwarding address.
2. Instruct the participant to set up an auto-forwarding rule or manually forward candidate emails (placement notices, client leads, invoice reminders).

### Step 2: Observation & Setup Timing
1. Record start time when participant opens Gmail / email client settings.
2. Guide participant through Gmail Forwarding Setup:
   - *Settings → Forwarding and POP/IMAP → Add a forwarding address*
   - Enter `inbound-test@inboxintel.example.com`
   - Retrieve confirmation code sent to inbound test mailbox and provide to participant.
   - Activate forwarding rule or filter.
3. Record end time when forwarding rule is verified active.
4. Calculate `forwardingSetupSeconds`.

### Step 3: Admin Policy Block Detection
If the participant's Google Workspace domain or mail server rejects external auto-forwarding rules:
1. Mark `adminPolicyBlocked: true` in the participant log.
2. Record the policy block code (e.g., `550 5.7.1 Auto-forwarding disabled by domain admin`).
3. Do NOT attempt to bypass administrative security controls.

### Step 4: Verification of Ingested Messages
1. Send 3 controlled test emails to participant's inbox (1 placement shortlist, 1 client lead, 1 newsletter).
2. Verify which emails are forwarded and received at the test mailbox.
3. Record `criticalMessagesExpected` vs `criticalMessagesIngested`.

---

## 4. API Data Recording

Record experiment outcomes in the validation repository:

```bash
# Record Ingestion Attempt
POST /validation/cohorts/:cohort_id/ingestion-attempts
X-Validation-Token: <VALIDATION_TOKEN>
Content-Type: application/json

{
  "participantId": "participant-uuid",
  "ingestionMode": "forwarding"
}

# Update Attempt with Measured Results
PATCH /validation/ingestion-attempts/:attempt_id
X-Validation-Token: <VALIDATION_TOKEN>
Content-Type: application/json

{
  "setupSeconds": 142,
  "firstIngestionSuccess": true,
  "messagesIngested": 15,
  "criticalMessagesExpected": 3,
  "criticalMessagesIngested": 3,
  "adminPolicyBlocked": false
}
```

---

## 5. Comparative Evaluation Framework

At the conclusion of the cohort, compare OAuth vs Forwarding across key strategic dimensions:

| Metric | OAuth 2.0 (`gmail.readonly`) | Manual Forwarding |
|---|---|---|
| **Setup Friction** | 1-click consent screen | Multi-step Gmail settings + PIN verification |
| **IT Policy Vulnerability** | Google Workspace admin app blocking | Auto-forwarding domain policy blocking |
| **Ingestion Scope** | Complete historical inbox + incremental sync | Forwarded messages only |
| **Privacy Perception** | Full inbox read access required | User selectively forwards relevant mail |
| **Maintenance Burden** | Token refresh / re-consent rules | Rule permanence (no OAuth token expiration) |

---
*Document Version: 1.0*
*Last Updated: 2026-07-23*
