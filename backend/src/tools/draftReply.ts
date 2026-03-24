import { z } from 'zod';
import type { ToolContext, ToolDefinition } from './types.js';
import { generateReply } from '../services/ai.js';
import { getAuthContext } from '../services/tokens.js';
import { fetchWithTimeout, safeJson } from '../utils/http.js';
import { query } from '../db/index.js';
import { createGmailDraft } from '../services/gmail.js';

const schema = z.object({
  tone: z.string().optional()
});

type Input = z.infer<typeof schema>;

type Output = { draftId: string; subject: string; body: string };

export const draftReplyTool: ToolDefinition<Input, Output> = {
  name: 'draft_reply',
  schema,
  safe: true,
  requiresApproval: false,
  riskLevel: 'low',
  reversible: true,
  estimatedSecondsSaved: 360,
  execute: async (ctx: ToolContext) => {
    const emailResult = await query<{
      subject: string | null;
      sender_name: string | null;
      sender_email: string | null;
      body_preview: string | null;
      thread_id: string | null;
    }>('SELECT subject, sender_name, sender_email, body_preview, thread_id FROM emails WHERE id = $1 AND user_id = $2', [ctx.emailId, ctx.userId]);

    const email = emailResult.rows[0];
    if (!email) {
      throw new Error('Email not found');
    }

    const replyDraft = await generateReply({
      subject: email.subject ?? '',
      senderName: email.sender_name,
      senderEmail: email.sender_email,
      bodyPreview: email.body_preview
    }, {
      userId: ctx.userId,
      operation: 'draft_reply_tool'
    });

    const auth = await getAuthContext(ctx.userId);
    if (auth.provider === 'google') {
      if (!email.sender_email) {
        throw new Error('Missing sender email for Gmail draft');
      }
      const draft = await createGmailDraft(auth.accessToken, {
        to: email.sender_email,
        subject: replyDraft.subject,
        body: replyDraft.body,
        threadId: email.thread_id
      });
      return { draftId: draft.id, subject: replyDraft.subject, body: replyDraft.body };
    }

    const draftResponse = await fetchWithTimeout(`https://graph.microsoft.com/v1.0/me/messages/${ctx.messageId}/createReply`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.accessToken}` }
    });

    const draft = await safeJson<any>(draftResponse);

    await fetchWithTimeout(`https://graph.microsoft.com/v1.0/me/messages/${draft.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        subject: replyDraft.subject,
        body: { contentType: 'HTML', content: replyDraft.body }
      })
    });

    return { draftId: draft.id, subject: replyDraft.subject, body: replyDraft.body };
  }
};
