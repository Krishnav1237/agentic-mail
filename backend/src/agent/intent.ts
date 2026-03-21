import { getMemory, upsertMemory } from '../memory/store.js';

export type IntentState = {
  intents: string[];
  sessionOverrides: string[];
  priorityBoosts: Record<string, number>;
  updatedAt: string;
};

const defaultIntentState: IntentState = {
  intents: [],
  sessionOverrides: [],
  priorityBoosts: {},
  updatedAt: new Date(0).toISOString()
};

const intentKey = 'intent_state';
const sessionKey = (sessionId: string) => `intent_session_${sessionId}`;

const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

export const getIntentState = async (userId: string, sessionId?: string): Promise<IntentState> => {
  const base = (await getMemory<IntentState>(userId, 'short', intentKey)) ?? defaultIntentState;
  if (!sessionId) return base;

  const session = await getMemory<IntentState>(userId, 'short', sessionKey(sessionId));
  if (!session) return base;

  return {
    intents: session.intents.length ? session.intents : base.intents,
    sessionOverrides: session.sessionOverrides.length ? session.sessionOverrides : base.sessionOverrides,
    priorityBoosts: { ...base.priorityBoosts, ...session.priorityBoosts },
    updatedAt: session.updatedAt ?? base.updatedAt
  };
};

export const updateIntentState = async (input: {
  userId: string;
  intents?: string[];
  sessionOverrides?: string[];
  priorityBoosts?: Record<string, number>;
  sessionId?: string;
  ttlHours?: number;
}) => {
  const boosts: Record<string, number> = {};
  for (const [key, value] of Object.entries(input.priorityBoosts ?? {})) {
    const normalized = Math.min(Math.max(value, 0.5), 2);
    boosts[key] = normalized;
  }

  const state: IntentState = {
    intents: input.intents ?? [],
    sessionOverrides: input.sessionOverrides ?? [],
    priorityBoosts: boosts,
    updatedAt: new Date().toISOString()
  };

  const key = input.sessionId ? sessionKey(input.sessionId) : intentKey;
  const ttl = input.ttlHours ?? 6;
  await upsertMemory(input.userId, 'short', key, state, hoursFromNow(ttl));
  return state;
};
