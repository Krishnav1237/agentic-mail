import { z } from 'zod';

export const EntitySchema = z.object({
  professors: z.array(z.string()).default([]),
  companies: z.array(z.string()).default([]),
  clubs: z.array(z.string()).default([])
});

export const ClassificationSchema = z.object({
  type: z.enum(['assignment', 'internship', 'event', 'spam', 'academic', 'personal', 'other']),
  ai_score: z.number().min(0).max(1),
  summary: z.string().max(400),
  entities: EntitySchema
});

export const DeadlineSchema = z.object({
  title: z.string(),
  due_at: z.string().datetime().or(z.string().min(1)),
  confidence: z.number().min(0).max(1)
});

export const TaskSchema = z.object({
  title: z.string(),
  description: z.string().optional().default(''),
  due_at: z.string().datetime().or(z.string().min(1)).optional(),
  link: z.string().url().optional(),
  priority_hint: z.enum(['low', 'medium', 'high']).optional()
});

export const ExtractionSchema = z.object({
  deadlines: z.array(DeadlineSchema).default([]),
  tasks: z.array(TaskSchema).default([]),
  links: z.array(z.string().url()).default([]),
  entities: EntitySchema
});

export type ClassificationOutput = z.infer<typeof ClassificationSchema>;
export type ExtractionOutput = z.infer<typeof ExtractionSchema>;

export const ReplySchema = z.object({
  subject: z.string(),
  body: z.string()
});

export type ReplyOutput = z.infer<typeof ReplySchema>;

export const AgentActionSchema = z.object({
  type: z.enum([
    'create_task',
    'create_calendar_event',
    'draft_reply',
    'send_reply',
    'snooze',
    'mark_important',
    'archive_email',
    'delete_email',
    'move_to_folder',
    'label_email',
    'ignore'
  ]),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  payload: z.record(z.any()).optional()
});

export const AgentDecisionSchema = z.object({
  classification: z.enum(['assignment', 'internship', 'event', 'spam', 'academic', 'personal', 'other']),
  priority: z.number().min(0).max(100),
  actions: z.array(AgentActionSchema).default([])
});

export type AgentDecision = z.infer<typeof AgentDecisionSchema>;

export const PlanStepSchema = z.object({
  step: z.number().int().min(1),
  workflow: z.string().min(1).default('General'),
  action: z.enum([
    'create_task',
    'create_calendar_event',
    'draft_reply',
    'send_reply',
    'snooze',
    'mark_important',
    'archive_email',
    'delete_email',
    'move_to_folder',
    'label_email'
  ]),
  input: z.record(z.any()).default({}),
  reason: z.string(),
  confidence: z.number().min(0).max(1)
});

export const PlanSchema = z.object({
  plan: z.array(PlanStepSchema).default([])
});

export type AgentPlan = z.infer<typeof PlanSchema>;

export const StrategistSchema = z.object({
  priority_weight_adjustments: z.record(z.number()).default({}),
  planning_aggressiveness: z.enum(['low', 'medium', 'high']).default('medium'),
  focus_areas: z.array(z.string()).default([]),
  notes: z.string().default('')
});

export type StrategistOutput = z.infer<typeof StrategistSchema>;

export const ActivityFeedSchema = z.object({
  actions_taken: z.array(z.string()).default([]),
  improvements: z.array(z.string()).default([]),
  insights: z.array(z.string()).default([])
});

export type ActivityFeedOutput = z.infer<typeof ActivityFeedSchema>;

export const ReflectionSchema = z.object({
  success: z.boolean(),
  improvement_suggestion: z.string(),
  confidence_adjustment: z.number().min(-1).max(1)
});

export type AgentReflection = z.infer<typeof ReflectionSchema>;
