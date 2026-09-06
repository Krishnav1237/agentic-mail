/**
 * The attention model's contract (`lib/attention.ts`).
 *
 * These tests exist to protect ONE property above all others: urgency and
 * importance are INDEPENDENT AXES. Every regression this module has
 * historically suffered was a collapse of that independence — an overdue
 * item silently losing its gold, a filter that couldn't express "both", a
 * count that treated the two as a partition. Each of those is asserted here
 * directly, so a future change that re-collapses the axes fails a test rather
 * than quietly changing what the product means.
 *
 * Behaviour, not implementation: nothing below reaches into how a value is
 * stored, only into what the exported functions answer.
 */
import { describe, expect, it } from 'vitest';
import {
  attentionFilterCount,
  attentionOr,
  attentionRank,
  escalateUrgency,
  EMPTY_ATTENTION_FILTER,
  isImportant,
  isUrgent,
  needsAttention,
  NORMAL_ATTENTION,
  passesAttentionFilter,
  summarizeAttention,
  type Attention,
} from './attention';

/** The four states the model can express, named once here so every test
 * below reads in the product's own vocabulary. */
const NORMAL: Attention = { urgency: 'normal', importance: 'normal' };
const URGENT: Attention = { urgency: 'urgent', importance: 'normal' };
const IMPORTANT: Attention = { urgency: 'normal', importance: 'important' };
const BOTH: Attention = { urgency: 'urgent', importance: 'important' };

describe('the two axes are independent', () => {
  it('expresses all four combinations distinctly', () => {
    expect([NORMAL, URGENT, IMPORTANT, BOTH].map(isUrgent)).toEqual([
      false,
      true,
      false,
      true,
    ]);
    expect([NORMAL, URGENT, IMPORTANT, BOTH].map(isImportant)).toEqual([
      false,
      false,
      true,
      true,
    ]);
  });

  it('treats either axis alone as needing attention, and neither as resting', () => {
    expect(needsAttention(NORMAL)).toBe(false);
    expect(needsAttention(URGENT)).toBe(true);
    expect(needsAttention(IMPORTANT)).toBe(true);
    expect(needsAttention(BOTH)).toBe(true);
  });

  it('resolves an absent value to fully normal, never to a fabricated level', () => {
    expect(attentionOr(undefined)).toEqual(NORMAL_ATTENTION);
    expect(attentionOr(BOTH)).toBe(BOTH);
  });
});

describe('attentionRank', () => {
  it('orders urgent+important → urgent → important → normal', () => {
    expect(attentionRank(BOTH)).toBe(0);
    expect(attentionRank(URGENT)).toBe(1);
    expect(attentionRank(IMPORTANT)).toBe(2);
    expect(attentionRank(NORMAL)).toBe(3);
  });

  it('sorts a mixed list into that order, loudest first', () => {
    const sorted = [NORMAL, IMPORTANT, BOTH, URGENT].sort(
      (a, b) => attentionRank(a) - attentionRank(b),
    );
    expect(sorted).toEqual([BOTH, URGENT, IMPORTANT, NORMAL]);
  });
});

describe('escalateUrgency', () => {
  it('raises urgency when a real deadline says the item is time-pressured', () => {
    expect(escalateUrgency(NORMAL, true)).toEqual(URGENT);
  });

  it('leaves importance untouched — a deadline says when, never how much', () => {
    // The exact regression the two-axis model was introduced to fix: under
    // the old single-level model, going overdue OVERWROTE `important` with
    // `urgent` and the mail silently stopped mattering.
    expect(escalateUrgency(IMPORTANT, true)).toEqual(BOTH);
  });

  it('only ever raises — nothing is quieted by an absent deadline', () => {
    expect(escalateUrgency(URGENT, false)).toEqual(URGENT);
    expect(escalateUrgency(BOTH, false)).toEqual(BOTH);
    expect(escalateUrgency(NORMAL, false)).toEqual(NORMAL);
  });

  it('treats an absent base as normal rather than throwing', () => {
    expect(escalateUrgency(undefined, false)).toEqual(NORMAL_ATTENTION);
    expect(escalateUrgency(undefined, true)).toEqual(URGENT);
  });
});

describe('summarizeAttention', () => {
  type Item = { attention: Attention; done?: boolean };
  const summarize = (items: Item[]) =>
    summarizeAttention(items, {
      isCompleted: (i) => Boolean(i.done),
      attentionOf: (i) => i.attention,
    });

  it('counts an item on both axes when it is both — the counts are not a partition', () => {
    const summary = summarize([
      { attention: URGENT },
      { attention: URGENT },
      { attention: IMPORTANT },
      { attention: IMPORTANT },
      { attention: IMPORTANT },
      { attention: BOTH },
      { attention: NORMAL },
      { attention: NORMAL },
      { attention: NORMAL },
      { attention: NORMAL },
    ]);
    expect(summary).toEqual({ activeCount: 10, urgentCount: 3, importantCount: 4 });
    // Deliberately does NOT sum to the total: the one `BOTH` item is a true
    // member of each count.
    expect(summary.urgentCount + summary.importantCount).not.toBe(summary.activeCount);
  });

  it('excludes completed items from every count, not just the total', () => {
    const summary = summarize([
      { attention: BOTH, done: true },
      { attention: URGENT, done: true },
      { attention: IMPORTANT },
      { attention: NORMAL },
    ]);
    expect(summary).toEqual({ activeCount: 2, urgentCount: 0, importantCount: 1 });
  });

  it('reports zeroes for an empty set rather than throwing', () => {
    expect(summarize([])).toEqual({ activeCount: 0, urgentCount: 0, importantCount: 0 });
  });
});

describe('passesAttentionFilter', () => {
  const filter = (urgency: Attention['urgency'][], importance: Attention['importance'][]) => ({
    urgency: new Set(urgency),
    importance: new Set(importance),
  });
  const matching = (f: ReturnType<typeof filter>) =>
    [NORMAL, URGENT, IMPORTANT, BOTH].filter((a) => passesAttentionFilter(a, f));

  it('constrains nothing when empty', () => {
    expect(matching(EMPTY_ATTENTION_FILTER())).toEqual([NORMAL, URGENT, IMPORTANT, BOTH]);
  });

  it('Urgent alone returns every urgent item INCLUDING the important ones', () => {
    // The old single-set filter could not express this: picking "Important"
    // silently excluded every important mail that had also gone urgent.
    expect(matching(filter(['urgent'], []))).toEqual([URGENT, BOTH]);
    expect(matching(filter([], ['important']))).toEqual([IMPORTANT, BOTH]);
  });

  it('intersects ACROSS axes — Urgent + Important narrows to exactly both', () => {
    expect(matching(filter(['urgent'], ['important']))).toEqual([BOTH]);
  });

  it('can ask for one axis while excluding the other', () => {
    expect(matching(filter(['urgent'], ['normal']))).toEqual([URGENT]);
    expect(matching(filter(['normal'], ['important']))).toEqual([IMPORTANT]);
  });

  it('unions WITHIN an axis', () => {
    expect(matching(filter(['urgent', 'normal'], []))).toEqual([
      NORMAL,
      URGENT,
      IMPORTANT,
      BOTH,
    ]);
  });

  it('counts active constraints across both axes for the "N applied" badge', () => {
    expect(attentionFilterCount(EMPTY_ATTENTION_FILTER())).toBe(0);
    expect(attentionFilterCount(filter(['urgent'], ['important']))).toBe(2);
    expect(attentionFilterCount(filter(['urgent', 'normal'], ['important']))).toBe(3);
  });
});
