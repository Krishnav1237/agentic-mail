import { describe, expect, it } from 'vitest';
import {
  DEADLINE_REMINDER_BY_LABEL,
  DEFAULT_TELEGRAM_INTEGRATION,
  sanitizeTelegramIntegration,
} from './telegramIntegration';

describe('sanitizeTelegramIntegration', () => {
  it('returns the default for non-object input', () => {
    expect(sanitizeTelegramIntegration(null)).toEqual(
      DEFAULT_TELEGRAM_INTEGRATION
    );
    expect(sanitizeTelegramIntegration(undefined)).toEqual(
      DEFAULT_TELEGRAM_INTEGRATION
    );
    expect(sanitizeTelegramIntegration('nope')).toEqual(
      DEFAULT_TELEGRAM_INTEGRATION
    );
  });

  it('passes through a fully-formed blob unchanged', () => {
    const input = {
      provider: 'telegram',
      connected: true,
      notificationPreferences: { urgentEmails: false, followUps: true },
      deliveryPreferences: { preferredTime: '18:30', deadlineReminder: '3d' },
    };
    expect(sanitizeTelegramIntegration(input)).toEqual(input);
  });

  it('falls back per-field for missing or malformed values', () => {
    const result = sanitizeTelegramIntegration({
      connected: 'yes', // wrong type
      notificationPreferences: { urgentEmails: true }, // followUps missing
      deliveryPreferences: {
        preferredTime: '25:99', // invalid time
        deadlineReminder: 'never', // not a known option
      },
    });
    expect(result).toEqual({
      provider: 'telegram',
      connected: DEFAULT_TELEGRAM_INTEGRATION.connected,
      notificationPreferences: {
        urgentEmails: true,
        followUps: DEFAULT_TELEGRAM_INTEGRATION.notificationPreferences.followUps,
      },
      deliveryPreferences: DEFAULT_TELEGRAM_INTEGRATION.deliveryPreferences,
    });
  });

  it('accepts every deadline reminder option', () => {
    for (const value of Object.values(DEADLINE_REMINDER_BY_LABEL)) {
      const result = sanitizeTelegramIntegration({
        deliveryPreferences: { deadlineReminder: value },
      });
      expect(result.deliveryPreferences.deadlineReminder).toBe(value);
    }
  });

  it('validates preferredTime as strict 24-hour HH:MM', () => {
    expect(
      sanitizeTelegramIntegration({ deliveryPreferences: { preferredTime: '09:05' } })
        .deliveryPreferences.preferredTime
    ).toBe('09:05');
    expect(
      sanitizeTelegramIntegration({ deliveryPreferences: { preferredTime: '9:05' } })
        .deliveryPreferences.preferredTime
    ).toBe(DEFAULT_TELEGRAM_INTEGRATION.deliveryPreferences.preferredTime);
  });
});
