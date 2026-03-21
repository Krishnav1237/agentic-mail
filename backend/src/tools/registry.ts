import { createTaskTool } from './createTask.js';
import { createCalendarEventTool } from './createCalendarEvent.js';
import { draftReplyTool } from './draftReply.js';
import { sendReplyTool } from './sendReply.js';
import { snoozeTool } from './snooze.js';
import { markImportantTool } from './markImportant.js';
import type { ToolContext, ToolDefinition, ToolName } from './types.js';

const registry: Partial<Record<ToolName, ToolDefinition<any, any>>> = {
  create_task: createTaskTool,
  create_calendar_event: createCalendarEventTool,
  draft_reply: draftReplyTool,
  send_reply: sendReplyTool,
  snooze: snoozeTool,
  mark_important: markImportantTool
};

export const getToolDefinition = (name: ToolName): ToolDefinition<any, any> | undefined => registry[name];

export const executeTool = async (name: ToolName, ctx: ToolContext, payload: unknown) => {
  const tool = registry[name];
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  const input = tool.schema.parse(payload ?? {});
  return tool.execute(ctx, input);
};
