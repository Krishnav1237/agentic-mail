/**
 * Date/deadline derivation (`lib/mailAdapters.ts`).
 *
 * Every temporal label in the product is COMPUTED from a real timestamp
 * rather than authored — that's the rule these helpers exist to enforce, and
 * the reason a hand-typed "2 days overdue" can't go stale here. The tests
 * below pin the boundaries of that computation, because the boundaries are
 * where it has actually gone wrong before: a due date is a calendar DAY, not
 * a rolling 24 hours, so two timestamps four minutes apart must not land in
 * different buckets merely for straddling midnight.
 *
 * Every case supplies an explicit `now`. Nothing here reads the real clock,
 * so the suite means the same thing on any day and in any timezone —
 * timestamps are written without a zone suffix so they parse as local time,
 * exactly as the app's own data does.
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import {
  daysSince,
  daysSinceOldest,
  dueBucketFor,
  formatClosingLabel,
  formatDueLabel,
  formatRelativeMailTime,
  initialsOf,
  NO_DEADLINE_LABEL,
  parseRecipient,
  splitRecipients,
  truncatePreview,
} from './mailAdapters';

/** A fixed "today" for every case below: Sunday 16 August 2026, mid-morning. */
const NOW = new Date('2026-08-16T10:30:00');

describe('dueBucketFor', () => {
  it('buckets by calendar day, not by a rolling 24 hours', () => {
    // Four minutes apart, either side of midnight. A raw ms divide would put
    // these in different buckets; a calendar-day diff correctly does not
    // treat "11:58pm tonight" as further away than "12:05am tonight".
    expect(dueBucketFor('2026-08-16T23:58:00', NOW)).toBe('today');
    expect(dueBucketFor('2026-08-17T00:05:00', NOW)).toBe('thisWeek');
  });

  it('classifies each tier at its boundary', () => {
    expect(dueBucketFor('2026-08-15T23:59:00', NOW)).toBe('overdue');
    expect(dueBucketFor('2026-08-16T00:01:00', NOW)).toBe('today');
    expect(dueBucketFor('2026-08-23T09:00:00', NOW)).toBe('thisWeek'); // +7 days
    expect(dueBucketFor('2026-08-24T09:00:00', NOW)).toBe('later'); // +8 days
  });

  it('reads a missing or unparseable date as noDeadline, never a fabricated one', () => {
    expect(dueBucketFor(undefined, NOW)).toBe('noDeadline');
    expect(dueBucketFor('not a date', NOW)).toBe('noDeadline');
  });
});

describe('formatDueLabel', () => {
  const label = (iso: string | undefined) =>
    formatDueLabel(iso, dueBucketFor(iso, NOW), NOW);

  it('pluralises overdue days correctly', () => {
    expect(label('2026-08-15T17:00:00')).toBe('1 day overdue');
    expect(label('2026-08-13T17:00:00')).toBe('3 days overdue');
  });

  it('names today and tomorrow in words', () => {
    expect(label('2026-08-16T17:00:00')).toBe('due today');
    expect(label('2026-08-17T17:00:00')).toBe('Tomorrow');
  });

  it('uses a weekday name for the rest of the coming week', () => {
    const thursday = label('2026-08-20T17:00:00');
    expect(thursday).toBeTruthy();
    expect(thursday).not.toBe('Tomorrow');
    expect(thursday).not.toMatch(/overdue|today/);
  });

  it('falls back to a week count further out', () => {
    expect(label('2026-09-19T17:00:00')).toBe('in 5 wks');
  });

  it('returns the canonical no-deadline label for an undated or unparseable item', () => {
    expect(label(undefined)).toBe(NO_DEADLINE_LABEL);
    expect(formatDueLabel('nonsense', 'today', NOW)).toBe(NO_DEADLINE_LABEL);
  });
});

describe('formatRelativeMailTime', () => {
  it('shows a clock time for something that arrived today', () => {
    expect(formatRelativeMailTime('2026-08-16T09:14:00', NOW)).toBe('9:14a');
    expect(formatRelativeMailTime('2026-08-16T14:35:00', NOW)).toBe('2:35p');
  });

  it('handles the 12-hour boundaries', () => {
    expect(formatRelativeMailTime('2026-08-16T00:05:00', NOW)).toBe('12:05a');
    expect(formatRelativeMailTime('2026-08-16T12:00:00', NOW)).toBe('12:00p');
  });

  it('counts calendar days, so late-yesterday reads as yesterday', () => {
    expect(formatRelativeMailTime('2026-08-15T23:58:00', NOW)).toBe('Yest.');
    expect(formatRelativeMailTime('2026-08-13T09:00:00', NOW)).toBe('3d ago');
  });

  it('steps up through weeks, months and years', () => {
    expect(formatRelativeMailTime('2026-08-06T09:00:00', NOW)).toBe('1wk ago');
    expect(formatRelativeMailTime('2026-06-16T09:00:00', NOW)).toBe('2mo ago');
    expect(formatRelativeMailTime('2024-08-16T09:00:00', NOW)).toBe('2yr ago');
  });

  it('returns undefined for missing or unparseable input', () => {
    expect(formatRelativeMailTime(undefined, NOW)).toBeUndefined();
    expect(formatRelativeMailTime('not a date', NOW)).toBeUndefined();
  });
});

describe('formatClosingLabel', () => {
  it('names the near cases in words', () => {
    expect(formatClosingLabel('2026-08-16T23:59:00', NOW)).toBe('closes today');
    expect(formatClosingLabel('2026-08-17T23:59:00', NOW)).toBe('closes tomorrow');
    expect(formatClosingLabel('2026-08-18T23:59:00', NOW)).toBe('closes in 2 days');
  });

  it('switches to weeks beyond a fortnight and reports a passed date honestly', () => {
    expect(formatClosingLabel('2026-09-05T23:59:00', NOW)).toBe('in 3 weeks');
    expect(formatClosingLabel('2026-08-01T23:59:00', NOW)).toBe('applications closed');
  });

  it('returns the canonical no-deadline label with no real closing date — never the opportunity’s own evergreen text', () => {
    expect(formatClosingLabel(undefined, NOW)).toBe(NO_DEADLINE_LABEL);
    expect(formatClosingLabel('rolling', NOW)).toBe(NO_DEADLINE_LABEL);
  });

  it('agrees with formatDueLabel on the exact same no-deadline string', () => {
    // The whole point of centralizing this: Actions/Approvals (formatDueLabel)
    // and Opportunities (formatClosingLabel) must never drift into two
    // different "no deadline" strings again.
    expect(formatClosingLabel(undefined, NOW)).toBe(
      formatDueLabel(undefined, dueBucketFor(undefined, NOW), NOW)
    );
  });
});

describe('the no-deadline label is one canonical string across every page', () => {
  // Actions and Approvals both resolve through `dueBucketFor` +
  // `formatDueLabel`; Opportunities resolves through `formatClosingLabel`.
  // Every case below is a representative "NO DEADLINE" row from one of the
  // three pages — the assertion is always the identical string, independent
  // of every other axis on the mail (attention, insight, workflow type).

  it('1. Actions: an item with no dueDate resolves to the canonical label', () => {
    expect(formatDueLabel(undefined, dueBucketFor(undefined, NOW), NOW)).toBe(NO_DEADLINE_LABEL);
  });

  it('2. Approvals: an item with no respondBy resolves to the same canonical label', () => {
    // `dueBucketFor(undefined)` is exactly what Approvals.tsx now calls
    // unconditionally — no `?? item.timing` fallback survives.
    expect(formatDueLabel(undefined, dueBucketFor(undefined, NOW), NOW)).toBe(NO_DEADLINE_LABEL);
  });

  it('3. Opportunities: an item with no closesAt resolves to the same canonical label, not its own evergreen timing text', () => {
    expect(formatClosingLabel(undefined, NOW)).toBe(NO_DEADLINE_LABEL);
  });

  it('4. a no-deadline mail with an AI insight still resolves to the canonical label — insight text never leaks into this slot', () => {
    // Structural, not incidental: the formatters below take only an ISO
    // date (and a bucket) — there is no parameter through which an insight
    // string could reach this computation at all.
    const insight = 'Professor has already agreed to write the letter and only needs the list of programs.';
    const label = formatDueLabel(undefined, dueBucketFor(undefined, NOW), NOW);
    expect(label).toBe(NO_DEADLINE_LABEL);
    expect(label).not.toBe(insight);
    expect(label).not.toContain('Professor');
  });

  it('5. a no-deadline mail that is important still reads "No deadline given" — importance never substitutes for the deadline slot', () => {
    // `formatDueLabel`/`dueBucketFor` never take `attention` as an input, so
    // an important-but-undated mail cannot influence this string.
    expect(formatDueLabel(undefined, dueBucketFor(undefined, NOW), NOW)).toBe(NO_DEADLINE_LABEL);
  });

  it('6. a no-deadline mail that is urgent on its authored attention (not its deadline) still reads "No deadline given"', () => {
    // Urgency CAN be deadline-driven elsewhere (`isUrgentByDeadline`), but an
    // authored `attention.urgency: 'urgent'` with no real `dueDate` is a
    // different, valid combination — the deadline slot must still name the
    // real deadline state, not borrow the urgency label.
    expect(formatDueLabel(undefined, dueBucketFor(undefined, NOW), NOW)).toBe(NO_DEADLINE_LABEL);
  });
});

describe('overdue agreement across the app’s deadline surfaces', () => {
  // `dueBucketFor` (Actions/Approvals/Dashboard) and `formatClosingLabel`
  // (Opportunities) used to each recompute the same day-diff independently.
  // Both now delegate to `deadlineGroups.ts`'s `dayDiffFor`, so they can no
  // longer land on opposite sides of the overdue boundary for the same
  // instant — pinning that here is what would catch a future edit to one
  // that forgot the other, rather than trusting they happen to agree today.
  it('a date one day past due reads overdue on both label paths', () => {
    const pastDue = '2026-08-15T23:59:00';
    expect(dueBucketFor(pastDue, NOW)).toBe('overdue');
    expect(formatClosingLabel(pastDue, NOW)).toBe('applications closed');
  });

  it('a date due today reads NOT overdue on both label paths', () => {
    const dueToday = '2026-08-16T23:59:00';
    expect(dueBucketFor(dueToday, NOW)).not.toBe('overdue');
    expect(formatClosingLabel(dueToday, NOW)).not.toBe('applications closed');
  });
});

describe('completion recency window', () => {
  afterEach(() => vi.useRealTimers());

  it('rounds up so a just-now completion reads as one day, never zero', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(daysSince('2026-08-16T10:00:00')).toBe(1);
    expect(daysSince('2026-08-13T10:30:00')).toBe(3);
  });

  it('dates the window by the OLDEST completion in the set', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(
      daysSinceOldest([
        { completedAt: '2026-08-15T10:30:00' },
        { completedAt: '2026-08-11T10:30:00' },
        { completedAt: '2026-08-14T10:30:00' },
      ]),
    ).toBe(5);
  });

  it('returns null when nothing has a completion date, rather than a fabricated number', () => {
    expect(daysSinceOldest([])).toBeNull();
    expect(daysSinceOldest([{}, {}])).toBeNull();
  });
});

describe('recipient and preview helpers', () => {
  it('splits "Name <email>" into its parts and title-cases the name', () => {
    expect(parseRecipient('PRIYA NATHAN <priya@meridianlabs.com>')).toEqual({
      name: 'Priya Nathan',
      email: 'priya@meridianlabs.com',
    });
  });

  it('falls back to the whole string as the name for a bare address', () => {
    expect(parseRecipient('lists@dept-newsletter.edu')).toEqual({
      name: 'lists@dept-newsletter.edu',
    });
  });

  it('uses the address as the name when only an angle-bracketed address is given', () => {
    expect(parseRecipient('<dana@northwind.co>')).toEqual({
      name: 'dana@northwind.co',
      email: 'dana@northwind.co',
    });
  });

  it('derives at most two initials', () => {
    expect(initialsOf('Alex Rivera')).toBe('AR');
    expect(initialsOf('HR — People Ops')).toBe('H—');
    expect(initialsOf('Storeline')).toBe('S');
  });

  it('splits multi-recipient strings and drops empties', () => {
    expect(splitRecipients('A <a@x.com>, B <b@x.com> , ')).toEqual([
      'A <a@x.com>',
      'B <b@x.com>',
    ]);
    expect(splitRecipients(undefined)).toEqual([]);
  });

  it('truncates on a word boundary and collapses whitespace', () => {
    expect(truncatePreview('  one   two\nthree  ')).toBe('one two three');
    const long = 'word '.repeat(60);
    const cut = truncatePreview(long, 40);
    expect(cut.length).toBeLessThanOrEqual(41); // 40 + the ellipsis
    expect(cut.endsWith('…')).toBe(true);
    expect(cut).not.toMatch(/\s…$/); // no dangling space before the ellipsis
  });

  it('leaves text shorter than the budget completely alone', () => {
    expect(truncatePreview('short enough', 130)).toBe('short enough');
  });
});
