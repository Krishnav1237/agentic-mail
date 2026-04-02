import { createTaskTool } from './createTask.js';
import { createCalendarEventTool } from './createCalendarEvent.js';
import { draftReplyTool } from './draftReply.js';
import { sendReplyTool } from './sendReply.js';
import { snoozeTool } from './snooze.js';
import { markImportantTool } from './markImportant.js';
import { archiveEmailTool } from './archiveEmail.js';
import { deleteEmailTool } from './deleteEmail.js';
import { moveToFolderTool } from './moveToFolder.js';
import { labelEmailTool } from './labelEmail.js';
import type { ToolContext, ToolDefinition, ToolName } from './types.js';

const registry: Partial<Record<ToolName, ToolDefinition<any, any>>> = {
  create_task: createTaskTool,
  create_calendar_event: createCalendarEventTool,
  draft_reply: draftReplyTool,
  send_reply: sendReplyTool,
  snooze: snoozeTool,
  mark_important: markImportantTool,
  archive_email: archiveEmailTool,
  delete_email: deleteEmailTool,
  move_to_folder: moveToFolderTool,
  label_email: labelEmailTool,
};

export const getToolDefinition = (
  name: ToolName
): ToolDefinition<any, any> | undefined => registry[name];

export const executeTool = async (
  name: ToolName,
  ctx: ToolContext,
  payload: unknown
) => {
  const tool = registry[name];
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  const input = tool.schema.parse(payload ?? {});
  if (tool.validate) {
    await tool.validate(ctx, input);
  }
  return tool.execute(ctx, input);
};
