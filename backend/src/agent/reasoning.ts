import { decideAgentActions } from '../services/ai.js';
import type { AgentGoalState, PerceivedEmail } from './types.js';

export const reasonAboutEmail = async (input: {
  email: PerceivedEmail;
  goals: AgentGoalState;
  memorySummary: string;
}) => {
  return decideAgentActions({
    goals: input.goals.goals,
    autopilotLevel: input.goals.autopilotLevel,
    email: {
      subject: input.email.subject,
      senderName: input.email.senderName,
      senderEmail: input.email.senderEmail,
      bodyPreview: input.email.bodyPreview,
      receivedAt: input.email.receivedAt,
      importance: input.email.importance,
    },
    memorySummary: input.memorySummary,
  });
};
