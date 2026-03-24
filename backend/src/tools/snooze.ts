import { z } from 'zod';
import type { ToolContext, ToolDefinition } from './types.js';
import { query, withTransaction } from '../db/index.js';

const schema = z.object({
  task_id: z.string().optional(),
  until: z.string().optional()
});

type Input = z.infer<typeof schema>;

type Output = { snoozed: number };

export const snoozeTool: ToolDefinition<Input, Output> = {
  name: 'snooze',
  schema,
  safe: true,
  requiresApproval: false,
  riskLevel: 'low',
  reversible: true,
  estimatedSecondsSaved: 180,
  execute: async (ctx: ToolContext, input: Input) => {
    const schedule = input.until ? new Date(input.until) : new Date(Date.now() + 24 * 60 * 60 * 1000);
    let affected = 0;

    if (input.task_id) {
      await withTransaction(async (client) => {
        await client.query(
          `UPDATE extracted_tasks SET status = 'snoozed', updated_at = now() WHERE id = $1 AND user_id = $2`,
          [input.task_id, ctx.userId]
        );
        await client.query(
          `INSERT INTO notifications (user_id, task_id, type, scheduled_for)
           VALUES ($1, $2, 'snooze', $3)`,
          [ctx.userId, input.task_id, schedule.toISOString()]
        );
      });
      affected = 1;
    } else {
      const tasks = await query<{ id: string }>(
        `SELECT id FROM extracted_tasks WHERE email_id = $1 AND user_id = $2 AND status = 'open'`,
        [ctx.emailId, ctx.userId]
      );
      await withTransaction(async (client) => {
        for (const task of tasks.rows) {
          await client.query(
            `UPDATE extracted_tasks SET status = 'snoozed', updated_at = now() WHERE id = $1 AND user_id = $2`,
            [task.id, ctx.userId]
          );
          await client.query(
            `INSERT INTO notifications (user_id, task_id, type, scheduled_for)
             VALUES ($1, $2, 'snooze', $3)`,
            [ctx.userId, task.id, schedule.toISOString()]
          );
        }
      });
      affected = tasks.rowCount ?? 0;
    }

    return { snoozed: affected };
  }
};
