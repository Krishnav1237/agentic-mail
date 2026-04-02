import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';

// Isolated re-implementation of planMerge logic for testing without env deps
type PlanStep = {
  step: number;
  workflow?: string;
  action: string;
  input: Record<string, unknown>;
  reason: string;
  confidence: number;
};

type PlannerResult = {
  plan: PlanStep[];
  diagnostics: string[];
  source: string;
};

const normalizeValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        if (['created_at', 'updated_at', 'received_at'].includes(key))
          return acc;
        acc[key] = normalizeValue((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  if (typeof value === 'string') return value.trim();
  return value;
};

const buildDedupeKey = (step: PlanStep) => {
  const normalizedInput = normalizeValue(step.input ?? {});
  const normalizedTarget = {
    email: (step.input.email_id as string | undefined) ?? null,
    task: (step.input.task_id as string | undefined) ?? null,
    folder: (step.input.folder as string | undefined) ?? null,
    label: (step.input.label as string | undefined) ?? null,
    workflow: step.workflow,
  };
  return createHash('sha1')
    .update(
      JSON.stringify({
        action: step.action,
        target: normalizedTarget,
        input: normalizedInput,
      })
    )
    .digest('hex');
};

const mergeAndDedupePlans = (plans: PlannerResult[]): PlannerResult => {
  const merged: Array<PlanStep & { originalOrder: number; dedupeKey: string }> =
    [];
  let order = 0;

  for (const planner of plans) {
    for (const step of planner.plan) {
      merged.push({
        ...step,
        dedupeKey: buildDedupeKey(step),
        originalOrder: order++,
      });
    }
  }

  const deduped = new Map<
    string,
    PlanStep & { originalOrder: number; dedupeKey: string }
  >();
  for (const step of merged) {
    const existing = deduped.get(step.dedupeKey);
    if (!existing) {
      deduped.set(step.dedupeKey, step);
      continue;
    }
    if (step.confidence > existing.confidence) {
      deduped.set(step.dedupeKey, {
        ...step,
        originalOrder: Math.min(existing.originalOrder, step.originalOrder),
      });
    } else if (
      step.confidence === existing.confidence &&
      step.originalOrder < existing.originalOrder
    ) {
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
      confidence: step.confidence,
    }));

  return {
    plan,
    diagnostics: plans.flatMap((p) => p.diagnostics),
    source: plans.length > 1 ? 'merged' : (plans[0]?.source ?? 'fast'),
  };
};

describe('Plan Merge & Deduplication', () => {
  const makeStep = (overrides: Partial<PlanStep> = {}): PlanStep => ({
    step: 1,
    action: 'create_task',
    input: { email_id: 'e1', title: 'Do homework' },
    reason: 'deadline',
    confidence: 0.9,
    ...overrides,
  });

  it('merges two plans into one', () => {
    const a: PlannerResult = {
      plan: [makeStep({ action: 'create_task' })],
      diagnostics: ['d1'],
      source: 'fast',
    };
    const b: PlannerResult = {
      plan: [makeStep({ action: 'archive_email' })],
      diagnostics: ['d2'],
      source: 'heavy',
    };
    const result = mergeAndDedupePlans([a, b]);

    expect(result.plan).toHaveLength(2);
    expect(result.source).toBe('merged');
    expect(result.diagnostics).toEqual(['d1', 'd2']);
  });

  it('deduplicates identical steps', () => {
    const step = makeStep();
    const a: PlannerResult = { plan: [step], diagnostics: [], source: 'fast' };
    const b: PlannerResult = {
      plan: [{ ...step }],
      diagnostics: [],
      source: 'heavy',
    };
    const result = mergeAndDedupePlans([a, b]);

    expect(result.plan).toHaveLength(1);
  });

  it('keeps the higher confidence step when deduplicating', () => {
    const low = makeStep({ confidence: 0.7 });
    const high = makeStep({ confidence: 0.95 });
    const a: PlannerResult = { plan: [low], diagnostics: [], source: 'fast' };
    const b: PlannerResult = { plan: [high], diagnostics: [], source: 'heavy' };
    const result = mergeAndDedupePlans([a, b]);

    expect(result.plan).toHaveLength(1);
    expect(result.plan[0]!.confidence).toBe(0.95);
  });

  it('preserves order from the first occurrence', () => {
    const step1 = makeStep({
      action: 'label_email',
      input: { email_id: 'e1', label: 'work' },
    });
    const step2 = makeStep({
      action: 'archive_email',
      input: { email_id: 'e2' },
    });
    const step3 = makeStep({
      action: 'create_task',
      input: { email_id: 'e3', title: 'Read paper' },
    });

    const a: PlannerResult = {
      plan: [step1, step3],
      diagnostics: [],
      source: 'fast',
    };
    const b: PlannerResult = {
      plan: [step2],
      diagnostics: [],
      source: 'heavy',
    };
    const result = mergeAndDedupePlans([a, b]);

    expect(result.plan[0]!.action).toBe('label_email');
    expect(result.plan[1]!.action).toBe('create_task');
    expect(result.plan[2]!.action).toBe('archive_email');
  });

  it('handles empty plans', () => {
    const result = mergeAndDedupePlans([
      { plan: [], diagnostics: [], source: 'fast' },
    ]);
    expect(result.plan).toHaveLength(0);
  });

  it('strips timestamp fields from dedup keys', () => {
    const a = makeStep({
      input: { email_id: 'e1', title: 'Test', created_at: '2024-01-01' },
    });
    const b = makeStep({
      input: { email_id: 'e1', title: 'Test', created_at: '2024-06-01' },
    });
    const planA: PlannerResult = { plan: [a], diagnostics: [], source: 'fast' };
    const planB: PlannerResult = {
      plan: [b],
      diagnostics: [],
      source: 'heavy',
    };
    const result = mergeAndDedupePlans([planA, planB]);

    // Should be deduped because created_at is stripped
    expect(result.plan).toHaveLength(1);
  });

  it('re-numbers steps sequentially after merge', () => {
    const steps = [1, 2, 3].map((i) =>
      makeStep({ action: `action_${i}` as any, input: { email_id: `e${i}` } })
    );
    const result = mergeAndDedupePlans([
      { plan: steps, diagnostics: [], source: 'fast' },
    ]);

    expect(result.plan.map((s) => s.step)).toEqual([1, 2, 3]);
  });
});
