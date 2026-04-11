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

const parseFunctionResponse = async (
  response: Response
): Promise<
  | WaitlistJoinResponse
  | WaitlistStatsResponse
  | SupabaseErrorResponse
  | { error?: string }
  | string
> => {
  const contentType = response.headers.get('content-type') ?? '';
  return contentType.includes('application/json')
    ? ((await response.json()) as
        | WaitlistJoinResponse
        | WaitlistStatsResponse
        | SupabaseErrorResponse
        | { error?: string })
    : await response.text();
};

const extractErrorMessage = (
  payload:
    | WaitlistJoinResponse
    | WaitlistStatsResponse
    | SupabaseErrorResponse
    | { error?: string }
    | string
) =>
  typeof payload === 'string'
    ? payload
    : [payload.message, payload.details, payload.hint, payload.error]
        .filter(Boolean)
        .join(' ');

const requestWaitlistStats = async (
  init: RequestInit
): Promise<WaitlistStatsResponse> => {
  const response = await fetch(getFunctionUrl('waitlist-signup'), init);
  const payload = await parseFunctionResponse(response);

  if (!response.ok) {
    throw new Error(extractErrorMessage(payload) || 'Supabase waitlist stats failed');
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
