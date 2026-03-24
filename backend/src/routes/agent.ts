import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { getUserGoals, updateUserGoals } from '../agent/goals.js';
import { recordAgentFeedback } from '../services/agentFeedback.js';
import { getLatestActivityFeed } from '../agent/activityFeed.js';
import { getIntentState, updateIntentState } from '../agent/intent.js';
import { approvePreview, approveWorkflowPreview, modifyPreview, cancelPreview } from '../agent/preview.js';
import { undoAction, rollbackWorkflow } from '../agent/recovery.js';
import { query } from '../db/index.js';
import { validate } from '../middleware/validate.js';
import { summarizeActions } from '../agent/magicOutput.js';

export const agentRouter = Router();

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.string().optional()
}).strip();

const goalsSchema = z.object({
  goals: z.array(z.object({
    goal: z.string().min(1).max(200),
    weight: z.number().min(0).max(10)
  })),
  autopilotLevel: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  personalityMode: z.enum(['chill', 'proactive', 'aggressive']).optional()
});

const feedbackSchema = z.object({
  actionId: z.string().uuid(),
  status: z.enum(['accepted', 'approved', 'approve', 'rejected', 'reject', 'modified', 'always_allow', 'cancel', 'cancelled']),
  notes: z.string().max(500).optional(),
  metadata: z.record(z.any()).optional()
});

const intentSchema = z.object({
  intents: z.array(z.string().max(200)).optional(),
  sessionOverrides: z.array(z.string().max(200)).optional(),
  priorityBoosts: z.record(z.number()).optional(),
  sessionId: z.string().max(120).optional(),
  ttlHours: z.number().min(1).max(168).optional()
});

const previewSchema = z.object({
  actionId: z.string().uuid(),
  payloadOverride: z.record(z.any()).optional(),
  reason: z.string().max(300).optional()
});

const workflowPreviewSchema = z.object({
  workflowId: z.string().min(3)
});

const recoverySchema = z.object({
  actionId: z.string().uuid()
});

const rollbackSchema = z.object({
  workflowId: z.string().min(3)
});

agentRouter.get('/goals', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const goals = await getUserGoals(userId);
  return res.json(goals);
});

agentRouter.put('/goals', authMiddleware, validate(goalsSchema), async (req: AuthRequest, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { goals, autopilotLevel, personalityMode } = req.body as z.infer<typeof goalsSchema>;

  await updateUserGoals(userId, { goals, autopilotLevel, personalityMode });
  return res.json({ ok: true });
});

agentRouter.post('/feedback', authMiddleware, validate(feedbackSchema), async (req: AuthRequest, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { actionId, status, notes, metadata } = req.body as z.infer<typeof feedbackSchema>;

  await recordAgentFeedback({ userId, actionId, status, notes, metadata });
  return res.json({ ok: true });
});

agentRouter.get('/activity-feed', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const feed = await getLatestActivityFeed(userId);
  const actions = await query<{ id: string; action_type: string; status: string; workflow_name: string | null; workflow_id: string | null }>(
    `SELECT id, action_type, status, workflow_name, workflow_id
     FROM agent_actions
     WHERE user_id = $1
       AND created_at >= now() - interval '24 hours'
     ORDER BY created_at DESC
     LIMIT 100`,
    [userId]
  );
  return res.json({ feed, ...summarizeActions(actions.rows) });
});

agentRouter.get('/actions', authMiddleware, validate(listSchema, 'query'), async (req: AuthRequest, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { limit, offset, status } = req.query as unknown as z.infer<typeof listSchema>;

  const conditions: string[] = ['a.user_id = $1'];
  const params: Array<string | number> = [userId];
  const addParam = (value: string | number) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (status) {
    conditions.push(`a.status = ${addParam(status)}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query<{ total: number }>(
    `SELECT COUNT(*)::int as total
     FROM agent_actions a
     ${whereClause}`,
    params
  );

  const limitParam = params.length + 1;
  const offsetParam = params.length + 2;
  const listResult = await query(
    `SELECT a.id, a.action_type, a.status, a.workflow_name, a.workflow_id, a.action_payload, a.confidence,
            a.decision_reason, a.requires_approval, a.created_at, a.email_id,
            e.subject, e.sender_name, e.sender_email
     FROM agent_actions a
     LEFT JOIN emails e ON e.id = a.email_id
     ${whereClause}
     ORDER BY a.created_at DESC
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    [...params, limit, offset]
  );

  return res.json({
    actions: listResult.rows,
    total: countResult.rows[0]?.total ?? 0,
    limit,
    offset,
    ...summarizeActions(listResult.rows as any)
  });
});

agentRouter.get('/intent', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const sessionId = req.query.sessionId as string | undefined;
  const intent = await getIntentState(userId, sessionId);
  return res.json(intent);
});

agentRouter.post('/intent', authMiddleware, validate(intentSchema), async (req: AuthRequest, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { intents, sessionOverrides, priorityBoosts, sessionId, ttlHours } = req.body as z.infer<typeof intentSchema>;

  const state = await updateIntentState({ userId, intents, sessionOverrides, priorityBoosts, sessionId, ttlHours });
  return res.json(state);
});

agentRouter.post('/preview/approve', authMiddleware, validate(previewSchema), async (req: AuthRequest, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { actionId, payloadOverride } = req.body as z.infer<typeof previewSchema>;

  const result = await approvePreview({ userId, actionId, payloadOverride });
  return res.json({ ok: true, result });
});

agentRouter.post('/preview/modify', authMiddleware, validate(previewSchema), async (req: AuthRequest, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { actionId, payloadOverride } = req.body as z.infer<typeof previewSchema>;
  if (!payloadOverride) return res.status(400).json({ error: 'Missing payloadOverride' });

  const result = await modifyPreview({ userId, actionId, payloadOverride });
  return res.json({ ok: true, ...result });
});

agentRouter.post('/preview/approve-all', authMiddleware, validate(workflowPreviewSchema), async (req: AuthRequest, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { workflowId } = req.body as z.infer<typeof workflowPreviewSchema>;
  const result = await approveWorkflowPreview({ userId, workflowId });
  return res.json({ ok: true, ...result });
});

agentRouter.post('/preview/cancel', authMiddleware, validate(previewSchema), async (req: AuthRequest, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { actionId, reason } = req.body as z.infer<typeof previewSchema>;

  const result = await cancelPreview({ userId, actionId, reason });
  return res.json({ ok: true, ...result });
});

agentRouter.post('/recovery/undo', authMiddleware, validate(recoverySchema), async (req: AuthRequest, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { actionId } = req.body as z.infer<typeof recoverySchema>;

  const result = await undoAction({ userId, actionId });
  return res.json({ ok: true, result });
});

agentRouter.post('/recovery/rollback', authMiddleware, validate(rollbackSchema), async (req: AuthRequest, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { workflowId } = req.body as z.infer<typeof rollbackSchema>;

  const result = await rollbackWorkflow({ userId, workflowId });
  return res.json({ ok: true, result });
});
