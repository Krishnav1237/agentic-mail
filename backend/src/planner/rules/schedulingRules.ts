import type { PartialPlanStep, PlannerInput, RuleResult } from '../../agent/planningTypes.js';

const isDueSoon = (value?: string | null) => {
  if (!value) return false;
  const parsed = new Date(value).getTime();
  if (Number.isNaN(parsed)) return false;
  return parsed - Date.now() <= 1000 * 60 * 60 * 24 * 3;
};

export const schedulingRules = (input: PlannerInput): RuleResult => {
  const steps: PartialPlanStep[] = [];

  for (const task of input.filtered.tasks) {
    if (task.category === 'assignment' && isDueSoon(task.dueAt)) {
      steps.push({
        workflow: 'Deadline Defense',
        action: 'create_calendar_event',
        input: { task_id: task.id },
        reason: 'Assignments due soon should be scheduled on the calendar.',
        confidence: 0.88
      });
    }
  }

  for (const email of input.filtered.emails) {
    if (/(schedule|availability|meeting|calendar|office hours)/i.test(`${email.subject} ${email.preview ?? ''}`)) {
      steps.push({
        workflow: 'Scheduling Triage',
        action: 'create_task',
        input: {
          email_id: email.id,
          title: `Respond to scheduling request: ${email.subject}`,
          category: 'academic',
          priority: 76
        },
        reason: 'Scheduling-related email likely needs a follow-up action.',
        confidence: 0.79
      });
    }
  }

  return {
    steps,
    diagnostics: steps.length > 0 ? [`scheduling:${steps.length}`] : []
  };
};
