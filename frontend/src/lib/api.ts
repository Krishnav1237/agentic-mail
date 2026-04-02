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

class ApiRequestError extends Error {
  status: number;
  body: unknown;
  method: string;
  path: string;
  isTimeout: boolean;
  isNetworkError: boolean;

  constructor({
    message,
    status,
    body,
    method,
    path,
    isTimeout = false,
    isNetworkError = false
  }: {
    message: string;
    status: number;
    body: unknown;
    method: string;
    path: string;
    isTimeout?: boolean;
    isNetworkError?: boolean;
  }) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.body = body;
    this.method = method;
    this.path = path;
    this.isTimeout = isTimeout;
    this.isNetworkError = isNetworkError;
  }
}

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';
const API_TIMEOUT_MS = 8000;

const getToken = () => localStorage.getItem('auth_token');

const withTimeout = async <T>(
  request: Promise<T>,
  ms: number,
  method: string,
  path: string,
  controller: AbortController
) => {
  let timer: number | undefined;

  try {
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => {
          controller.abort();
          reject(new ApiRequestError({
            message: 'Network issue. Please try again.',
            status: 408,
            body: null,
            method,
            path,
            isTimeout: true
          }));
        }, ms);
      })
    ]);
  } finally {
    if (timer) {
      window.clearTimeout(timer);
    }
  }
};

const isJsonResponse = (response: Response) =>
  (response.headers.get('content-type') ?? '').includes('application/json');

const readResponseBody = async (response: Response) => {
  if (response.status === 204) {
    return null;
  }

  if (isJsonResponse(response)) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    return await response.text();
  } catch {
    return null;
  }
};

const messageFromBody = (body: unknown) => {
  if (!body) return null;
  if (typeof body === 'string' && body.trim()) return body;
  if (typeof body === 'object' && body !== null) {
    const error = 'error' in body ? body.error : null;
    const message = 'message' in body ? body.message : null;

    if (typeof message === 'string' && message.trim()) return message;
    if (typeof error === 'string' && error.trim()) return error;
  }
  return null;
};

const normalizeThrownError = (error: unknown, method: string, path: string) => {
  if (error instanceof ApiRequestError) {
    return error;
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return new ApiRequestError({
      message: 'Network issue. Please try again.',
      status: 408,
      body: null,
      method,
      path,
      isTimeout: true
    });
  }

  return new ApiRequestError({
    message: 'Something went wrong',
    status: 500,
    body: error instanceof Error ? error.message : null,
    method,
    path,
    isNetworkError: true
  });
};

const shouldRetry = (method: string, error: ApiRequestError) =>
  method === 'GET' && (error.isTimeout || error.isNetworkError || error.status === 0);

const parseResponse = async <T>(response: Response) => {
  if (response.status === 204) {
    return null as T;
  }

  if (!isJsonResponse(response)) {
    const text = await response.text();
    return text as T;
  }

  return response.json() as Promise<T>;
};

const apiFetch = async <T>(path: string, init: RequestInit = {}) => {
  const token = getToken();
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers ?? {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');

  const maxAttempts = method === 'GET' ? 2 : 1;
  const url = `${API_BASE}${path}`;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();

    try {
      console.log('API_CALL', { url, method, attempt });

      const response = await withTimeout(
        fetch(url, {
          ...init,
          method,
          headers,
          credentials: 'include',
          signal: controller.signal
        }),
        API_TIMEOUT_MS,
        method,
        path,
        controller
      );

      if (!(response instanceof Response)) {
        throw new ApiRequestError({
          message: 'Something went wrong',
          status: 500,
          body: null,
          method,
          path
        });
      }

      if (!response.ok) {
        const body = await readResponseBody(response);
        throw new ApiRequestError({
          message: messageFromBody(body) ?? 'Something went wrong',
          status: response.status,
          body,
          method,
          path
        });
      }

      return await parseResponse<T>(response);
    } catch (error) {
      const normalizedError = normalizeThrownError(error, method, path);

      if (attempt < maxAttempts && shouldRetry(method, normalizedError)) {
        console.log('API_RETRY', {
          url,
          method,
          attempt,
          reason: normalizedError.message
        });
        continue;
      }

      console.log('API_ERROR', {
        url,
        method,
        attempt,
        message: normalizedError.message,
        status: normalizedError.status,
        body: normalizedError.body
      });
      throw normalizedError;
    }
  }

  throw new ApiRequestError({
    message: 'Something went wrong',
    status: 500,
    body: null,
    method,
    path
  });
};

const buildQuery = (params: Record<string, string | number | boolean | undefined>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
};

export const getDashboard = () => apiFetch<DashboardSections>('/tasks/dashboard');
export const getSession = () => apiFetch<SessionResponse>('/auth/session');
export const logout = () => apiFetch<{ ok: true }>('/auth/logout', { method: 'POST' });

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
}) => apiFetch<TaskListResponse>(`/tasks${buildQuery(params)}`);

export const getEmails = (params: {
  limit?: number;
  offset?: number;
  status?: string;
  classification?: string;
  query?: string;
}) => apiFetch<EmailListResponse>(`/emails${buildQuery(params)}`);

export const getAgentActions = (params: { limit?: number; offset?: number; status?: string }) =>
  apiFetch<AgentActionsResponse>(`/agent/actions${buildQuery(params)}`);

export const getActivityFeed = () =>
  apiFetch<{ feed: { summary: ActivityFeed; summary_date: string } | null }>('/agent/activity-feed');

export const getGoals = () => apiFetch<GoalsResponse>('/agent/goals');

export const updateGoals = (payload: {
  goals: Array<{ goal: string; weight: number }>;
  autopilotLevel: 0 | 1 | 2;
  personalityMode: 'chill' | 'proactive' | 'aggressive';
}) => apiFetch('/agent/goals', { method: 'PUT', body: JSON.stringify(payload) });

export const getPreferences = () => apiFetch<PreferencesResponse>('/preferences');

export const updatePreferences = (weights: Record<string, number>) =>
  apiFetch('/preferences', { method: 'PUT', body: JSON.stringify({ weights }) });

export const approveAction = (actionId: string, payloadOverride?: Record<string, unknown>) =>
  apiFetch('/agent/preview/approve', { method: 'POST', body: JSON.stringify({ actionId, payloadOverride }) });

export const modifyAction = (actionId: string, payloadOverride: Record<string, unknown>) =>
  apiFetch('/agent/preview/modify', { method: 'POST', body: JSON.stringify({ actionId, payloadOverride }) });

export const cancelAction = (actionId: string, reason?: string) =>
  apiFetch('/agent/preview/cancel', { method: 'POST', body: JSON.stringify({ actionId, reason }) });

export const syncInbox = () => apiFetch<{ status: string }>('/emails/sync', { method: 'POST' });

export const recordFeedback = (payload: { emailId?: string; action: string; category?: string }) =>
  apiFetch('/feedback', { method: 'POST', body: JSON.stringify(payload) });

export const addToCalendar = (taskId: string) =>
  apiFetch('/actions/calendar', { method: 'POST', body: JSON.stringify({ taskId }) });

export const markImportant = (emailId: string) =>
  apiFetch('/actions/important', { method: 'POST', body: JSON.stringify({ emailId }) });

export const generateReply = (emailId: string) =>
  apiFetch('/actions/reply', { method: 'POST', body: JSON.stringify({ emailId }) });

export const snoozeTask = (taskId: string) =>
  apiFetch('/actions/snooze', { method: 'POST', body: JSON.stringify({ taskId }) });
