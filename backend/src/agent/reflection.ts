import { query } from '../db/index.js';
import { reflectOnExecution } from '../services/ai.js';
import { addEpisode } from '../memory/episodic.js';
import type { AgentGoalState } from './types.js';

export const runReflection = async (input: {
  userId: string;
  goals: AgentGoalState;
  context: string;
  planId: string;
  plan: unknown;
  results: unknown;
}) => {
  const reflection = await reflectOnExecution({
    goals: input.goals.goals,
    context: input.context,
    plan: input.plan,
    results: input.results
  });

  await query(
    `INSERT INTO agent_reflections (user_id, plan_id, reflection)
     VALUES ($1, $2, $3)`,
    [input.userId, input.planId, JSON.stringify(reflection)]
  );

  await addEpisode({
    userId: input.userId,
    context: { planId: input.planId, context: input.context, plan: input.plan },
    outcome: { results: input.results, reflection }
  });

  return reflection;
};
