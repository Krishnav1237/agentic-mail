/**
 * THE attention model. One semantic definition of "how much attention does
 * this need", for the whole product.
 *
 * Attention is TWO INDEPENDENT DIMENSIONS, not one ladder:
 *
 *   urgency:    urgent | normal     — "how soon does this require attention?"
 *   importance: important | normal  — "how much does this matter?"
 *
 * They answer different questions, so they never suppress each other. A mail
 * can have neither, either, or both, which yields exactly four states:
 *
 *   normal              not urgent, not important — nothing special
 *   important           matters, but no time pressure
 *   urgent              time-pressured, but not strategically important
 *   urgent + important  time-pressured AND it matters
 *
 * There is deliberately NO fourth level. "Urgent + important" is not a
 * classification anyone stores; it's just both flags being set, and every
 * ranking/count/visual below *derives* from the pair rather than reading a
 * combined enum. This is the correction to the earlier model, which collapsed
 * the two questions into one mutually-exclusive `urgent | important | normal`
 * field and so could not express "urgent but not important" or "important and
 * also due today" at all.
 *
 * `normal` on either axis does NOT mean unimportant or ignorable. It means
 * nothing about that dimension currently needs anything from you. That
 * distinction is why normal mail keeps full, comfortable text contrast
 * everywhere (see `components/workspace/attention.ts`): attention controls
 * *emphasis*, never *readability*.
 *
 * ATTENTION IS NOT STATUS. Workflow state (unread, needs action, waiting,
 * scheduled, completed), inbox category (Primary/Updates/Promotions) and
 * timing (overdue, closes in 3 days) are separate dimensions that answer
 * different questions, and they stay separate — a mail can be
 * `urgent + completed` or `normal + unread`. The one place timing legitimately
 * *feeds* attention is `escalateUrgency` below, and note that it feeds only
 * the URGENCY axis: a deadline says something about when, never about worth.
 *
 * Visual mapping (red = urgent, gold = important, tints, accent rails) lives
 * one layer up in `components/workspace/attention.ts` — this module stays free
 * of UI so the store and the counting logic can use it without importing
 * React.
 */

/** How soon this needs attention. Independent of {@link Importance}. */
export type Urgency = 'urgent' | 'normal';

/** How much this matters. Independent of {@link Urgency}. */
export type Importance = 'important' | 'normal';

/**
 * The canonical attention value every mail/workflow item carries: the pair,
 * always both axes, never a single collapsed level. Stored as one object so
 * "a record's attention" stays one field to thread through adapters, counts
 * and props — but the two axes inside it are read independently everywhere.
 */
export type Attention = {
  urgency: Urgency;
  importance: Importance;
};

/** The resting state — neither axis raised. The single value `undefined`
 * always resolves to (see {@link attentionOr}), so no page invents its own
 * default. */
export const NORMAL_ATTENTION: Attention = { urgency: 'normal', importance: 'normal' };

/* ------------------------------- Predicates ------------------------------- */

export function isUrgent(attention: Attention): boolean {
  return attention.urgency === 'urgent';
}

export function isImportant(attention: Attention): boolean {
  return attention.importance === 'important';
}

/** Whether either axis is raised — i.e. whether this item gets any attention
 * treatment at all (tint, rail, dot) and whether the header counts call it
 * out. Both axes `normal` is the resting state. */
export function needsAttention(attention: Attention): boolean {
  return isUrgent(attention) || isImportant(attention);
}

/** Normalizes a possibly-absent value. Absent always means fully normal —
 * never a fabricated level, and never a page-specific default. */
export function attentionOr(attention: Attention | undefined): Attention {
  return attention ?? NORMAL_ATTENTION;
}

/* -------------------------------- Labelling ------------------------------- */

/** The user-facing word for each axis value — the same word everywhere it's
 * written: filter menus, header counts, the style guide. Never "High", never
 * "Featured", never "Overdue" standing in for one of these. */
export const URGENCY_LABEL: Record<Urgency, string> = {
  urgent: 'Urgent',
  normal: 'Not urgent',
};

export const IMPORTANCE_LABEL: Record<Importance, string> = {
  important: 'Important',
  normal: 'Normal',
};

/** Lowercase forms for inline sentence use (header counts: "3 urgent"). */
export const URGENT_COUNT_LABEL = 'urgent';
export const IMPORTANT_COUNT_LABEL = 'important';

/**
 * The four states, loudest → quietest, for documentation surfaces only (the
 * Foundation style guide). This is a *display enumeration of combinations*,
 * not a taxonomy: nothing stores these keys, and no logic branches on them.
 */
export const ATTENTION_STATES: { key: string; label: string; attention: Attention }[] = [
  {
    key: 'urgent-important',
    label: 'Urgent + Important',
    attention: { urgency: 'urgent', importance: 'important' },
  },
  { key: 'urgent', label: 'Urgent', attention: { urgency: 'urgent', importance: 'normal' } },
  { key: 'important', label: 'Important', attention: { urgency: 'normal', importance: 'important' } },
  { key: 'normal', label: 'Normal', attention: NORMAL_ATTENTION },
];

/* -------------------------------- Ranking --------------------------------- */

/**
 * 0 = loudest. The one ranking every "which of these matters most" decision
 * uses — Dashboard's choice of which mails to surface, any attention sort —
 * so no page can invent its own precedence:
 *
 *   0  urgent + important
 *   1  urgent
 *   2  important
 *   3  normal
 *
 * DERIVED from the two axes, never stored. Urgency outranks importance
 * because urgency is what decides *what you look at first*; importance breaks
 * the tie within each urgency band.
 */
export function attentionRank(attention: Attention): number {
  return (isUrgent(attention) ? 0 : 2) + (isImportant(attention) ? 0 : 1);
}

/**
 * Raises a record's authored URGENCY to `urgent` when a real temporal fact
 * says it's time-pressured — an Action past its due date, an Opportunity
 * inside its closing window, an Approval past its respond-by.
 *
 * This is the ONE sanctioned path from timing into attention, and it touches
 * only the urgency axis. Importance passes through untouched, because a
 * deadline changes *when* something needs you, never *how much it matters* —
 * collapsing those was exactly the bug in the previous model, where an
 * overdue important mail silently lost its gold.
 *
 * Escalation only ever goes up: nothing is quieted by this.
 */
export function escalateUrgency(base: Attention | undefined, timePressured: boolean): Attention {
  const attention = attentionOr(base);
  return timePressured && !isUrgent(attention) ? { ...attention, urgency: 'urgent' } : attention;
}

/* ------------------------------- Counting -------------------------------- */

export type AttentionSummary = {
  /** The still-active (not completed) subset every count below derives from. */
  activeCount: number;
  /** Every active urgent item — urgent-only AND urgent+important. */
  urgentCount: number;
  /** Every active important item — important-only AND urgent+important. */
  importantCount: number;
};

/**
 * The one counting mechanism every page's header summary uses. Active-first,
 * then urgent/important derived from that *same* active subset — never from
 * the raw list — so a completed item can never inflate an open/urgent/
 * important total on any page.
 *
 * The two counts INTENTIONALLY OVERLAP. An urgent + important mail is counted
 * once as urgent and once as important, because each count answers its own
 * question ("how many need me soon?" / "how many matter?") and that mail is a
 * true member of both. So 10 active mails split 2 urgent-only, 3
 * important-only, 1 both and 4 normal reads "10 open · 3 urgent · 4
 * important" — the counts are not a partition and were never meant to sum to
 * the total.
 *
 * Each page still supplies `isCompleted` (an Approval's `completedAt` isn't
 * an Inbox row's) and `attentionOf` (how to reach the row behind an item),
 * but the mechanism itself lives here once.
 */
export function summarizeAttention<T>(
  items: T[],
  opts: {
    isCompleted: (item: T) => boolean;
    attentionOf: (item: T) => Attention;
  },
): AttentionSummary {
  let activeCount = 0;
  let urgentCount = 0;
  let importantCount = 0;
  for (const item of items) {
    if (opts.isCompleted(item)) continue;
    activeCount += 1;
    const attention = opts.attentionOf(item);
    if (isUrgent(attention)) urgentCount += 1;
    if (isImportant(attention)) importantCount += 1;
  }
  return { activeCount, urgentCount, importantCount };
}

/* -------------------------------- Filtering ------------------------------ */

/**
 * The one attention filter shape: two independent selections, one per axis.
 *
 * Independence is the whole point. Selecting `Urgent` alone returns every
 * urgent mail *including* the urgent + important ones; adding `Important`
 * narrows to only those that are both. The previous single-set filter could
 * not express either of those, because it treated the levels as alternatives.
 */
export type AttentionFilter = {
  urgency: Set<Urgency>;
  importance: Set<Importance>;
};

export const EMPTY_ATTENTION_FILTER = (): AttentionFilter => ({
  urgency: new Set(),
  importance: new Set(),
});

/** How many attention constraints are active — for "N filters applied"
 * badges, so pages don't each count the two sets by hand. */
export function attentionFilterCount(filter: AttentionFilter): number {
  return filter.urgency.size + filter.importance.size;
}

/** The one attention filter vocabulary. Any page offering an attention filter
 * renders exactly these, grouped by axis, with these labels. */
export const URGENCY_FILTER_OPTIONS: { key: Urgency; label: string }[] = [
  { key: 'urgent', label: URGENCY_LABEL.urgent },
  { key: 'normal', label: URGENCY_LABEL.normal },
];

export const IMPORTANCE_FILTER_OPTIONS: { key: Importance; label: string }[] = [
  { key: 'important', label: IMPORTANCE_LABEL.important },
  { key: 'normal', label: IMPORTANCE_LABEL.normal },
];

/**
 * Attention-filter predicate. Within an axis the selection is an OR (and an
 * empty selection means "no constraint on this axis"); ACROSS the two axes it
 * is an AND. That single rule produces every case the model needs:
 *
 *   {}                                  → everything
 *   {urgent}                            → urgent-only + urgent&important
 *   {important}                         → important-only + urgent&important
 *   {urgent} × {important}              → only urgent & important
 *   {urgent} × {normal importance}      → only urgent, not important
 *   {not urgent} × {important}          → only important, not urgent
 *
 * Shared so "filtered by Urgent" can't mean something subtly different on two
 * pages.
 */
export function passesAttentionFilter(attention: Attention, filter: AttentionFilter): boolean {
  const urgencyOk = filter.urgency.size === 0 || filter.urgency.has(attention.urgency);
  const importanceOk = filter.importance.size === 0 || filter.importance.has(attention.importance);
  return urgencyOk && importanceOk;
}
