import { createHash } from 'crypto';
import type { AgentPlan } from '../ai/schemas.js';
import type { PlannerResult } from './planningTypes.js';

const normalizeValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        if (['created_at', 'updated_at', 'received_at'].includes(key)) return acc;
        acc[key] = normalizeValue((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  return value;
};

const normalizeTarget = (step: AgentPlan['plan'][number]) => {
  const input = step.input ?? {};
  return {
    email: (input.email_id as string | undefined) ?? (input.message_id as string | undefined) ?? null,
    task: (input.task_id as string | undefined) ?? null,
    folder: (input.folder as string | undefined) ?? null,
    label: (input.label as string | undefined) ?? null,
    workflow: step.workflow
  };
};

const buildDedupeKey = (step: AgentPlan['plan'][number]) => {
  const normalizedInput = normalizeValue(step.input ?? {});
  const normalizedTarget = normalizeTarget(step);
  return createHash('sha1')
    .update(JSON.stringify({
      action: step.action,
      target: normalizedTarget,
      input: normalizedInput
    }))
    .digest('hex');
};

export const mergeAndDedupePlans = (plans: PlannerResult[]): PlannerResult => {
  const merged: Array<AgentPlan['plan'][number] & { originalOrder: number; dedupeKey: string }> = [];
  let order = 0;

  for (const planner of plans) {
    for (const step of planner.plan) {
      merged.push({
        ...step,
        dedupeKey: buildDedupeKey(step),
        originalOrder: order++
      });
    }
  }

  const deduped = new Map<string, AgentPlan['plan'][number] & { originalOrder: number; dedupeKey: string }>();
  for (const step of merged) {
    const existing = deduped.get(step.dedupeKey);
    if (!existing) {
      deduped.set(step.dedupeKey, step);
      continue;
    }

    if (step.confidence > existing.confidence) {
      deduped.set(step.dedupeKey, {
        ...step,
        originalOrder: Math.min(existing.originalOrder, step.originalOrder)
      });
      continue;
    }

    if (step.confidence === existing.confidence && step.originalOrder < existing.originalOrder) {
      deduped.set(step.dedupeKey, step);
    }
  }

  const plan = [...deduped.values()]
    .sort((a, b) => a.originalOrder - b.originalOrder)
    .map((step, index) => ({
      step: index + 1,
      workflow: step.workflow,
      action: step.action,
      input: step.input,
      reason: step.reason,
      confidence: step.confidence
    }));

  return {
    plan,
    diagnostics: plans.flatMap((planner) => planner.diagnostics),
    source: plans.length > 1 ? 'merged' : plans[0]?.source ?? 'fast'
  };
};

export const getExecutionKeyForStep = (step: AgentPlan['plan'][number]) => buildDedupeKey(step);
