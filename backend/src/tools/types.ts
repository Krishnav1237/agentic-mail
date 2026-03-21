import type { z } from 'zod';

export type ToolName =
  | 'create_task'
  | 'create_calendar_event'
  | 'draft_reply'
  | 'send_reply'
  | 'snooze'
  | 'mark_important';

export type ToolContext = {
  userId: string;
  emailId: string;
  messageId: string;
};

export type ToolDefinition<Input, Output> = {
  name: ToolName;
  schema: z.ZodSchema<Input>;
  safe: boolean;
  requiresApproval: boolean;
  execute: (ctx: ToolContext, input: Input) => Promise<Output>;
};
