import { z } from 'zod';
import { query, withTransaction } from '../db/index.js';
import { computePriorityScore } from '../services/priority.js';
import type { ToolContext, ToolDefinition } from './types.js';

const schema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  due_at: z.string().optional(),
  link: z.string().optional(),
  category: z.string().optional(),
  priority: z.number().min(0).max(100).optional()
});

type Input = z.infer<typeof schema>;

type Output = { taskId: string };

const normalizeDate = (value?: string) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

export const createTaskTool: ToolDefinition<Input, Output> = {
  name: 'create_task',
  schema,
  safe: true,
  requiresApproval: false,
  execute: async (ctx: ToolContext, input: Input) => {
    const email = await query<{ subject: string | null }>(
      'SELECT subject FROM emails WHERE id = $1 AND user_id = $2',
      [ctx.emailId, ctx.userId]
    );
    const title = input.title ?? email.rows[0]?.subject ?? 'Follow up';
    const category = input.category ?? 'other';
    const aiScore = input.priority ? input.priority / 100 : 0.5;
    const priorityScore = await computePriorityScore({ userId: ctx.userId, aiScore, category });

    const taskId = await withTransaction(async (client) => {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO extracted_tasks (user_id, email_id, title, description, due_at, link, category, priority_score)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          ctx.userId,
          ctx.emailId,
          title,
          input.description ?? null,
          normalizeDate(input.due_at),
          input.link ?? null,
          category,
          priorityScore
        ]
      );

      if (input.due_at) {
        const due = new Date(input.due_at);
        const reminder = new Date(due.getTime() - 24 * 60 * 60 * 1000);
        await client.query(
          `INSERT INTO notifications (user_id, task_id, type, scheduled_for)
           VALUES ($1, $2, 'deadline', $3)`,
          [ctx.userId, inserted.rows[0].id, reminder.toISOString()]
        );
      }

      return inserted.rows[0].id;
    });

    return { taskId };
  }
};
