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

const getRestUrl = (tableName: string) =>
  `${SUPABASE_URL}/rest/v1/${tableName}`;

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

export const getWaitlistStats = async (): Promise<WaitlistStatsResponse> => {
  ensureSupabaseConfig();

  try {
    // Direct call to Supabase REST API to get count instead of Edge Function
    const headers = getSupabaseHeaders({
      'Prefer': 'count=exact',
    });
    // We only need the count, so limit=1 and select a small field
    const response = await fetch(`${getRestUrl('waitlist')}?select=*&limit=1`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new Error('Supabase waitlist stats request failed');
    }

    // The count is returned in the Content-Range header: e.g., "0-0/25"
    const contentRange = response.headers.get('Content-Range');
    let total = 0;
    if (contentRange) {
      const match = contentRange.match(/\/(\d+)$/);
      if (match) {
        total = parseInt(match[1], 10);
      }
    }

    return { success: true, total };
  } catch (error) {
    console.error('Failed to fetch waitlist stats from Supabase:', error);
    throw error;
  }
};

export const joinWaitlist = async (
  email: string
): Promise<WaitlistJoinResponse> => {
  ensureSupabaseConfig();

  // Try calling edge function to join
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
