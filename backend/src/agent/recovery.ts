import { query } from '../db/index.js';
import { getAuthContext } from '../services/tokens.js';
import { fetchWithTimeout } from '../utils/http.js';
import { deleteGoogleCalendarEvent, modifyGmailMessage, deleteGmailDraft } from '../services/gmail.js';
import { updateAgentActionStatus } from './actionStore.js';
import { logAgentStep } from './logs.js';

type ActionRow = {
  id: string;
  action_type: string;
  action_payload: Record<string, any>;
  email_id: string;
  message_id: string | null;
  status: string;
  workflow_id: string | null;
};

const getAction = async (userId: string, actionId: string): Promise<ActionRow | null> => {
  const result = await query<ActionRow>(
    `SELECT a.id, a.action_type, a.action_payload, a.email_id, e.message_id, a.status, a.workflow_id
     FROM agent_actions a
     JOIN emails e ON e.id = a.email_id
     WHERE a.id = $1 AND a.user_id = $2`,
    [actionId, userId]
  );
  return result.rows[0] ?? null;
};

const removeNotifications = async (userId: string, taskId: string) => {
  await query(
    `DELETE FROM notifications WHERE user_id = $1 AND task_id = $2`,
    [userId, taskId]
  );
};

const undoCreateTask = async (userId: string, payload: Record<string, any>) => {
  const taskId = payload?.result?.taskId ?? payload?.task_id;
  if (!taskId) throw new Error('Missing taskId for undo');
  await query(`DELETE FROM extracted_tasks WHERE id = $1 AND user_id = $2`, [taskId, userId]);
  await removeNotifications(userId, taskId);
  return { undone: 'create_task', taskId };
};

const undoCreateCalendarEvent = async (userId: string, payload: Record<string, any>) => {
  const eventId = payload?.result?.eventId ?? payload?.event_id;
  if (!eventId) throw new Error('Missing eventId for undo');
  const auth = await getAuthContext(userId);
  if (auth.provider === 'google') {
    await deleteGoogleCalendarEvent(auth.accessToken, eventId);
  } else {
    await fetchWithTimeout(`https://graph.microsoft.com/v1.0/me/events/${eventId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${auth.accessToken}` }
    });
  }
  return { undone: 'create_calendar_event', eventId };
};

const undoSnooze = async (userId: string, payload: Record<string, any>, emailId: string) => {
  if (payload?.task_id) {
    await query(
      `UPDATE extracted_tasks SET status = 'open', updated_at = now() WHERE id = $1 AND user_id = $2`,
      [payload.task_id, userId]
    );
    await removeNotifications(userId, payload.task_id);
    return { undone: 'snooze', taskId: payload.task_id };
  }

  const tasks = await query<{ id: string }>(
    `SELECT id FROM extracted_tasks WHERE email_id = $1 AND user_id = $2`,
    [emailId, userId]
  );
  for (const task of tasks.rows) {
    await query(
      `UPDATE extracted_tasks SET status = 'open', updated_at = now() WHERE id = $1 AND user_id = $2`,
      [task.id, userId]
    );
    await removeNotifications(userId, task.id);
  }
  return { undone: 'snooze', taskCount: tasks.rowCount };
};

const undoMarkImportant = async (userId: string, messageId: string | null) => {
  if (!messageId) throw new Error('Missing message context');
  const auth = await getAuthContext(userId);
  if (auth.provider === 'google') {
    await modifyGmailMessage(auth.accessToken, messageId, { removeLabelIds: ['IMPORTANT', 'STARRED'] });
  } else {
    await fetchWithTimeout(`https://graph.microsoft.com/v1.0/me/messages/${messageId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ importance: 'normal' })
    });
  }
  return { undone: 'mark_important', messageId };
};

const undoDraftReply = async (userId: string, payload: Record<string, any>) => {
  const draftId = payload?.result?.draftId ?? payload?.draft_id;
  if (!draftId) throw new Error('Missing draftId for undo');
  const auth = await getAuthContext(userId);
  if (auth.provider === 'google') {
    await deleteGmailDraft(auth.accessToken, draftId);
  } else {
    await fetchWithTimeout(`https://graph.microsoft.com/v1.0/me/messages/${draftId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${auth.accessToken}` }
    });
  }
  return { undone: 'draft_reply', draftId };
};

export const undoAction = async (input: { userId: string; actionId: string }) => {
  const action = await getAction(input.userId, input.actionId);
  if (!action) throw new Error('Action not found');
  if (action.status !== 'executed') throw new Error('Only executed actions can be undone');

  let result: Record<string, unknown> = {};
  switch (action.action_type) {
    case 'create_task':
      result = await undoCreateTask(input.userId, action.action_payload ?? {});
      break;
    case 'create_calendar_event':
      result = await undoCreateCalendarEvent(input.userId, action.action_payload ?? {});
      break;
    case 'snooze':
      result = await undoSnooze(input.userId, action.action_payload ?? {}, action.email_id);
      break;
    case 'mark_important':
      result = await undoMarkImportant(input.userId, action.message_id);
      break;
    case 'draft_reply':
      result = await undoDraftReply(input.userId, action.action_payload ?? {});
      break;
    default:
      throw new Error('Undo not supported for this action type');
  }

  await updateAgentActionStatus(action.id, 'undone', { undo: result });
  return result;
};

export const rollbackWorkflow = async (input: { userId: string; workflowId: string }) => {
  const actions = await query<{ id: string }>(
    `SELECT id FROM agent_actions
     WHERE user_id = $1 AND workflow_id = $2
     ORDER BY created_at DESC`,
    [input.userId, input.workflowId]
  );

  const results: Array<Record<string, unknown>> = [];
  for (const row of actions.rows) {
    try {
      const result = await undoAction({ userId: input.userId, actionId: row.id });
      results.push({ actionId: row.id, result });
    } catch (error) {
      results.push({ actionId: row.id, error: (error as Error).message });
    }
  }

  return results;
};

export const detectRiskyOutcome = async (input: {
  userId: string;
  actionType: string;
  result?: Record<string, unknown>;
  confidence: number;
}) => {
  if (input.actionType === 'send_reply') {
    await logAgentStep({
      userId: input.userId,
      step: 'risky_action',
      message: 'Send reply is irreversible',
      data: { actionType: input.actionType }
    });
    return { risky: true, reason: 'irreversible_action' };
  }

  if ((input.result as any)?.error) {
    await logAgentStep({
      userId: input.userId,
      step: 'risky_action',
      message: 'Action returned an error',
      data: { actionType: input.actionType, error: (input.result as any).error }
    });
    return { risky: true, reason: 'error_outcome' };
  }

  if (input.confidence < 0.55) {
    return { risky: true, reason: 'low_confidence_execution' };
  }

  return { risky: false };
};
