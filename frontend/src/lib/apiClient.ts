/**
 * The one place this app talks to the Obligo backend.
 *
 * Before this file existed the frontend had no API client at all — every
 * workspace store ran off `localStorage` or in-memory demo data (see
 * `docs/integration-audit.md` §1). This module is the transport half of
 * closing that gap: base URL resolution, cookie/CSRF handling, and one typed
 * function per endpoint. It deliberately knows nothing about stores, React or
 * routing — `storeBootstrap.ts` owns that lifecycle, and importing a store
 * from here would create a cycle, since every store imports this.
 *
 * BACKEND-OPTIONAL BY DESIGN. When `VITE_API_BASE` is unset the app runs in
 * demo mode: no request is ever made, no 401 redirect can fire, and the
 * workspace browses on shipped defaults exactly as it did before any backend
 * existed. That is a deliberate product decision, not a fallback — see
 * `isBackendEnabled()`.
 *
 * IMPORT-SAFE UNDER NODE. `vite.config.ts` runs vitest with
 * `environment: 'node'` and no jsdom, so nothing here may touch `document` or
 * `window` at module scope. The cookie reader and `fetch` are both injectable
 * for the same reason — a test can exercise this module without a DOM.
 */
import type { AgentPreferences } from './agentPreferences';
import type { ProfilePhoto, UserProfile } from './userProfile';
import type {
  TelegramDeliveryPreferences,
  TelegramIntegration,
  TelegramNotificationPreferences,
} from './telegramIntegration';

/* ------------------------------- Base URL -------------------------------- */

const CONFIGURED_API_BASE = import.meta.env.VITE_API_BASE?.trim() ?? '';

/** Where the dev backend lives when someone opts in without naming a host. */
const DEV_API_BASE = 'http://localhost:4000';

/**
 * Whether this build should talk to a backend at all.
 *
 * `VITE_API_BASE` unset means demo mode — the workspace runs on shipped
 * defaults with no network, which is how the app behaved before any of these
 * routes existed and remains useful for frontend-only work. Setting it opts
 * into the real thing: hydration on mount, persistence on change, and the
 * 401 redirect in `handleUnauthorized`.
 *
 * Read through this function rather than the constant, so the rule lives in
 * one place and reads the same at every call site.
 */
export function isBackendEnabled(): boolean {
  return CONFIGURED_API_BASE.length > 0;
}

function apiBase(): string {
  if (CONFIGURED_API_BASE) return CONFIGURED_API_BASE.replace(/\/+$/, '');
  // Only reachable if a caller ignored `isBackendEnabled()`. Naming the env
  // var is the whole value of this message — the same courtesy `waitlist.ts`
  // extends for its own missing configuration.
  if (import.meta.env.DEV) return DEV_API_BASE;
  throw new ApiError(
    ApiErrorCode.NOT_CONFIGURED,
    'VITE_API_BASE is not set, so this build cannot reach the Obligo API.',
    0
  );
}

/* -------------------------------- Errors --------------------------------- */

/**
 * Codes this client can produce that the server's own bounded list
 * (`backend/src/errors/AppError.ts`) cannot, because they describe failures
 * that happen before or instead of a response.
 *
 * Kept distinct from `INTERNAL_ERROR` on purpose: "the server said no" and
 * "there is no server" need different handling — the 401 redirect must fire
 * for the first and never for the second, or a backend that simply isn't
 * running would bounce a developer out of the workspace.
 */
export const ApiErrorCode = {
  NETWORK_UNREACHABLE: 'NETWORK_UNREACHABLE',
  MALFORMED_RESPONSE: 'MALFORMED_RESPONSE',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
} as const;

export class ApiError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  /**
   * The server's correlation id, when there is one. OPTIONAL BY NECESSITY:
   * `middleware/auth.ts` answers AUTH_REQUIRED / AUTH_CONFLICT / CSRF_INVALID
   * directly and `app.ts`'s 404 handler does too — none of those pass through
   * the error handler that attaches `requestId`, so it is genuinely absent on
   * exactly the responses a client is most likely to hit.
   */
  readonly requestId?: string;

  constructor(code: string, message: string, httpStatus: number, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.requestId = requestId;
  }
}

/* ------------------------------- CSRF token ------------------------------- */

/** Reads a cookie by name from a `document.cookie`-shaped string. Pure, so
 * the parsing is testable without a DOM. */
export function readCookie(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return null;
}

function currentCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  return readCookie(document.cookie, 'csrf_token');
}

/** Methods the backend's double-submit check actually applies to — see the
 * `['POST', 'PUT', 'DELETE', 'PATCH']` guard in `middleware/auth.ts`. A GET
 * carrying the header would be harmless but is never looked at. */
const CSRF_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/* ---------------------------- 401 → sign-in ------------------------------- */

let redirectingToSignIn = false;

/**
 * A 401 means the session expired or never existed. There is no signed-out
 * workspace design and no login page other than Landing's CTA into
 * `GET /auth/google`, so the honest response is to leave the workspace
 * entirely rather than render a page full of defaults whose edits would
 * silently fail to save.
 *
 * A HARD navigation, not router `navigate()`: `sessionActions.signOut()`
 * already documents why — mail and workflow state is in-memory-only and needs
 * a full reload to truly clear, so a soft navigation could carry one user's
 * state into the next sign-in. It also makes clearing the stores redundant,
 * since the whole module graph is discarded.
 *
 * ONE-SHOT. Bootstrap fires three GETs in parallel, so an expired session
 * produces three simultaneous 401s; without this guard they race to navigate.
 */
function handleUnauthorized(): void {
  if (redirectingToSignIn) return;
  if (typeof window === 'undefined') return;
  redirectingToSignIn = true;
  window.location.assign('/');
}

/* ------------------------------ The transport ----------------------------- */

type RequestOptions = {
  method?: string;
  body?: unknown;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {};

  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  if (CSRF_METHODS.has(method)) {
    const csrf = currentCsrfToken();
    // Sent when present; absent is left to the server to reject. Failing here
    // would turn "your session cookie is gone" into a confusing client-side
    // error instead of the 401/403 that actually describes it.
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  let response: Response;
  try {
    response = await fetch(`${apiBase()}${path}`, {
      method,
      headers,
      // The `auth_token` cookie is httpOnly — the browser attaches it and this
      // client never sees it. Required because dev is cross-origin
      // (5173 -> 4000) and production is cross-site entirely.
      credentials: 'include',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error: unknown) {
    if (error instanceof ApiError) throw error; // apiBase() threw
    throw new ApiError(
      ApiErrorCode.NETWORK_UNREACHABLE,
      'Could not reach the Obligo API.',
      0
    );
  }

  if (response.ok) {
    try {
      return (await response.json()) as T;
    } catch {
      throw new ApiError(
        ApiErrorCode.MALFORMED_RESPONSE,
        'The API returned a response this app could not read.',
        response.status
      );
    }
  }

  // Error envelope: {error, message, requestId?}. A non-JSON body is entirely
  // possible here (a proxy's HTML error page, a CORS rejection), so parsing is
  // best-effort and falls back to the status line.
  let code = 'INTERNAL_ERROR';
  let message = `Request failed with status ${response.status}.`;
  let requestId: string | undefined;

  try {
    const envelope = (await response.json()) as {
      error?: unknown;
      message?: unknown;
      requestId?: unknown;
    };
    if (typeof envelope.error === 'string') code = envelope.error;
    if (typeof envelope.message === 'string') message = envelope.message;
    if (typeof envelope.requestId === 'string') requestId = envelope.requestId;
  } catch {
    code = ApiErrorCode.MALFORMED_RESPONSE;
  }

  if (response.status === 401) handleUnauthorized();

  throw new ApiError(code, message, response.status, requestId);
}

/* ------------------------------ Write queue ------------------------------- */

/** How long to wait for a burst of changes to settle before writing.
 *
 * Every control on the Settings page commits immediately — there is no Save
 * button — so flipping ten toggles would otherwise be ten PUTs against a
 * limiter that allows sixty a minute. Only the NETWORK is debounced; the
 * in-memory commit and re-render stay synchronous, which is what keeps the
 * controls feeling instant. */
export const WRITE_DEBOUNCE_MS = 400;

export type WriteQueue<T> = {
  /** Queue `value` as the next write, replacing any not yet sent. */
  push(value: T): void;
  /** Send immediately if anything is pending. Resolves when the write settles. */
  flush(): Promise<void>;
  /** Drop anything pending without sending it. Used on sign-out, so clearing
   * local state can never write defaults over the server's copy. */
  cancel(): void;
};

/**
 * Coalesces rapid writes into one trailing request.
 *
 * Latest-wins rather than a queue of every intermediate value: each of these
 * endpoints takes the COMPLETE resource, so an older payload carries no
 * information the newer one lacks.
 */
export function createWriteQueue<T>(
  write: (value: T) => Promise<unknown>,
  onError: (error: ApiError) => void
): WriteQueue<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { value: T } | null = null;
  let inFlight: Promise<void> = Promise.resolve();

  const send = async (): Promise<void> => {
    if (!pending) return;
    const { value } = pending;
    pending = null;
    try {
      await write(value);
    } catch (error: unknown) {
      onError(
        error instanceof ApiError
          ? error
          : new ApiError(ApiErrorCode.NETWORK_UNREACHABLE, 'Could not save your change.', 0)
      );
    }
  };

  return {
    push(value: T) {
      pending = { value };
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        // Chained so two bursts can never be in flight at once and land out
        // of order — with latest-wins payloads, an overtaking older write
        // would otherwise be the last thing the server sees.
        inFlight = inFlight.then(send);
      }, WRITE_DEBOUNCE_MS);
    },
    flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
        inFlight = inFlight.then(send);
      }
      return inFlight;
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
    },
  };
}

/* ------------------------------- Endpoints -------------------------------- */

export type SessionResponse = {
  authenticated: boolean;
  user?: { userId: string; email: string };
  authMode?: 'cookie' | 'bearer';
};

/** `GET /auth/session` answers 200 with `{authenticated:false}` rather than a
 * 401, so this never triggers the sign-in redirect — which is what makes it
 * safe for `/auth/callback` to ask the question directly. */
export function fetchSession(): Promise<SessionResponse> {
  return request<SessionResponse>('/auth/session');
}

export function logout(): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/auth/logout', { method: 'POST' });
}

export function fetchPreferences(): Promise<AgentPreferences> {
  return request<AgentPreferences>('/preferences');
}

/** Takes the COMPLETE object — `PUT /preferences` is replace-not-merge and
 * rejects unknown keys, matching the store's own `hydrate()` contract. */
export function savePreferences(preferences: AgentPreferences): Promise<AgentPreferences> {
  return request<AgentPreferences>('/preferences', { method: 'PUT', body: preferences });
}

export function fetchProfile(): Promise<UserProfile> {
  return request<UserProfile>('/profile');
}

/**
 * The writable subset of the profile. `email` and `emailChange` are omitted
 * because `PUT /profile` rejects them outright rather than ignoring them.
 *
 * `profilePhoto` excludes `uploaded`: there is no image storage behind it, so
 * the route answers 400. The type makes that a compile error here rather than
 * a runtime surprise.
 */
export type ProfileUpdate = {
  displayName: string;
  profilePhoto: Exclude<ProfilePhoto, { kind: 'uploaded' }>;
};

export function saveProfile(update: ProfileUpdate): Promise<UserProfile> {
  return request<UserProfile>('/profile', { method: 'PUT', body: update });
}

export function fetchTelegram(): Promise<TelegramIntegration> {
  return request<TelegramIntegration>('/integrations/telegram');
}

/** Preferences only. `connected` is derived server-side from whether a chat is
 * linked, and `PUT` answers 400 if a client tries to assert it. */
export type TelegramPreferencesUpdate = {
  notificationPreferences: TelegramNotificationPreferences;
  deliveryPreferences: TelegramDeliveryPreferences;
};

export function saveTelegramPreferences(
  update: TelegramPreferencesUpdate
): Promise<TelegramIntegration> {
  return request<TelegramIntegration>('/integrations/telegram', {
    method: 'PUT',
    body: update,
  });
}

export type TelegramConnectResponse = {
  /** A `t.me` deep link that pre-fills `/start <code>` in Telegram. */
  linkUrl: string;
  /** ISO 8601. The link is single-use and expires. */
  expiresAt: string;
  /** Still `connected: false` — linking only completes once the user presses
   * Start and Telegram's webhook delivers the code back. */
  integration: TelegramIntegration;
};

export function connectTelegram(): Promise<TelegramConnectResponse> {
  return request<TelegramConnectResponse>('/integrations/telegram/connect', {
    method: 'POST',
  });
}

export function disconnectTelegram(): Promise<TelegramIntegration> {
  return request<TelegramIntegration>('/integrations/telegram/disconnect', {
    method: 'POST',
  });
}

/** Resolves on `{ok:true}`; every failure arrives as a thrown `ApiError`
 * carrying TELEGRAM_NOT_CONNECTED / TELEGRAM_SEND_FAILED /
 * TELEGRAM_NOT_CONFIGURED, which the store maps into its own result shape. */
export function sendTelegramTest(): Promise<{ ok: true }> {
  return request<{ ok: true }>('/integrations/telegram/test', { method: 'POST' });
}
