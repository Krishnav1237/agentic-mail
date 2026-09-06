/**
 * Telegram — the one real V1 delivery-channel integration.
 *
 * Kept separate from `AgentPreferences`/`SettingsStore` (`agentPreferences.ts`):
 * those are IIL's own behavior — what counts as urgent, important, or a
 * follow-up. This file never decides any of that; it only carries how an
 * already-derived IIL event reaches the user through an external channel:
 *
 *   IIL event -> notification preferences -> delivery channel -> Telegram
 *
 * `provider`/`connected` sit at the top level of `TelegramIntegration` so a
 * second integration can be added later without reshaping this one — see
 * `telegramIntegrationStore.ts` for why V1 still only ever holds this single
 * object rather than a keyed collection of integrations.
 *
 * Same split as `agentPreferences.ts`/`userProfile.ts`: pure types + a
 * `sanitize*` reconciler, no React/storage/UI.
 */

export type TelegramNotificationPreferences = {
  urgentEmails: boolean;
  followUps: boolean;
};

/** How long before a deadline IIL should remind the user over Telegram. */
export type TelegramDeadlineReminder = '1h' | '3h' | '1d' | '2d' | '3d';

export type TelegramDeliveryPreferences = {
  /** 24-hour "HH:MM" local time — the one daily window preferred
   * notifications go out. */
  preferredTime: string;
  deadlineReminder: TelegramDeadlineReminder;
};

export type TelegramIntegration = {
  provider: 'telegram';
  connected: boolean;
  notificationPreferences: TelegramNotificationPreferences;
  deliveryPreferences: TelegramDeliveryPreferences;
};

export const DEFAULT_TELEGRAM_INTEGRATION: TelegramIntegration = {
  provider: 'telegram',
  connected: false,
  notificationPreferences: { urgentEmails: true, followUps: true },
  deliveryPreferences: { preferredTime: '09:00', deadlineReminder: '1d' },
};

/** Label ⇄ value map for the deadline-reminder `Select`, same convention as
 * `TOPIC_BY_LABEL`/`CLEANUP_BY_LABEL` in `workspaceData.ts`. */
export const DEADLINE_REMINDER_BY_LABEL: Readonly<
  Record<string, TelegramDeadlineReminder>
> = {
  '1 hour': '1h',
  '3 hours': '3h',
  '1 day': '1d',
  '2 days': '2d',
  '3 days': '3d',
};

const DEADLINE_REMINDER_VALUES: TelegramDeadlineReminder[] = Object.values(
  DEADLINE_REMINDER_BY_LABEL
);

const PREFERRED_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Reconciles a stored/received blob against the current shape — the same
 * "any missing or unrecognised field falls back to its default" contract
 * `sanitizePreferences` uses, needed for the same two reasons: a blob
 * written by an older build, and one returned by a backend on a different
 * deploy cadence.
 */
export function sanitizeTelegramIntegration(raw: unknown): TelegramIntegration {
  if (!raw || typeof raw !== 'object') return DEFAULT_TELEGRAM_INTEGRATION;
  const input = raw as Partial<TelegramIntegration>;
  const notif: Partial<TelegramNotificationPreferences> =
    input.notificationPreferences ?? {};
  const delivery: Partial<TelegramDeliveryPreferences> =
    input.deliveryPreferences ?? {};

  return {
    provider: 'telegram',
    connected:
      typeof input.connected === 'boolean'
        ? input.connected
        : DEFAULT_TELEGRAM_INTEGRATION.connected,
    notificationPreferences: {
      urgentEmails:
        typeof notif.urgentEmails === 'boolean'
          ? notif.urgentEmails
          : DEFAULT_TELEGRAM_INTEGRATION.notificationPreferences.urgentEmails,
      followUps:
        typeof notif.followUps === 'boolean'
          ? notif.followUps
          : DEFAULT_TELEGRAM_INTEGRATION.notificationPreferences.followUps,
    },
    deliveryPreferences: {
      preferredTime:
        typeof delivery.preferredTime === 'string' &&
        PREFERRED_TIME_RE.test(delivery.preferredTime)
          ? delivery.preferredTime
          : DEFAULT_TELEGRAM_INTEGRATION.deliveryPreferences.preferredTime,
      deadlineReminder: DEADLINE_REMINDER_VALUES.includes(
        delivery.deadlineReminder as TelegramDeadlineReminder
      )
        ? (delivery.deadlineReminder as TelegramDeadlineReminder)
        : DEFAULT_TELEGRAM_INTEGRATION.deliveryPreferences.deadlineReminder,
    },
  };
}
