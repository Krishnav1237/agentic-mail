import { describe, expect, test } from 'vitest';
import {
  URGENT_DEADLINE_DAYS,
  compareByDeadline,
  deadlineGroupFor,
  isUrgentByDeadline,
} from './deadlineGroups';

const NOW = new Date('2026-08-20T09:00:00');
const iso = (daysFromNow: number) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString();
};

describe('deadlineGroupFor', () => {
  test('a passed date is overdue', () => {
    expect(deadlineGroupFor(iso(-1), NOW)).toBe('overdue');
    expect(deadlineGroupFor(iso(-30), NOW)).toBe('overdue');
  });

  test('today through 7 days out is upcoming7', () => {
    expect(deadlineGroupFor(iso(0), NOW)).toBe('upcoming7');
    expect(deadlineGroupFor(iso(7), NOW)).toBe('upcoming7');
  });

  test('8 through 30 days out is upcoming30', () => {
    expect(deadlineGroupFor(iso(8), NOW)).toBe('upcoming30');
    expect(deadlineGroupFor(iso(30), NOW)).toBe('upcoming30');
  });

  test('beyond 30 days is later', () => {
    expect(deadlineGroupFor(iso(31), NOW)).toBe('later');
  });

  test('no deadline, or an unparseable one, is noDeadline', () => {
    expect(deadlineGroupFor(undefined, NOW)).toBe('noDeadline');
    expect(deadlineGroupFor('not-a-date', NOW)).toBe('noDeadline');
  });
});

describe('isUrgentByDeadline — the 3-day urgency window', () => {
  test('overdue is outside this forward-looking window (it escalates via isOverdueByDeadline instead)', () => {
    expect(isUrgentByDeadline(iso(-1), NOW)).toBe(false);
  });

  test('exactly at the boundary (URGENT_DEADLINE_DAYS out) is urgent', () => {
    expect(URGENT_DEADLINE_DAYS).toBe(3);
    expect(isUrgentByDeadline(iso(3), NOW)).toBe(true);
  });

  test('one day past the boundary is not urgent', () => {
    expect(isUrgentByDeadline(iso(4), NOW)).toBe(false);
  });

  test('inside the window (due today, due tomorrow) is urgent', () => {
    expect(isUrgentByDeadline(iso(0), NOW)).toBe(true);
    expect(isUrgentByDeadline(iso(1), NOW)).toBe(true);
  });

  test('outside the window is not urgent', () => {
    expect(isUrgentByDeadline(iso(10), NOW)).toBe(false);
  });

  test('no deadline is never urgent', () => {
    expect(isUrgentByDeadline(undefined, NOW)).toBe(false);
  });

  /**
   * Regression test for the previous Overdue-tier color bug.
   *
   * Root cause: the store used to bake deadline-driven urgency into
   * `baseAttention` exactly once, at hydrate time (`applyDeadlineEscalation`
   * inside `buildMailbox`, mailStore.ts), while each page's section grouping
   * (`dueBucketFor`/now `deadlineGroupFor`) recomputed live on every render.
   * A mail hydrated while its deadline was still outside the urgency window
   * could cross into that window later purely because wall-clock time
   * advanced — the section it rendered in updated on the next render, but its
   * stored `attention.urgency` never did, because nothing ever re-ran the
   * escalation.
   *
   * The fix (mailStore.ts's `refreshDerivedState`) makes urgency escalation a
   * pure function of the row's stored `deadlineIso` and the current time,
   * recomputed on every derive rather than frozen once. This test pins the
   * underlying property that fix depends on: the SAME deadline ISO must
   * escalate differently depending only on `now`, proving urgency isn't
   * something a single past computation can freeze.
   */
  test('the same deadline escalates as `now` moves closer to it, without any re-authoring', () => {
    const deadline = iso(4); // 4 days out from NOW — outside the window today
    const stillFar = NOW;
    const twoDaysLater = new Date(NOW);
    twoDaysLater.setDate(twoDaysLater.getDate() + 2); // now only 2 days out

    expect(isUrgentByDeadline(deadline, stillFar)).toBe(false);
    expect(isUrgentByDeadline(deadline, twoDaysLater)).toBe(true);
  });
});

describe('compareByDeadline', () => {
  test('sorts nearest deadline first', () => {
    const items = [iso(10), iso(0), iso(5)];
    expect([...items].sort(compareByDeadline)).toEqual([iso(0), iso(5), iso(10)]);
  });

  test('items with no deadline sort after every dated item', () => {
    const items = [undefined, iso(2), undefined, iso(1)];
    expect([...items].sort(compareByDeadline)).toEqual([iso(1), iso(2), undefined, undefined]);
  });
});
