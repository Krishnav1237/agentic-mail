import { z } from 'zod';
import type { ToolContext, ToolDefinition } from './types.js';
import { getAuthContext } from '../services/tokens.js';
import { modifyGmailMessage } from '../services/gmail.js';
import { moveMessage } from '../services/graph.js';
import {
  gmailAllowedFolders,
  normalizeFolderName,
  resolveOutlookFolderId,
} from './providerConfig.js';

const schema = z.object({
  folder: z.string().min(1).max(80),
});

type Input = z.infer<typeof schema>;
type Output = { moved: true; folder: string };

export const moveToFolderTool: ToolDefinition<Input, Output> = {
  name: 'move_to_folder',
  schema,
  safe: false,
  requiresApproval: false,
  riskLevel: 'medium',
  reversible: true,
  estimatedSecondsSaved: 120,
  validate: async (ctx: ToolContext, input: Input) => {
    const auth = await getAuthContext(ctx.userId);
    const folder = normalizeFolderName(input.folder);
    if (auth.provider === 'google' && !gmailAllowedFolders.has(folder)) {
      throw new Error(`Folder ${input.folder} is not supported for Gmail`);
    }
    if (auth.provider === 'microsoft') {
      await resolveOutlookFolderId(auth.accessToken, folder);
    }
  },
  execute: async (ctx: ToolContext, input: Input) => {
    const auth = await getAuthContext(ctx.userId);
    const folder = normalizeFolderName(input.folder);

    if (auth.provider === 'google') {
      if (folder === 'inbox') {
        await modifyGmailMessage(auth.accessToken, ctx.messageId, {
          addLabelIds: ['INBOX'],
        });
      } else if (folder === 'archive') {
        await modifyGmailMessage(auth.accessToken, ctx.messageId, {
          removeLabelIds: ['INBOX'],
        });
      }
      return { moved: true, folder };
    }

    const destinationId = await resolveOutlookFolderId(
      auth.accessToken,
      folder
    );
    await moveMessage(auth.accessToken, ctx.messageId, destinationId);
    return { moved: true, folder };
  },
};
