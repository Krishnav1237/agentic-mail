# Validation Decision Rules
*Obligo Validation Program — Stage 6 Deterministic Go/No-Go Decision Engine*

---

## 1. Overview

The validation decision engine (`src/services/validationDecisionService.ts`) evaluates snapshot metrics for a cohort against versioned decision thresholds (`src/config/validationThresholds.ts`).

---

## 2. Threshold Source of Truth (Version `v1`)

| Metric Domain | Parameter | Threshold | Direction |
|---|---|---|---|
| **Sample Size** | `minimumSampleSize` | 5 participants | $\ge$ |
| **OAuth** | `setupCompletionRate` | 80% ($0.80$) | $\ge$ |
| **OAuth** | `medianSetupSeconds` | 120 seconds | $\le$ |
| **OAuth** | `successfulFirstIngestionRate` | 90% ($0.90$) | $\ge$ |
| **OAuth** | `criticalEmailRecall` | 85% ($0.85$) | $\ge$ |
| **Forwarding** | `setupCompletionRate` | 70% ($0.70$) | $\ge$ |
| **Forwarding** | `adminPolicyBlockRate` | 20% ($0.20$) | $\le$ |
| **Quality** | `actionPrecision` | **85% ($0.85$)** | $\ge$ |
| **Quality** | `opportunityPrecision` | **80% ($0.80$)** | $\ge$ |
| **Quality** | `deadlinePrecision` | **95% ($0.95$)** | $\ge$ |
| **Quality** | `criticalEmailRecall` | **95% ($0.95$)** | $\ge$ |
| **Quality** | `semanticDuplicateRate` | **2% ($0.02$)** | $\le$ |
| **Quality** | `extractionFailureRate` | **5% ($0.05$)** | $<$ |

---

## 3. Go/No-Go Evaluation Flowchart

```
┌─────────────────────────────────────────────────────────┐
│              Evaluate Cohort Metrics                    │
└──────────────────────────┬──────────────────────────────┘
                           │
             Participant Count < 5?
            ┌──────────────┴──────────────┐
           YES                            NO
            │                             │
 ┌──────────▼──────────────┐   OAuth & Quality Checks Pass?
 │ insufficient_evidence   │  ┌───────────┴───────────┐
 └─────────────────────────┘ YES                         NO
                              │                          │
                 ┌────────────▼──────────┐   Forwarding Checks Pass?
                 │      oauth_beta       │  ┌────────────┴───────────┐
                 └───────────────────────┘ YES                      NO
                                            │                       │
                               ┌────────────▼──────────┐ ┌──────────▼───────────┐
                               │    forwarding_alpha   │ │  vertical_rejected   │
                               └───────────────────────┘ └──────────────────────┘
```

---

## 4. Persisted Audit Record

Decisions are stored immutably in `validation_decisions` table:
- `cohort_id` (unique per decision)
- `decision` (`oauth_beta`, `forwarding_alpha`, `hybrid_design`, `insufficient_evidence`, `vertical_rejected`)
- `threshold_version` (`v1`)
- `passed_checks` (array of rule strings)
- `failed_checks` (array of rule strings)
- `missing_data` (array of unmeasured parameters)
- `rationale` (structured human/engine narrative)

---
*Document Version: 1.0*
