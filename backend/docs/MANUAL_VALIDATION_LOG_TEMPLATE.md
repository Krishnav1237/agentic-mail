# Manual Validation Log Template
*IIL Validation Program — Stage 3*
*Copy this template for each cohort session.*
*Fill in only coded/anonymized observations. Do not record personal information, email addresses, or raw interview transcripts.*

---

## Session Header

| Field | Value |
|---|---|
| Cohort ID | *(cohort UUID)* |
| Participant Code | *(e.g. P001)* |
| Session Type | *(oauth_setup / forwarding_setup / review / interview / observation)* |
| Facilitator Code | *(e.g. F01)* |
| Date | *(YYYY-MM-DD)* |
| Duration (minutes) | *(measured)* |

---

## OAuth Setup Observation Checklist

Complete only for `oauth_setup` sessions.

| Step | Completed? | Notes (anonymized only) |
|---|---|---|
| Participant invited (OAuth link sent) | Y / N | |
| Participant clicked authorization link | Y / N | |
| Google consent screen presented | Y / N | |
| Participant accepted all scopes | Y / N / Admin-blocked |
| OAuth token issued | Y / N | |
| First inbox sync triggered | Y / N | |
| At least one email ingested | Y / N | |
| Trust prompt shown (if any) | Y / N | |
| Trust prompt accepted | Y / N / N/A | |
| Admin policy blocked (Google Workspace) | Y / N | |

**Setup start time (timestamp):** `__________`
**Setup complete time (timestamp):** `__________`
**Setup duration (seconds):** `__________`

**Critical emails expected in this inbox:** `__________`
**Critical emails confirmed ingested:** `__________`

---

## Forwarding Setup Observation Checklist

Complete only for `forwarding_setup` sessions.

| Step | Completed? | Notes (anonymized only) |
|---|---|---|
| Forwarding address provided to participant | Y / N | |
| Participant navigated to Gmail settings | Y / N | |
| Forwarding address entered in settings | Y / N | |
| Gmail confirmation PIN entered | Y / N | |
| Forwarding rule activated | Y / N | |
| Admin policy blocked (Google Workspace) | Y / N | |
| First forwarded email received | Y / N | |
| Participant confirmed test email was received | Y / N | |

**Setup start time (timestamp):** `__________`
**Setup complete time (timestamp):** `__________`
**Setup duration (seconds):** `__________`

**Admin policy block detail (coded, no names):** `__________`

---

## Email Label Review Worksheet

Complete only for `review` sessions.
Add one row per email reviewed. Use email IDs, not subjects or bodies.
Limit notes to category codes, not email content.

| Email ID | Is Critical? | Action? | Opportunity? | Deadline (YYYY-MM-DD or "relative" or "none") | Contains Sensitive Data? | Reviewer Notes |
|---|---|---|---|---|---|---|
| | Y / N | Y / N | Y / N | | Y / N | |
| | Y / N | Y / N | Y / N | | Y / N | |
| | Y / N | Y / N | Y / N | | Y / N | |
| | Y / N | Y / N | Y / N | | Y / N | |
| | Y / N | Y / N | Y / N | | Y / N | |

---

## Extraction Review Worksheet

Complete only for `review` sessions.
Compare AI extraction output against human labels above.
Do NOT record any email body content in this form.

| Email ID | Action Valid? | Opportunity Valid? | Deadline Valid? | Semantic Duplicate? | Failure Category |
|---|---|---|---|---|---|
| | Y / N / skip | Y / N / skip | Y / N / skip | Y / N | *(see codes below)* |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |

**Failure category codes:**
- `missed_critical`
- `false_positive_action`
- `false_positive_opportunity`
- `wrong_deadline`
- `duplicate_action`
- `duplicate_opportunity`
- `prompt_injection_risk`
- `other`

---

## Interview Notes

Complete only for `interview` sessions.
Use coded values ONLY. Do not transcribe conversations.

| Question | Coded Response |
|---|---|
| Missed email frequency | *(daily / weekly / monthly / rarely / never)* |
| Problem severity | *(critical / high / medium / low / none)* |
| Current workaround | *(manual_check / calendar / notes_app / none / other)* |
| Preferred ingestion mode (after demo) | *(oauth / forwarding / no_preference / unsure)* |
| Trust concern category | *(privacy_oauth / privacy_forwarding / accuracy / none / other)* |
| Willingness to pay response | *(willing_any / willing_trial / resistant / refused)* |
| Willingness to pay amount mentioned (₹) | *(number or blank)* |
| Continuation intent | *(yes / conditional / no / undecided)* |

**Anonymized coded observation notes (max 2000 chars, no names, no email content):**

```
[write here]
```

---

## One-Week Follow-Up Checklist

Complete 7 days after session.

| Field | Value |
|---|---|
| Participant continued using the system | Y / N |
| Any further emails ingested | Y / N |
| Trust withdrawn (revoked OAuth) | Y / N |
| Forwarding rule removed | Y / N |
| Notes (anonymized only) | |

---

## Data Entry Checklist

After session, confirm all data was entered into the validation API.

| Item | Entered via API? |
|---|---|
| Ingestion attempt record created/updated | Y / N |
| Email labels submitted | Y / N |
| Extraction reviews submitted | Y / N |
| Interview record submitted (if applicable) | Y / N |
| Participant record updated (setup times, trust, continuation) | Y / N |
| Validation event logged | Y / N |

---

## Privacy Checklist

Before archiving this log:

- [ ] No personal names appear in this document
- [ ] No email addresses appear
- [ ] No email subjects or bodies appear
- [ ] No interview quotes appear (only coded responses)
- [ ] All participants identified by code only
- [ ] This document stored in secure, access-controlled location
- [ ] Raw paper notes (if any) destroyed after data entry

---
*Template version: 1*
*Last updated: 2026-07-23*
