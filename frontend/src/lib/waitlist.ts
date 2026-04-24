import { API_BASE } from './apiBase';

export type WaitlistJoinResponse = {
  success: true;
  status: 'created' | 'duplicate';
  message: string;
};

export type WaitlistStatsResponse = {
  success: true;
  total: number;
};

type WaitlistErrorResponse = {
  error?: string;
  message?: string;
};

const parseResponse = async (
  response: Response
): Promise<WaitlistJoinResponse | WaitlistStatsResponse | WaitlistErrorResponse> => {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  const text = await response.text();
  return { error: text };
};

const extractError = (
  payload: WaitlistJoinResponse | WaitlistStatsResponse | WaitlistErrorResponse
) => payload.error || payload.message || 'Waitlist request failed';

export const getWaitlistStats = async (): Promise<WaitlistStatsResponse> => {
  const response = await fetch(`${API_BASE}/waitlist/stats`, {
    method: 'GET',
    credentials: 'include',
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(extractError(payload));
  }
  return payload as WaitlistStatsResponse;
};

export const joinWaitlist = async (email: string) => {
  const response = await fetch(`${API_BASE}/waitlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
    credentials: 'include',
  });

  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(extractError(payload));
  }

  return payload as WaitlistJoinResponse;
};
