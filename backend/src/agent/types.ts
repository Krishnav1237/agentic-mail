import type { AgentDecision } from '../ai/schemas.js';

export type PerceivedEmail = {
  emailId: string;
  messageId: string;
  threadId?: string | null;
  subject: string;
  senderName?: string | null;
  senderEmail?: string | null;
  bodyPreview?: string | null;
  receivedAt?: string | null;
  importance?: string | null;
};

export type AgentGoalState = {
  goals: Array<{ goal: string; weight: number }>;
  autopilotLevel: 0 | 1 | 2;
  personalityMode: 'chill' | 'proactive' | 'aggressive';
};

export type PlannedAction = {
  type: AgentDecision['actions'][number]['type'];
  reason: string;
  confidence: number;
  baseConfidence?: number;
  adjustedConfidence?: number;
  historicalAccuracy?: number;
  recencyWeight?: number;
  contextSimilarity?: number;
  workflow?: string;
  workflowId?: string;
  preview?: Record<string, unknown> | null;
  payload?: Record<string, unknown>;
  execution: 'execute' | 'suggest' | 'ignore';
  requiresApproval: boolean;
};
