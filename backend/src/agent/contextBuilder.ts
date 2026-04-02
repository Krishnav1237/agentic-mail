import type { AgentGoalState } from './types.js';
import { buildMemorySummary } from '../memory/summary.js';
import { listEpisodes } from '../memory/episodic.js';
import { getStrategistState } from './strategist.js';

export type ContextInputs = {
  userId: string;
  goals: AgentGoalState;
  pendingEmails: Array<{
    id: string;
    subject: string;
    sender: string;
    receivedAt?: string | null;
    preview?: string;
  }>;
  openTasks: Array<{
    id: string;
    title: string;
    dueAt?: string | null;
    category?: string | null;
  }>;
  upcomingEvents: Array<{ id: string; subject: string; start?: string | null }>;
  recentActions: Array<{ id: string; action_type: string; status: string }>;
};

export type BuiltContext = {
  summary: string;
  episodic: Array<{ context: any; outcome: any; created_at: string }>;
};

export const buildContext = async (
  input: ContextInputs
): Promise<BuiltContext> => {
  const memorySummary = await buildMemorySummary(input.userId);
  const episodic = await listEpisodes(input.userId, 5);
  const strategist = await getStrategistState(input.userId);

  const summary = [
    `Goals: ${input.goals.goals.map((g) => `${g.goal}(${g.weight})`).join(', ') || 'none'}`,
    `Autopilot: ${input.goals.autopilotLevel}`,
    `Personality: ${input.goals.personalityMode}`,
    `Strategy: ${strategist.planningAggressiveness} | Focus: ${strategist.focusAreas.join(', ') || 'none'}`,
    `Pending emails: ${input.pendingEmails.length}`,
    `Open tasks: ${input.openTasks.length}`,
    `Upcoming events: ${input.upcomingEvents.length}`,
    `Recent actions: ${input.recentActions.length}`,
    `Memory: ${memorySummary}`,
  ].join(' | ');

  return { summary, episodic };
};
