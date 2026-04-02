import type { z } from 'zod';

export type ToolName =
  | 'create_task'
  | 'create_calendar_event'
  | 'draft_reply'
  | 'send_reply'
  | 'snooze'
  | 'mark_important'
  | 'archive_email'
  | 'delete_email'
  | 'move_to_folder'
  | 'label_email';

export type ToolRiskLevel = 'low' | 'medium' | 'high';

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
  riskLevel: ToolRiskLevel;
  reversible: boolean;
  estimatedSecondsSaved: number;
  validate?: (ctx: ToolContext, input: Input) => Promise<void>;
  undo?: (ctx: ToolContext, input: Input, result: Output) => Promise<unknown>;
  execute: (ctx: ToolContext, input: Input) => Promise<Output>;
};
