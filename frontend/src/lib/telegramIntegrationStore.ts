/**
 * The one place Telegram integration state lives — kept distinct from
 * `settingsStore` (IIL preferences) and `userProfileStore` (account/auth),
 * for the same reason `agentPreferences.ts` documents: an integration is
 * "how IIL connects to an external service", not "how IIL behaves" or "who
 * the user is". See `telegramIntegration.ts` for the full split.
 *
 * Same shape as `settingsStore.ts` on purpose — a module-level external
 * store exposed through `useSyncExternalStore`, persisted to `localStorage`,
 * with a non-React `get*`/`subscribeTo*` pair alongside the hook.
 *
 * THE BACKEND SEAMS ARE THE NAMED FUNCTIONS BELOW. `connectIntegration`/
 * `disconnectIntegration` are where a real OAuth-less bot-linking flow will
 * attach once the backend exists; today they only flip the local `connected`
 * flag, which is why this store — not any component — owns them: nothing
 * downstream needs to change shape when a real network call replaces the
 * body of either function. `sendTestNotification` is the
 * `POST /integrations/telegram/test` seam, and never claims a message
 * actually reached Telegram, since no backend is wired up to confirm that.
 *
 * A single object, not a keyed collection, because V1 supports exactly one
 * integration (Part 3 of the spec). A second integration later promotes this
 * to a map keyed by `provider` — deferred until there's a second real one to
 * shape it against.
 */
import { useSyncExternalStore } from 'react';
import {
  DEFAULT_TELEGRAM_INTEGRATION,
  sanitizeTelegramIntegration,
  type TelegramDeliveryPreferences,
  type TelegramIntegration,
  type TelegramNotificationPreferences,
} from './telegramIntegration';

const STORAGE_KEY = 'iil-telegram-integration';

/** Storage access can throw outright (Safari private browsing, blocked
 * cookies) — same guard `settingsStore`/`userProfileStore` use for the
 * initial render snapshot. */
function readStored(): TelegramIntegration {
  if (typeof window === 'undefined') return DEFAULT_TELEGRAM_INTEGRATION;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw
      ? sanitizeTelegramIntegration(JSON.parse(raw))
      : DEFAULT_TELEGRAM_INTEGRATION;
  } catch {
    return DEFAULT_TELEGRAM_INTEGRATION;
  }
}

let state: TelegramIntegration = readStored();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return state;
}

/** Commits a new integration state: in memory, to storage, and to every
 * subscriber. A failed write degrades to session-only, same contract as
 * `settingsStore.save`. */
function save(next: TelegramIntegration) {
  state = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — session-only */
  }
  emit();
}

export const telegramActions = {
  /** THE FUTURE BOT-LINKING SEAM. No OAuth/token/session exists yet — see
   * the file header. Flips `connected` so the rest of the UI (which reads
   * only this flag, never a hardcoded assumption) reflects a connected
   * integration. */
  connectIntegration() {
    save({ ...state, connected: true });
  },

  /** THE FUTURE DISCONNECT SEAM. Clears `connected` only — notification and
   * delivery preferences are left as-is, so reconnecting doesn't ask the
   * user to redo them. */
  disconnectIntegration() {
    save({ ...state, connected: false });
  },

  updateNotificationPreferences(
    patch: Partial<TelegramNotificationPreferences>
  ) {
    save({
      ...state,
      notificationPreferences: { ...state.notificationPreferences, ...patch },
    });
  },

  updateDeliveryPreferences(patch: Partial<TelegramDeliveryPreferences>) {
    save({
      ...state,
      deliveryPreferences: { ...state.deliveryPreferences, ...patch },
    });
  },

  /** Restores everything this store owns to its shipped defaults. */
  reset() {
    save(DEFAULT_TELEGRAM_INTEGRATION);
  },

  /** Replaces the whole object — the entry point a `GET /integrations/telegram`
   * response would use once the backend exists. */
  hydrate(raw: unknown) {
    save(sanitizeTelegramIntegration(raw));
  },
};

export type TestNotificationResult = { ok: true } | { ok: false; reason: string };

/**
 * THE FUTURE `POST /integrations/telegram/test` SEAM.
 *
 * No backend exists yet, so this only simulates request latency — long
 * enough for the modal to exercise a real loading state — and then resolves
 * successfully. It never claims Telegram actually received anything; the
 * caller's success copy must say the request was sent, not that it was
 * delivered, until a real backend response can confirm delivery.
 */
export function sendTestNotification(): Promise<TestNotificationResult> {
  return new Promise((resolve) => {
    setTimeout(() => resolve({ ok: true }), 700);
  });
}

/** Current integration state, for readers that aren't React components. */
export function getTelegramIntegration(): Readonly<TelegramIntegration> {
  return getSnapshot();
}

export function subscribeToTelegramIntegration(cb: () => void): () => void {
  return subscribe(cb);
}

export function useTelegramIntegration(): Readonly<TelegramIntegration> {
  return useSyncExternalStore(subscribe, getSnapshot);
}
