import type { PartialPlanStep, PlannerInput, RuleResult } from '../../agent/planningTypes.js';

export const cleanupRules = (input: PlannerInput): RuleResult => {
  const steps = input.filtered.emails.flatMap<PartialPlanStep>((email) => {
    const text = `${email.subject} ${email.preview ?? ''}`;
    if (/(newsletter|digest|announcement|update|promo|promotion)/i.test(text) && !/(deadline|interview|application)/i.test(text)) {
      return [
        {
          workflow: 'Inbox Cleanup',
          action: 'label_email',
          input: { email_id: email.id, label: 'CATEGORY_UPDATES' },
          reason: 'Informational updates should be labeled for lower-noise triage.',
          confidence: 0.72
        },
        {
          workflow: 'Inbox Cleanup',
          action: 'archive_email',
          input: { email_id: email.id },
          reason: 'Low-actionability update can leave the inbox after labeling.',
          confidence: 0.67
        }
      ];
    }

    return [];
  });

  return {
    steps,
    diagnostics: steps.length > 0 ? [`cleanup:${steps.length}`] : []
  };
};
