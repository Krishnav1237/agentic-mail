export const categoryTones: Record<string, string> = {
  assignment: 'border-amber-400/20 text-amber-200',
  internship: 'border-emerald-400/20 text-emerald-300',
  event: 'border-cyan-400/20 text-cyan-300',
  academic: 'border-blue-400/20 text-blue-300',
  personal: 'border-white/10 text-white/70',
  spam: 'border-rose-400/20 text-rose-300',
  other: 'border-white/10 text-white/70'
};

export const statusTones: Record<string, string> = {
  open: 'border-emerald-400/20 text-emerald-300',
  snoozed: 'border-amber-400/20 text-amber-200',
  completed: 'border-white/10 text-white/60',
  pending: 'border-cyan-400/20 text-cyan-300',
  processed: 'border-blue-400/20 text-blue-300',
  approved: 'border-emerald-400/20 text-emerald-300',
  preview: 'border-amber-400/20 text-amber-200',
  suggest: 'border-amber-400/20 text-amber-200',
  suggested: 'border-amber-400/20 text-amber-200',
  modified: 'border-violet-400/20 text-violet-300',
  rejected: 'border-rose-400/20 text-rose-300',
  failed: 'border-rose-400/20 text-rose-300',
  cancelled: 'border-white/10 text-white/50',
  canceled: 'border-white/10 text-white/50',
  executed: 'border-emerald-400/20 text-emerald-300',
  ignored: 'border-white/10 text-white/50',
  discarded: 'border-white/10 text-white/50'
};

export const autopilotLabels: Record<0 | 1 | 2, string> = {
  0: 'Suggestions only',
  1: 'Safe automation',
  2: 'Full agent assist'
};

export const personalityDescriptions: Record<'chill' | 'proactive' | 'aggressive', string> = {
  chill: 'Fewer interruptions, calmer planning, more approvals.',
  proactive: 'Balanced suggestions and safe automation for everyday use.',
  aggressive: 'Higher urgency and faster execution for heavy inbox weeks.'
};

export const formatDateTime = (value?: string | null) => {
  if (!value) return 'No deadline';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));
};

export const formatDate = (value?: string | null) => {
  if (!value) return 'No date';
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
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

export const getCategoryTone = (category?: string | null) => categoryTones[category ?? 'other'] ?? categoryTones.other;

export const getStatusTone = (status?: string | null) => statusTones[status ?? 'open'] ?? statusTones.open;

export const getPriorityLabel = (score: number) => {
  if (score >= 3) return 'Critical';
  if (score >= 2) return 'High';
  if (score >= 1) return 'Medium';
  return 'Low';
};

export const getPriorityTone = (score: number) => {
  if (score >= 3) return 'text-rose-300';
  if (score >= 2) return 'text-white';
  if (score >= 1) return 'text-white/80';
  return 'text-white/60';
};
