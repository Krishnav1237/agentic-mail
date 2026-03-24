import { z } from 'zod';
import type { ToolContext, ToolDefinition } from './types.js';
import { getAuthContext } from '../services/tokens.js';
import { modifyGmailMessage } from '../services/gmail.js';
import { getMessage, patchMessage } from '../services/graph.js';
import { gmailAllowedLabels, normalizeLabelName, outlookAllowedCategories } from './providerConfig.js';

const schema = z.object({
  label: z.string().min(1).max(80)
});

type Input = z.infer<typeof schema>;
type Output = { labeled: true; label: string };

export const labelEmailTool: ToolDefinition<Input, Output> = {
  name: 'label_email',
  schema,
  safe: true,
  requiresApproval: false,
  riskLevel: 'low',
  reversible: true,
  estimatedSecondsSaved: 75,
  validate: async (ctx: ToolContext, input: Input) => {
    const auth = await getAuthContext(ctx.userId);
    const label = normalizeLabelName(input.label);
    if (auth.provider === 'google') {
      if (!gmailAllowedLabels.has(label)) {
        throw new Error(`Label ${input.label} is not allowed`);
      }
      return;
    }

    if (!outlookAllowedCategories.has(label)) {
      throw new Error(`Category ${input.label} is not allowed`);
    }
  },
  execute: async (ctx: ToolContext, input: Input) => {
    const auth = await getAuthContext(ctx.userId);
    const label = normalizeLabelName(input.label);

    if (auth.provider === 'google') {
      await modifyGmailMessage(auth.accessToken, ctx.messageId, { addLabelIds: [label] });
      return { labeled: true, label };
    }

    const existing = await getMessage(auth.accessToken, ctx.messageId);
    const categories = new Set<string>([...(existing?.categories ?? []), label]);
    await patchMessage(auth.accessToken, ctx.messageId, { categories: [...categories] });
    return { labeled: true, label };
  }
};
