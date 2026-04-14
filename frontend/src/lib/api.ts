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

export type UsageMetric = {
  metric: string;
  used: number;
  quotaLimit: number | null;
  percentage: number;
  remaining: number | null;
  windowStart: string;
  windowEnd: string;
  warn70Sent: boolean;
  warn85Sent: boolean;
  warn100Sent: boolean;
};

export type BillingPlan = {
  plan_slug: string;
  plan_name: string;
  status: string;
  priceUsdCents: number;
  interval: string;
  limits: Record<string, number>;
  features: Record<string, unknown>;
  current_period_start: string | null;
  current_period_end: string | null;
  grace_until: string | null;
};

export type BillingWarning = {
  metric: string;
  used: number;
  quotaLimit: number;
  percentage: number;
  severity: 'warning' | 'high' | 'hard_stop';
};

export class ApiError extends Error {
  status: number;
  code?: string;
  metric?: string;
  upgradeRequired?: boolean;
  details?: unknown;

  constructor(
    message: string,
    options: {
      status: number;
      code?: string;
      metric?: string;
      upgradeRequired?: boolean;
      details?: unknown;
    }
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.metric = options.metric;
    this.upgradeRequired = options.upgradeRequired;
    this.details = options.details;
  }
}

export const isQuotaExceededError = (
  error: unknown
): error is ApiError & { metric: string } => {
  return (
    error instanceof ApiError &&
    error.status === 402 &&
    error.code === 'quota_exhausted' &&
    Boolean(error.metric)
  );
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

export type MustActItem = {
  id: string;
  title: string;
  subject: string | null;
  sender_name: string | null;
  sender_email: string | null;
  why_reason: string | null;
  risk_tier: 'low' | 'medium' | 'high' | string;
  confidence: number;
  score: number;
  deadline_at: string | null;
  suggested_bundle: string[];
  status: string;
  deferred_until: string | null;
  created_at: string;
};

export type MustActListResponse = {
  items: MustActItem[];
  total: number;
  limit: number;
  offset: number;
};

export type SenderPolicyRule = {
  senderKey: string;
  mode: 'always' | 'never' | 'suggest_only';
  actionTypes?: string[];
  updatedAt?: string;
};

export type FollowupTimelineItem = {
  id: string;
  action: string;
  status: 'pending' | 'suggested' | 'sent' | 'cancelled' | string;
  scheduled_for: string;
  sent_at: string | null;
  cancelled_at: string | null;
  metadata: Record<string, unknown>;
  thread_id: string | null;
  thread_type: string | null;
  state: string | null;
  subject: string | null;
  sender_email: string | null;
};

export type FollowupTimelineResponse = {
  items: FollowupTimelineItem[];
  total: number;
  limit: number;
  offset: number;
};

export type FollowupPolicy = {
  mode: 'suggest' | 'draft' | 'auto_send';
  defaultDelayDays: number;
  recruiterDelayDays: number;
  cooldownHours: number;
  autoSendEnabled: boolean;
  allowedSenderDomains: string[];
  blockedSenderDomains: string[];
  quietHours: Record<string, unknown>;
};

const CSRF_COOKIE_NAME =
  import.meta.env.VITE_AUTH_CSRF_COOKIE_NAME?.trim() || 'iil_csrf';

const readCookie = (name: string) => {
  if (typeof document === 'undefined') return null;
  const encodedName = `${encodeURIComponent(name)}=`;
  const match = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(encodedName));
  if (!match) return null;
  return decodeURIComponent(match.slice(encodedName.length));
};

const apiFetch = async (path: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers ?? {});
  headers.set('Content-Type', 'application/json');
  const csrfToken = readCookie(CSRF_COOKIE_NAME);
  if (csrfToken) {
    headers.set('X-CSRF-Token', csrfToken);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const raw = await response.text();
    let parsed: any = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
    throw new ApiError(parsed?.error || raw || 'Request failed', {
      status: response.status,
      code: parsed?.code,
      metric: parsed?.metric,
      upgradeRequired: parsed?.upgradeRequired,
      details: parsed,
    });
  }

  return response.json();
};

export const getDashboard = () =>
  apiFetch('/tasks/dashboard') as Promise<DashboardSections>;
export const getSession = () =>
  apiFetch('/auth/session') as Promise<SessionResponse>;
export const logout = () => apiFetch('/auth/logout', { method: 'POST' });

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

export const getBillingPlan = () =>
  apiFetch('/billing/plan') as Promise<BillingPlan>;

export const getBillingUsage = () =>
  apiFetch('/billing/usage') as Promise<{ usage: UsageMetric[] }>;

export const getBillingWarnings = () =>
  apiFetch('/billing/warnings') as Promise<{ warnings: BillingWarning[] }>;

export const createCheckout = (planSlug: 'free' | 'pro' | 'power') =>
  apiFetch('/billing/checkout', {
    method: 'POST',
    body: JSON.stringify({ planSlug }),
  }) as Promise<{ ok: boolean; checkoutUrl: string }>;

export const openBillingPortal = () =>
  apiFetch('/billing/portal', { method: 'POST' }) as Promise<{
    ok: boolean;
    portalUrl: string;
  }>;

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

export const getMustAct = (params: {
  limit?: number;
  offset?: number;
  status?: string;
}) =>
  apiFetch(`/tasks/must-act${buildQuery(params)}`) as Promise<MustActListResponse>;

export const approveMustAct = (
  id: string,
  payload?: { notes?: string; payload?: Record<string, unknown> }
) =>
  apiFetch(`/must-act/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify(payload ?? {}),
  }) as Promise<{ ok: boolean; status: string }>;

export const rejectMustAct = (
  id: string,
  payload?: { notes?: string; payload?: Record<string, unknown> }
) =>
  apiFetch(`/must-act/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify(payload ?? {}),
  }) as Promise<{ ok: boolean; status: string }>;

export const deferMustAct = (
  id: string,
  payload: { deferredUntil: string; notes?: string; payload?: Record<string, unknown> }
) =>
  apiFetch(`/must-act/${id}/defer`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<{ ok: boolean; status: string }>;

export const editMustAct = (
  id: string,
  payload: { notes?: string; payload?: Record<string, unknown> }
) =>
  apiFetch(`/must-act/${id}/edit`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<{ ok: boolean; status: string }>;

export const reopenMustAct = (id: string) =>
  apiFetch(`/must-act/${id}/reopen`, {
    method: 'POST',
  }) as Promise<{ ok: boolean; status: string }>;

export const getSenderPolicyRules = () =>
  apiFetch('/preferences/policy-rules') as Promise<{ rules: SenderPolicyRule[] }>;

export const updateSenderPolicyRules = (rules: SenderPolicyRule[]) =>
  apiFetch('/preferences/policy-rules', {
    method: 'PUT',
    body: JSON.stringify({ rules }),
  }) as Promise<{ ok: boolean; rules: SenderPolicyRule[] }>;

export const getFollowupTimeline = (params: { limit?: number; offset?: number }) =>
  apiFetch(`/followups/timeline${buildQuery(params)}`) as Promise<FollowupTimelineResponse>;

export const getFollowupPolicy = () =>
  apiFetch('/followups/policy') as Promise<FollowupPolicy>;

export const updateFollowupPolicySettings = (policy: FollowupPolicy) =>
  apiFetch('/followups/policy', {
    method: 'PUT',
    body: JSON.stringify(policy),
  }) as Promise<{ ok: boolean }>;

export const approveFollowup = (id: string) =>
  apiFetch(`/followups/${id}/approve`, { method: 'POST' }) as Promise<{
    ok: boolean;
    status: string;
  }>;

export const cancelFollowup = (id: string) =>
  apiFetch(`/followups/${id}/cancel`, { method: 'POST' }) as Promise<{
    ok: boolean;
    status: string;
  }>;

export const undoAgentAction = (actionId: string) =>
  apiFetch('/agent/recovery/undo', {
    method: 'POST',
    body: JSON.stringify({ actionId }),
  }) as Promise<{ ok: boolean; result: Record<string, unknown> }>;

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
