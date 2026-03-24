import { createHash } from 'crypto';
import { redis } from '../config/redis.js';
import type { AgentGoalState } from './types.js';
import type { StrategistState } from './strategist.js';
import type { IntentState } from './intent.js';
import type { FilteredPlannerContext } from './planningTypes.js';

const STATE_VERSION = 'v2';
const TERMINAL_ACTION_STATUSES = new Set(['executed', 'failed', 'cancelled', 'undone', 'approved', 'rejected']);

const stateKey = (userId: string, loopType: string) => `agent-state:${STATE_VERSION}:${userId}:${loopType}`;

const stableSort = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(stableSort);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = stableSort((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
};

const hashString = (value: string) => createHash('sha256').update(value).digest('hex');

const trimSubject = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
const trimPreview = (value?: string) => (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 160);
const normalizeSender = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();

const bucketDate = (value?: string | null) => {
  if (!value) return 'none';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'unknown';
  const diffHours = (parsed.getTime() - Date.now()) / (1000 * 60 * 60);
  if (diffHours < 0) return 'overdue';
  if (diffHours <= 24) return 'today';
  if (diffHours <= 24 * 3) return '3d';
  if (diffHours <= 24 * 14) return '2w';
  return 'later';
};

const priorityBand = (value?: number | null) => {
  if (value === null || value === undefined) return 'unknown';
  if (value >= 2.5) return 'critical';
  if (value >= 1.5) return 'high';
  if (value >= 0.75) return 'medium';
  return 'low';
};

const normalizeThreads = (context: FilteredPlannerContext) => {
  const grouped = new Map<string, {
    threadKey: string;
    subjects: Set<string>;
    senderDomains: Set<string>;
    senders: Set<string>;
    importance: Set<string>;
    classifications: Set<string>;
    reasons: Set<string>;
    count: number;
  }>();

  for (const email of context.emails) {
    const fallbackThreadKey = `${trimSubject(email.subject)}::${normalizeSender(email.sender)}`;
    const threadKey = email.threadId || hashString(fallbackThreadKey).slice(0, 12);
    const entry = grouped.get(threadKey) ?? {
      threadKey,
      subjects: new Set<string>(),
      senderDomains: new Set<string>(),
      senders: new Set<string>(),
      importance: new Set<string>(),
      classifications: new Set<string>(),
      reasons: new Set<string>(),
      count: 0
    };

    entry.count += 1;
    entry.subjects.add(trimSubject(email.subject));
    entry.senders.add(normalizeSender(email.sender));
    if (email.senderDomain) entry.senderDomains.add(email.senderDomain.toLowerCase());
    if (email.importance) entry.importance.add(email.importance.toLowerCase());
    if (email.classification) entry.classifications.add(email.classification.toLowerCase());
    email.reasons.forEach((reason) => entry.reasons.add(reason));

    grouped.set(threadKey, entry);
  }

  return [...grouped.values()]
    .map((entry) => ({
      threadKey: entry.threadKey,
      subjects: [...entry.subjects].sort(),
      senders: [...entry.senders].sort(),
      senderDomains: [...entry.senderDomains].sort(),
      importance: [...entry.importance].sort(),
      classifications: [...entry.classifications].sort(),
      reasons: [...entry.reasons].sort(),
      count: entry.count
    }))
    .sort((a, b) => a.threadKey.localeCompare(b.threadKey));
};

export const buildDecisionState = (input: {
  filtered: FilteredPlannerContext;
  goals: AgentGoalState;
  intents: IntentState;
  strategist: StrategistState;
  recentActions: Array<{ id: string; action_type: string; status: string; workflow_name?: string | null }>;
}) => {
  const threads = normalizeThreads(input.filtered);
  const tasks = input.filtered.tasks
    .map((task) => ({
      title: trimSubject(task.title),
      category: task.category ?? 'other',
      status: task.status ?? 'open',
      dueBucket: bucketDate(task.dueAt),
      priorityBand: priorityBand(task.priorityScore),
      reasons: [...task.reasons].sort()
    }))
    .sort((a, b) => `${a.title}:${a.category}`.localeCompare(`${b.title}:${b.category}`));

  const events = input.filtered.events
    .map((event) => ({
      subject: trimSubject(event.subject),
      startBucket: bucketDate(event.start),
      reasons: [...event.reasons].sort()
    }))
    .sort((a, b) => a.subject.localeCompare(b.subject));

  const recentActions = input.recentActions
    .filter((action) => TERMINAL_ACTION_STATUSES.has(action.status))
    .map((action) => ({
      actionType: action.action_type,
      status: action.status,
      workflow: action.workflow_name ?? 'general'
    }))
    .sort((a, b) => `${a.workflow}:${a.actionType}:${a.status}`.localeCompare(`${b.workflow}:${b.actionType}:${b.status}`));

  return stableSort({
    version: STATE_VERSION,
    goals: {
      goals: input.goals.goals
        .map((goal) => ({ goal: goal.goal.trim().toLowerCase(), weight: Number(goal.weight.toFixed(2)) }))
        .sort((a, b) => a.goal.localeCompare(b.goal)),
      autopilotLevel: input.goals.autopilotLevel,
      personalityMode: input.goals.personalityMode
    },
    strategist: {
      planningAggressiveness: input.strategist.planningAggressiveness,
      focusAreas: [...input.strategist.focusAreas].map((value) => value.trim().toLowerCase()).sort(),
      priorityAdjustments: input.strategist.priorityAdjustments,
      notes: input.strategist.notes.trim().slice(0, 240)
    },
    intents: {
      intents: [...input.intents.intents].map((value) => value.trim().toLowerCase()).sort(),
      sessionOverrides: [...input.intents.sessionOverrides].map((value) => value.trim().toLowerCase()).sort(),
      priorityBoosts: input.intents.priorityBoosts
    },
    threads,
    tasks,
    events,
    recentActions,
    counts: {
      emails: input.filtered.emails.length,
      tasks: input.filtered.tasks.length,
      events: input.filtered.events.length
    }
  });
};

export const computeDecisionStateHash = (state: unknown) => {
  const normalized = JSON.stringify(state);
  return {
    stateHash: hashString(normalized),
    normalizedStateVersion: STATE_VERSION,
    normalizedState: normalized
  };
};

export const getStoredStateHash = async (userId: string, loopType: string) => {
  const raw = await redis.get(stateKey(userId, loopType));
  if (!raw) return null;
  return JSON.parse(raw) as {
    stateHash: string;
    normalizedStateVersion: string;
    computedAt: string;
    counts?: Record<string, number>;
  };
};

export const storeStateHash = async (input: {
  userId: string;
  loopType: string;
  stateHash: string;
  counts: Record<string, number>;
}) => {
  await redis.set(
    stateKey(input.userId, input.loopType),
    JSON.stringify({
      stateHash: input.stateHash,
      normalizedStateVersion: STATE_VERSION,
      computedAt: new Date().toISOString(),
      counts: input.counts
    }),
    'EX',
    60 * 60 * 24 * 7
  );
};
