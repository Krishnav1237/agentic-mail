# Validation Metrics Specification
*Obligo Validation Program — Stage 1 & 6 Metrics Reference*

---

## 1. Overview

This document specifies the exact formula, inputs, and null-handling rules for all metrics computed by `src/services/validationMetricsService.ts`.

---

## 2. Ingestion Channel Metrics

### 2.1 OAuth Setup Completion Rate
$$\text{OAuth Setup Rate} = \frac{\text{Participants with } \text{oauth\_completed} = \text{TRUE}}{\text{Participants with } \text{oauth\_invited} = \text{TRUE}}$$
- **Null Safety:** Returns `null` if `oauth_invited` is 0.

### 2.2 Median OAuth Setup Time
$$\text{Median OAuth Setup Seconds} = \text{MEDIAN}(\text{setup\_seconds} \text{ for } \text{ingestion\_mode} = \text{'oauth'})$$
- **Null Safety:** Returns `null` if no completed setup attempt records exist.

### 2.3 Forwarding Setup Completion Rate
$$\text{Forwarding Setup Rate} = \frac{\text{Participants with } \text{forwarding\_completed} = \text{TRUE}}{\text{Participants with } \text{forwarding\_attempted} = \text{TRUE}}$$
- **Null Safety:** Returns `null` if `forwarding_attempted` is 0.

### 2.4 Forwarding Admin Policy Block Rate
$$\text{Admin Policy Block Rate} = \frac{\text{Forwarding attempts with } \text{admin\_policy\_blocked} = \text{TRUE}}{\text{Total forwarding attempts}}$$
- **Null Safety:** Returns `null` if total forwarding attempts is 0.

---

## 3. Extraction Quality Metrics

### 3.1 Action Precision
$$\text{Action Precision} = \frac{\text{Reviewed emails where } \text{action\_valid} = \text{TRUE}}{\text{Reviewed emails where AI extracted at least 1 Action Candidate}}$$
- **Authoritative Threshold:** $\ge 85\%$ ($0.85$)
- **Null Safety:** Returns `null` if 0 emails with action candidates have been human-reviewed.

### 3.2 Opportunity Precision
$$\text{Opportunity Precision} = \frac{\text{Reviewed emails where } \text{opportunity\_valid} = \text{TRUE}}{\text{Reviewed emails where AI extracted at least 1 Opportunity Candidate}}$$
- **Authoritative Threshold:** $\ge 80\%$ ($0.80$)
- **Null Safety:** Returns `null` if 0 emails with opportunity candidates have been human-reviewed.

### 3.3 Deadline Precision
$$\text{Deadline Precision} = \frac{\text{Reviewed emails where } \text{deadline\_valid} = \text{TRUE}}{\text{Reviewed emails where human labeled an explicit deadline}}$$
- **Authoritative Threshold:** $\ge 95\%$ ($0.95$)
- **Null Safety:** Returns `null` if 0 emails with deadlines have been human-reviewed.

### 3.4 Critical Email Recall
$$\text{Critical Recall} = \frac{\text{Human-labeled critical emails where AI extracted at least 1 valid entity}}{\text{Total human-labeled critical emails}}$$
- **Authoritative Threshold:** $\ge 95\%$ ($0.95$)
- **Null Safety:** Returns `null` if 0 critical emails have been human-labeled.

### 3.5 Semantic Duplicate Rate
$$\text{Semantic Duplicate Rate} = \frac{\text{Extraction reviews with } \text{semantic\_duplicate} = \text{TRUE}}{\text{Total extraction reviews}}$$
- **Authoritative Threshold:** $\le 2\%$ ($0.02$)
- **Null Safety:** Returns `null` if 0 extraction reviews exist.

### 3.6 Extraction Failure Rate
$$\text{Extraction Failure Rate} = \frac{\text{Extraction runs with status } = \text{'failed'}}{\text{Total extraction runs}}$$
- **Authoritative Threshold:** $< 5\%$ ($0.05$)
- **Null Safety:** Returns `null` if 0 extraction runs exist.

---
*Document Version: 1.0*
