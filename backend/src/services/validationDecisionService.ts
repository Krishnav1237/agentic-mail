/**
 * Validation Decision Service
 *
 * Deterministic evaluation of cohort metrics against versioned thresholds.
 *
 * This is Stage 6 infrastructure — it can only produce a meaningful result
 * when real cohort data has been collected and reviewed.
 *
 * Until then, all calls will return 'insufficient_evidence'.
 */

import { computeCohortMetrics, CohortMetrics } from './validationMetricsService.js';
import { getThresholds, ValidationThresholds } from '../config/validationThresholds.js';
import { getCohort } from '../repositories/validationRepository.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DecisionOutcome =
  | 'oauth_beta'
  | 'forwarding_alpha'
  | 'hybrid_design'
  | 'insufficient_evidence'
  | 'vertical_rejected';

export interface DecisionResult {
  decision: DecisionOutcome;
  thresholdVersion: string;
  passed: string[];
  failed: string[];
  missing: string[];
  rationale: string[];
}

// ─── Decision engine ──────────────────────────────────────────────────────────

/**
 * Evaluate a cohort against its decision thresholds.
 *
 * Rules (transparent):
 *   oauth_beta        — all OAuth checks pass AND quality checks pass
 *   forwarding_alpha  — all forwarding checks pass AND quality checks pass AND admin block rate low
 *   hybrid_design     — both paths pass quality AND segment preference data supports split
 *   insufficient_evidence — sample too small OR required metrics missing
 *   vertical_rejected — problem severity low OR continuation intent absent AND quality fails materially
 *
 * Never silently chooses a path when required metrics are missing.
 */
export async function evaluateCohortDecision(cohortId: string): Promise<DecisionResult> {
  const passed: string[] = [];
  const failed: string[] = [];
  const missing: string[] = [];
  const rationale: string[] = [];

  // Load cohort to get threshold version
  const cohort = await getCohort(cohortId);
  if (!cohort) {
    return {
      decision: 'insufficient_evidence',
      thresholdVersion: 'v1',
      passed,
      failed,
      missing: ['cohort_not_found'],
      rationale: ['Cohort not found'],
    };
  }

  const thresholdVersion = cohort.decisionThresholdVersion;
  const thresholds = getThresholds(thresholdVersion);

  if (!thresholds) {
    return {
      decision: 'insufficient_evidence',
      thresholdVersion,
      passed,
      failed,
      missing: ['unknown_threshold_version'],
      rationale: [`Unknown threshold version: ${thresholdVersion}`],
    };
  }

  // Compute metrics
  const metrics = await computeCohortMetrics(cohortId);

  // Segmented minimum sample size checks
  const min = thresholds.minimumSampleSize;
  if (metrics.participantCount < min.totalParticipants) {
    missing.push('minimum_sample_size');
    rationale.push(
      `Only ${metrics.participantCount} participants; minimum total participants is ${min.totalParticipants}`
    );
    return { decision: 'insufficient_evidence', thresholdVersion, passed, failed, missing, rationale };
  }

  const oauthAttempts = metrics.oauth.invited ?? 0;
  const forwardingAttempts = metrics.forwarding.attempted ?? 0;
  if (oauthAttempts < min.oauthAttempts) {
    missing.push('minimum_oauth_attempts');
    rationale.push(`Only ${oauthAttempts} OAuth invitations/attempts; minimum is ${min.oauthAttempts}`);
  }
  if (forwardingAttempts < min.forwardingAttempts) {
    missing.push('minimum_forwarding_attempts');
    rationale.push(`Only ${forwardingAttempts} forwarding attempts; minimum is ${min.forwardingAttempts}`);
  }

  // Evaluate quality checks (required for any positive decision)
  const qualityResult = evaluateQuality(metrics, thresholds, passed, failed, missing);

  // Evaluate OAuth path
  const oauthResult = evaluateOAuth(metrics, thresholds, passed, failed, missing);

  // Evaluate forwarding path
  const forwardingResult = evaluateForwarding(metrics, thresholds, passed, failed, missing);

  // Missing data check — if critical metrics are missing, we can't decide
  if (missing.length > 0) {
    rationale.push(`Missing required data: ${missing.join(', ')}`);
    return { decision: 'insufficient_evidence', thresholdVersion, passed, failed, missing, rationale };
  }

  // Decision logic
  const qualityOk = qualityResult;
  const oauthOk = oauthResult;
  const forwardingOk = forwardingResult;

  // Check for vertical rejection first (strongest signal)
  if (shouldRejectVertical(metrics, thresholds)) {
    rationale.push('Problem severity or continuation intent failed materially. Vertical rejected.');
    return { decision: 'vertical_rejected', thresholdVersion, passed, failed, missing, rationale };
  }

  if (qualityOk && oauthOk && forwardingOk) {
    rationale.push('Both OAuth and forwarding paths meet quality thresholds. Hybrid design warranted if segment data supports split.');
    return { decision: 'hybrid_design', thresholdVersion, passed, failed, missing, rationale };
  }

  if (qualityOk && oauthOk) {
    rationale.push('OAuth path meets all thresholds. Recommend OAuth beta.');
    return { decision: 'oauth_beta', thresholdVersion, passed, failed, missing, rationale };
  }

  if (qualityOk && forwardingOk) {
    rationale.push('Forwarding path meets all thresholds. Recommend forwarding alpha.');
    return { decision: 'forwarding_alpha', thresholdVersion, passed, failed, missing, rationale };
  }

  rationale.push('No path meets all required thresholds. Insufficient evidence for a positive decision.');
  return { decision: 'insufficient_evidence', thresholdVersion, passed, failed, missing, rationale };
}

// ─── Sub-evaluators ───────────────────────────────────────────────────────────

function evaluateQuality(
  m: CohortMetrics,
  t: ValidationThresholds,
  passed: string[],
  failed: string[],
  missing: string[]
): boolean {
  let ok = true;
  const q = m.quality;
  const qt = t.quality;

  ok = checkMetric('quality.deadline_precision', q.deadlinePrecision, qt.deadlinePrecision, '>=', passed, failed, missing) && ok;
  ok = checkMetric('quality.action_precision', q.actionPrecision, qt.actionPrecision, '>=', passed, failed, missing) && ok;
  ok = checkMetric('quality.opportunity_precision', q.opportunityPrecision, qt.opportunityPrecision, '>=', passed, failed, missing) && ok;
  ok = checkMetric('quality.critical_email_recall', q.criticalEmailRecall, qt.criticalEmailRecall, '>=', passed, failed, missing) && ok;
  ok = checkMetric('quality.semantic_duplicate_rate', q.semanticDuplicateRate, qt.semanticDuplicateRate, '<=', passed, failed, missing) && ok;
  ok = checkMetric('quality.extraction_failure_rate', q.extractionFailureRate, qt.extractionFailureRate, '<=', passed, failed, missing) && ok;

  return ok;
}

function evaluateOAuth(
  m: CohortMetrics,
  t: ValidationThresholds,
  passed: string[],
  failed: string[],
  missing: string[]
): boolean {
  let ok = true;
  const o = m.oauth;
  const ot = t.oauth;

  ok = checkMetric('oauth.setup_completion_rate', o.setupCompletionRate, ot.setupCompletionRate, '>=', passed, failed, missing) && ok;
  ok = checkMetric('oauth.first_ingestion_success_rate', o.firstIngestionSuccessRate, ot.successfulFirstIngestionRate, '>=', passed, failed, missing) && ok;
  ok = checkMetric('oauth.critical_email_recall', o.criticalEmailRecall, ot.criticalEmailRecall, '>=', passed, failed, missing) && ok;
  ok = checkMetric('oauth.trust_acceptance_rate', o.trustAcceptanceRate, ot.trustAcceptanceRate, '>=', passed, failed, missing) && ok;
  ok = checkMetric('oauth.one_week_continuation_rate', o.oneWeekContinuationRate, ot.oneWeekContinuationRate, '>=', passed, failed, missing) && ok;

  // Median setup time — lower is better (must be <= threshold)
  if (o.medianSetupSeconds !== null) {
    if (o.medianSetupSeconds <= ot.medianSetupSeconds) {
      passed.push(`oauth.median_setup_seconds: ${o.medianSetupSeconds}s <= ${ot.medianSetupSeconds}s`);
    } else {
      failed.push(`oauth.median_setup_seconds: ${o.medianSetupSeconds}s > ${ot.medianSetupSeconds}s`);
      ok = false;
    }
  } else {
    missing.push('oauth.median_setup_seconds');
    ok = false;
  }

  return ok;
}

function evaluateForwarding(
  m: CohortMetrics,
  t: ValidationThresholds,
  passed: string[],
  failed: string[],
  missing: string[]
): boolean {
  if (m.forwarding.attempted === 0) {
    missing.push('forwarding.no_attempts');
    return false;
  }

  let ok = true;
  const f = m.forwarding;
  const ft = t.forwarding;

  ok = checkMetric('forwarding.setup_completion_rate', f.setupCompletionRate, ft.setupCompletionRate, '>=', passed, failed, missing) && ok;
  ok = checkMetric('forwarding.first_ingestion_success_rate', f.firstIngestionSuccessRate, ft.successfulFirstIngestionRate, '>=', passed, failed, missing) && ok;
  ok = checkMetric('forwarding.critical_email_recall', f.criticalEmailRecall, ft.criticalEmailRecall, '>=', passed, failed, missing) && ok;
  ok = checkMetric('forwarding.admin_policy_block_rate', f.adminPolicyBlockRate, ft.adminPolicyBlockRate, '<=', passed, failed, missing) && ok;
  ok = checkMetric('forwarding.trust_acceptance_rate', f.trustAcceptanceRate, ft.trustAcceptanceRate, '>=', passed, failed, missing) && ok;
  ok = checkMetric('forwarding.one_week_continuation_rate', f.oneWeekContinuationRate, ft.oneWeekContinuationRate, '>=', passed, failed, missing) && ok;

  if (f.medianSetupSeconds !== null) {
    if (f.medianSetupSeconds <= ft.medianSetupSeconds) {
      passed.push(`forwarding.median_setup_seconds: ${f.medianSetupSeconds}s <= ${ft.medianSetupSeconds}s`);
    } else {
      failed.push(`forwarding.median_setup_seconds: ${f.medianSetupSeconds}s > ${ft.medianSetupSeconds}s`);
      ok = false;
    }
  } else {
    missing.push('forwarding.median_setup_seconds');
    ok = false;
  }

  return ok;
}

function shouldRejectVertical(m: CohortMetrics, _t: ValidationThresholds): boolean {
  // Vertical rejection signals are not in the automated metrics —
  // they come from interview data (problem_severity, continuation_intent).
  // This would be evaluated with qualitative data in a real decision.
  // Return false here: rejection must be explicit from human review.
  return false;
}

/**
 * Check a single metric against a threshold.
 * direction: '>=' means metric must be >= threshold (higher is better).
 *            '<=' means metric must be <= threshold (lower is better).
 */
function checkMetric(
  name: string,
  value: number | null,
  threshold: number,
  direction: '>=' | '<=',
  passed: string[],
  failed: string[],
  missing: string[]
): boolean {
  if (value === null) {
    missing.push(name);
    return false;
  }
  const ok = direction === '>=' ? value >= threshold : value <= threshold;
  const label = `${name}: ${(value * 100).toFixed(1)}% ${direction === '>=' ? '>=' : '<='} ${(threshold * 100).toFixed(1)}%`;
  if (ok) {
    passed.push(label);
  } else {
    failed.push(label);
  }
  return ok;
}
