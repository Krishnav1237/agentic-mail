import { describe, expect, it } from 'vitest';
import { shouldEnqueueGraphNotification } from './webhooksGuard.js';

describe('shouldEnqueueGraphNotification', () => {
  it('returns false when subscription row is missing', () => {
    expect(
      shouldEnqueueGraphNotification(
        { subscriptionId: 'sub-1', clientState: 'abc' },
        undefined
      )
    ).toBe(false);
  });

  it('returns false when notification clientState is missing', () => {
    expect(
      shouldEnqueueGraphNotification(
        { subscriptionId: 'sub-1' },
        { user_id: 'user-1', client_state: 'abc' }
      )
    ).toBe(false);
  });

  it('returns false when subscription client_state is missing', () => {
    expect(
      shouldEnqueueGraphNotification(
        { subscriptionId: 'sub-1', clientState: 'abc' },
        { user_id: 'user-1', client_state: '' }
      )
    ).toBe(false);
  });

  it('returns false when clientState does not match', () => {
    expect(
      shouldEnqueueGraphNotification(
        { subscriptionId: 'sub-1', clientState: 'abc' },
        { user_id: 'user-1', client_state: 'xyz' }
      )
    ).toBe(false);
  });

  it('returns true on exact clientState match', () => {
    expect(
      shouldEnqueueGraphNotification(
        { subscriptionId: 'sub-1', clientState: 'abc' },
        { user_id: 'user-1', client_state: 'abc' }
      )
    ).toBe(true);
  });
});
