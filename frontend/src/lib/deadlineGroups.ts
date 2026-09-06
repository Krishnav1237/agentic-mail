/**
 * Shared chronological grouping + urgency-window constants for Actions,
 * Opportunities and Approvals.
 *
 * Before this module, each page invented its own section headings (Actions
 * hardcoded five JSX tier labels, Opportunities grouped by a hand-authored
 * `groupId`/prose heading with no relationship to time, Approvals had a
 * single static shelf) and its own read of "how soon is soon" (Opportunities'
 * `isClosingSoon` defaulted to 3 days, Actions/Approvals treated "overdue" as
 * the trigger for red). One deterministic model, used by all three, is what
 * makes "Overdue" and "urgent" mean the same thing everywhere instead of each
 * page drawing its own boundary.
 *
 * Rolling windows throughout, consistent with `dueBucketFor`'s existing
 * rolling 7-day "this week" (`lib/mailAdapters.ts`) rather than calendar-week/
 * calendar-month boundaries — the two would otherwise disagree about which
 * bucket a date one week out lands in depending on where in the month "now"
 * happens to fall.
 */

/** A future deadline inside this many days (inclusive) counts as urgent — see
 * `isUrgentByDeadline`. Not (yet) user-configurable, but named and imported
 * everywhere the threshold is used rather than the literal `3`, so the
 * eventual preference has exactly one call site to read from. */
export const URGENT_DEADLINE_DAYS = 3;

/**
 * How many full calendar days must pass after a user's own outbound message,
 * with nothing back, before Follow-ups may treat it as a candidate.
 *
 * A DIFFERENT product concept from `URGENT_DEADLINE_DAYS` above, even though
 * both happen to be 3 today: that constant counts down to a deadline someone
 * else set (an offer expiring, an application closing); this one counts up
 * from something the user sent, with no deadline involved at all. Named and
 * imported at its own call site (`agentPreferences.ts`'s `isFollowUpCandidate`)
 * rather than reusing the urgency constant, so the two can diverge the moment
 * either one needs to without a shared magic number silently coupling them.
 */
export const FOLLOW_UP_WAIT_DAYS = 3;

/**
 * Rolling windows from the current moment — deliberately NOT calendar
 * periods. "This week"/"This month" read as calendar-week/calendar-month to
 * a reader, which is ambiguous (does "this week" reset on Sunday? the 1st of
 * the month?) and was never what the underlying math computed anyway — it
 * was always "N days from now," not "before the calendar page turns." The
 * names below say exactly that instead of implying a calendar boundary that
 * doesn't exist.
 */
export type DeadlineGroup =
  | 'overdue'
  | 'upcoming7'
  | 'upcoming30'
  | 'later'
  | 'noDeadline';

/** Display order every page's sections render in, top to bottom. */
export const DEADLINE_GROUP_ORDER: DeadlineGroup[] = [
  'overdue',
  'upcoming7',
  'upcoming30',
  'later',
  'noDeadline',
];

/** The one heading string per group — identical wherever it's used, never a
 * page-specific label. */
export const DEADLINE_GROUP_LABEL: Record<DeadlineGroup, string> = {
  overdue: 'Overdue',
  upcoming7: 'Upcoming 7 Days',
  upcoming30: 'Upcoming 30 Days',
  later: 'Later',
  // Matches `mailAdapters.ts`'s `NO_DEADLINE_LABEL` verbatim — the same fact
  // ("this item has no deadline") used to read differently as a section
  // heading ("No deadline — still tracked") than as a row's own label ("No
  // deadline given"), visible side-by-side on the same page (Actions, e.g.).
  // One concept, one label, everywhere.
  noDeadline: 'No deadline given',
};

/** Calendar-day difference between a deadline and `now` — null for a missing
 * or unparseable ISO string, never a fabricated number. Both sides zeroed to
 * midnight first: a deadline is a day, not a 24-hour window, so 11:58pm and
 * 12:05am on the same calendar day can't land in different groups just
 * because one crossed midnight relative to `now` and the other didn't.
 *
 * THE ONE PLACE THIS MATH HAPPENS. `mailAdapters.ts`'s `dueBucketFor`,
 * `formatDueLabel` and `formatClosingLabel` all import and call this rather
 * than each re-deriving its own day-diff — three independent copies of the
 * identical calculation used to exist, which is exactly the kind of
 * duplication that lets a boundary-case fix land in one and silently miss
 * the other two. Exported so every "how many days until/since" question in
 * the app, section-grouping or label text alike, is one function call
 * against the same fact. */
export function dayDiffFor(iso: string | undefined, now: Date): number | null {
  if (!iso) return null;
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return null;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return Math.round((startOfDue.getTime() - startOfToday.getTime()) / 86_400_000);
}

/**
 * Which of the five shared sections a deadline belongs in — computed fresh
 * against the real current time on every call, never a bucket assigned once
 * and left to go stale. `now` only exists for testability; every real caller
 * lets it default to the actual current time.
 *
 * Rolling windows, not calendar periods — "the next 7 days from right now,"
 * never "the rest of this calendar week":
 *
 *   overdue     — deadline has already passed (dayDiff < 0)
 *   upcoming7   — deadline is in the next 7 days (0 <= dayDiff <= 7, today included)
 *   upcoming30  — more than 7 days away but within the next 30 (8 <= dayDiff <= 30)
 *   later       — more than 30 days away (dayDiff > 30)
 *   noDeadline  — no parseable deadline; still active/tracked, just undated
 */
export function deadlineGroupFor(
  iso: string | undefined,
  now: Date = new Date(),
): DeadlineGroup {
  const dayDiff = dayDiffFor(iso, now);
  if (dayDiff === null) return 'noDeadline';
  if (dayDiff < 0) return 'overdue';
  if (dayDiff <= 7) return 'upcoming7';
  if (dayDiff <= 30) return 'upcoming30';
  return 'later';
}

/**
 * Whether a deadline is urgent by the FORWARD-LOOKING window — a future
 * deadline inside `URGENT_DEADLINE_DAYS`. Deliberately excludes overdue: this
 * function only answers "is it inside the countdown window", not "does it
 * deserve the urgent/red treatment" — overdue deadlines get that treatment
 * too (overdue is a subset of urgent, see `attention.ts`'s module doc), just
 * via `isOverdueByDeadline` instead, since a passed deadline was never inside
 * a future countdown window in the first place. Callers that want the full
 * "does this deadline make the row urgent" answer check both (see
 * `mailStore.ts`'s `refreshDerivedState`).
 *
 * Boundary semantics:
 *   overdue     — deadline has passed (dayDiff < 0) — see `isOverdueByDeadline`
 *   urgent      — 0 <= dayDiff <= URGENT_DEADLINE_DAYS (today counts)
 *   non-urgent  — dayDiff > URGENT_DEADLINE_DAYS, or no deadline at all
 *
 * Computed fresh from `iso`/`now` on every call — this is what lets the same
 * stored deadline correctly stop being urgent, or start being urgent, purely
 * because time passed, without anything re-authoring the record.
 */
export function isUrgentByDeadline(
  iso: string | undefined,
  now: Date = new Date(),
): boolean {
  const dayDiff = dayDiffFor(iso, now);
  return dayDiff !== null && dayDiff >= 0 && dayDiff <= URGENT_DEADLINE_DAYS;
}

/**
 * Whether a deadline has already passed — the fact that puts a mail in the
 * Overdue section AND (alongside `isUrgentByDeadline`) escalates its
 * `attention.urgency` to `urgent` in `mailStore.ts`'s `refreshDerivedState`.
 * The counterpart to `isUrgentByDeadline`, and the one other place
 * `dayDiffFor` is read from outside this module — one fact feeding both the
 * section a mail renders in and its own card's urgency treatment, rather than
 * two conditions that could disagree.
 */
export function isOverdueByDeadline(
  iso: string | undefined,
  now: Date = new Date(),
): boolean {
  const dayDiff = dayDiffFor(iso, now);
  return dayDiff !== null && dayDiff < 0;
}

/** Ascending-by-deadline comparator for sorting a group's items nearest-
 * deadline-first — an item with no deadline sorts after every dated one
 * (there is nothing to rank it against, so it falls to the end rather than
 * arbitrarily to the front). Ties keep their original relative order
 * (`Array.prototype.sort` is stable), never a fabricated tiebreak. */
export function compareByDeadline(aIso: string | undefined, bIso: string | undefined): number {
  const aTime = aIso ? new Date(aIso).getTime() : NaN;
  const bTime = bIso ? new Date(bIso).getTime() : NaN;
  const aValid = !Number.isNaN(aTime);
  const bValid = !Number.isNaN(bTime);
  if (aValid && bValid) return aTime - bTime;
  if (aValid) return -1;
  if (bValid) return 1;
  return 0;
}
