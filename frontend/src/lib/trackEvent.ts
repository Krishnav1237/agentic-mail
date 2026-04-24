import { recordFeedback } from './api';

const seen = new Set<string>();

export const trackEvent = (input: {
  action: string;
  emailId?: string;
  category?: string;
  metadata?: Record<string, unknown>;
  dedupeKey?: string;
}) => {
  if (input.dedupeKey) {
    if (seen.has(input.dedupeKey)) return;
    seen.add(input.dedupeKey);
  }

  void recordFeedback({
    emailId: input.emailId,
    action: input.action,
    category: input.category,
    metadata: input.metadata,
  }).catch((error) => {
    console.error('trackEvent failed', error);
  });
};

