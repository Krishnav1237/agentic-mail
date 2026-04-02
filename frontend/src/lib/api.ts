import { API_BASE } from './apiBase';

export type Task = {
  id: string;
  email_id: string;
  message_id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  link: string | null;
  category: string | null;
  priority_score: number;
  status: string;
  created_at?: string;
};

export type DashboardSections = {
  criticalToday: Task[];
  upcomingDeadlines: Task[];
  opportunities: Task[];
  lowPriority: Task[];
};

export type Paginated<T> = {
  total: number;
  limit: number;
  offset: number;
  items: T[];
};

export type TaskListResponse = {
  tasks: Task[];
  total: number;
  limit: number;
  offset: number;
};

export type EmailRow = {
  id: string;
  message_id: string;
  subject: string | null;
  sender_email: string | null;
  sender_name: string | null;
  received_at: string | null;
  classification: string | null;
  ai_score: number | null;
  status: string | null;
};

export type EmailListResponse = {
  emails: EmailRow[];
  total: number;
  limit: number;
  offset: number;
};

export type AgentActionRow = {
  id: string;
  action_type: string;
  status: string;
  workflow_name: string | null;
  workflow_id: string | null;
  action_payload: Record<string, any>;
  confidence: number | null;
  decision_reason: string | null;
  requires_approval: boolean;
  created_at: string;
  email_id: string | null;
  subject?: string | null;
  sender_name?: string | null;
  sender_email?: string | null;
};

export type AgentActionsResponse = {
  actions: AgentActionRow[];
  total: number;
  limit: number;
  offset: number;
};

export type ActivityFeed = {
  actions_taken: string[];
  improvements: string[];
  insights: string[];
};

export type GoalsResponse = {
  goals: Array<{ goal: string; weight: number }>;
  autopilotLevel: 0 | 1 | 2;
  personalityMode: 'chill' | 'proactive' | 'aggressive';
};

export type PreferencesResponse = {
  weights: Record<string, number>;
};

export type SessionResponse = {
  authenticated: boolean;
  user?: {
    userId: string;
    email: string;
  };
  authMode?: 'cookie' | 'bearer';
};

export type WaitlistJoinResponse = {
  success: true;
  status: 'created' | 'duplicate';
  message: string;
};

const getToken = () => localStorage.getItem('auth_token');

const apiFetch = async (path: string, init: RequestInit = {}) => {
  const token = getToken();
  const headers = new Headers(init.headers ?? {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Request failed');
  }

  return response.json();
};

export const getDashboard = () =>
  apiFetch('/tasks/dashboard') as Promise<DashboardSections>;
export const getSession = () =>
  apiFetch('/auth/session') as Promise<SessionResponse>;
export const logout = () => apiFetch('/auth/logout', { method: 'POST' });

export const joinWaitlist = async (email: string) => {
  const response = await fetch(`${API_BASE}/waitlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
    credentials: 'include',
  });

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json')
    ? ((await response.json()) as WaitlistJoinResponse | { error?: string })
    : await response.text();

  if (!response.ok) {
    throw new Error(
      typeof payload === 'string'
        ? payload
        : payload.error || 'Waitlist request failed'
    );
  }

  return payload as WaitlistJoinResponse;
};

const buildQuery = (
  params: Record<string, string | number | boolean | undefined>
) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
};

export const getTasks = (params: {
  limit?: number;
  offset?: number;
  status?: string;
  category?: string;
  query?: string;
  sort?: 'priority' | 'due' | 'created';
  minPriority?: number;
  maxPriority?: number;
  dueOnly?: boolean;
  dueFrom?: string;
  dueTo?: string;
}) => apiFetch(`/tasks${buildQuery(params)}`) as Promise<TaskListResponse>;

export const getEmails = (params: {
  limit?: number;
  offset?: number;
  status?: string;
  classification?: string;
  query?: string;
}) => apiFetch(`/emails${buildQuery(params)}`) as Promise<EmailListResponse>;

export const getAgentActions = (params: {
  limit?: number;
  offset?: number;
  status?: string;
}) =>
  apiFetch(
    `/agent/actions${buildQuery(params)}`
  ) as Promise<AgentActionsResponse>;

export const getActivityFeed = () =>
  apiFetch('/agent/activity-feed') as Promise<{
    feed: { summary: ActivityFeed; summary_date: string } | null;
  }>;

export const getGoals = () =>
  apiFetch('/agent/goals') as Promise<GoalsResponse>;

export const updateGoals = (payload: {
  goals: Array<{ goal: string; weight: number }>;
  autopilotLevel: 0 | 1 | 2;
  personalityMode: 'chill' | 'proactive' | 'aggressive';
}) =>
  apiFetch('/agent/goals', { method: 'PUT', body: JSON.stringify(payload) });

export const getPreferences = () =>
  apiFetch('/preferences') as Promise<PreferencesResponse>;

export const updatePreferences = (weights: Record<string, number>) =>
  apiFetch('/preferences', {
    method: 'PUT',
    body: JSON.stringify({ weights }),
  });

export const approveAction = (
  actionId: string,
  payloadOverride?: Record<string, unknown>
) =>
  apiFetch('/agent/preview/approve', {
    method: 'POST',
    body: JSON.stringify({ actionId, payloadOverride }),
  });

export const modifyAction = (
  actionId: string,
  payloadOverride: Record<string, unknown>
) =>
  apiFetch('/agent/preview/modify', {
    method: 'POST',
    body: JSON.stringify({ actionId, payloadOverride }),
  });

export const cancelAction = (actionId: string, reason?: string) =>
  apiFetch('/agent/preview/cancel', {
    method: 'POST',
    body: JSON.stringify({ actionId, reason }),
  });

export const syncInbox = () => apiFetch('/emails/sync', { method: 'POST' });

export const recordFeedback = (payload: {
  emailId?: string;
  action: string;
  category?: string;
}) => apiFetch('/feedback', { method: 'POST', body: JSON.stringify(payload) });

export const addToCalendar = (taskId: string) =>
  apiFetch('/actions/calendar', {
    method: 'POST',
    body: JSON.stringify({ taskId }),
  });

export const markImportant = (emailId: string) =>
  apiFetch('/actions/important', {
    method: 'POST',
    body: JSON.stringify({ emailId }),
  });

export const generateReply = (emailId: string) =>
  apiFetch('/actions/reply', {
    method: 'POST',
    body: JSON.stringify({ emailId }),
  });

export const snoozeTask = (taskId: string) =>
  apiFetch('/actions/snooze', {
    method: 'POST',
    body: JSON.stringify({ taskId }),
  });
