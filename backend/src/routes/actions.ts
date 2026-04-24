import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { executeTool } from '../tools/registry.js';
import { query } from '../db/index.js';
import { asyncRoute } from '../middleware/asyncRoute.js';
import { consumeUsageMetric } from '../services/billing.js';
import { NotFoundError, QuotaExceededError } from '../errors/domain.js';

export const actionsRouter = Router();

type DraftReplyResult = {
  draftId?: string;
};

const consumeExecutionQuota = async (userId: string, idempotencyKey: string) => {
  return consumeUsageMetric({
    userId,
    metric: 'actions_executed',
    units: 1,
    idempotencyKey,
    source: 'direct_actions',
    enforce: true,
  });
};

const assertQuotaAllowed = (
  quota: Awaited<ReturnType<typeof consumeExecutionQuota>>
) => {
  if (quota.allowed) return;
  throw new QuotaExceededError({
    metric: 'actions_executed',
    used: quota.used ?? 0,
    limit: quota.limit ?? 0,
    message: 'Action quota exhausted for current billing window',
  });
};

const getContextFromTask = async (taskId: string, userId: string) => {
  const result = await query<{ email_id: string; message_id: string }>(
    `SELECT t.email_id, e.message_id
     FROM extracted_tasks t
     JOIN emails e ON e.id = t.email_id
     WHERE t.id = $1 AND t.user_id = $2`,
    [taskId, userId]
  );
  return result.rows[0] ?? null;
};

const getContextFromMessage = async (messageId: string, userId: string) => {
  const result = await query<{ id: string; message_id: string }>(
    'SELECT id, message_id FROM emails WHERE message_id = $1 AND user_id = $2',
    [messageId, userId]
  );
  return result.rows[0] ?? null;
};

const calendarSchema = z.object({
  taskId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
});

actionsRouter.post(
  '/calendar',
  authMiddleware,
  validate(calendarSchema),
  asyncRoute(async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { taskId, idempotencyKey } = req.body as z.infer<typeof calendarSchema>;
    const quota = await consumeExecutionQuota(userId, `direct:calendar:${idempotencyKey}`);
    assertQuotaAllowed(quota);

    const ctx = await getContextFromTask(taskId, userId);
    if (!ctx) throw new NotFoundError('Task not found');

    const result = await executeTool(
      'create_calendar_event',
      {
        userId,
        emailId: ctx.email_id,
        messageId: ctx.message_id,
      },
      { task_id: taskId }
    );

    return res.json(result);
  })
);

const importantSchema = z.object({
  emailId: z.string().min(1),
  idempotencyKey: z.string().uuid(),
});

actionsRouter.post(
  '/important',
  authMiddleware,
  validate(importantSchema),
  asyncRoute(async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { emailId, idempotencyKey } = req.body as z.infer<typeof importantSchema>;
    const quota = await consumeExecutionQuota(userId, `direct:important:${idempotencyKey}`);
    assertQuotaAllowed(quota);

    const ctx = await getContextFromMessage(emailId, userId);
    if (!ctx) throw new NotFoundError('Email not found');

    const result = await executeTool(
      'mark_important',
      {
        userId,
        emailId: ctx.id,
        messageId: ctx.message_id,
      },
      {}
    );

    return res.json(result);
  })
);

const replySchema = z.object({
  emailId: z.string().min(1),
  send: z.boolean().optional(),
  idempotencyKey: z.string().uuid(),
});

actionsRouter.post(
  '/reply',
  authMiddleware,
  validate(replySchema),
  asyncRoute(async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { emailId, send, idempotencyKey } = req.body as z.infer<typeof replySchema>;
    const quota = await consumeExecutionQuota(userId, `direct:reply:draft:${idempotencyKey}`);
    assertQuotaAllowed(quota);

    const ctx = await getContextFromMessage(emailId, userId);
    if (!ctx) throw new NotFoundError('Email not found');

    const draft = (await executeTool(
      'draft_reply',
      {
        userId,
        emailId: ctx.id,
        messageId: ctx.message_id,
      },
      {}
    )) as DraftReplyResult;

    if (send && draft.draftId) {
      const sendQuota = await consumeExecutionQuota(
        userId,
        `direct:reply:send:${idempotencyKey}`
      );
      assertQuotaAllowed(sendQuota);
      await executeTool(
        'send_reply',
        {
          userId,
          emailId: ctx.id,
          messageId: ctx.message_id,
        },
        { draft_id: draft.draftId }
      );
    }

    return res.json({ ...draft, sent: Boolean(send) });
  })
);

const snoozeSchema = z.object({
  taskId: z.string().uuid(),
  until: z.string().optional(),
  idempotencyKey: z.string().uuid(),
});

actionsRouter.post(
  '/snooze',
  authMiddleware,
  validate(snoozeSchema),
  asyncRoute(async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { taskId, until, idempotencyKey } = req.body as z.infer<typeof snoozeSchema>;
    const quota = await consumeExecutionQuota(userId, `direct:snooze:${idempotencyKey}`);
    assertQuotaAllowed(quota);

    const ctx = await getContextFromTask(taskId, userId);
    if (!ctx) throw new NotFoundError('Task not found');

    const result = await executeTool(
      'snooze',
      {
        userId,
        emailId: ctx.email_id,
        messageId: ctx.message_id,
      },
      { task_id: taskId, until }
    );

    return res.json(result);
  })
);
