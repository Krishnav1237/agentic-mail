import { API_BASE } from './apiBase';

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

const normalizeWaitlistEmail = (email: string) => email.trim().toLowerCase();

export const getWaitlistStats = async (): Promise<WaitlistStatsResponse> => {
  const response = await fetch(`${API_BASE}/waitlist/stats`);
  if (!response.ok) {
    throw new Error('Failed to fetch waitlist stats');
  }
  return response.json();
};

export const joinWaitlist = async (
  email: string
): Promise<WaitlistJoinResponse> => {
  const response = await fetch(`${API_BASE}/waitlist`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: normalizeWaitlistEmail(email) }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Waitlist signup failed');
  }

  return response.json();
};
