/**
 * Validation Routes
 *
 * Internal validation tooling API. NOT customer-facing.
 * NOT Phase 5 customer product APIs.
 *
 * All routes require X-Validation-Token header (timing-safe pre-shared secret).
 * All routes are rate-limited via the standard Redis rate limiter.
 *
 * Route summary:
 *   POST   /validation/cohorts
 *   GET    /validation/cohorts
 *   GET    /validation/cohorts/:id
 *   PATCH  /validation/cohorts/:id
 *
 *   POST   /validation/cohorts/:id/participants
 *   GET    /validation/cohorts/:id/participants
 *   PATCH  /validation/participants/:id
 *
 *   POST   /validation/cohorts/:id/email-labels
 *   PATCH  /validation/email-labels/:id
 *
 *   POST   /validation/cohorts/:id/extraction-reviews
 *   PATCH  /validation/extraction-reviews/:id
 *
 *   POST   /validation/cohorts/:id/interviews
 *   PATCH  /validation/interviews/:id
 *
 *   POST   /validation/cohorts/:id/ingestion-attempts
 *   PATCH  /validation/ingestion-attempts/:id
 *
 *   GET    /validation/cohorts/:id/metrics
 *   POST   /validation/cohorts/:id/decision
 *   GET    /validation/cohorts/:id/export
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireValidationToken } from '../middleware/validationAuth.js';
import { rateLimiter } from '../middleware/rateLimit.js';
import * as repo from '../repositories/validationRepository.js';
import { computeCohortMetrics } from '../services/validationMetricsService.js';
import { evaluateCohortDecision } from '../services/validationDecisionService.js';
import { buildCohortExport, exportRowsToCsv } from '../services/validationExportService.js';
import { AppError, ErrorCode } from '../errors/AppError.js';

export const validationRouter = Router();

// Rate limiter for validation endpoints (stricter than auth routes)
const validationRateLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 200,
  keyPrefix: 'validation',
});

// Apply token auth and rate limiter to all validation routes
validationRouter.use(validationRateLimiter, requireValidationToken);

// ─── Cohorts ──────────────────────────────────────────────────────────────────

const CreateCohortSchema = z.object({
  name: z.string().min(1).max(200),
  vertical: z.string().min(1).max(100),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  decisionThresholdVersion: z.string().regex(/^v[0-9]+$/).optional(),
});

const PatchCohortSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(['planning', 'active', 'completed', 'cancelled']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  decisionThresholdVersion: z.string().regex(/^v[0-9]+$/).optional(),
});

validationRouter.post('/cohorts', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = CreateCohortSchema.safeParse(req.body);
  if (!parsed.success) return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.message, 400));
  try {
    const cohort = await repo.createCohort(parsed.data);
    res.status(201).json({ ok: true, cohort });
  } catch (err) {
    next(err);
  }
});

validationRouter.get('/cohorts', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const cohorts = await repo.listCohorts();
    res.json({ ok: true, cohorts });
  } catch (err) {
    next(err);
  }
});

validationRouter.get('/cohorts/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cohort = await repo.getCohort(req.params.id);
    if (!cohort) return next(new AppError(ErrorCode.NOT_FOUND, 'Cohort not found', 404));
    res.json({ ok: true, cohort });
  } catch (err) {
    next(err);
  }
});

validationRouter.patch('/cohorts/:id', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = PatchCohortSchema.safeParse(req.body);
  if (!parsed.success) return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.message, 400));
  try {
    const cohort = await repo.updateCohort(req.params.id, parsed.data);
    if (!cohort) return next(new AppError(ErrorCode.NOT_FOUND, 'Cohort not found', 404));
    res.json({ ok: true, cohort });
  } catch (err) {
    next(err);
  }
});

// ─── Participants ─────────────────────────────────────────────────────────────

const CreateParticipantSchema = z.object({
  participantCode: z.string().min(1).max(50),
  persona: z.enum(['student', 'class_representative', 'freelancer']),
  source: z.string().max(200).optional().nullable(),
  userId: z.string().uuid().optional().nullable(),
});

const PatchParticipantSchema = z.object({
  userId: z.string().uuid().optional().nullable(),
  oauthInvited: z.boolean().optional(),
  oauthCompleted: z.boolean().optional(),
  oauthSetupSeconds: z.number().int().min(0).optional().nullable(),
  forwardingAttempted: z.boolean().optional(),
  forwardingCompleted: z.boolean().optional(),
  forwardingSetupSeconds: z.number().int().min(0).optional().nullable(),
  adminPolicyBlocked: z.boolean().optional(),
  trustAccepted: z.boolean().optional().nullable(),
  continuedAfterOneWeek: z.boolean().optional().nullable(),
  willingnessToPayAmount: z.number().min(0).optional().nullable(),
  notesRedacted: z.string().max(2000).optional().nullable(),
});

validationRouter.post('/cohorts/:id/participants', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = CreateParticipantSchema.safeParse(req.body);
  if (!parsed.success) return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.message, 400));
  try {
    const participant = await repo.createParticipant({ cohortId: req.params.id, ...parsed.data });
    res.status(201).json({ ok: true, participant });
  } catch (err) {
    next(err);
  }
});

validationRouter.get('/cohorts/:id/participants', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const participants = await repo.listParticipants(req.params.id);
    res.json({ ok: true, participants });
  } catch (err) {
    next(err);
  }
});

validationRouter.patch('/participants/:id', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = PatchParticipantSchema.safeParse(req.body);
  if (!parsed.success) return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.message, 400));
  try {
    const participant = await repo.updateParticipant(req.params.id, parsed.data);
    if (!participant) return next(new AppError(ErrorCode.NOT_FOUND, 'Participant not found', 404));
    res.json({ ok: true, participant });
  } catch (err) {
    next(err);
  }
});

// ─── Email Labels ─────────────────────────────────────────────────────────────

const CreateLabelSchema = z.object({
  emailId: z.string().uuid(),
  reviewerCode: z.string().min(1).max(50),
  isCritical: z.boolean().default(false),
  shouldCreateAction: z.boolean().default(false),
  shouldCreateOpportunity: z.boolean().default(false),
  correctDeadline: z.string().max(20).optional().nullable(),
  deadlineKind: z.enum(['absolute', 'relative', 'none']).optional().nullable(),
  correctActionTitle: z.string().max(300).optional().nullable(),
  correctOpportunityTitle: z.string().max(300).optional().nullable(),
  containsSensitiveData: z.boolean().default(false),
});

const PatchLabelSchema = z.object({
  isCritical: z.boolean().optional(),
  shouldCreateAction: z.boolean().optional(),
  shouldCreateOpportunity: z.boolean().optional(),
  correctDeadline: z.string().max(20).optional().nullable(),
  deadlineKind: z.enum(['absolute', 'relative', 'none']).optional().nullable(),
  correctActionTitle: z.string().max(300).optional().nullable(),
  correctOpportunityTitle: z.string().max(300).optional().nullable(),
  containsSensitiveData: z.boolean().optional(),
});

validationRouter.post('/cohorts/:id/email-labels', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = CreateLabelSchema.safeParse(req.body);
  if (!parsed.success) return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.message, 400));
  try {
    const label = await repo.createEmailLabel({ cohortId: req.params.id, ...parsed.data });
    res.status(201).json({ ok: true, label });
  } catch (err: any) {
    if (err?.message?.includes('does not belong to a participant')) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, err.message, 403));
    }
    next(err);
  }
});

validationRouter.patch('/email-labels/:id', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = PatchLabelSchema.safeParse(req.body);
  if (!parsed.success) return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.message, 400));
  try {
    const label = await repo.updateEmailLabel(req.params.id, parsed.data);
    if (!label) return next(new AppError(ErrorCode.NOT_FOUND, 'Label not found', 404));
    res.json({ ok: true, label });
  } catch (err) {
    next(err);
  }
});

// ─── Extraction Reviews ───────────────────────────────────────────────────────

const CreateReviewSchema = z.object({
  emailId: z.string().uuid(),
  extractionRunId: z.string().uuid().optional().nullable(),
  reviewerCode: z.string().min(1).max(50),
  actionValid: z.boolean().optional().nullable(),
  opportunityValid: z.boolean().optional().nullable(),
  deadlineValid: z.boolean().optional().nullable(),
  semanticDuplicate: z.boolean().default(false),
  failureCategory: z.enum([
    'missed_critical', 'false_positive_action', 'false_positive_opportunity',
    'wrong_deadline', 'duplicate_action', 'duplicate_opportunity',
    'prompt_injection_risk', 'other',
  ]).optional().nullable(),
  reviewNotesRedacted: z.string().max(2000).optional().nullable(),
});

const PatchReviewSchema = CreateReviewSchema.omit({ emailId: true, reviewerCode: true }).partial();

validationRouter.post('/cohorts/:id/extraction-reviews', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = CreateReviewSchema.safeParse(req.body);
  if (!parsed.success) return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.message, 400));
  try {
    const review = await repo.createExtractionReview({ cohortId: req.params.id, ...parsed.data });
    res.status(201).json({ ok: true, review });
  } catch (err) {
    next(err);
  }
});

validationRouter.patch('/extraction-reviews/:id', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = PatchReviewSchema.safeParse(req.body);
  if (!parsed.success) return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.message, 400));
  try {
    const review = await repo.updateExtractionReview(req.params.id, parsed.data);
    if (!review) return next(new AppError(ErrorCode.NOT_FOUND, 'Review not found', 404));
    res.json({ ok: true, review });
  } catch (err) {
    next(err);
  }
});

// ─── Interviews ───────────────────────────────────────────────────────────────

const InterviewSchema = z.object({
  participantId: z.string().uuid(),
  missedEmailFrequency: z.enum(['daily', 'weekly', 'monthly', 'rarely', 'never']).optional().nullable(),
  problemSeverity: z.enum(['critical', 'high', 'medium', 'low', 'none']).optional().nullable(),
  currentWorkaround: z.enum(['manual_check', 'calendar', 'notes_app', 'none', 'other']).optional().nullable(),
  preferredIngestionMode: z.enum(['oauth', 'forwarding', 'no_preference', 'unsure']).optional().nullable(),
  trustConcernCategory: z.enum(['privacy_oauth', 'privacy_forwarding', 'accuracy', 'none', 'other']).optional().nullable(),
  priceResponse: z.enum(['willing_any', 'willing_trial', 'resistant', 'refused']).optional().nullable(),
  continuationIntent: z.enum(['yes', 'conditional', 'no', 'undecided']).optional().nullable(),
  notesRedacted: z.string().max(2000).optional().nullable(),
});

const PatchInterviewSchema = InterviewSchema.omit({ participantId: true }).partial();

validationRouter.post('/cohorts/:id/interviews', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = InterviewSchema.safeParse(req.body);
  if (!parsed.success) return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.message, 400));
  try {
    const interview = await repo.createInterview({ cohortId: req.params.id, ...parsed.data });
    res.status(201).json({ ok: true, interview });
  } catch (err) {
    next(err);
  }
});

validationRouter.patch('/interviews/:id', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = PatchInterviewSchema.safeParse(req.body);
  if (!parsed.success) return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.message, 400));
  try {
    const interview = await repo.updateInterview(req.params.id, parsed.data);
    if (!interview) return next(new AppError(ErrorCode.NOT_FOUND, 'Interview not found', 404));
    res.json({ ok: true, interview });
  } catch (err) {
    next(err);
  }
});

// ─── Ingestion Attempts ───────────────────────────────────────────────────────

const CreateIngestionAttemptSchema = z.object({
  participantId: z.string().uuid(),
  ingestionMode: z.enum(['oauth', 'forwarding']),
});

const PatchIngestionAttemptSchema = z.object({
  completedAt: z.string().optional(),
  setupSeconds: z.number().int().min(0).optional(),
  firstIngestionSuccess: z.boolean().optional().nullable(),
  messagesIngested: z.number().int().min(0).optional(),
  criticalMessagesExpected: z.number().int().min(0).optional(),
  criticalMessagesIngested: z.number().int().min(0).optional(),
  failureCode: z.string().max(100).optional().nullable(),
  adminPolicyBlocked: z.boolean().optional(),
});

validationRouter.post('/cohorts/:id/ingestion-attempts', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = CreateIngestionAttemptSchema.safeParse(req.body);
  if (!parsed.success) return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.message, 400));
  try {
    const attempt = await repo.createIngestionAttempt({ cohortId: req.params.id, ...parsed.data });
    res.status(201).json({ ok: true, attempt });
  } catch (err) {
    next(err);
  }
});

validationRouter.patch('/ingestion-attempts/:id', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = PatchIngestionAttemptSchema.safeParse(req.body);
  if (!parsed.success) return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.message, 400));
  try {
    const attempt = await repo.updateIngestionAttempt(req.params.id, parsed.data);
    if (!attempt) return next(new AppError(ErrorCode.NOT_FOUND, 'Ingestion attempt not found', 404));
    res.json({ ok: true, attempt });
  } catch (err) {
    next(err);
  }
});

// ─── Metrics ──────────────────────────────────────────────────────────────────

validationRouter.get('/cohorts/:id/metrics', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cohort = await repo.getCohort(req.params.id);
    if (!cohort) return next(new AppError(ErrorCode.NOT_FOUND, 'Cohort not found', 404));
    const metrics = await computeCohortMetrics(req.params.id);
    res.json({ ok: true, metrics });
  } catch (err) {
    next(err);
  }
});

// ─── Decision ─────────────────────────────────────────────────────────────────

const CreateDecisionSchema = z.object({
  financialInputsJson: z.object({}).passthrough().optional().nullable(),
  rationale: z.string().min(1).max(5000).optional(),
});

validationRouter.post('/cohorts/:id/decision', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = CreateDecisionSchema.safeParse(req.body);
  if (!parsed.success) return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.message, 400));
  try {
    const cohort = await repo.getCohort(req.params.id);
    if (!cohort) return next(new AppError(ErrorCode.NOT_FOUND, 'Cohort not found', 404));

    const evaluationResult = await evaluateCohortDecision(req.params.id);
    const metrics = await computeCohortMetrics(req.params.id);

    const decision = await repo.createDecision({
      cohortId: req.params.id,
      decision: evaluationResult.decision,
      thresholdVersion: evaluationResult.thresholdVersion,
      oauthMetricsJson: metrics.oauth as any,
      forwardingMetricsJson: metrics.forwarding as any,
      qualityMetricsJson: metrics.quality as any,
      financialInputsJson: parsed.data.financialInputsJson ?? null,
      passedChecks: evaluationResult.passed,
      failedChecks: evaluationResult.failed,
      missingData: evaluationResult.missing,
      rationale: [
        ...evaluationResult.rationale,
        ...(parsed.data.rationale ? [parsed.data.rationale] : []),
      ].join(' | '),
    });

    res.status(201).json({ ok: true, decision, evaluation: evaluationResult });
  } catch (err) {
    next(err);
  }
});

// ─── Export ───────────────────────────────────────────────────────────────────

validationRouter.get('/cohorts/:id/export', async (req: Request, res: Response, next: NextFunction) => {
  const format = (req.query.format as string) ?? 'json';

  if (!['json', 'csv'].includes(format)) {
    return next(new AppError(ErrorCode.VALIDATION_ERROR, 'format must be json or csv', 400));
  }

  try {
    const cohort = await repo.getCohort(req.params.id);
    if (!cohort) return next(new AppError(ErrorCode.NOT_FOUND, 'Cohort not found', 404));

    const rows = await buildCohortExport(req.params.id);

    if (format === 'csv') {
      const csv = exportRowsToCsv(rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="cohort-${req.params.id}.csv"`);
      res.send(csv);
    } else {
      res.json({ ok: true, cohortId: req.params.id, exportedAt: new Date().toISOString(), rows });
    }
  } catch (err) {
    next(err);
  }
});
