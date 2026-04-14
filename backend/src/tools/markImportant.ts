import { z } from 'zod';
import type { ToolContext, ToolDefinition } from './types.js';
import { getAuthContext } from '../services/tokens.js';
import { assertOk, fetchWithTimeout, safeJson } from '../utils/http.js';
import { modifyGmailMessage } from '../services/gmail.js';

const schema = z.object({});

type Input = z.infer<typeof schema>;

type Output = { messageId: string };

export const markImportantTool: ToolDefinition<Input, Output> = {
  name: 'mark_important',
  schema,
  safe: true,
  requiresApproval: false,
  riskLevel: 'low',
  reversible: true,
  estimatedSecondsSaved: 120,
  execute: async (ctx: ToolContext) => {
    const auth = await getAuthContext(ctx.userId);
    if (auth.provider === 'google') {
      await modifyGmailMessage(auth.accessToken, ctx.messageId, {
        addLabelIds: ['IMPORTANT', 'STARRED'],
      });
    } else {
      const response = await fetchWithTimeout(
        `https://graph.microsoft.com/v1.0/me/messages/${ctx.messageId}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${auth.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ importance: 'high' }),
        }
      );
      await assertOk(response, 'Graph mark important');
      await safeJson<any>(response);
    }
    return { messageId: ctx.messageId };
  },
};
