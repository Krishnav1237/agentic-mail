import { describe, expect, it } from 'vitest';
import { createHmac } from 'crypto';
import {
  createBillingWebhookSignature,
  isBillingWebhookTimestampFresh,
  quotaSeverity,
  usageMetrics,
  verifyBillingWebhookSignature,
} from './billingUtils.js';

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
    const rawBody = JSON.stringify({ type: 'subscription.updated' });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const secret = 'test-secret';
    const signature = createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    expect(
      verifyBillingWebhookSignature({
        rawBody,
        timestamp,
        signature,
        secret,
      })
    ).toBe(true);

    expect(
      verifyBillingWebhookSignature({
        rawBody,
        timestamp,
        signature: 'bad-signature',
        secret,
      })
    ).toBe(false);
  });

  it('creates deterministic billing webhook signature', () => {
    const signature = createBillingWebhookSignature({
      timestamp: '1710000000',
      rawBody: '{"ok":true}',
      secret: 'secret',
    });
    expect(signature).toBe(
      createHmac('sha256', 'secret').update('1710000000.{"ok":true}').digest('hex')
    );
  });

  it('validates billing webhook timestamp freshness', () => {
    expect(isBillingWebhookTimestampFresh(String(Math.floor(Date.now() / 1000)))).toBe(
      true
    );
    expect(isBillingWebhookTimestampFresh('100')).toBe(false);
  });
});
