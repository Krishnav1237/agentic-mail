import { z } from 'zod';
import type { ToolContext, ToolDefinition } from './types.js';
import { getAuthContext } from '../services/tokens.js';
import { fetchWithTimeout } from '../utils/http.js';
import { sendGmailDraft } from '../services/gmail.js';

const schema = z.object({
  draft_id: z.string()
});

type Input = z.infer<typeof schema>;

type Output = { sent: boolean };

export const sendReplyTool: ToolDefinition<Input, Output> = {
  name: 'send_reply',
  schema,
  safe: false,
  requiresApproval: true,
  riskLevel: 'high',
  reversible: false,
  estimatedSecondsSaved: 240,
  execute: async (ctx: ToolContext, input: Input) => {
    const auth = await getAuthContext(ctx.userId);
    if (auth.provider === 'google') {
      await sendGmailDraft(auth.accessToken, input.draft_id);
    } else {
      await fetchWithTimeout(`https://graph.microsoft.com/v1.0/me/messages/${input.draft_id}/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.accessToken}` }
      });
    }

    return { sent: true };
  }
};
