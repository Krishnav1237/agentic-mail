/**
 * The one place Telegram integration state lives — kept distinct from
 * `settingsStore` (Obligo preferences) and `userProfileStore` (account/auth),
 * for the same reason `agentPreferences.ts` documents: an integration is
 * "how Obligo connects to an external service", not "how Obligo behaves" or
 * "who the user is". See `telegramIntegration.ts` for the full split.
 *
 * Same shape as `settingsStore.ts` on purpose, including the commit/persist
 * split — see that file for why `hydrate()` must never write.
 *
 * LINKING IS ASYNCHRONOUS NOW, AND THAT CHANGED THIS FILE'S SHAPE.
 * `connectIntegration()` used to flip a local boolean. Real bot linking cannot:
 * the backend issues a single-use code, the user leaves for Telegram, presses
 * Start, and a webhook completes the binding seconds later. So `connect()`
 * returns a deep link and leaves `connected` FALSE, and the caller polls
 * `refresh()` until the webhook lands. `connected` is never written by this
 * store at all — it is derived server-side from whether a chat is linked, and
 * only ever arrives through `hydrate()`.
 *
 * `localStorage` IS GONE, for the reasons in `settingsStore`'s header.
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
import {
  connectTelegram,
  createWriteQueue,
  disconnectTelegram,
  fetchTelegram,
  isBackendEnabled,
  saveTelegramPreferences,
  sendTelegramTest,
  type ApiError,
  type TelegramPreferencesUpdate,
} from './apiClient';
import { syncStatusActions } from './syncStatus';

let state: TelegramIntegration = DEFAULT_TELEGRAM_INTEGRATION;
const listeners = new Set<() => void>();

/** See `settingsStore`'s `hydrated`: writes are refused until the server's
 * copy has been read, so a failed load can't overwrite real preferences with
 * defaults. */
let hydrated = false;

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

const writeQueue = createWriteQueue<TelegramPreferencesUpdate>(
  async (update) => {
    const stored = await saveTelegramPreferences(update);
    commit(sanitizeTelegramIntegration(stored));
    syncStatusActions.clearWriteError();
  },
  (error: ApiError) => {
    syncStatusActions.reportWriteError(
      `Couldn't save your Telegram settings — ${error.message}`
    );
  }
);

/** Memory + subscribers. Never writes. */
function commit(next: TelegramIntegration) {
  state = next;
  emit();
}

/**
 * Commits locally and schedules the preference halves to
 * `PUT /integrations/telegram`.
 *
 * `provider` and `connected` are deliberately not sent — the route answers 400
 * for `connected` rather than ignoring it, because asserting a link state the
 * server derives would be meaningless.
 */
function persist(next: TelegramIntegration) {
  commit(next);
  if (!isBackendEnabled()) return;
  if (!hydrated) return;
  writeQueue.push({
    notificationPreferences: next.notificationPreferences,
    deliveryPreferences: next.deliveryPreferences,
  });
}

export type TelegramConnectResult =
  | { ok: true; linkUrl: string; expiresAt: string }
  | { ok: false; reason: string };

export type TelegramActionResult = { ok: true } | { ok: false; reason: string };

export const telegramActions = {
  /**
   * Starts bot linking and returns the deep link to open in Telegram.
   *
   * Does NOT connect anything by itself, and deliberately does not set
   * `connected` — the returned integration still reports false. The caller
   * shows the link and polls {@link refresh} until the webhook completes the
   * binding on the server.
   */
  async connect(): Promise<TelegramConnectResult> {
    if (!isBackendEnabled()) {
      return { ok: false, reason: 'No backend is configured for this build.' };
    }
    try {
      const response = await connectTelegram();
      hydrated = true;
      commit(sanitizeTelegramIntegration(response.integration));
      return { ok: true, linkUrl: response.linkUrl, expiresAt: response.expiresAt };
    } catch (error: unknown) {
      return { ok: false, reason: describe(error, "Couldn't start Telegram linking.") };
    }
  },

  /**
   * Unlinks the chat. Notification and delivery preferences are preserved
   * server-side, so reconnecting doesn't ask the user to redo them — which is
   * why the backend exposes this as POST /disconnect rather than a DELETE on
   * the resource.
   */
  async disconnect(): Promise<TelegramActionResult> {
    if (!isBackendEnabled()) {
      return { ok: false, reason: 'No backend is configured for this build.' };
    }
    try {
      const integration = await disconnectTelegram();
      hydrated = true;
      commit(sanitizeTelegramIntegration(integration));
      return { ok: true };
    } catch (error: unknown) {
      return { ok: false, reason: describe(error, "Couldn't disconnect Telegram.") };
    }
  },

  /** Re-reads the integration. Used to poll for the webhook completing a link,
   * and cheap enough to call whenever the modal opens. */
  async refresh(): Promise<void> {
    if (!isBackendEnabled()) return;
    try {
      const integration = await fetchTelegram();
      hydrated = true;
      commit(sanitizeTelegramIntegration(integration));
    } catch {
      // A failed poll is not worth surfacing — the caller is in a loop and the
      // next tick may well succeed. A failed initial load is a different thing
      // and is reported by `storeBootstrap`.
    }
  },

  updateNotificationPreferences(patch: Partial<TelegramNotificationPreferences>) {
    persist({
      ...state,
      notificationPreferences: { ...state.notificationPreferences, ...patch },
    });
  },

  updateDeliveryPreferences(patch: Partial<TelegramDeliveryPreferences>) {
    persist({
      ...state,
      deliveryPreferences: { ...state.deliveryPreferences, ...patch },
    });
  },

  /** Restores everything this store owns to its shipped defaults — a
   * deliberate user action, so it writes. Contrast {@link clearLocalState}. */
  reset() {
    persist(DEFAULT_TELEGRAM_INTEGRATION);
  },

  /** Replaces the whole object from a `GET /integrations/telegram` response,
   * and unlocks writing. */
  hydrate(raw: unknown) {
    hydrated = true;
    commit(sanitizeTelegramIntegration(raw));
  },

  /** Marks the backend copy unreachable; writes stay disabled. */
  markUnavailable() {
    hydrated = false;
  },

  /** Drops local state WITHOUT writing — the sign-out path. See
   * `settingsStore.clearLocalState` for why this is not `reset()`. */
  clearLocalState() {
    writeQueue.cancel();
    hydrated = false;
    commit(DEFAULT_TELEGRAM_INTEGRATION);
  },

  flush() {
    return writeQueue.flush();
  },
};

export type TestNotificationResult = { ok: true } | { ok: false; reason: string };

/**
 * `POST /integrations/telegram/test`.
 *
 * Success means Telegram ACCEPTED the message, which is as close to "it
 * arrived" as this app can honestly get — so the caller's copy still says the
 * request was sent rather than claiming delivery.
 *
 * Failures arrive as thrown `ApiError`s carrying TELEGRAM_NOT_CONNECTED,
 * TELEGRAM_SEND_FAILED or TELEGRAM_NOT_CONFIGURED; they are mapped here into
 * the `{ok:false, reason}` half of this function's long-standing return type
 * rather than propagating, so the modal's existing state machine still works
 * unchanged.
 */
export async function sendTestNotification(): Promise<TestNotificationResult> {
  if (!isBackendEnabled()) {
    return { ok: false, reason: 'No backend is configured for this build.' };
  }
  try {
    await sendTelegramTest();
    return { ok: true };
  } catch (error: unknown) {
    return { ok: false, reason: describe(error, "Couldn't send the test notification.") };
  }
}

/** Pulls a user-facing sentence out of an unknown thrown value. The server's
 * messages are already written for humans and bounded (never raw provider or
 * SQL text), so they're safe to show directly. */
function describe(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
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
