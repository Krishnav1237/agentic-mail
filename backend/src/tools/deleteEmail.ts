import { z } from 'zod';
import type { ToolContext, ToolDefinition } from './types.js';
import { getAuthContext } from '../services/tokens.js';
import { trashGmailMessage } from '../services/gmail.js';
import { moveMessage } from '../services/graph.js';
import { resolveOutlookFolderId } from './providerConfig.js';

const schema = z.object({
  reason: z.string().max(240).optional()
});

type Input = z.infer<typeof schema>;
type Output = { deleted: true; destination: string };

export const deleteEmailTool: ToolDefinition<Input, Output> = {
  name: 'delete_email',
  schema,
  safe: false,
  requiresApproval: true,
  riskLevel: 'high',
  reversible: true,
  estimatedSecondsSaved: 60,
  execute: async (ctx: ToolContext) => {
    const auth = await getAuthContext(ctx.userId);
    if (auth.provider === 'google') {
      await trashGmailMessage(auth.accessToken, ctx.messageId);
      return { deleted: true, destination: 'trash' };
    }

    const deletedFolderId = await resolveOutlookFolderId(auth.accessToken, 'deleteditems');
    await moveMessage(auth.accessToken, ctx.messageId, deletedFolderId);
    return { deleted: true, destination: 'deleteditems' };
  }
};
