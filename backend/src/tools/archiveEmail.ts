import { z } from 'zod';
import type { ToolContext, ToolDefinition } from './types.js';
import { getAuthContext } from '../services/tokens.js';
import { archiveGmailMessage } from '../services/gmail.js';
import { moveMessage } from '../services/graph.js';
import { resolveOutlookFolderId } from './providerConfig.js';

const schema = z.object({});

type Input = z.infer<typeof schema>;
type Output = { archived: true; destination: string };

export const archiveEmailTool: ToolDefinition<Input, Output> = {
  name: 'archive_email',
  schema,
  safe: true,
  requiresApproval: false,
  riskLevel: 'low',
  reversible: true,
  estimatedSecondsSaved: 90,
  execute: async (ctx: ToolContext) => {
    const auth = await getAuthContext(ctx.userId);
    if (auth.provider === 'google') {
      await archiveGmailMessage(auth.accessToken, ctx.messageId);
      return { archived: true, destination: 'archive' };
    }

    const archiveFolderId = await resolveOutlookFolderId(
      auth.accessToken,
      'archive'
    );
    await moveMessage(auth.accessToken, ctx.messageId, archiveFolderId);
    return { archived: true, destination: 'archive' };
  },
};
