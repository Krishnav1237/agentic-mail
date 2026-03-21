import { z } from 'zod';
import { env } from '../config/env.js';
import { callLLM } from '../ai/llmProviders.js';
import { classificationPrompt, extractionPrompt, replyPrompt, agentDecisionPrompt, plannerPrompt, reflectionPrompt, strategistPrompt, activityFeedPrompt } from '../ai/prompts.js';
import { ClassificationSchema, ExtractionSchema, ReplySchema, AgentDecisionSchema, PlanSchema, ReflectionSchema, StrategistSchema, ActivityFeedSchema, type ClassificationOutput, type ExtractionOutput, type ReplyOutput, type AgentDecision, type AgentPlan, type AgentReflection, type StrategistOutput, type ActivityFeedOutput } from '../ai/schemas.js';

const extractJson = (content: string) => {
  const trimmed = content.trim();
  if (trimmed.startsWith('{')) {
    return trimmed;
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error('No JSON object found');
  }
  return trimmed.slice(start, end + 1);
};

const parseAndValidate = async <S extends z.ZodTypeAny>(prompt: string, schema: S): Promise<z.infer<S>> => {
  let attempt = 0;
  let lastError: Error | undefined;
  let currentPrompt = prompt;

  while (attempt <= env.aiMaxRetries) {
    const { content } = await callLLM(currentPrompt);
    try {
      const json = JSON.parse(extractJson(content));
      return schema.parse(json);
    } catch (error) {
      lastError = error as Error;
      attempt += 1;
      currentPrompt = `${prompt}\n\nIMPORTANT: Respond with STRICT JSON that matches the schema. No markdown. No extra text.`;
    }
  }

  throw lastError ?? new Error('AI validation failed');
};

export const classifyEmail = async (input: {
  subject: string;
  senderName?: string | null;
  senderEmail?: string | null;
  bodyPreview?: string | null;
}): Promise<ClassificationOutput> => {
  const prompt = classificationPrompt(input);
  return parseAndValidate(prompt, ClassificationSchema);
};

export const extractEmail = async (input: {
  subject: string;
  senderName?: string | null;
  senderEmail?: string | null;
  bodyPreview?: string | null;
}): Promise<ExtractionOutput> => {
  const prompt = extractionPrompt(input);
  return parseAndValidate(prompt, ExtractionSchema);
};

export const generateReply = async (input: {
  subject: string;
  senderName?: string | null;
  senderEmail?: string | null;
  bodyPreview?: string | null;
}): Promise<ReplyOutput> => {
  const prompt = replyPrompt(input);
  return parseAndValidate(prompt, ReplySchema);
};

export const decideAgentActions = async (input: {
  goals: Array<{ goal: string; weight: number }>;
  autopilotLevel: number;
  email: {
    subject: string;
    senderName?: string | null;
    senderEmail?: string | null;
    bodyPreview?: string | null;
    receivedAt?: string | null;
    importance?: string | null;
  };
  memorySummary: string;
}): Promise<AgentDecision> => {
  const prompt = agentDecisionPrompt(input);
  return parseAndValidate(prompt, AgentDecisionSchema);
};

export const planAgentActions = async (input: {
  goals: Array<{ goal: string; weight: number }>;
  autopilotLevel: number;
  context: string;
  planningAggressiveness?: 'low' | 'medium' | 'high';
  focusAreas?: string[];
  priorityWeights?: Record<string, number>;
  priorityAdjustments?: Record<string, number>;
  strategistNotes?: string;
  intentSummary?: string;
  sessionOverrides?: string;
  priorityBoosts?: Record<string, number>;
  energyLevel?: 'low' | 'medium' | 'high';
  bestTime?: string;
  personalityMode?: 'chill' | 'proactive' | 'aggressive';
  pendingEmails: Array<{ id: string; subject: string; sender: string; receivedAt?: string | null; preview?: string }>;
  openTasks: Array<{ id: string; title: string; dueAt?: string | null; category?: string | null }>;
  upcomingEvents: Array<{ id: string; subject: string; start?: string | null }>;
  recentActions: Array<{ id: string; action_type: string; status: string }>;
}): Promise<AgentPlan> => {
  const prompt = plannerPrompt(input);
  return parseAndValidate(prompt, PlanSchema);
};

export const reflectOnExecution = async (input: {
  goals: Array<{ goal: string; weight: number }>;
  context: string;
  plan: unknown;
  results: unknown;
}): Promise<AgentReflection> => {
  const prompt = reflectionPrompt(input);
  return parseAndValidate(prompt, ReflectionSchema);
};

export const generateStrategistAdjustments = async (input: {
  goals: Array<{ goal: string; weight: number }>;
  behaviorSummary: string;
  preferences: Record<string, number>;
  recentActions: Array<{ action_type: string; status: string }>;
  recentFeedback: Array<{ status: string; count: number }>;
  memorySummary: string;
}): Promise<StrategistOutput> => {
  const prompt = strategistPrompt(input);
  return parseAndValidate(prompt, StrategistSchema);
};

export const generateActivityFeed = async (input: {
  goals: Array<{ goal: string; weight: number }>;
  actionsSummary: string;
  reflectionsSummary: string;
  strategistNotes: string;
}): Promise<ActivityFeedOutput> => {
  const prompt = activityFeedPrompt(input);
  return parseAndValidate(prompt, ActivityFeedSchema);
};
