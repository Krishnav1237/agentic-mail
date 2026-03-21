import { query } from '../db/index.js';
import { generateReply } from '../services/ai.js';
import type { ToolDefinition } from '../tools/types.js';
import { getToolDefinition, executeTool } from '../tools/registry.js';
import { updateAgentActionStatus } from './actionStore.js';

export type ActionPreview = {
  summary: string;
  details: Record<string, unknown>;
  risks: string[];
  canUndo: boolean;
  requiresApproval: boolean;
};

const getEmailBasics = async (userId: string, emailId: string) => {
  const result = await query<{ subject: string | null; sender_email: string | null; sender_name: string | null; body_preview: string | null }>(
    `SELECT subject, sender_email, sender_name, body_preview
     FROM emails
     WHERE id = $1 AND user_id = $2`,
    [emailId, userId]
  );
  return result.rows[0] ?? null;
};

const getTaskBasics = async (userId: string, taskId: string) => {
  const result = await query<{ title: string; description: string | null; due_at: string | null; category: string | null }>(
    `SELECT title, description, due_at, category
     FROM extracted_tasks
     WHERE id = $1 AND user_id = $2`,
    [taskId, userId]
  );
  return result.rows[0] ?? null;
};

const previewForTool = async (tool: ToolDefinition<any, any>, input: Record<string, unknown>, ctx: { userId: string; emailId?: string | null }) => {
  switch (tool.name) {
    case 'create_task': {
      const email = ctx.emailId ? await getEmailBasics(ctx.userId, ctx.emailId) : null;
      const title = (input.title as string) ?? email?.subject ?? 'Follow up';
      const dueAt = (input.due_at as string | undefined) ?? null;
      const category = (input.category as string | undefined) ?? 'other';
      return {
        summary: `Create task: ${title}`,
        details: { title, due_at: dueAt, category, link: input.link ?? null },
        risks: [],
        canUndo: true
      };
    }
    case 'create_calendar_event': {
      let title = (input.title as string | undefined) ?? 'Student task';
      let dueAt = (input.due_at as string | undefined) ?? null;
      if (input.task_id) {
        const task = await getTaskBasics(ctx.userId, input.task_id as string);
        if (task) {
          title = task.title;
          dueAt = task.due_at ?? dueAt;
        }
      }
      return {
        summary: `Create calendar event: ${title}`,
        details: { title, start_at: input.start_at ?? null, end_at: input.end_at ?? null, due_at: dueAt },
        risks: [],
        canUndo: true
      };
    }
    case 'draft_reply': {
      const email = ctx.emailId ? await getEmailBasics(ctx.userId, ctx.emailId) : null;
      const draft = email ? await generateReply({
        subject: email.subject ?? '',
        senderName: email.sender_name,
        senderEmail: email.sender_email,
        bodyPreview: email.body_preview
      }) : { subject: 'Draft reply', body: 'Draft reply will be generated.' };
      return {
        summary: `Draft reply: ${draft.subject}`,
        details: { subject: draft.subject, body: draft.body },
        risks: [],
        canUndo: true
      };
    }
    case 'send_reply': {
      return {
        summary: 'Send reply',
        details: { draft_id: input.draft_id ?? null },
        risks: ['Irreversible action'],
        canUndo: false
      };
    }
    case 'snooze': {
      return {
        summary: 'Snooze tasks',
        details: { task_id: input.task_id ?? null, until: input.until ?? null },
        risks: [],
        canUndo: true
      };
    }
    case 'mark_important': {
      return {
        summary: 'Mark email as important',
        details: {},
        risks: [],
        canUndo: true
      };
    }
    default:
      return {
        summary: `Preview ${tool.name}`,
        details: input,
        risks: [],
        canUndo: false
      };
  }
};

export const generateActionPreview = async (input: {
  userId: string;
  actionType: string;
  actionInput: Record<string, unknown>;
  emailId?: string | null;
}): Promise<ActionPreview | null> => {
  const tool = getToolDefinition(input.actionType as any);
  if (!tool) return null;

  const basePreview = await previewForTool(tool, input.actionInput, { userId: input.userId, emailId: input.emailId });
  return {
    ...basePreview,
    requiresApproval: tool.requiresApproval
  };
};

const stripMeta = (payload: Record<string, unknown>) => {
  const { __meta, __preview, ...rest } = payload as any;
  return rest as Record<string, unknown>;
};

const stripContextFields = (input: Record<string, unknown>) => {
  const { email_id, task_id, message_id, ...rest } = input as any;
  return rest;
};

const getActionContext = async (userId: string, actionId: string) => {
  const result = await query<{ id: string; action_type: string; action_payload: Record<string, unknown>; email_id: string; message_id: string | null; status: string }>(
    `SELECT a.id, a.action_type, a.action_payload, a.email_id, e.message_id, a.status
     FROM agent_actions a
     JOIN emails e ON e.id = a.email_id
     WHERE a.id = $1 AND a.user_id = $2`,
    [actionId, userId]
  );
  return result.rows[0] ?? null;
};

export const approvePreview = async (input: {
  userId: string;
  actionId: string;
  payloadOverride?: Record<string, unknown>;
}) => {
  const action = await getActionContext(input.userId, input.actionId);
  if (!action) throw new Error('Preview action not found');
  if (!['preview', 'suggest', 'suggested'].includes(action.status)) {
    throw new Error('Action is not in a preview state');
  }

  const basePayload = stripMeta(action.action_payload ?? {});
  const payload = { ...basePayload, ...(input.payloadOverride ?? {}) };
  const cleaned = stripContextFields(payload);

  const messageId = action.message_id ?? '';
  if (!messageId && ['mark_important', 'draft_reply', 'send_reply'].includes(action.action_type)) {
    throw new Error('Missing message context');
  }

  const result = await executeTool(action.action_type as any, {
    userId: input.userId,
    emailId: action.email_id,
    messageId
  }, cleaned);

  await updateAgentActionStatus(action.id, 'executed', { ...payload, result, approved: true });
  return result;
};

export const modifyPreview = async (input: {
  userId: string;
  actionId: string;
  payloadOverride: Record<string, unknown>;
}) => {
  const action = await getActionContext(input.userId, input.actionId);
  if (!action) throw new Error('Preview action not found');

  const basePayload = stripMeta(action.action_payload ?? {});
  const payload = { ...basePayload, ...(input.payloadOverride ?? {}) };
  const preview = await generateActionPreview({
    userId: input.userId,
    actionType: action.action_type,
    actionInput: payload,
    emailId: action.email_id
  });

  await updateAgentActionStatus(action.id, 'modified', { ...payload, __preview: preview });
  return { preview };
};

export const cancelPreview = async (input: { userId: string; actionId: string; reason?: string }) => {
  const action = await getActionContext(input.userId, input.actionId);
  if (!action) throw new Error('Preview action not found');

  await updateAgentActionStatus(action.id, 'cancelled', { reason: input.reason ?? null });
  return { cancelled: true };
};
