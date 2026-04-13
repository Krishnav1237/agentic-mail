import { describe, expect, it } from 'vitest';
import { createHmac } from 'crypto';
import { quotaSeverity, usageMetrics, verifyBillingWebhookSignature } from './billing.js';

describe('billing helpers', () => {
  it('maps quota severity thresholds correctly', () => {
    expect(quotaSeverity(0.2)).toBe('none');
    expect(quotaSeverity(0.7)).toBe('warning');
    expect(quotaSeverity(0.85)).toBe('high');
    expect(quotaSeverity(1)).toBe('hard_stop');
  });

  it('contains expected metered metrics', () => {
    expect(usageMetrics).toEqual([
      'emails_processed',
      'actions_suggested',
      'actions_executed',
      'followups_sent',
    ]);
  });

  it('validates billing webhook signature', () => {
    const payload = JSON.stringify({ type: 'subscription.updated' });
    const secret = 'test-secret';
    const signature = createHmac('sha256', secret).update(payload).digest('hex');

    expect(
      verifyBillingWebhookSignature({
        payload,
        signature,
        secret,
      })
    ).toBe(true);

    expect(
      verifyBillingWebhookSignature({
        payload,
        signature: 'bad-signature',
        secret,
      })
    ).toBe(false);
  });
});
