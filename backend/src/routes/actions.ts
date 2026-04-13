import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { executeTool } from '../tools/registry.js';
import { query } from '../db/index.js';
import { asyncRoute } from '../middleware/asyncRoute.js';
import { consumeUsageMetric } from '../services/billing.js';

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
});

actionsRouter.post(
  '/calendar',
  authMiddleware,
  validate(calendarSchema),
  asyncRoute(async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { taskId } = req.body as z.infer<typeof calendarSchema>;
    const quota = await consumeExecutionQuota(
      userId,
      `direct:calendar:${taskId}:${Date.now()}`
    );
    if (!quota.allowed) {
      return res.status(402).json({
        error: 'Action quota exhausted for current billing window',
        code: 'quota_exhausted',
        metric: 'actions_executed',
        upgradeRequired: true,
      });
    }

    const ctx = await getContextFromTask(taskId, userId);
    if (!ctx) return res.status(404).json({ error: 'Task not found' });

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
});

actionsRouter.post(
  '/important',
  authMiddleware,
  validate(importantSchema),
  asyncRoute(async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { emailId } = req.body as z.infer<typeof importantSchema>;
    const quota = await consumeExecutionQuota(
      userId,
      `direct:important:${emailId}:${Date.now()}`
    );
    if (!quota.allowed) {
      return res.status(402).json({
        error: 'Action quota exhausted for current billing window',
        code: 'quota_exhausted',
        metric: 'actions_executed',
        upgradeRequired: true,
      });
    }

    const ctx = await getContextFromMessage(emailId, userId);
    if (!ctx) return res.status(404).json({ error: 'Email not found' });

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
});

actionsRouter.post(
  '/reply',
  authMiddleware,
  validate(replySchema),
  asyncRoute(async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { emailId, send } = req.body as z.infer<typeof replySchema>;
    const quota = await consumeExecutionQuota(
      userId,
      `direct:reply:draft:${emailId}:${Date.now()}`
    );
    if (!quota.allowed) {
      return res.status(402).json({
        error: 'Action quota exhausted for current billing window',
        code: 'quota_exhausted',
        metric: 'actions_executed',
        upgradeRequired: true,
      });
    }

    const ctx = await getContextFromMessage(emailId, userId);
    if (!ctx) return res.status(404).json({ error: 'Email not found' });

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
        `direct:reply:send:${emailId}:${Date.now()}`
      );
      if (!sendQuota.allowed) {
        return res.status(402).json({
          error: 'Send action quota exhausted for current billing window',
          code: 'quota_exhausted',
          metric: 'actions_executed',
          upgradeRequired: true,
        });
      }
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
});

actionsRouter.post(
  '/snooze',
  authMiddleware,
  validate(snoozeSchema),
  asyncRoute(async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { taskId, until } = req.body as z.infer<typeof snoozeSchema>;
    const quota = await consumeExecutionQuota(
      userId,
      `direct:snooze:${taskId}:${Date.now()}`
    );
    if (!quota.allowed) {
      return res.status(402).json({
        error: 'Action quota exhausted for current billing window',
        code: 'quota_exhausted',
        metric: 'actions_executed',
        upgradeRequired: true,
      });
    }

    const ctx = await getContextFromTask(taskId, userId);
    if (!ctx) return res.status(404).json({ error: 'Task not found' });

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
