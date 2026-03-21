import type { PerceivedEmail } from './types.js';

export type EmailRow = {
  id: string;
  message_id: string;
  thread_id: string | null;
  subject: string | null;
  sender_name: string | null;
  sender_email: string | null;
  body_preview: string | null;
  received_at: string | null;
  importance: string | null;
};

export const perceiveEmail = (email: EmailRow): PerceivedEmail => {
  return {
    emailId: email.id,
    messageId: email.message_id,
    threadId: email.thread_id,
    subject: email.subject ?? '',
    senderName: email.sender_name,
    senderEmail: email.sender_email,
    bodyPreview: email.body_preview,
    receivedAt: email.received_at,
    importance: email.importance
  };
};
