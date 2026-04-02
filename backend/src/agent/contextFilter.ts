import type {
  FilteredPlannerContext,
  PlannerEmail,
  PlannerEvent,
  PlannerTask,
} from './planningTypes.js';

type RawEmail = {
  id: string;
  threadId?: string | null;
  subject: string;
  sender: string;
  senderDomain?: string | null;
  receivedAt?: string | null;
  preview?: string;
  importance?: string | null;
  classification?: string | null;
};

type RawTask = {
  id: string;
  title: string;
  dueAt?: string | null;
  category?: string | null;
  priorityScore?: number | null;
  status?: string;
};

type RawEvent = {
  id: string;
  subject: string;
  start?: string | null;
};

const hasSignal = (text: string) =>
  /(deadline|due|submit|application|interview|schedule|meeting|respond|reply|internship|event|reminder|today|tomorrow|urgent)/i.test(
    text
  );

const normalizePreview = (value?: string) =>
  (value ?? '').replace(/\s+/g, ' ').trim().slice(0, 220);

const hoursUntil = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  if (Number.isNaN(parsed)) return null;
  return (parsed - Date.now()) / (1000 * 60 * 60);
};

const filterEmail = (email: RawEmail): PlannerEmail => {
  const reasons: string[] = [];
  const text = `${email.subject} ${email.preview ?? ''}`.trim();
  const sender = email.sender.toLowerCase();

  if (email.importance === 'high') reasons.push('important');
  if (email.classification && email.classification !== 'spam')
    reasons.push(`classification:${email.classification}`);
  if (hasSignal(text)) reasons.push('actionable_keyword');
  if (
    /(career|jobs?|recruit|talent|campus|professor|office|university)/i.test(
      sender
    )
  )
    reasons.push('high_value_sender');

  const actionable = reasons.length > 0 && email.classification !== 'spam';
  return {
    id: email.id,
    threadId: email.threadId ?? email.id,
    subject: email.subject,
    sender: email.sender,
    senderDomain: email.senderDomain ?? null,
    receivedAt: email.receivedAt,
    preview: normalizePreview(email.preview),
    importance: email.importance ?? null,
    classification: email.classification ?? null,
    actionable,
    reasons: actionable ? reasons : ['filtered_noise'],
  };
};

const filterTask = (task: RawTask): PlannerTask => {
  const reasons: string[] = [];
  const dueInHours = hoursUntil(task.dueAt);
  if ((task.priorityScore ?? 0) >= 1.5) reasons.push('priority');
  if (
    task.category &&
    ['assignment', 'internship', 'event', 'academic'].includes(task.category)
  )
    reasons.push(`category:${task.category}`);
  if (dueInHours !== null && dueInHours <= 24 * 14) reasons.push('due_soon');
  if (task.status === 'open') reasons.push('open');

  const actionable = reasons.length > 0;
  return {
    id: task.id,
    title: task.title,
    dueAt: task.dueAt,
    category: task.category ?? null,
    priorityScore: task.priorityScore ?? null,
    status: task.status ?? 'open',
    actionable,
    reasons: actionable ? reasons : ['filtered_noise'],
  };
};

const filterEvent = (event: RawEvent): PlannerEvent => {
  const reasons: string[] = [];
  const startsInHours = hoursUntil(event.start);
  if (hasSignal(event.subject)) reasons.push('actionable_keyword');
  if (startsInHours !== null && startsInHours <= 24 * 14)
    reasons.push('upcoming');

  const actionable = reasons.length > 0;
  return {
    id: event.id,
    subject: event.subject,
    start: event.start,
    actionable,
    reasons: actionable ? reasons : ['filtered_noise'],
  };
};

export const filterPlanningContext = (input: {
  pendingEmails: RawEmail[];
  openTasks: RawTask[];
  upcomingEvents: RawEvent[];
}): FilteredPlannerContext => {
  const filteredEmails = input.pendingEmails.map(filterEmail);
  const filteredTasks = input.openTasks.map(filterTask);
  const filteredEvents = input.upcomingEvents.map(filterEvent);

  const emails = filteredEmails
    .filter((email) => email.actionable)
    .slice(0, 25);
  const tasks = filteredTasks.filter((task) => task.actionable).slice(0, 60);
  const events = filteredEvents
    .filter((event) => event.actionable)
    .slice(0, 20);

  return {
    emails,
    tasks,
    events,
    diagnostics: {
      keptEmails: emails.length,
      droppedEmails: filteredEmails.length - emails.length,
      keptTasks: tasks.length,
      droppedTasks: filteredTasks.length - tasks.length,
      keptEvents: events.length,
      droppedEvents: filteredEvents.length - events.length,
    },
  };
};
