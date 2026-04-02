import { describe, expect, it } from 'vitest';
import {
  buildWaitlistConfirmationPayload,
  normalizeWaitlistEmail,
} from './waitlistEmailTemplate.js';

describe('waitlist email template', () => {
  it('normalizes waitlist email addresses', () => {
    expect(normalizeWaitlistEmail('  ShreyBansal15704@Gmail.com  ')).toBe(
      'shreybansal15704@gmail.com'
    );
  });

  it('builds the IIL waitlist confirmation email payload', () => {
    const payload = buildWaitlistConfirmationPayload(
      'onboarding@resend.dev',
      'shreybansal15704@gmail.com'
    );

    expect(payload).toMatchObject({
      from: 'onboarding@resend.dev',
      to: 'shreybansal15704@gmail.com',
      subject: "You're on the list for IIL!",
    });
    expect(payload.html).toContain('IIL | INBOX INTELLIGENCE LAYER');
    expect(payload.html).toContain("You're on the list.");
    expect(payload.html).not.toContain('SIL |');
  });
});
