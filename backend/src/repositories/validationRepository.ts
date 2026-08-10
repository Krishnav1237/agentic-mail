/**
 * Validation Repository
 *
 * All SQL for the validation program tables lives here.
 * No SQL in route handlers.
 *
 * Authorization model:
 *   - These functions must only be called after VALIDATION_TOKEN verification.
 *   - Cross-cohort queries are prevented by always scoping to cohort_id.
 *   - Cross-user email labelling is prevented by confirming email ownership
 *     via the emails.user_id FK chain before inserting labels.
 */

import { query, db } from '../db/index.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ValidationCohort {
  id: string;
  name: string;
  vertical: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
  decisionThresholdVersion: string;
  createdAt: string;
  updatedAt: string;
}

export interface ValidationParticipant {
  id: string;
  cohortId: string;
  userId: string | null;
  participantCode: string;
  persona: string;
  source: string | null;
  oauthInvited: boolean;
  oauthCompleted: boolean;
  oauthSetupSeconds: number | null;
  forwardingAttempted: boolean;
  forwardingCompleted: boolean;
  forwardingSetupSeconds: number | null;
  adminPolicyBlocked: boolean;
  trustAccepted: boolean | null;
  continuedAfterOneWeek: boolean | null;
  willingnessToPayAmount: number | null;
  willingnessToPayCurrency: string | null;
  notesRedacted: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ValidationEmailLabel {
  id: string;
  cohortId: string;
  emailId: string;
  reviewerCode: string;
  isCritical: boolean;
  shouldCreateAction: boolean;
  shouldCreateOpportunity: boolean;
  correctDeadline: string | null;
  deadlineKind: string | null;
  correctActionTitle: string | null;
  correctOpportunityTitle: string | null;
  containsSensitiveData: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ValidationExtractionReview {
  id: string;
  cohortId: string;
  emailId: string;
  extractionRunId: string | null;
  actionValid: boolean | null;
  opportunityValid: boolean | null;
  deadlineValid: boolean | null;
  semanticDuplicate: boolean;
  failureCategory: string | null;
  reviewerCode: string;
  reviewNotesRedacted: string | null;
  createdAt: string;
}

export interface ValidationIngestionAttempt {
  id: string;
  cohortId: string;
  participantId: string;
  ingestionMode: string;
  startedAt: string;
  completedAt: string | null;
  setupSeconds: number | null;
  firstIngestionSuccess: boolean | null;
  messagesIngested: number;
  criticalMessagesExpected: number;
  criticalMessagesIngested: number;
  failureCode: string | null;
  adminPolicyBlocked: boolean;
  createdAt: string;
}

export interface ValidationInterview {
  id: string;
  cohortId: string;
  participantId: string;
  missedEmailFrequency: string | null;
  problemSeverity: string | null;
  currentWorkaround: string | null;
  preferredIngestionMode: string | null;
  trustConcernCategory: string | null;
  priceResponse: string | null;
  continuationIntent: string | null;
  notesRedacted: string | null;
  createdAt: string;
}

export interface ValidationDecision {
  id: string;
  cohortId: string;
  decision: string;
  thresholdVersion: string;
  oauthMetricsJson: object | null;
  forwardingMetricsJson: object | null;
  qualityMetricsJson: object | null;
  financialInputsJson: object | null;
  passedChecks: string[];
  failedChecks: string[];
  missingData: string[];
  rationale: string;
  decidedAt: string;
}

// ─── Cohorts ──────────────────────────────────────────────────────────────────

export async function createCohort(params: {
  name: string;
  vertical: string;
  startDate?: string | null;
  endDate?: string | null;
  decisionThresholdVersion?: string;
}): Promise<ValidationCohort> {
  const r = await query(
    `INSERT INTO validation_cohorts (name, vertical, start_date, end_date, decision_threshold_version)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, vertical, start_date, end_date, status,
               decision_threshold_version, created_at, updated_at`,
    [
      params.name,
      params.vertical,
      params.startDate ?? null,
      params.endDate ?? null,
      params.decisionThresholdVersion ?? 'v1',
    ]
  );
  return mapCohort(r.rows[0]);
}

export async function listCohorts(): Promise<ValidationCohort[]> {
  const r = await query(
    `SELECT id, name, vertical, start_date, end_date, status,
            decision_threshold_version, created_at, updated_at
     FROM validation_cohorts
     ORDER BY created_at DESC`
  );
  return r.rows.map(mapCohort);
}

export async function getCohort(cohortId: string): Promise<ValidationCohort | null> {
  const r = await query(
    `SELECT id, name, vertical, start_date, end_date, status,
            decision_threshold_version, created_at, updated_at
     FROM validation_cohorts WHERE id = $1`,
    [cohortId]
  );
  return r.rows[0] ? mapCohort(r.rows[0]) : null;
}

export async function updateCohort(
  cohortId: string,
  patch: { name?: string; status?: string; startDate?: string; endDate?: string; decisionThresholdVersion?: string }
): Promise<ValidationCohort | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (patch.name !== undefined) { fields.push(`name = $${i++}`); values.push(patch.name); }
  if (patch.status !== undefined) { fields.push(`status = $${i++}`); values.push(patch.status); }
  if (patch.startDate !== undefined) { fields.push(`start_date = $${i++}`); values.push(patch.startDate); }
  if (patch.endDate !== undefined) { fields.push(`end_date = $${i++}`); values.push(patch.endDate); }
  if (patch.decisionThresholdVersion !== undefined) {
    fields.push(`decision_threshold_version = $${i++}`);
    values.push(patch.decisionThresholdVersion);
  }

  if (fields.length === 0) return getCohort(cohortId);

  fields.push(`updated_at = NOW()`);
  values.push(cohortId);

  const r = await query(
    `UPDATE validation_cohorts SET ${fields.join(', ')}
     WHERE id = $${i}
     RETURNING id, name, vertical, start_date, end_date, status,
               decision_threshold_version, created_at, updated_at`,
    values
  );
  return r.rows[0] ? mapCohort(r.rows[0]) : null;
}

// ─── Participants ─────────────────────────────────────────────────────────────

export async function createParticipant(params: {
  cohortId: string;
  participantCode: string;
  persona: string;
  source?: string | null;
  userId?: string | null;
}): Promise<ValidationParticipant> {
  const r = await query(
    `INSERT INTO validation_participants (cohort_id, participant_code, persona, source, user_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [params.cohortId, params.participantCode, params.persona, params.source ?? null, params.userId ?? null]
  );
  return mapParticipant(r.rows[0]);
}

export async function listParticipants(cohortId: string): Promise<ValidationParticipant[]> {
  const r = await query(
    `SELECT * FROM validation_participants WHERE cohort_id = $1 ORDER BY created_at ASC`,
    [cohortId]
  );
  return r.rows.map(mapParticipant);
}

export async function updateParticipant(
  participantId: string,
  patch: Partial<{
    userId: string | null;
    oauthInvited: boolean;
    oauthCompleted: boolean;
    oauthSetupSeconds: number | null;
    forwardingAttempted: boolean;
    forwardingCompleted: boolean;
    forwardingSetupSeconds: number | null;
    adminPolicyBlocked: boolean;
    trustAccepted: boolean | null;
    continuedAfterOneWeek: boolean | null;
    willingnessToPayAmount: number | null;
    notesRedacted: string | null;
  }>
): Promise<ValidationParticipant | null> {
  const colMap: Record<string, string> = {
    userId: 'user_id',
    oauthInvited: 'oauth_invited',
    oauthCompleted: 'oauth_completed',
    oauthSetupSeconds: 'oauth_setup_seconds',
    forwardingAttempted: 'forwarding_attempted',
    forwardingCompleted: 'forwarding_completed',
    forwardingSetupSeconds: 'forwarding_setup_seconds',
    adminPolicyBlocked: 'admin_policy_blocked',
    trustAccepted: 'trust_accepted',
    continuedAfterOneWeek: 'continued_after_one_week',
    willingnessToPayAmount: 'willingness_to_pay_amount',
    notesRedacted: 'notes_redacted',
  };

  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  for (const [key, col] of Object.entries(colMap)) {
    if (key in patch) {
      fields.push(`${col} = $${i++}`);
      values.push((patch as any)[key]);
    }
  }

  if (fields.length === 0) {
    const r = await query(`SELECT * FROM validation_participants WHERE id = $1`, [participantId]);
    return r.rows[0] ? mapParticipant(r.rows[0]) : null;
  }

  fields.push(`updated_at = NOW()`);
  values.push(participantId);

  const r = await query(
    `UPDATE validation_participants SET ${fields.join(', ')}
     WHERE id = $${i} RETURNING *`,
    values
  );
  return r.rows[0] ? mapParticipant(r.rows[0]) : null;
}

// ─── Email Labels ─────────────────────────────────────────────────────────────

/**
 * Create an email label.
 * Safety: confirms email belongs to a user in this cohort before insertion.
 */
export async function createEmailLabel(params: {
  cohortId: string;
  emailId: string;
  reviewerCode: string;
  isCritical: boolean;
  shouldCreateAction: boolean;
  shouldCreateOpportunity: boolean;
  correctDeadline?: string | null;
  deadlineKind?: string | null;
  correctActionTitle?: string | null;
  correctOpportunityTitle?: string | null;
  containsSensitiveData?: boolean;
}): Promise<ValidationEmailLabel> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Ownership safety check: confirm this email belongs to a participant in this cohort.
    const ownerCheck = await client.query(
      `SELECT e.id FROM emails e
       JOIN validation_participants vp ON vp.user_id = e.user_id
       WHERE e.id = $1 AND vp.cohort_id = $2
       LIMIT 1`,
      [params.emailId, params.cohortId]
    );
    if (ownerCheck.rows.length === 0) {
      throw new Error('Email does not belong to a participant in this cohort');
    }

    const r = await client.query(
      `INSERT INTO validation_email_labels
         (cohort_id, email_id, reviewer_code, is_critical, should_create_action,
          should_create_opportunity, correct_deadline, deadline_kind,
          correct_action_title, correct_opportunity_title, contains_sensitive_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        params.cohortId, params.emailId, params.reviewerCode,
        params.isCritical, params.shouldCreateAction, params.shouldCreateOpportunity,
        params.correctDeadline ?? null, params.deadlineKind ?? null,
        params.correctActionTitle ?? null, params.correctOpportunityTitle ?? null,
        params.containsSensitiveData ?? false,
      ]
    );
    await client.query('COMMIT');
    return mapEmailLabel(r.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateEmailLabel(
  labelId: string,
  patch: Partial<{
    isCritical: boolean;
    shouldCreateAction: boolean;
    shouldCreateOpportunity: boolean;
    correctDeadline: string | null;
    deadlineKind: string | null;
    correctActionTitle: string | null;
    correctOpportunityTitle: string | null;
    containsSensitiveData: boolean;
  }>
): Promise<ValidationEmailLabel | null> {
  const colMap: Record<string, string> = {
    isCritical: 'is_critical',
    shouldCreateAction: 'should_create_action',
    shouldCreateOpportunity: 'should_create_opportunity',
    correctDeadline: 'correct_deadline',
    deadlineKind: 'deadline_kind',
    correctActionTitle: 'correct_action_title',
    correctOpportunityTitle: 'correct_opportunity_title',
    containsSensitiveData: 'contains_sensitive_data',
  };

  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  for (const [key, col] of Object.entries(colMap)) {
    if (key in patch) {
      fields.push(`${col} = $${i++}`);
      values.push((patch as any)[key]);
    }
  }

  if (fields.length === 0) {
    const r = await query(`SELECT * FROM validation_email_labels WHERE id = $1`, [labelId]);
    return r.rows[0] ? mapEmailLabel(r.rows[0]) : null;
  }

  fields.push(`updated_at = NOW()`);
  values.push(labelId);

  const r = await query(
    `UPDATE validation_email_labels SET ${fields.join(', ')}
     WHERE id = $${i} RETURNING *`,
    values
  );
  return r.rows[0] ? mapEmailLabel(r.rows[0]) : null;
}

// ─── Extraction Reviews ───────────────────────────────────────────────────────

export async function createExtractionReview(params: {
  cohortId: string;
  emailId: string;
  extractionRunId?: string | null;
  reviewerCode: string;
  actionValid?: boolean | null;
  opportunityValid?: boolean | null;
  deadlineValid?: boolean | null;
  semanticDuplicate?: boolean;
  failureCategory?: string | null;
  reviewNotesRedacted?: string | null;
}): Promise<ValidationExtractionReview> {
  const r = await query(
    `INSERT INTO validation_extraction_reviews
       (cohort_id, email_id, extraction_run_id, reviewer_code,
        action_valid, opportunity_valid, deadline_valid,
        semantic_duplicate, failure_category, review_notes_redacted)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      params.cohortId, params.emailId, params.extractionRunId ?? null,
      params.reviewerCode,
      params.actionValid ?? null, params.opportunityValid ?? null,
      params.deadlineValid ?? null,
      params.semanticDuplicate ?? false,
      params.failureCategory ?? null,
      params.reviewNotesRedacted ?? null,
    ]
  );
  return mapExtractionReview(r.rows[0]);
}

export async function updateExtractionReview(
  reviewId: string,
  patch: Partial<{
    actionValid: boolean | null;
    opportunityValid: boolean | null;
    deadlineValid: boolean | null;
    semanticDuplicate: boolean;
    failureCategory: string | null;
    reviewNotesRedacted: string | null;
  }>
): Promise<ValidationExtractionReview | null> {
  const colMap: Record<string, string> = {
    actionValid: 'action_valid',
    opportunityValid: 'opportunity_valid',
    deadlineValid: 'deadline_valid',
    semanticDuplicate: 'semantic_duplicate',
    failureCategory: 'failure_category',
    reviewNotesRedacted: 'review_notes_redacted',
  };

  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  for (const [key, col] of Object.entries(colMap)) {
    if (key in patch) {
      fields.push(`${col} = $${i++}`);
      values.push((patch as any)[key]);
    }
  }

  if (fields.length === 0) {
    const r = await query(`SELECT * FROM validation_extraction_reviews WHERE id = $1`, [reviewId]);
    return r.rows[0] ? mapExtractionReview(r.rows[0]) : null;
  }

  values.push(reviewId);
  const r = await query(
    `UPDATE validation_extraction_reviews SET ${fields.join(', ')}
     WHERE id = $${i} RETURNING *`,
    values
  );
  return r.rows[0] ? mapExtractionReview(r.rows[0]) : null;
}

// ─── Ingestion Attempts ───────────────────────────────────────────────────────

export async function createIngestionAttempt(params: {
  cohortId: string;
  participantId: string;
  ingestionMode: string;
}): Promise<ValidationIngestionAttempt> {
  const r = await query(
    `INSERT INTO validation_ingestion_attempts (cohort_id, participant_id, ingestion_mode)
     VALUES ($1, $2, $3) RETURNING *`,
    [params.cohortId, params.participantId, params.ingestionMode]
  );
  return mapIngestionAttempt(r.rows[0]);
}

export async function updateIngestionAttempt(
  attemptId: string,
  patch: Partial<{
    completedAt: string;
    setupSeconds: number;
    firstIngestionSuccess: boolean | null;
    messagesIngested: number;
    criticalMessagesExpected: number;
    criticalMessagesIngested: number;
    failureCode: string | null;
    adminPolicyBlocked: boolean;
  }>
): Promise<ValidationIngestionAttempt | null> {
  const colMap: Record<string, string> = {
    completedAt: 'completed_at',
    setupSeconds: 'setup_seconds',
    firstIngestionSuccess: 'first_ingestion_success',
    messagesIngested: 'messages_ingested',
    criticalMessagesExpected: 'critical_messages_expected',
    criticalMessagesIngested: 'critical_messages_ingested',
    failureCode: 'failure_code',
    adminPolicyBlocked: 'admin_policy_blocked',
  };

  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  for (const [key, col] of Object.entries(colMap)) {
    if (key in patch) {
      fields.push(`${col} = $${i++}`);
      values.push((patch as any)[key]);
    }
  }

  if (fields.length === 0) {
    const r = await query(`SELECT * FROM validation_ingestion_attempts WHERE id = $1`, [attemptId]);
    return r.rows[0] ? mapIngestionAttempt(r.rows[0]) : null;
  }

  values.push(attemptId);
  const r = await query(
    `UPDATE validation_ingestion_attempts SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
  return r.rows[0] ? mapIngestionAttempt(r.rows[0]) : null;
}

// ─── Interviews ───────────────────────────────────────────────────────────────

export async function createInterview(params: {
  cohortId: string;
  participantId: string;
  missedEmailFrequency?: string | null;
  problemSeverity?: string | null;
  currentWorkaround?: string | null;
  preferredIngestionMode?: string | null;
  trustConcernCategory?: string | null;
  priceResponse?: string | null;
  continuationIntent?: string | null;
  notesRedacted?: string | null;
}): Promise<ValidationInterview> {
  const r = await query(
    `INSERT INTO validation_interviews
       (cohort_id, participant_id, missed_email_frequency, problem_severity,
        current_workaround, preferred_ingestion_mode, trust_concern_category,
        price_response, continuation_intent, notes_redacted)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      params.cohortId, params.participantId,
      params.missedEmailFrequency ?? null,
      params.problemSeverity ?? null,
      params.currentWorkaround ?? null,
      params.preferredIngestionMode ?? null,
      params.trustConcernCategory ?? null,
      params.priceResponse ?? null,
      params.continuationIntent ?? null,
      params.notesRedacted ?? null,
    ]
  );
  return mapInterview(r.rows[0]);
}

export async function updateInterview(
  interviewId: string,
  patch: Partial<{
    missedEmailFrequency: string | null;
    problemSeverity: string | null;
    currentWorkaround: string | null;
    preferredIngestionMode: string | null;
    trustConcernCategory: string | null;
    priceResponse: string | null;
    continuationIntent: string | null;
    notesRedacted: string | null;
  }>
): Promise<ValidationInterview | null> {
  const colMap: Record<string, string> = {
    missedEmailFrequency: 'missed_email_frequency',
    problemSeverity: 'problem_severity',
    currentWorkaround: 'current_workaround',
    preferredIngestionMode: 'preferred_ingestion_mode',
    trustConcernCategory: 'trust_concern_category',
    priceResponse: 'price_response',
    continuationIntent: 'continuation_intent',
    notesRedacted: 'notes_redacted',
  };

  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  for (const [key, col] of Object.entries(colMap)) {
    if (key in patch) {
      fields.push(`${col} = $${i++}`);
      values.push((patch as any)[key]);
    }
  }

  if (fields.length === 0) {
    const r = await query(`SELECT * FROM validation_interviews WHERE id = $1`, [interviewId]);
    return r.rows[0] ? mapInterview(r.rows[0]) : null;
  }

  values.push(interviewId);
  const r = await query(
    `UPDATE validation_interviews SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
  return r.rows[0] ? mapInterview(r.rows[0]) : null;
}

// ─── Decisions ────────────────────────────────────────────────────────────────

export async function createDecision(params: {
  cohortId: string;
  decision: string;
  thresholdVersion: string;
  oauthMetricsJson?: object | null;
  forwardingMetricsJson?: object | null;
  qualityMetricsJson?: object | null;
  financialInputsJson?: object | null;
  passedChecks?: string[];
  failedChecks?: string[];
  missingData?: string[];
  rationale: string;
}): Promise<ValidationDecision> {
  const r = await query(
    `INSERT INTO validation_decisions
       (cohort_id, decision, threshold_version, oauth_metrics_json, forwarding_metrics_json,
        quality_metrics_json, financial_inputs_json, passed_checks, failed_checks,
        missing_data, rationale)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      params.cohortId, params.decision, params.thresholdVersion,
      params.oauthMetricsJson ? JSON.stringify(params.oauthMetricsJson) : null,
      params.forwardingMetricsJson ? JSON.stringify(params.forwardingMetricsJson) : null,
      params.qualityMetricsJson ? JSON.stringify(params.qualityMetricsJson) : null,
      params.financialInputsJson ? JSON.stringify(params.financialInputsJson) : null,
      params.passedChecks ?? [],
      params.failedChecks ?? [],
      params.missingData ?? [],
      params.rationale,
    ]
  );
  return mapDecision(r.rows[0]);
}

export async function getDecision(cohortId: string): Promise<ValidationDecision | null> {
  const r = await query(
    `SELECT * FROM validation_decisions WHERE cohort_id = $1`,
    [cohortId]
  );
  return r.rows[0] ? mapDecision(r.rows[0]) : null;
}

// ─── Events ───────────────────────────────────────────────────────────────────

export async function recordValidationEvent(params: {
  eventType: string;
  cohortId?: string | null;
  participantId?: string | null;
  userId?: string | null;
  detailsJson?: object;
}): Promise<void> {
  await query(
    `INSERT INTO validation_events (cohort_id, participant_id, user_id, event_type, details_json)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      params.cohortId ?? null,
      params.participantId ?? null,
      params.userId ?? null,
      params.eventType,
      JSON.stringify(params.detailsJson ?? {}),
    ]
  );
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

function mapCohort(row: any): ValidationCohort {
  return {
    id: row.id,
    name: row.name,
    vertical: row.vertical,
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    status: row.status,
    decisionThresholdVersion: row.decision_threshold_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapParticipant(row: any): ValidationParticipant {
  return {
    id: row.id,
    cohortId: row.cohort_id,
    userId: row.user_id ?? null,
    participantCode: row.participant_code,
    persona: row.persona,
    source: row.source ?? null,
    oauthInvited: row.oauth_invited,
    oauthCompleted: row.oauth_completed,
    oauthSetupSeconds: row.oauth_setup_seconds ?? null,
    forwardingAttempted: row.forwarding_attempted,
    forwardingCompleted: row.forwarding_completed,
    forwardingSetupSeconds: row.forwarding_setup_seconds ?? null,
    adminPolicyBlocked: row.admin_policy_blocked,
    trustAccepted: row.trust_accepted ?? null,
    continuedAfterOneWeek: row.continued_after_one_week ?? null,
    willingnessToPayAmount: row.willingness_to_pay_amount ?? null,
    willingnessToPayCurrency: row.willingness_to_pay_currency ?? null,
    notesRedacted: row.notes_redacted ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEmailLabel(row: any): ValidationEmailLabel {
  return {
    id: row.id,
    cohortId: row.cohort_id,
    emailId: row.email_id,
    reviewerCode: row.reviewer_code,
    isCritical: row.is_critical,
    shouldCreateAction: row.should_create_action,
    shouldCreateOpportunity: row.should_create_opportunity,
    correctDeadline: row.correct_deadline ?? null,
    deadlineKind: row.deadline_kind ?? null,
    correctActionTitle: row.correct_action_title ?? null,
    correctOpportunityTitle: row.correct_opportunity_title ?? null,
    containsSensitiveData: row.contains_sensitive_data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapExtractionReview(row: any): ValidationExtractionReview {
  return {
    id: row.id,
    cohortId: row.cohort_id,
    emailId: row.email_id,
    extractionRunId: row.extraction_run_id ?? null,
    actionValid: row.action_valid ?? null,
    opportunityValid: row.opportunity_valid ?? null,
    deadlineValid: row.deadline_valid ?? null,
    semanticDuplicate: row.semantic_duplicate,
    failureCategory: row.failure_category ?? null,
    reviewerCode: row.reviewer_code,
    reviewNotesRedacted: row.review_notes_redacted ?? null,
    createdAt: row.created_at,
  };
}

function mapIngestionAttempt(row: any): ValidationIngestionAttempt {
  return {
    id: row.id,
    cohortId: row.cohort_id,
    participantId: row.participant_id,
    ingestionMode: row.ingestion_mode,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? null,
    setupSeconds: row.setup_seconds ?? null,
    firstIngestionSuccess: row.first_ingestion_success ?? null,
    messagesIngested: row.messages_ingested ?? 0,
    criticalMessagesExpected: row.critical_messages_expected ?? 0,
    criticalMessagesIngested: row.critical_messages_ingested ?? 0,
    failureCode: row.failure_code ?? null,
    adminPolicyBlocked: row.admin_policy_blocked,
    createdAt: row.created_at,
  };
}

function mapInterview(row: any): ValidationInterview {
  return {
    id: row.id,
    cohortId: row.cohort_id,
    participantId: row.participant_id,
    missedEmailFrequency: row.missed_email_frequency ?? null,
    problemSeverity: row.problem_severity ?? null,
    currentWorkaround: row.current_workaround ?? null,
    preferredIngestionMode: row.preferred_ingestion_mode ?? null,
    trustConcernCategory: row.trust_concern_category ?? null,
    priceResponse: row.price_response ?? null,
    continuationIntent: row.continuation_intent ?? null,
    notesRedacted: row.notes_redacted ?? null,
    createdAt: row.created_at,
  };
}

function mapDecision(row: any): ValidationDecision {
  return {
    id: row.id,
    cohortId: row.cohort_id,
    decision: row.decision,
    thresholdVersion: row.threshold_version,
    oauthMetricsJson: row.oauth_metrics_json ?? null,
    forwardingMetricsJson: row.forwarding_metrics_json ?? null,
    qualityMetricsJson: row.quality_metrics_json ?? null,
    financialInputsJson: row.financial_inputs_json ?? null,
    passedChecks: row.passed_checks ?? [],
    failedChecks: row.failed_checks ?? [],
    missingData: row.missing_data ?? [],
    rationale: row.rationale,
    decidedAt: row.decided_at,
  };
}
