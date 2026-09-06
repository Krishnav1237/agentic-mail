/**
 * Small, page-agnostic helpers for turning non-inbox data (an Approval, an
 * Action item, an Opportunity, or any other "this is basically an email"
 * record) into the shapes the canonical mail-detail system understands —
 * `StoredMailRow` (mailStore.ts) and `ThreadDetail` (workspaceData.ts).
 *
 * These used to be copy-pasted per page (Approvals had its own
 * `initialsOf`/recipient-parsing, Inbox's own `ThreadView` had another).
 * One copy here, imported everywhere, is what keeps "same underlying
 * read/unread state, same mail-detail UI" actually true instead of merely
 * visually similar.
 */
import { dayDiffFor } from './deadlineGroups';

/** This mailbox's own identity — every mock message is either sent to this
 * user or sent by them. Centralized here (rather than hardcoded separately
 * wherever "is this me?" or "who did I send this as?" comes up) so the
 * metadata popover's "me" detection and the Sent/Scheduled adapter (which
 * has to render *outgoing* mail as if it were a receivable row) can't drift
 * apart into two different addresses for the same person. */
export const CURRENT_USER_NAME = 'Alex Rivera';
export const CURRENT_USER_EMAIL = 'alex.rivera@gmail.com';

/** "PRIYA NATHAN <priya@meridianlabs.com>" -> the name/email pair the
 * canonical header expects. Falls back to using the whole string as the
 * name when it isn't in that "Name <email>" shape (e.g. a bare address). */
export function parseRecipient(raw: string): { name: string; email?: string } {
  const match = raw.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (!match) return { name: raw };
  const rawName = match[1].trim();
  const name = rawName ? rawName.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : match[2];
  return { name, email: match[2] };
}

/** Avatar fallback for senders outside the sample conversation. */
export function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase();
}

/** Plain-text preview from a composer's HTML content (e.g. for a Sent/
 * Scheduled list snippet).
 *
 * Parsed with `DOMParser`, not by assigning `innerHTML` to a detached div.
 * A detached div is still a live node: markup written into it is parsed by
 * the real HTML parser, so `<img src=x onerror=…>` fetches and fires. That
 * only ever mattered because this text isn't purely our own — the composer
 * is a `contentEditable`, so anything the user pastes into it (and, once a
 * backend supplies drafts, anything it sends) arrives here as markup.
 * `DOMParser` documents are inert by construction: no script execution, no
 * subresource loading, no event handlers. Still not a sanitizer — it's a
 * text extractor, and the extracted text is only ever rendered as text. */
export function stripHtml(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Caps a mail row's content preview at a fixed character budget, on a word
 * boundary, with a trailing ellipsis — a row is an overview, not the email
 * itself, so this is a hard ceiling rather than relying on the row's own
 * width (a wide row would otherwise still show two or three full sentences
 * before CSS truncation ever kicks in). CSS `text-overflow: ellipsis` stays
 * on the element as a responsive safety net for narrower widths; this is
 * what keeps the *un-clipped* case short too. */
export function truncatePreview(text: string, max = 130): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** "August 6, 2026, 3:43 PM" — the message-details popover's full Date row.
 * Uses the browser's own locale/timezone (same `toLocaleDateString`/
 * `toLocaleTimeString(undefined, {...})` convention `SchedulePopover` already
 * uses for its own date display), not a format hardcoded to one message.
 * Returns undefined for a missing/unparseable `iso` so the caller can omit
 * the row entirely rather than showing a fabricated date. */
export function formatFullDateTime(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const date = d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date}, ${time}`;
}

/** Compact, Gmail-style relative label for a row's rightmost "received"
 * column — "9:14a" for something that arrived today, "Yest.", "3d ago",
 * "2wk ago", "4mo ago", "1yr ago" beyond that. Computed fresh from the real
 * timestamp on every call, never stored or authored by hand — a message that
 * reads "3d ago" today has to read "4d ago" tomorrow without any app code
 * noticing or updating it, the same way a real inbox's dates keep working no
 * matter how long a message sits there. `now` only exists for testability;
 * every real caller lets it default to the actual current time. Returns
 * undefined for a missing/unparseable `iso`, matching `formatFullDateTime`'s
 * own contract, so a caller can omit the column entirely rather than show a
 * fabricated time. */
export function formatRelativeMailTime(iso?: string, now: Date = new Date()): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;

  // Calendar-day difference, not a raw ms/24h divide — otherwise "11:58pm
  // yesterday" (barely over an hour old) would misread as "2d ago" just for
  // straddling two midnights, while "12:05am today" (a full day older) would
  // misread as "today".
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round((startOfToday.getTime() - startOfDay.getTime()) / 86_400_000);

  if (dayDiff <= 0) {
    // Today (or, from clock skew, technically still "in the future") — plain
    // clock time, same "9:14a"/"2:35p" shorthand every same-day row uses.
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const suffix = hours >= 12 ? 'p' : 'a';
    hours = hours % 12 || 12;
    return `${hours}:${minutes}${suffix}`;
  }
  if (dayDiff === 1) return 'Yest.';
  if (dayDiff < 7) return `${dayDiff}d ago`;
  const weeks = Math.floor(dayDiff / 7);
  if (weeks < 5) return `${weeks}wk ago`;
  const months = Math.floor(dayDiff / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(dayDiff / 365);
  return `${years}yr ago`;
}

/** Which of Actions' five tiers a deadline belongs in, computed fresh
 * against the real current time on every call — never a bucket an author
 * hand-placed an item into once (the exact thing that made "Overdue"/
 * "Today" drift from reality the moment real time moved past whenever the
 * mock data was written). A missing/unparseable `dueDateIso` always reads
 * as `'noDeadline'`, the same tier a real backend record with nothing due
 * would belong in — never fabricated into a fake deadline. */
export type DueBucket = 'overdue' | 'today' | 'thisWeek' | 'later' | 'noDeadline';

export function dueBucketFor(dueDateIso: string | undefined, now: Date = new Date()): DueBucket {
  const dayDiff = dayDiffFor(dueDateIso, now);
  if (dayDiff === null) return 'noDeadline';
  if (dayDiff < 0) return 'overdue';
  if (dayDiff === 0) return 'today';
  if (dayDiff <= 7) return 'thisWeek';
  return 'later';
}

/**
 * THE one canonical string for "this mail has no deadline" — Actions,
 * Approvals and Opportunities all render exactly this, via `formatDueLabel`/
 * `formatClosingLabel` below, rather than each page inventing its own
 * fallback ("no rush", blank, an opportunity's own evergreen `timing` text,
 * even stray insight copy) for what is structurally the same state. Exported
 * so a caller can compare against it directly if it ever needs to, without
 * retyping the string.
 */
export const NO_DEADLINE_LABEL = 'No deadline given';

/** The label shown next to a due date — "2 days overdue", "due today",
 * "Tomorrow"/a weekday name within the coming week, "in N wks" beyond that,
 * or `NO_DEADLINE_LABEL` for a `noDeadline` item (or an unparseable date) —
 * the canonical deadline STATE (`bucket`, from `dueBucketFor`) decides which
 * branch runs; this function only ever turns that state into text, never
 * re-derives it. Computed fresh from `dueDateIso` on every call; pass the
 * same `now` used for `dueBucketFor` so the two can never disagree about
 * which day it is. */
export function formatDueLabel(
  dueDateIso: string | undefined,
  bucket: DueBucket,
  now: Date = new Date(),
): string {
  if (bucket === 'noDeadline') return NO_DEADLINE_LABEL;
  const dayDiff = dayDiffFor(dueDateIso, now);
  if (dayDiff === null) return NO_DEADLINE_LABEL;
  const due = new Date(dueDateIso!);

  switch (bucket) {
    case 'overdue': {
      const days = Math.abs(dayDiff);
      return `${days} day${days === 1 ? '' : 's'} overdue`;
    }
    case 'today':
      return 'due today';
    case 'thisWeek':
      // "Tomorrow" for the very next day, a short weekday name ("Thu")
      // otherwise — the same two label shapes This Week's items already
      // used, now derived instead of hand-picked per item.
      return dayDiff === 1 ? 'Tomorrow' : due.toLocaleDateString(undefined, { weekday: 'short' });
    case 'later': {
      const weeks = Math.max(1, Math.round(dayDiff / 7));
      return `in ${weeks} wks`;
    }
  }
}

/** The "closes in N days"-style label for an Opportunity with a real
 * closing date — computed fresh from `closesAtIso` on every call, never a
 * hand-typed string that would freeze at whatever was true the day the
 * record was written. Returns `NO_DEADLINE_LABEL` for an opportunity with no
 * real closing date (rolling/open-ended/recurring ones) — the same canonical
 * no-deadline text Actions/Approvals show via `formatDueLabel`, not that
 * item's own evergreen `timing` text (which is opportunity metadata, not a
 * deadline state, and stays available on the record for wherever it's
 * actually relevant to show — just not here). */
export function formatClosingLabel(closesAtIso: string | undefined, now: Date = new Date()): string {
  const dayDiff = dayDiffFor(closesAtIso, now);
  if (dayDiff === null) return NO_DEADLINE_LABEL;

  if (dayDiff < 0) return 'applications closed';
  if (dayDiff === 0) return 'closes today';
  if (dayDiff === 1) return 'closes tomorrow';
  if (dayDiff < 14) return `closes in ${dayDiff} days`;
  const weeks = Math.round(dayDiff / 7);
  return `in ${weeks} weeks`;
}

/** Splits a comma-joined recipient string ("Name <email>, Name2 <email2>")
 * into individual entries, trimmed, with empties dropped — used to render
 * multi-recipient To/Cc/Bcc rows as a real list instead of one run-on line. */
export function splitRecipients(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Whole days between `iso` and now, rounded up so a completion from a few
 * minutes ago still reads as "in the last 1 day" rather than "0 days" — the
 * window this backs (Actions/Opportunities/Approvals' shared completion
 * footer, Dashboard's automated-activity note) is a plain-language recency
 * window, not a precise duration. */
export function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

/** The "in the last N days" window for a set of completed rows — the oldest
 * `completedAt` among them, or `null` when none have one (nothing to date a
 * window by, so the caller should omit the phrase entirely rather than
 * show a fabricated number). One implementation shared by every page's
 * completion footer so "N days" always means the same thing everywhere. */
export function daysSinceOldest(items: Array<{ completedAt?: string }>): number | null {
  const timestamps = items.map((i) => i.completedAt).filter((d): d is string => Boolean(d));
  if (!timestamps.length) return null;
  const oldest = Math.min(...timestamps.map((d) => new Date(d).getTime()));
  return daysSince(new Date(oldest).toISOString());
}

/* Header counting used to live here as `summarizeActiveItems`, which let each
 * page pass its own `isUrgent`/`isImportant` predicates — and so let Actions
 * count "overdue", Opportunities count "closing soon" and Approvals count
 * "urgent" while all three believed they were reporting the same thing. It's
 * been replaced by `summarizeAttention` in `lib/attention.ts`, which takes one
 * `attentionOf` accessor and derives both counts from the single canonical
 * attention value. */
