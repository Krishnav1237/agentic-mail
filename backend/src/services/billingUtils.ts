import { createHmac, timingSafeEqual } from 'crypto';

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

export const createBillingWebhookSignature = (input: {
  timestamp: string;
  rawBody: string;
  secret: string;
}) =>
  createHmac('sha256', input.secret)
    .update(`${input.timestamp}.${input.rawBody}`)
    .digest('hex');

export const verifyBillingWebhookSignature = (input: {
  timestamp: string;
  rawBody: string;
  signature: string;
  secret: string;
}) => {
  const digest = createBillingWebhookSignature({
    timestamp: input.timestamp,
    rawBody: input.rawBody,
    secret: input.secret,
  });
  const expected = Buffer.from(digest, 'utf8');
  const received = Buffer.from(input.signature.trim(), 'utf8');
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
};

export const isBillingWebhookTimestampFresh = (
  timestamp: string,
  maxSkewMs = 5 * 60 * 1000
) => {
  const parsed = Number(timestamp);
  if (!Number.isFinite(parsed) || parsed <= 0) return false;
  const eventMs = parsed > 1_000_000_000_000 ? parsed : parsed * 1000;
  return Math.abs(Date.now() - eventMs) <= maxSkewMs;
};
