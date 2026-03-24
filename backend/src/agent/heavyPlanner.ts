import { planAgentActions } from '../services/ai.js';
import type { PlannerInput, PlannerResult } from './planningTypes.js';

export const runHeavyPlanner = async (input: PlannerInput): Promise<PlannerResult> => {
  const plan = await planAgentActions({
    goals: input.goals.goals,
    autopilotLevel: input.goals.autopilotLevel,
    context: input.context.summary,
    planningAggressiveness: input.strategist.planningAggressiveness,
    focusAreas: input.strategist.focusAreas,
    priorityAdjustments: input.strategist.priorityAdjustments,
    strategistNotes: input.strategist.notes,
    intentSummary: input.intents.intents.join(', ') || 'none',
    sessionOverrides: input.intents.sessionOverrides.join(', ') || 'none',
    priorityBoosts: input.intents.priorityBoosts,
    energyLevel: input.energy.energyLevel,
    bestTime: input.energy.bestTime,
    personalityMode: input.goals.personalityMode,
    pendingEmails: input.filtered.emails.map((email) => ({
      id: email.id,
      subject: email.subject,
      sender: email.sender,
      receivedAt: email.receivedAt,
      preview: email.preview
    })),
    openTasks: input.filtered.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      dueAt: task.dueAt,
      category: task.category
    })),
    upcomingEvents: input.filtered.events.map((event) => ({
      id: event.id,
      subject: event.subject,
      start: event.start
    })),
    recentActions: input.recentActions.map((action) => ({
      id: action.id,
      action_type: action.action_type,
      status: action.status
    }))
  }, {
    userId: input.userId,
    operation: `heavy_planner_${input.planType}`,
    metadata: {
      pendingEmails: input.filtered.emails.length,
      openTasks: input.filtered.tasks.length,
      upcomingEvents: input.filtered.events.length
    }
  });

  return {
    plan: plan.plan,
    diagnostics: ['heavy_planner'],
    source: 'heavy'
  };
};
