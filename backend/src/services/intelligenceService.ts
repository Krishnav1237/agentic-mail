import crypto from 'crypto';
import { query, db } from '../db/index.js';
import { StructuredAiService } from '../ai/structuredAiService.js';
import { scoreAndRecord } from './emailScoringService.js';
import { env } from '../config/env.js';
import { AppError, ErrorCode, toSafeCode } from '../errors/AppError.js';

const LLM_MATERIALIZATION_CONFIDENCE = 0.7;
const FALLBACK_MATERIALIZATION_CONFIDENCE = 0.8;

const PROTECTED_ACTION_STATUSES = new Set([
  'completed', 'archived', 'cancelled', 'snoozed',
]);

const PROTECTED_OPPORTUNITY_STATUSES = new Set([
  'saved', 'applied', 'dismissed',
]);

export const makeMaterializedEntityKey = (params: {
  userId: string;
  sourceEmailId: string;
  entityType: 'action' | 'opportunity';
  title: string;
  deadline: string | null | undefined;
  target: string | null | undefined;
  category: string | null | undefined;
}): string => {
  const normalizeText = (s: string | null | undefined): string | null => {
    if (!s || s.trim().length === 0) return null;
    return s.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
  };

  const normalizeDeadline = (d: string | null | undefined): string | null => {
    if (!d) return null;
    const match = d.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
  };

  const canonical = JSON.stringify({
    k: 'v1',
    u: params.userId,
    e: params.sourceEmailId,
    t: params.entityType,
    ti: normalizeText(params.title),
    dl: normalizeDeadline(params.deadline),
    tg: normalizeText(params.target),
    ca: normalizeText(params.category),
  });

  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
};

export const makeExtractionCandidateKey = (params: {
  userId: string;
  emailId: string;
  entityType: 'action' | 'opportunity';
  title: string;
  extractionVersion: number;
}): string => {
  const canonical = JSON.stringify({
    k: 'candidate-v1',
    u: params.userId,
    e: params.emailId,
    t: params.entityType,
    ti: params.title.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' '),
    v: params.extractionVersion,
  });
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
};

export class IntelligenceService {
  public static generateIdempotencyKey(
    userId: string,
    emailId: string,
    entityType: 'action' | 'opportunity',
    title: string,
    version: number = 1
  ): string {
    return makeMaterializedEntityKey({
      userId,
      sourceEmailId: emailId,
      entityType,
      title,
      deadline: null,
      target: null,
      category: null,
    });
  }

  public static async processEmailIntelligence(emailId: string): Promise<string> {
    const emailRes = await query(
      `SELECT id, user_id, subject, body_text, sender_email, sender_name, received_at
       FROM emails WHERE id = $1`,
      [emailId]
    );

    if (emailRes.rows.length === 0) {
      throw new AppError(ErrorCode.NOT_FOUND, `Email not found: ${emailId}`, 404);
    }

    const email = emailRes.rows[0];
    const userId: string = email.user_id;
    const EXTRACTION_VERSION = 1;

    const runRes = await query(
      `INSERT INTO extraction_runs (user_id, email_id, prompt_version, schema_version, model, status)
       VALUES ($1, $2, 'v1', 'v2', $3, 'running')
       RETURNING id`,
      [userId, emailId, env.AI_MODEL]
    );
    const extractionRunId: string = runRes.rows[0].id;

    try {
      // Pre-LLM Noise Scoring (Shadow Mode)
      // Scores signal patterns and persists to email_filtering_decisions.
      // Low signal never discards or blocks extraction pipeline.
      await scoreAndRecord({
        emailId,
        subject: email.subject || '',
        bodyText: email.body_text || '',
        senderEmail: email.sender_email || '',
      });

      const aiResult = await StructuredAiService.analyzeEmail(
        email.subject || '',
        email.body_text || '',
        email.sender_email || ''
      );

      const {
        data,
        model,
        provider,
        analysisMode,
        promptTokens,
        completionTokens,
        latencyMs,
        estimatedCost,
        pricingStatus,
        pricingVersion,
      } = aiResult;

      const materializationThreshold =
        analysisMode === 'deterministic_fallback'
          ? FALLBACK_MATERIALIZATION_CONFIDENCE
          : LLM_MATERIALIZATION_CONFIDENCE;

      const client = await db.connect();
      try {
        await client.query('BEGIN');

        await client.query(
          `INSERT INTO email_intelligence (
             email_id, extraction_version, intent_classification, sender_classification,
             priority_score, urgency_score, is_noise, action_candidates, opportunity_candidates,
             extracted_reasoning, analysis_mode
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (email_id, extraction_version) DO UPDATE SET
             intent_classification   = EXCLUDED.intent_classification,
             sender_classification   = EXCLUDED.sender_classification,
             priority_score          = EXCLUDED.priority_score,
             urgency_score           = EXCLUDED.urgency_score,
             is_noise                = EXCLUDED.is_noise,
             action_candidates       = EXCLUDED.action_candidates,
             opportunity_candidates  = EXCLUDED.opportunity_candidates,
             extracted_reasoning     = EXCLUDED.extracted_reasoning,
             analysis_mode           = EXCLUDED.analysis_mode,
             updated_at              = NOW()`,
          [
            emailId,
            EXTRACTION_VERSION,
            data.intentClassification,
            data.senderClassification,
            data.priorityScore,
            data.urgencyScore,
            data.isNoise,
            JSON.stringify(data.actionCandidates),
            JSON.stringify(data.opportunityCandidates),
            data.reasoning,
            analysisMode,
          ]
        );

        await client.query(
          `UPDATE emails
           SET classification = $1, ai_score = $2, ai_processing_status = 'processed',
               processed_at = NOW(), updated_at = NOW()
           WHERE id = $3`,
          [data.intentClassification, data.priorityScore, emailId]
        );

        if (analysisMode === 'llm') {
          await client.query(
            `INSERT INTO llm_usage_events
               (user_id, provider, model, prompt_tokens, completion_tokens,
                total_cost, pricing_status, pricing_version)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              userId,
              provider,
              model,
              promptTokens > 0 ? promptTokens : null,
              completionTokens > 0 ? completionTokens : null,
              estimatedCost !== null && estimatedCost >= 0 ? estimatedCost : null,
              pricingStatus,
              pricingVersion,
            ]
          );
        }

        if (!data.isNoise) {
          for (const candidate of data.actionCandidates) {
            if (candidate.confidence < materializationThreshold) continue;

            const idempotencyKey = makeMaterializedEntityKey({
              userId,
              sourceEmailId: emailId,
              entityType: 'action',
              title: candidate.title,
              deadline: candidate.dueAt || candidate.dueDate || null,
              target: null,
              category: candidate.category || null,
            });

            const existingRes = await client.query(
              `SELECT status FROM actions WHERE idempotency_key = $1 AND user_id = $2`,
              [idempotencyKey, userId]
            );

            if (existingRes.rows.length > 0) {
              if (PROTECTED_ACTION_STATUSES.has(existingRes.rows[0].status)) continue;
            }

            await client.query(
              `INSERT INTO actions (
                 user_id, email_id, idempotency_key, title, description, category,
                 due_at, has_exact_time, priority_score, status, is_gold, gold_reason, prepared_work
               )
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open', $10, $11, $12)
               ON CONFLICT (idempotency_key) DO UPDATE SET
                 priority_score = EXCLUDED.priority_score,
                 is_gold        = EXCLUDED.is_gold,
                 gold_reason    = EXCLUDED.gold_reason,
                 updated_at     = NOW()
               WHERE actions.status NOT IN ('completed', 'archived', 'cancelled', 'snoozed')`,
              [
                userId,
                emailId,
                idempotencyKey,
                candidate.title,
                candidate.description || null,
                candidate.category || 'general',
                candidate.dueAt ? new Date(candidate.dueAt) : null,
                candidate.hasExactTime ?? false,
                data.priorityScore,
                candidate.isGold ?? false,
                candidate.goldReason || null,
                JSON.stringify({ sourceSubject: email.subject }),
              ]
            );
          }

          for (const opp of data.opportunityCandidates) {
            if (opp.confidence < materializationThreshold) continue;

            const idempotencyKey = makeMaterializedEntityKey({
              userId,
              sourceEmailId: emailId,
              entityType: 'opportunity',
              title: opp.title,
              deadline: null,
              target: opp.companyOrSource || null,
              category: opp.opportunityType || null,
            });

            const existingRes = await client.query(
              `SELECT status FROM opportunities WHERE idempotency_key = $1 AND user_id = $2`,
              [idempotencyKey, userId]
            );

            if (existingRes.rows.length > 0) {
              if (PROTECTED_OPPORTUNITY_STATUSES.has(existingRes.rows[0].status)) continue;
            }

            await client.query(
              `INSERT INTO opportunities (
                 user_id, email_id, idempotency_key, title, company_or_source, description,
                 opportunity_type, status, is_gold, gold_reason, source_context
               )
               VALUES ($1, $2, $3, $4, $5, $6, $7, 'surfaced', $8, $9, $10)
               ON CONFLICT (idempotency_key) DO UPDATE SET
                 is_gold     = EXCLUDED.is_gold,
                 gold_reason = EXCLUDED.gold_reason,
                 updated_at  = NOW()
               WHERE opportunities.status NOT IN ('saved', 'applied', 'dismissed')`,
              [
                userId,
                emailId,
                idempotencyKey,
                opp.title,
                opp.companyOrSource || null,
                opp.description || null,
                opp.opportunityType,
                opp.isGold ?? false,
                opp.goldReason || null,
                JSON.stringify({ senderEmail: email.sender_email }),
              ]
            );
          }
        }

        await client.query(
          `UPDATE extraction_runs
           SET status = 'completed', latency_ms = $1, prompt_tokens = $2,
               completion_tokens = $3, estimated_cost = $4, completed_at = NOW()
           WHERE id = $5`,
          [
            latencyMs,
            promptTokens ?? 0,
            completionTokens ?? 0,
            estimatedCost !== null && estimatedCost >= 0 ? estimatedCost : 0,
            extractionRunId,
          ]
        );

        await client.query('COMMIT');
        return extractionRunId;
      } catch (txErr: unknown) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
    } catch (error: unknown) {
      const safeCode = toSafeCode(error);

      await query(
        `UPDATE extraction_runs SET status = 'failed', error_code = $1, completed_at = NOW() WHERE id = $2`,
        [safeCode, extractionRunId]
      ).catch(() => {});

      throw error;
    }
  }
}
