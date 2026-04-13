import { createHmac } from 'crypto';

export const usageMetrics = [
  'emails_processed',
  'actions_suggested',
  'actions_executed',
  'followups_sent',
] as const;

export type UsageMetric = (typeof usageMetrics)[number];

export const quotaSeverity = (percentage: number) => {
  if (percentage >= 1) return 'hard_stop' as const;
  if (percentage >= 0.85) return 'high' as const;
  if (percentage >= 0.7) return 'warning' as const;
  return 'none' as const;
};

export const verifyBillingWebhookSignature = (input: {
  payload: string;
  signature: string;
  secret: string;
}) => {
  const digest = createHmac('sha256', input.secret)
    .update(input.payload)
    .digest('hex');
  return digest === input.signature;
};
