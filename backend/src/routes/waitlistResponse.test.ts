import { describe, expect, it } from 'vitest';
import {
  buildWaitlistJoinResponse,
  getWaitlistJoinStatusCode,
} from './waitlistResponse.js';

describe('waitlist response', () => {
  it('returns a created response for new emails', () => {
    const response = buildWaitlistJoinResponse(true);

    expect(response).toEqual({
      success: true,
      status: 'created',
      message: 'Your email has been added to the waitlist.',
    });
    expect(getWaitlistJoinStatusCode(response.status)).toBe(201);
  });

  it('returns a duplicate response for existing emails', () => {
    const response = buildWaitlistJoinResponse(false);

    expect(response).toEqual({
      success: true,
      status: 'duplicate',
      message: "You are already on the waitlist. We'll onboard you soon.",
    });
    expect(getWaitlistJoinStatusCode(response.status)).toBe(200);
  });
});
