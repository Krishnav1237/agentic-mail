# User Interview Discovery Guide
*Obligo Validation Program — Stage 4*
*Qualitative interview protocol and question framework for cohort participants.*

---

> [!IMPORTANT]
> **PRIVACY & COMPLIANCE MANDATE**
> - DO NOT record or transcribe personal names, email addresses, or specific email content during interviews.
> - Record responses using ONLY the standardized category codes listed in this guide.
> - Store only the coded responses via the `/validation/cohorts/:id/interviews` API endpoint.

---

## 1. Objectives

1. Discover participant baseline behavior (how they currently manage email deadlines, placement notices, or client leads).
2. Quantify problem severity and frequency of missed critical messages.
3. Compare user trust perceptions between Google OAuth 2.0 (`gmail.readonly`) and manual email forwarding.
4. Gauge price sensitivity and willingness to pay (WTP) for automated inbox intelligence.
5. Identify continuation intent after 7–14 days of cohort participation.

---

## 2. Interview Structure & Timing

- **Session 1 (Pre-Cohort / Onboarding):** 10 minutes — Baseline habits & initial trust orientation.
- **Session 2 (Mid-Cohort / Day 7):** 15 minutes — Initial experience review, false positives/negatives discussion.
- **Session 3 (Post-Cohort / Day 14):** 15 minutes — Value evaluation, willingness to pay, and continuation intent.

---

## 3. Coded Question Framework

### Section A: Baseline Problem Severity & Frequency

#### Q1: "How often do you miss important or actionable emails in your inbox?"
- `daily` — Misses important emails almost every day.
- `weekly` — Misses important emails 1–2 times a week.
- `monthly` — Misses important emails 1–2 times a month.
- `rarely` — Misses important emails once a semester/quarter.
- `never` — Claims never to miss an important email.

#### Q2: "How severe is the consequence when an important email is missed?"
- `critical` — Lost job/internship opportunity, missed financial deadline, severe penalty.
- `high` — Required last-minute rush, stress, minor grade/fee penalty.
- `medium` — Inconvenience, required follow-up email.
- `low` — Negligible impact.
- `none` — No consequence.

#### Q3: "What is your current primary workaround for managing inbox obligations?"
- `manual_check` — Checking inbox repeatedly / starring / marking unread.
- `calendar` — Manually adding deadlines to Google Calendar / Apple Calendar.
- `notes_app` — Maintaining a separate list in Notion, Apple Notes, or paper.
- `none` — Relying on memory alone.
- `other` — Specialized third-party tool or browser extension.

---

### Section B: Ingestion Mode & Trust Evaluation

#### Q4: "Between connecting your Gmail account via Google OAuth and setting up a forwarding rule to a dedicated address, which do you prefer?"
- `oauth` — Prefers one-click Google Sign-In / OAuth authorization.
- `forwarding` — Prefers selective or manual email forwarding.
- `no_preference` — Equally fine with either method.
- `unsure` — Needs more technical detail before deciding.

#### Q5: "What is your primary privacy or trust concern regarding inbox automation?"
- `privacy_oauth` — Hesitant to grant read access to entire inbox via OAuth.
- `privacy_forwarding` — Concerned about emails being stored on external server via forwarding.
- `accuracy` — Worried the AI will hallucinate deadlines or miss critical messages.
- `none` — No major trust concerns.
- `other` — Corporate/institutional IT policy restriction.

---

### Section C: Valuation & Continuation Intent

#### Q6: "How would you describe your willingness to pay for a service that reliably extracts actions and opportunities from your inbox?"
- `willing_any` — Ready to pay a monthly subscription immediately.
- `willing_trial` — Willing to pay after a free trial period.
- `resistant` — Expects the service to be free or ad-supported.
- `refused` — Would not pay under any circumstances.

#### Q7: "If priced at ₹199–₹499 / month (or equivalent local pricing), would you subscribe?"
- Record numeric amount mentioned (if any) or leave blank.
- Standard currency code: `INR` (or `USD`/`EUR` as appropriate).

#### Q8: "Do you intend to continue using the platform after this 14-day validation study?"
- `yes` — Definitely want to keep using it.
- `conditional` — Only if specific features/improvements are added.
- `no` — Do not wish to continue.
- `undecided` — Need more time to evaluate.

---

## 4. API Data Entry Mapping

Upon completing an interview, submit the responses directly to the backend via:

```bash
POST /validation/cohorts/:cohort_id/interviews
X-Validation-Token: <VALIDATION_TOKEN>
Content-Type: application/json

{
  "participantId": "participant-uuid-here",
  "missedEmailFrequency": "weekly",
  "problemSeverity": "high",
  "currentWorkaround": "manual_check",
  "preferredIngestionMode": "oauth",
  "trustConcernCategory": "privacy_oauth",
  "priceResponse": "willing_trial",
  "continuationIntent": "conditional",
  "notesRedacted": "Participant expressed willingness to pay if calendar sync is added. Coded entry only."
}
```

---
*Document Version: 1.0*
*Last Updated: 2026-07-23*
