export type WaitlistJoinResponse = {
  success: true;
  status: 'created' | 'duplicate';
  message: string;
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

export const joinWaitlist = async (email: string) => {
  if (!SUPABASE_URL || !configuredSupabaseAnonKey) {
    throw new Error(
      'Waitlist signup requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
    );
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/waitlist-signup`, {
    method: 'POST',
    headers: getSupabaseHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ email: normalizeWaitlistEmail(email) }),
  });

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json')
    ? ((await response.json()) as
        | WaitlistJoinResponse
        | SupabaseErrorResponse
        | { error?: string })
    : await response.text();

  if (!response.ok) {
    const detail =
      typeof payload === 'string'
        ? payload
        : [payload.message, payload.details, payload.hint, payload.error]
            .filter(Boolean)
            .join(' ');

    throw new Error(detail || 'Supabase waitlist request failed');
  }

  return payload as WaitlistJoinResponse;
};
