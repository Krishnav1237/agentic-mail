# Validation Results Report Template
*Obligo Validation Program — Stage 6 Cohort Outcome Report*
*Fill out upon conclusion of a 14-day validation study.*

---

## Executive Overview

| Field | Value |
|---|---|
| Cohort ID | `[cohort-uuid]` |
| Cohort Name | `[e.g. Placement Vertical — August 2026 Cohort 1]` |
| Vertical | Placement |
| Total Participants | `[count >= 5]` |
| Evaluation Period | `YYYY-MM-DD` to `YYYY-MM-DD` |
| Threshold Version | `v1` |
| **Deterministic Decision** | `[oauth_beta / forwarding_alpha / hybrid_design / insufficient_evidence / vertical_rejected]` |

---

## 1. Participant Breakdown

| Participant Code | Persona | OAuth Setup | Forwarding Setup | 1-Week Continuation | Trust Accepted |
|---|---|---|---|---|---|
| P001 | Student | Completed (85s) | N/A | Yes | Yes |
| P002 | Student | Completed (110s) | N/A | Yes | Yes |
| P003 | Class Rep | Admin Blocked | Completed (140s) | Yes | Yes |
| P004 | Freelancer | Completed (95s) | N/A | No | No |
| P005 | Student | Completed (105s) | N/A | Yes | Yes |

---

## 2. Quantitative Metric Evidence

### Ingestion Performance

| Metric | Target (v1) | Observed Value | Status |
|---|---|---|---|
| OAuth Setup Completion Rate | $\ge 80\%$ | `[e.g. 80.0%]` | PASS / FAIL |
| OAuth Median Setup Time | $\le 120\text{s}$ | `[e.g. 98s]` | PASS / FAIL |
| OAuth First Ingestion Success | $\ge 90\%$ | `[e.g. 100.0%]` | PASS / FAIL |
| Forwarding Admin Policy Block Rate | $\le 20\%$ | `[e.g. 20.0%]` | PASS / FAIL |
| One-Week Continuation Rate | $\ge 60\%$ | `[e.g. 80.0%]` | PASS / FAIL |

### Extraction Quality (Human-Reviewed Sample)

| Metric | Target (v1) | Observed Value | Status |
|---|---|---|---|
| Action Precision | $\ge 85\%$ | `[e.g. 88.5%]` | PASS / FAIL |
| Opportunity Precision | $\ge 80\%$ | `[e.g. 82.0%]` | PASS / FAIL |
| Deadline Precision | $\ge 95\%$ | `[e.g. 96.0%]` | PASS / FAIL |
| Critical Email Recall | $\ge 95\%$ | `[e.g. 96.5%]` | PASS / FAIL |
| Semantic Duplicate Rate | $\le 2\%$ | `[e.g. 0.0%]` | PASS / FAIL |
| Extraction Failure Rate | $< 5\%$ | `[e.g. 1.2%]` | PASS / FAIL |

---

## 3. Explicit Unvalidated Assumptions Statement

The following strategy assumptions remain **UNVALIDATED** until live cohort data is gathered:
- **Placement Vertical Fit:** Unvalidated until real student response data is collected.
- **Channel Preference:** Neither OAuth nor forwarding path has been selected.
- **Extraction Accuracy on Real Inboxes:** Unvalidated until human labelling of participant inboxes is complete.
- **Phase 5–7 Readiness:** Phase 5 (Product UI APIs), Phase 6 (Write Execution), and Phase 7 (Agent Planners) remain deferred.

---
*Report Template Version: 1.0*
