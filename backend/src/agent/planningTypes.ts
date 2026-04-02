import type { AgentPlan } from '../ai/schemas.js';
import type { AgentGoalState } from './types.js';
import type { StrategistState } from './strategist.js';
import type { IntentState } from './intent.js';
import type { BuiltContext } from './contextBuilder.js';

export type PlannerEmail = {
  id: string;
  threadId: string;
  subject: string;
  sender: string;
  senderDomain: string | null;
  receivedAt?: string | null;
  preview?: string;
  importance?: string | null;
  classification?: string | null;
  actionable: boolean;
  reasons: string[];
};

export type PlannerTask = {
  id: string;
  title: string;
  dueAt?: string | null;
  category?: string | null;
  priorityScore?: number | null;
  status?: string;
  actionable: boolean;
  reasons: string[];
};

export type PlannerEvent = {
  id: string;
  subject: string;
  start?: string | null;
  actionable: boolean;
  reasons: string[];
};

export type FilterDiagnostics = {
  keptEmails: number;
  droppedEmails: number;
  keptTasks: number;
  droppedTasks: number;
  keptEvents: number;
  droppedEvents: number;
};

export type FilteredPlannerContext = {
  emails: PlannerEmail[];
  tasks: PlannerTask[];
  events: PlannerEvent[];
  diagnostics: FilterDiagnostics;
};

export type PlannerInput = {
  userId: string;
  planType: 'continuous' | 'daily';
  goals: AgentGoalState;
  context: BuiltContext;
  strategist: StrategistState;
  intents: IntentState;
  energy: {
    energyLevel: 'low' | 'medium' | 'high';
    bestTime: string;
  };
  filtered: FilteredPlannerContext;
  recentActions: Array<{
    id: string;
    action_type: string;
    status: string;
    workflow_name?: string | null;
  }>;
  remainingBudgetMs?: number;
};

export type PlannerResult = {
  plan: AgentPlan['plan'];
  diagnostics: string[];
  source: 'fast' | 'heavy' | 'merged';
};

export type PartialPlanStep = Omit<AgentPlan['plan'][number], 'step'>;

export type RuleResult = {
  steps: PartialPlanStep[];
  diagnostics: string[];
};
