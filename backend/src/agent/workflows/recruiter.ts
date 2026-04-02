import type { PlannerEmail } from '../planningTypes.js';
import type { PartialPlanStep } from '../planningTypes.js';

const recruiterSignal = (email: PlannerEmail) =>
  /(recruit|talent|hiring|candidate|interview|application|offer)/i.test(
    `${email.subject} ${email.preview ?? ''} ${email.sender}`
  );

const interviewSignal = (email: PlannerEmail) =>
  /(interview|availability|schedule|calendar|timeslot|meeting)/i.test(
    `${email.subject} ${email.preview ?? ''}`
  );

const responseSignal = (email: PlannerEmail) =>
  /(respond|reply|confirm|follow up|next steps|availability)/i.test(
    `${email.subject} ${email.preview ?? ''}`
  );

export const buildRecruiterWorkflow = (
  email: PlannerEmail
): PartialPlanStep[] => {
  if (!recruiterSignal(email)) return [];

  const workflow = 'Recruiter Pipeline';
  const steps: PartialPlanStep[] = [];

  steps.push({
    workflow,
    action: 'label_email',
    input: { email_id: email.id, label: 'Recruiter' },
    reason:
      'Recruiter-related communication should be tagged for pipeline visibility.',
    confidence: 0.89,
  });

  if (responseSignal(email)) {
    steps.push({
      workflow,
      action: 'draft_reply',
      input: { email_id: email.id },
      reason: 'Recruiter email appears to need a candidate response.',
      confidence: 0.86,
    });
  }

  if (interviewSignal(email)) {
    steps.push({
      workflow: 'Interview Scheduling',
      action: 'create_calendar_event',
      input: { email_id: email.id, title: email.subject },
      reason:
        'Interview-related messages benefit from a calendar hold for planning.',
      confidence: 0.81,
    });
    steps.push({
      workflow: 'Interview Scheduling',
      action: 'move_to_folder',
      input: { email_id: email.id, folder: 'archive' },
      reason:
        'Once tagged and planned, interview scheduling emails can move out of the inbox for focus.',
      confidence: 0.68,
    });
  } else {
    steps.push({
      workflow,
      action: 'create_task',
      input: {
        email_id: email.id,
        title: `Follow up with recruiter: ${email.subject}`,
        category: 'internship',
        priority: 82,
      },
      reason:
        'Recruiter messages should generate a follow-up task in the pipeline.',
      confidence: 0.84,
    });
  }

  return steps;
};
