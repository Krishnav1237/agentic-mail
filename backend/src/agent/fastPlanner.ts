import type { PlannerInput, PlannerResult, PartialPlanStep } from './planningTypes.js';
import { recruiterRules } from '../planner/rules/recruiterRules.js';
import { schedulingRules } from '../planner/rules/schedulingRules.js';
import { cleanupRules } from '../planner/rules/cleanupRules.js';

const ruleModules = [recruiterRules, schedulingRules, cleanupRules];

const withStepNumbers = (steps: PartialPlanStep[]) =>
  steps.map((step, index) => ({ ...step, step: index + 1 }));

export const runFastPlanner = async (input: PlannerInput): Promise<PlannerResult> => {
  const diagnostics: string[] = [];
  const partials: PartialPlanStep[] = [];

  for (const rule of ruleModules) {
    const result = rule(input);
    partials.push(...result.steps);
    diagnostics.push(...result.diagnostics);
  }

  return {
    plan: withStepNumbers(partials),
    diagnostics,
    source: 'fast'
  };
};
