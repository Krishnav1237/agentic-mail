export type WaitlistJoinResponse = {
  success: true;
  status: 'created' | 'duplicate';
  message: string;
  total?: number;
};

export type WaitlistStatsResponse = {
  success: true;
  total: number;
};

type SupabaseErrorResponse = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message?: string;
};

const configuredSupabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const configuredSupabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

const SUPABASE_URL = configuredSupabaseUrl
  ? configuredSupabaseUrl.replace(/\/+$/, '')
  : '';

const normalizeWaitlistEmail = (email: string) => email.trim().toLowerCase();

const getSupabaseHeaders = (headers?: HeadersInit) => {
  const nextHeaders = new Headers(headers);
  nextHeaders.set('apikey', configuredSupabaseAnonKey ?? '');
  nextHeaders.set('Authorization', `Bearer ${configuredSupabaseAnonKey ?? ''}`);
  return nextHeaders;
};

const getFunctionUrl = (functionName: string) =>
  `${SUPABASE_URL}/functions/v1/${functionName}`;

const ensureSupabaseConfig = () => {
  if (!SUPABASE_URL || !configuredSupabaseAnonKey) {
    throw new Error(
      'Waitlist signup requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
    );
  }
};

/** Anything the edge function can hand back: a success body, an error body,
 * or (for a non-JSON failure, e.g. a gateway error page) raw text. */
type WaitlistPayload =
  | WaitlistJoinResponse
  | WaitlistStatsResponse
  | SupabaseErrorResponse
  | { error?: string }
  | string;

const parseFunctionResponse = async (
  response: Response
): Promise<WaitlistPayload> => {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return response.text();
  // A response can advertise JSON and still not contain any (a truncated
  // body, an empty 502) — `.json()` throws there, which would surface as an
  // unhandled parse error instead of the request failure it actually is.
  try {
    return (await response.json()) as WaitlistPayload;
  } catch {
    return '';
  }
};

/** Every shape an error body can arrive in, read defensively. A failed
 * response is the one case where the payload genuinely isn't one of the
 * success types, so each field is looked up rather than assumed present —
 * indexing the union directly only type-checked by accident of which member
 * happened to declare which key. */
const readErrorField = (payload: object, key: string): string | undefined => {
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
};

const extractErrorMessage = (payload: WaitlistPayload) =>
  typeof payload === 'string'
    ? payload
    : ['message', 'details', 'hint', 'error']
        .map((key) => readErrorField(payload, key))
        .filter(Boolean)
        .join(' ');

const requestWaitlistStats = async (
  init: RequestInit
): Promise<WaitlistStatsResponse> => {
  const response = await fetch(getFunctionUrl('waitlist-signup'), init);
  const payload = await parseFunctionResponse(response);

  if (!response.ok) {
    throw new Error(
      extractErrorMessage(payload) || 'Supabase waitlist stats failed'
    );
  }

  return payload as WaitlistStatsResponse;
};

export const getWaitlistStats = async (): Promise<WaitlistStatsResponse> => {
  ensureSupabaseConfig();

  try {
    // Prefer GET because many deployments still have the older edge-function
    // contract, and pushing this repo does not redeploy Supabase functions.
    return await requestWaitlistStats({
      method: 'GET',
      headers: getSupabaseHeaders(),
    });
  } catch {
    return requestWaitlistStats({
      method: 'POST',
      headers: getSupabaseHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({ action: 'stats' }),
    });
  }
};

export const joinWaitlist = async (email: string) => {
  ensureSupabaseConfig();

  const response = await fetch(getFunctionUrl('waitlist-signup'), {
    method: 'POST',
    headers: getSupabaseHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ email: normalizeWaitlistEmail(email) }),
  });

  const payload = await parseFunctionResponse(response);

  if (!response.ok) {
    throw new Error(
      extractErrorMessage(payload) || 'Supabase waitlist request failed'
    );
  }

  return payload as WaitlistJoinResponse;
};
