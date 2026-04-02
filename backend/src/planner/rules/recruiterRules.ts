import { buildRecruiterWorkflow } from '../../agent/workflows/recruiter.js';
import type { PlannerInput, RuleResult } from '../../agent/planningTypes.js';

export const recruiterRules = (input: PlannerInput): RuleResult => {
  const steps = input.filtered.emails
    .filter((email) =>
      email.reasons.some(
        (reason) =>
          reason === 'high_value_sender' ||
          reason.includes('classification:internship')
      )
    )
    .flatMap((email) => buildRecruiterWorkflow(email));

  return {
    steps,
    diagnostics: steps.length > 0 ? [`recruiter:${steps.length}`] : [],
  };
};
