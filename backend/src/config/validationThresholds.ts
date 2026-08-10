/**
 * Versioned validation decision thresholds.
 *
 * Single source of truth for cohort evaluation thresholds.
 * The threshold version used for each cohort decision is persisted in
 * validation_decisions.threshold_version for auditability.
 *
 * Do NOT hardcode these values in route handlers or workers.
 * Always read from getThresholds(version).
 */

export interface PersonaSampleMinimums {
  students: number;
  classRepresentatives: number;
  freelancers: number;
}

export interface MinimumSampleSize {
  totalParticipants: number;
  personaParticipants: PersonaSampleMinimums;
  oauthAttempts: number;
  forwardingAttempts: number;
  labelledEmails: number;
  criticalLabelledEmails: number;
  reviewedActions: number;
  reviewedOpportunities: number;
  oneWeekFollowUps: number;
}

export interface ValidationThresholds {
  version: string;
  oauth: {
    setupCompletionRate: number;        // 0–1
    medianSetupSeconds: number;          // seconds
    successfulFirstIngestionRate: number;
    criticalEmailRecall: number;
    trustAcceptanceRate: number;
    oneWeekContinuationRate: number;
  };
  forwarding: {
    setupCompletionRate: number;
    medianSetupSeconds: number;
    successfulFirstIngestionRate: number;
    criticalEmailRecall: number;
    adminPolicyBlockRate: number;       // must stay BELOW this
    trustAcceptanceRate: number;
    oneWeekContinuationRate: number;
  };
  quality: {
    deadlinePrecision: number;
    actionPrecision: number;
    opportunityPrecision: number;
    criticalEmailRecall: number;
    semanticDuplicateRate: number;      // must stay BELOW this
    extractionFailureRate: number;      // must stay BELOW this
  };
  minimumSampleSize: MinimumSampleSize;
}

/**
 * v1 thresholds — authoritative criteria based on strategy document.
 */
const THRESHOLD_V1: ValidationThresholds = {
  version: 'v1',
  oauth: {
    setupCompletionRate: 0.80,          // ≥ 80% complete setup
    medianSetupSeconds: 120,            // ≤ 2 minutes median
    successfulFirstIngestionRate: 0.90, // ≥ 90% get at least one email
    criticalEmailRecall: 0.95,          // ≥ 95% critical emails ingested
    trustAcceptanceRate: 0.75,          // ≥ 75% accept trust prompt
    oneWeekContinuationRate: 0.60,      // ≥ 60% still active after 1 week
  },
  forwarding: {
    setupCompletionRate: 0.70,          // ≥ 70% complete setup (higher friction expected)
    medianSetupSeconds: 300,            // ≤ 5 minutes median
    successfulFirstIngestionRate: 0.80,
    criticalEmailRecall: 0.90,
    adminPolicyBlockRate: 0.20,         // ≤ 20% blocked by admin policy
    trustAcceptanceRate: 0.65,
    oneWeekContinuationRate: 0.55,
  },
  quality: {
    deadlinePrecision: 0.95,            // ≥ 95% of extracted deadlines are correct
    actionPrecision: 0.85,              // ≥ 85% of materialized actions are valid
    opportunityPrecision: 0.80,         // ≥ 80% of materialized opportunities are valid
    criticalEmailRecall: 0.95,          // ≥ 95% critical emails get at least one entity
    semanticDuplicateRate: 0.02,        // ≤ 2% semantic duplicate rate
    extractionFailureRate: 0.05,        // < 5% terminal extraction failures
  },
  minimumSampleSize: {
    totalParticipants: 20,
    personaParticipants: {
      students: 10,
      classRepresentatives: 5,
      freelancers: 5,
    },
    oauthAttempts: 5,
    forwardingAttempts: 5,
    labelledEmails: 30,
    criticalLabelledEmails: 10,
    reviewedActions: 15,
    reviewedOpportunities: 10,
    oneWeekFollowUps: 10,
  },
};

const THRESHOLD_REGISTRY: Record<string, ValidationThresholds> = {
  v1: THRESHOLD_V1,
};

/**
 * Retrieve thresholds for a given version string.
 * Returns null if the version is unrecognized.
 */
export function getThresholds(version: string): ValidationThresholds | null {
  return THRESHOLD_REGISTRY[version] ?? null;
}

/**
 * Returns the current default threshold version.
 */
export function currentThresholdVersion(): string {
  return 'v1';
}

/**
 * Returns all registered threshold versions (for admin inspection).
 */
export function listThresholdVersions(): string[] {
  return Object.keys(THRESHOLD_REGISTRY);
}
