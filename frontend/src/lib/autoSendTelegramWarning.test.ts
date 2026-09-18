/**
 * Settings' persistent auto-send/Telegram banner, exercised against the real
 * `settingsStore` + `telegramIntegrationStore` singletons rather than just the
 * pure predicate in isolation (see `agentPreferences.test.ts` for that).
 *
 * The whole point of `needsTelegramForAutoSend` being a live, recomputed-on-
 * every-render check rather than a flag set once at selection time is that it
 * must agree regardless of which of the two independent stores changed first.
 * This file is what actually drives both stores through both orderings and
 * checks the same function Settings.tsx calls comes out the same either way.
 *
 * Both stores are module singletons, so each test takes a fresh pair via
 * `vi.resetModules()` — same reason `settingsIntegration.test.ts` does.
 * `isBackendEnabled` is stubbed false so `hydrate()`/`update()` only ever
 * touch local state, with no network mock needed for this file's purposes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { needsTelegramForAutoSend } from './agentPreferences';

type SettingsStore = typeof import('./settingsStore');
type TelegramStore = typeof import('./telegramIntegrationStore');

let settings: SettingsStore;
let telegram: TelegramStore;

vi.mock('./apiClient', () => ({
  isBackendEnabled: () => false,
  createWriteQueue: () => ({
    push: () => {},
    flush: async () => {},
    cancel: () => {},
  }),
}));

beforeEach(async () => {
  vi.resetModules();
  settings = await import('./settingsStore');
  telegram = await import('./telegramIntegrationStore');
  // Establish a known starting point: drafting on review, Telegram connected
  // — the "nothing to warn about" state both tests below move away from.
  settings.settingsActions.hydrate(undefined);
  telegram.telegramActions.hydrate({
    provider: 'telegram',
    connected: true,
    notificationPreferences: { urgentEmails: true, followUps: true },
    deliveryPreferences: { preferredTime: '09:00', deadlineReminder: '1d' },
  });
});

const currentlyNeedsWarning = () =>
  needsTelegramForAutoSend(
    settings.getAgentPreferences().replyDrafting,
    telegram.getTelegramIntegration().connected
  );

describe('auto-send + Telegram warning — order independence', () => {
  it('turns on when auto-send is enabled FIRST, then Telegram disconnects', () => {
    expect(currentlyNeedsWarning()).toBe(false);

    settings.settingsActions.update({ replyDrafting: 'auto' });
    expect(currentlyNeedsWarning()).toBe(false); // still connected — no warning yet

    telegram.telegramActions.hydrate({
      provider: 'telegram',
      connected: false,
      notificationPreferences: { urgentEmails: true, followUps: true },
      deliveryPreferences: { preferredTime: '09:00', deadlineReminder: '1d' },
    });
    expect(currentlyNeedsWarning()).toBe(true);
  });

  it('turns on when Telegram disconnects FIRST, then auto-send is enabled — the reverse order', () => {
    expect(currentlyNeedsWarning()).toBe(false);

    telegram.telegramActions.hydrate({
      provider: 'telegram',
      connected: false,
      notificationPreferences: { urgentEmails: true, followUps: true },
      deliveryPreferences: { preferredTime: '09:00', deadlineReminder: '1d' },
    });
    expect(currentlyNeedsWarning()).toBe(false); // disconnected but not on auto — no warning yet

    settings.settingsActions.update({ replyDrafting: 'auto' });
    expect(currentlyNeedsWarning()).toBe(true);
  });

  it('the banner\'s two offered fixes both clear it, from either starting order', () => {
    settings.settingsActions.update({ replyDrafting: 'auto' });
    telegram.telegramActions.hydrate({
      provider: 'telegram',
      connected: false,
      notificationPreferences: { urgentEmails: true, followUps: true },
      deliveryPreferences: { preferredTime: '09:00', deadlineReminder: '1d' },
    });
    expect(currentlyNeedsWarning()).toBe(true);

    // Fix 1: reconnect Telegram (what the webhook completing a link does —
    // simulated here the same way TelegramIntegrationModal's poll would see it).
    telegram.telegramActions.hydrate({
      provider: 'telegram',
      connected: true,
      notificationPreferences: { urgentEmails: true, followUps: true },
      deliveryPreferences: { preferredTime: '09:00', deadlineReminder: '1d' },
    });
    expect(currentlyNeedsWarning()).toBe(false);

    // Fix 2: disable auto-send instead (what the banner's other button does).
    telegram.telegramActions.hydrate({
      provider: 'telegram',
      connected: false,
      notificationPreferences: { urgentEmails: true, followUps: true },
      deliveryPreferences: { preferredTime: '09:00', deadlineReminder: '1d' },
    });
    expect(currentlyNeedsWarning()).toBe(true);
    settings.settingsActions.update({ replyDrafting: 'review' });
    expect(currentlyNeedsWarning()).toBe(false);
  });

  it('never warns for review or off, no matter what Telegram is doing', () => {
    for (const replyDrafting of ['off', 'review'] as const) {
      settings.settingsActions.update({ replyDrafting });
      telegram.telegramActions.hydrate({
        provider: 'telegram',
        connected: false,
        notificationPreferences: { urgentEmails: true, followUps: true },
        deliveryPreferences: { preferredTime: '09:00', deadlineReminder: '1d' },
      });
      expect(currentlyNeedsWarning()).toBe(false);
    }
  });
});
