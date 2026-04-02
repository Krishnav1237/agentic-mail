import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Replicate the validate middleware logic for isolated testing
const runValidation = (schema: z.ZodTypeAny, payload: unknown) => {
  const result = schema.safeParse(payload);
  if (!result.success) {
    return { ok: false as const, error: result.error.flatten() };
  }
  return { ok: true as const, data: result.data };
};

const emailSchema = z.object({
  email: z.string().email(),
});

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['pending', 'processed', 'all']).default('all'),
});

const goalsSchema = z.object({
  goals: z
    .array(
      z.object({
        goal: z.string().min(1).max(500),
        weight: z.number().min(0).max(10),
      })
    )
    .min(1)
    .max(20),
  autopilotLevel: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  personalityMode: z.enum(['chill', 'proactive', 'aggressive']),
});

describe('Zod Input Validation', () => {
  describe('email validation', () => {
    it('accepts a valid email', () => {
      const result = runValidation(emailSchema, { email: 'test@example.com' });
      expect(result.ok).toBe(true);
    });

    it('rejects an invalid email', () => {
      const result = runValidation(emailSchema, { email: 'not-an-email' });
      expect(result.ok).toBe(false);
    });

    it('rejects missing email', () => {
      const result = runValidation(emailSchema, {});
      expect(result.ok).toBe(false);
    });

    it('rejects empty string', () => {
      const result = runValidation(emailSchema, { email: '' });
      expect(result.ok).toBe(false);
    });
  });

  describe('pagination validation', () => {
    it('applies defaults when no params given', () => {
      const result = runValidation(paginationSchema, {});
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.limit).toBe(20);
        expect(result.data.offset).toBe(0);
        expect(result.data.status).toBe('all');
      }
    });

    it('accepts valid numeric strings (from query params)', () => {
      const result = runValidation(paginationSchema, {
        limit: '50',
        offset: '10',
        status: 'pending',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.limit).toBe(50);
        expect(result.data.offset).toBe(10);
      }
    });

    it('rejects limit above max', () => {
      const result = runValidation(paginationSchema, { limit: '200' });
      expect(result.ok).toBe(false);
    });

    it('rejects negative offset', () => {
      const result = runValidation(paginationSchema, { offset: '-1' });
      expect(result.ok).toBe(false);
    });

    it('rejects invalid status enum', () => {
      const result = runValidation(paginationSchema, { status: 'invalid' });
      expect(result.ok).toBe(false);
    });
  });

  describe('goals validation', () => {
    it('accepts valid goals', () => {
      const result = runValidation(goalsSchema, {
        goals: [{ goal: 'Stay on top of deadlines', weight: 5 }],
        autopilotLevel: 1,
        personalityMode: 'proactive',
      });
      expect(result.ok).toBe(true);
    });

    it('rejects empty goals array', () => {
      const result = runValidation(goalsSchema, {
        goals: [],
        autopilotLevel: 0,
        personalityMode: 'chill',
      });
      expect(result.ok).toBe(false);
    });

    it('rejects invalid autopilot level', () => {
      const result = runValidation(goalsSchema, {
        goals: [{ goal: 'test', weight: 1 }],
        autopilotLevel: 5,
        personalityMode: 'proactive',
      });
      expect(result.ok).toBe(false);
    });

    it('rejects invalid personality mode', () => {
      const result = runValidation(goalsSchema, {
        goals: [{ goal: 'test', weight: 1 }],
        autopilotLevel: 0,
        personalityMode: 'turbo',
      });
      expect(result.ok).toBe(false);
    });

    it('rejects weight out of range', () => {
      const result = runValidation(goalsSchema, {
        goals: [{ goal: 'test', weight: 25 }],
        autopilotLevel: 0,
        personalityMode: 'chill',
      });
      expect(result.ok).toBe(false);
    });
  });
});
