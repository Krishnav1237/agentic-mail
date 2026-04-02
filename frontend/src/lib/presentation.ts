export const categoryTones: Record<string, string> = {
  assignment: 'bg-amber-100 text-amber-700 ring-amber-200',
  internship: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  event: 'bg-cyan-100 text-cyan-700 ring-cyan-200',
  academic: 'bg-indigo-100 text-indigo-700 ring-indigo-200',
  personal: 'bg-slate-100 text-slate-700 ring-slate-200',
  spam: 'bg-rose-100 text-rose-700 ring-rose-200',
  other: 'bg-slate-100 text-slate-700 ring-slate-200',
};

export const statusTones: Record<string, string> = {
  open: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  snoozed: 'bg-amber-50 text-amber-700 ring-amber-200',
  completed: 'bg-slate-100 text-slate-700 ring-slate-200',
  pending: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
  processed: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  preview: 'bg-amber-50 text-amber-700 ring-amber-200',
  suggest: 'bg-amber-50 text-amber-700 ring-amber-200',
  suggested: 'bg-amber-50 text-amber-700 ring-amber-200',
  failed: 'bg-rose-50 text-rose-700 ring-rose-200',
  cancelled: 'bg-slate-100 text-slate-700 ring-slate-200',
};

export const autopilotLabels: Record<0 | 1 | 2, string> = {
  0: 'Suggestions only',
  1: 'Safe automation',
  2: 'Full agent assist',
};

export const personalityDescriptions: Record<
  'chill' | 'proactive' | 'aggressive',
  string
> = {
  chill: 'Fewer interruptions, calmer planning, more approvals.',
  proactive: 'Balanced suggestions and safe automation for everyday use.',
  aggressive: 'Higher urgency and faster execution for heavy inbox weeks.',
};

export const formatDateTime = (value?: string | null) => {
  if (!value) return 'No deadline';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
};

export const formatDate = (value?: string | null) => {
  if (!value) return 'No date';
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
};

export const relativeWindow = (value?: string | null) => {
  if (!value) return 'No deadline set';
  const due = new Date(value).getTime();
  const diffHours = Math.round((due - Date.now()) / (1000 * 60 * 60));

  if (diffHours <= 0) return 'Due now';
  if (diffHours < 24) return `Due in ${diffHours}h`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) return 'Due tomorrow';
  return `Due in ${diffDays} days`;
};

export const getCategoryTone = (category?: string | null) =>
  categoryTones[category ?? 'other'] ?? categoryTones.other;

export const getStatusTone = (status?: string | null) =>
  statusTones[status ?? 'open'] ?? statusTones.open;

export const getPriorityLabel = (score: number) => {
  if (score >= 3) return 'Critical';
  if (score >= 2) return 'High';
  if (score >= 1) return 'Medium';
  return 'Low';
};

export const getPriorityTone = (score: number) => {
  if (score >= 3) return 'text-rose-600';
  if (score >= 2) return 'text-amber-600';
  if (score >= 1) return 'text-cyan-600';
  return 'text-slate-500';
};
