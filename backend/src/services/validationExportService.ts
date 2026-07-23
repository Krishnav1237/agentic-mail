/**
 * Validation Export Service
 *
 * Produces safe CSV or JSON exports of cohort data.
 *
 * MUST NOT include in exports:
 *   - OAuth tokens, refresh tokens, JWTs, cookies
 *   - Email bodies or raw HTML
 *   - AI prompts or raw model responses
 *   - Personal email addresses
 *   - Sensitive raw interview transcripts
 *
 * All exported fields are pre-approved anonymized fields only.
 */

import { query } from '../db/index.js';

export interface ParticipantExportRow {
  participantCode: string;
  persona: string;
  oauthSetupOutcome: 'completed' | 'not_completed' | 'not_attempted';
  oauthSetupSeconds: number | null;
  forwardingSetupOutcome: 'completed' | 'not_completed' | 'not_attempted';
  forwardingSetupSeconds: number | null;
  firstIngestionResult_oauth: 'success' | 'failed' | 'unknown' | 'not_attempted';
  firstIngestionResult_forwarding: 'success' | 'failed' | 'unknown' | 'not_attempted';
  criticalMessagesExpected_oauth: number;
  criticalMessagesIngested_oauth: number;
  criticalMessagesExpected_forwarding: number;
  criticalMessagesIngested_forwarding: number;
  materializedActionsTotal: number;
  validActionsReviewed: number;
  materializedOpportunitiesTotal: number;
  validOpportunitiesReviewed: number;
  semanticDuplicateCount: number;
  extractionFailureCount: number;
  trustConcernCategory: string | null;
  continuationIntent: string | null;
  willingnessToPayAmount: number | null;
  willingnessToPayCurrency: string | null;
}

/**
 * Build a safe export for a cohort.
 * All rows are anonymized by participant_code.
 */
export async function buildCohortExport(cohortId: string): Promise<ParticipantExportRow[]> {
  const participantsRes = await query(
    `SELECT id, participant_code, persona,
            oauth_invited, oauth_completed, oauth_setup_seconds,
            forwarding_attempted, forwarding_completed, forwarding_setup_seconds,
            trust_accepted, continued_after_one_week,
            willingness_to_pay_amount, willingness_to_pay_currency
     FROM validation_participants
     WHERE cohort_id = $1
     ORDER BY participant_code ASC`,
    [cohortId]
  );

  const rows: ParticipantExportRow[] = [];

  for (const p of participantsRes.rows) {
    // Ingestion attempts for this participant
    const ingestionRes = await query(
      `SELECT ingestion_mode, first_ingestion_success,
              critical_messages_expected, critical_messages_ingested
       FROM validation_ingestion_attempts
       WHERE participant_id = $1`,
      [p.id]
    );
    const oauthAttempt = ingestionRes.rows.find((r: any) => r.ingestion_mode === 'oauth');
    const fwdAttempt = ingestionRes.rows.find((r: any) => r.ingestion_mode === 'forwarding');

    // Interview data
    const interviewRes = await query(
      `SELECT trust_concern_category, continuation_intent
       FROM validation_interviews
       WHERE participant_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [p.id]
    );
    const interview = interviewRes.rows[0] ?? null;

    // Action/opportunity counts — scoped to this participant's user_id
    let actionsTotal = 0;
    let oppsTotal = 0;
    if (p.user_id) {
      const entityRes = await query(
        `SELECT
           (SELECT COUNT(*)::int FROM actions WHERE user_id = $1) AS actions_count,
           (SELECT COUNT(*)::int FROM opportunities WHERE user_id = $1) AS opps_count`,
        [p.user_id]
      );
      actionsTotal = entityRes.rows[0]?.actions_count ?? 0;
      oppsTotal = entityRes.rows[0]?.opps_count ?? 0;
    }

    // Review counts
    const reviewRes = await query(
      `SELECT
         COUNT(*) FILTER (WHERE action_valid = TRUE)::int AS valid_actions,
         COUNT(*) FILTER (WHERE opportunity_valid = TRUE)::int AS valid_opps,
         COUNT(*) FILTER (WHERE semantic_duplicate = TRUE)::int AS semantic_dups
       FROM validation_extraction_reviews ver
       JOIN emails e ON e.id = ver.email_id
       WHERE ver.cohort_id = $1 AND e.user_id = $2`,
      [cohortId, p.user_id ?? '00000000-0000-0000-0000-000000000000']
    );
    const reviewRow = reviewRes.rows[0] ?? {};

    // Extraction failure count
    const failRes = await query(
      `SELECT COUNT(*)::int AS failed_count
       FROM extraction_runs er
       JOIN emails e ON e.id = er.email_id
       WHERE e.user_id = $1 AND er.status = 'failed'`,
      [p.user_id ?? '00000000-0000-0000-0000-000000000000']
    );
    const failedCount = failRes.rows[0]?.failed_count ?? 0;

    const oauthOutcome = !p.oauth_invited
      ? ('not_attempted' as const)
      : p.oauth_completed
      ? ('completed' as const)
      : ('not_completed' as const);

    const fwdOutcome = !p.forwarding_attempted
      ? ('not_attempted' as const)
      : p.forwarding_completed
      ? ('completed' as const)
      : ('not_completed' as const);

    const oauthIngestionResult = !oauthAttempt
      ? 'not_attempted'
      : oauthAttempt.first_ingestion_success === true
      ? 'success'
      : oauthAttempt.first_ingestion_success === false
      ? 'failed'
      : 'unknown';

    const fwdIngestionResult = !fwdAttempt
      ? 'not_attempted'
      : fwdAttempt.first_ingestion_success === true
      ? 'success'
      : fwdAttempt.first_ingestion_success === false
      ? 'failed'
      : 'unknown';

    rows.push({
      participantCode: p.participant_code,
      persona: p.persona,
      oauthSetupOutcome: oauthOutcome,
      oauthSetupSeconds: p.oauth_setup_seconds ?? null,
      forwardingSetupOutcome: fwdOutcome,
      forwardingSetupSeconds: p.forwarding_setup_seconds ?? null,
      firstIngestionResult_oauth: oauthIngestionResult as any,
      firstIngestionResult_forwarding: fwdIngestionResult as any,
      criticalMessagesExpected_oauth: oauthAttempt?.critical_messages_expected ?? 0,
      criticalMessagesIngested_oauth: oauthAttempt?.critical_messages_ingested ?? 0,
      criticalMessagesExpected_forwarding: fwdAttempt?.critical_messages_expected ?? 0,
      criticalMessagesIngested_forwarding: fwdAttempt?.critical_messages_ingested ?? 0,
      materializedActionsTotal: actionsTotal,
      validActionsReviewed: reviewRow.valid_actions ?? 0,
      materializedOpportunitiesTotal: oppsTotal,
      validOpportunitiesReviewed: reviewRow.valid_opps ?? 0,
      semanticDuplicateCount: reviewRow.semantic_dups ?? 0,
      extractionFailureCount: failedCount,
      trustConcernCategory: interview?.trust_concern_category ?? null,
      continuationIntent: interview?.continuation_intent ?? null,
      willingnessToPayAmount: p.willingness_to_pay_amount ?? null,
      willingnessToPayCurrency: p.willingness_to_pay_currency ?? null,
    });
  }

  return rows;
}

/**
 * Convert export rows to CSV string.
 */
export function exportRowsToCsv(rows: ParticipantExportRow[]): string {
  if (rows.length === 0) return '';

  const headers = Object.keys(rows[0]) as (keyof ParticipantExportRow)[];

  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const headerLine = headers.map(escape).join(',');
  const dataLines = rows.map((row) => headers.map((h) => escape(row[h])).join(','));

  return [headerLine, ...dataLines].join('\n');
}
