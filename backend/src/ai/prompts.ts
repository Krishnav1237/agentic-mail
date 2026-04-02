export const classificationPrompt = (input: {
  subject: string;
  senderName?: string | null;
  senderEmail?: string | null;
  bodyPreview?: string | null;
}) => {
  return `You are an email classifier for an inbox intelligence system.
Classify the email into one of: assignment, internship, event, spam, academic, personal, other.
Return STRICT JSON only. No prose, no markdown.
Schema:
{
  "type": "assignment|internship|event|spam|academic|personal|other",
  "ai_score": number (0-1, urgency/importance),
  "summary": string (<= 400 chars),
  "entities": {
    "professors": string[],
    "companies": string[],
    "clubs": string[]
  }
}
Email:
Subject: ${input.subject}
Sender: ${input.senderName ?? ''} <${input.senderEmail ?? ''}>
Body preview: ${input.bodyPreview ?? ''}`;
};

export const extractionPrompt = (input: {
  subject: string;
  senderName?: string | null;
  senderEmail?: string | null;
  bodyPreview?: string | null;
}) => {
  return `You extract deadlines, tasks, links, and entities from student emails.
Return STRICT JSON only. No prose, no markdown.
Schema:
{
  "deadlines": [{"title": string, "due_at": string, "confidence": number}],
  "tasks": [{"title": string, "description": string, "due_at": string?, "link": string?, "priority_hint": "low|medium|high"?}],
  "links": string[],
  "entities": {"professors": string[], "companies": string[], "clubs": string[]}
}
Guidelines:
- Use ISO 8601 dates if possible. If date is unknown, use best-effort natural language.
- Include only actionable items.
Email:
Subject: ${input.subject}
Sender: ${input.senderName ?? ''} <${input.senderEmail ?? ''}>
Body preview: ${input.bodyPreview ?? ''}`;
};

export const replyPrompt = (input: {
  subject: string;
  senderName?: string | null;
  senderEmail?: string | null;
  bodyPreview?: string | null;
}) => {
  return `You are drafting a concise, professional reply for a student.
Return STRICT JSON only. No prose, no markdown.
Schema:
{
  "subject": string,
  "body": string
}
Guidelines:
- Keep it short, friendly, and actionable.
- If clarification is needed, ask 1-2 focused questions.
Email:
Subject: ${input.subject}
Sender: ${input.senderName ?? ''} <${input.senderEmail ?? ''}>
Body preview: ${input.bodyPreview ?? ''}`;
};

export const agentDecisionPrompt = (input: {
  goals: Array<{ goal: string; weight: number }>;
  autopilotLevel: number;
  email: {
    subject: string;
    senderName?: string | null;
    senderEmail?: string | null;
    bodyPreview?: string | null;
    receivedAt?: string | null;
    importance?: string | null;
  };
  memorySummary: string;
}) => {
  return `You are an autonomous student inbox agent.
Use the user's goals, memory summary, and email context to decide what to do.
Return STRICT JSON only. No prose, no markdown.
Output schema:
{
  "classification": "assignment|internship|event|spam|academic|personal|other",
  "priority": number (0-100),
  "actions": [
    {
      "type": "create_task|create_calendar_event|draft_reply|send_reply|snooze|mark_important|archive_email|delete_email|move_to_folder|label_email|ignore",
      "reason": string,
      "confidence": number (0-1),
      "payload": object (optional, include any fields needed to execute the action)
    }
  ]
}
Guidelines:
- Align with user goals.
- Avoid unsafe actions (never auto-send replies).
- Prefer high-confidence, high-impact actions.
User goals: ${input.goals.map((g) => `${g.goal} (${g.weight})`).join(', ') || 'None provided'}
Autopilot level: ${input.autopilotLevel}
Memory summary: ${input.memorySummary}
Email:
Subject: ${input.email.subject}
Sender: ${input.email.senderName ?? ''} <${input.email.senderEmail ?? ''}>
Received: ${input.email.receivedAt ?? ''}
Importance: ${input.email.importance ?? ''}
Body preview: ${input.email.bodyPreview ?? ''}`;
};

export const plannerPrompt = (input: {
  goals: Array<{ goal: string; weight: number }>;
  autopilotLevel: number;
  context: string;
  planningAggressiveness?: 'low' | 'medium' | 'high';
  focusAreas?: string[];
  priorityWeights?: Record<string, number>;
  priorityAdjustments?: Record<string, number>;
  strategistNotes?: string;
  intentSummary?: string;
  sessionOverrides?: string;
  priorityBoosts?: Record<string, number>;
  energyLevel?: 'low' | 'medium' | 'high';
  bestTime?: string;
  personalityMode?: 'chill' | 'proactive' | 'aggressive';
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
}) => {
  return `You are a planning engine for an autonomous student assistant.
Create a multi-step plan that advances user goals.
Return STRICT JSON only. No prose, no markdown.
Plan schema:
{
  "plan": [
    { "step": number, "workflow": string, "action": "create_task|create_calendar_event|draft_reply|send_reply|snooze|mark_important|archive_email|delete_email|move_to_folder|label_email", "input": object, "reason": string, "confidence": number }
  ]
}
Guidelines:
- Use available email/task context.
- Include email_id or task_id in the input when needed.
- Consider dependencies between steps.
- Group related steps into workflows using the same workflow label.
- Keep workflow labels short and action-oriented.
- Do not include unsafe actions unless clearly justified.
- Prefer reversible cleanup actions over deletion when intent is ambiguous.
- Honor personality mode: chill = fewer actions, proactive = balanced, aggressive = more actions.
- Apply priority boosts when choosing which actions to include.
User goals: ${input.goals.map((g) => `${g.goal} (${g.weight})`).join(', ') || 'None'}
Autopilot level: ${input.autopilotLevel}
Personality mode: ${input.personalityMode ?? 'proactive'}
Intent summary: ${input.intentSummary ?? 'none'}
Session overrides: ${input.sessionOverrides ?? 'none'}
Priority boosts: ${JSON.stringify(input.priorityBoosts ?? {})}
Energy level: ${input.energyLevel ?? 'medium'}
Best time: ${input.bestTime ?? 'unknown'}
Planning aggressiveness: ${input.planningAggressiveness ?? 'medium'}
Focus areas: ${(input.focusAreas ?? []).join(', ') || 'none'}
Priority weights: ${JSON.stringify(input.priorityWeights ?? {})}
Priority adjustments: ${JSON.stringify(input.priorityAdjustments ?? {})}
Strategist notes: ${input.strategistNotes ?? ''}
Context summary: ${input.context}
Pending emails: ${input.pendingEmails.map((e) => `${e.id}:${e.subject}::${(e.preview ?? '').slice(0, 120)}`).join(' | ') || 'none'}
Open tasks: ${input.openTasks.map((t) => `${t.id}:${t.title}`).join(' | ') || 'none'}
Upcoming events: ${input.upcomingEvents.map((e) => `${e.id}:${e.subject}`).join(' | ') || 'none'}
Recent actions: ${input.recentActions.map((a) => `${a.id}:${a.action_type}:${a.status}`).join(' | ') || 'none'}`;
};

export const strategistPrompt = (input: {
  goals: Array<{ goal: string; weight: number }>;
  behaviorSummary: string;
  preferences: Record<string, number>;
  recentActions: Array<{ action_type: string; status: string }>;
  recentFeedback: Array<{ status: string; count: number }>;
  memorySummary: string;
}) => {
  return `You are a strategist module optimizing an autonomous student assistant.
Return STRICT JSON only. No prose, no markdown.
Schema:
{
  "priority_weight_adjustments": { "assignment": number, "internship": number, "event": number, "academic": number, "personal": number, "spam": number, "other": number },
  "planning_aggressiveness": "low|medium|high",
  "focus_areas": [string],
  "notes": string
}
Guidelines:
- priority_weight_adjustments are MULTIPLIERS (0.7 to 1.3). Use 1.0 when no change.
- Keep adjustments conservative and goal-aligned.
- Focus areas should be short phrases aligned with current goals.
Goals: ${input.goals.map((g) => `${g.goal} (${g.weight})`).join(', ') || 'None'}
Behavior summary: ${input.behaviorSummary}
Preferences: ${JSON.stringify(input.preferences)}
Recent actions: ${input.recentActions.map((a) => `${a.action_type}:${a.status}`).join(', ') || 'none'}
Recent feedback: ${input.recentFeedback.map((f) => `${f.status}:${f.count}`).join(', ') || 'none'}
Memory summary: ${input.memorySummary}`;
};

export const activityFeedPrompt = (input: {
  goals: Array<{ goal: string; weight: number }>;
  actionsSummary: string;
  reflectionsSummary: string;
  strategistNotes: string;
}) => {
  return `You are generating a daily activity feed summary for a student assistant.
Return STRICT JSON only. No prose, no markdown.
Schema:
{
  "actions_taken": [string],
  "improvements": [string],
  "insights": [string]
}
Guidelines:
- Keep entries short and actionable.
- Mention impactful actions and any notable improvements.
Goals: ${input.goals.map((g) => `${g.goal} (${g.weight})`).join(', ') || 'None'}
Actions summary: ${input.actionsSummary}
Reflections summary: ${input.reflectionsSummary}
Strategist notes: ${input.strategistNotes}`;
};

export const reflectionPrompt = (input: {
  goals: Array<{ goal: string; weight: number }>;
  context: string;
  plan: unknown;
  results: unknown;
}) => {
  return `You are a reflection engine evaluating agent execution.
Return STRICT JSON only. No prose, no markdown.
Schema:
{
  "success": boolean,
  "improvement_suggestion": string,
  "confidence_adjustment": number
}
Goals: ${input.goals.map((g) => `${g.goal} (${g.weight})`).join(', ') || 'None'}
Context: ${input.context}
Plan: ${JSON.stringify(input.plan)}
Results: ${JSON.stringify(input.results)}`;
};
