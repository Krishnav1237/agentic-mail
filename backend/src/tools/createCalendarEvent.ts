import { z } from 'zod';
import { query } from '../db/index.js';
import { getAuthContext } from '../services/tokens.js';
import { fetchWithTimeout, safeJson } from '../utils/http.js';
import { createGoogleCalendarEvent } from '../services/gmail.js';
import type { ToolContext, ToolDefinition } from './types.js';

const schema = z.object({
  task_id: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  start_at: z.string().optional(),
  end_at: z.string().optional(),
  due_at: z.string().optional()
});

type Input = z.infer<typeof schema>;

type Output = { eventId: string };

export const createCalendarEventTool: ToolDefinition<Input, Output> = {
  name: 'create_calendar_event',
  schema,
  safe: true,
  requiresApproval: false,
  execute: async (ctx: ToolContext, input: Input) => {
    let title = input.title ?? 'Student task';
    let description = input.description ?? '';
    let dueAt = input.due_at;

    if (input.task_id) {
      const taskResult = await query<{
        title: string;
        description: string | null;
        due_at: string | null;
      }>('SELECT title, description, due_at FROM extracted_tasks WHERE id = $1 AND user_id = $2', [input.task_id, ctx.userId]);
      const task = taskResult.rows[0];
      if (task) {
        title = task.title;
        description = task.description ?? '';
        dueAt = task.due_at ?? dueAt;
      }
    }

    const end = input.end_at ? new Date(input.end_at) : dueAt ? new Date(dueAt) : new Date(Date.now() + 60 * 60 * 1000);
    const start = input.start_at ? new Date(input.start_at) : new Date(end.getTime() - 60 * 60 * 1000);

    const auth = await getAuthContext(ctx.userId);
    if (auth.provider === 'google') {
      const event = await createGoogleCalendarEvent(auth.accessToken, {
        title,
        description,
        start,
        end
      });
      return { eventId: event.id };
    }

    const response = await fetchWithTimeout('https://graph.microsoft.com/v1.0/me/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        subject: title,
        body: { contentType: 'HTML', content: description },
        start: { dateTime: start.toISOString(), timeZone: 'UTC' },
        end: { dateTime: end.toISOString(), timeZone: 'UTC' }
      })
    });

    const data = await safeJson<any>(response);
    return { eventId: data.id };
  }
};
