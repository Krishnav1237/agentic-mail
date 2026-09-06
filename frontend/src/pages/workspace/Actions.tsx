import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';
import {
  attentionSegments,
  importanceSwatchStyle,
  urgencySwatchStyle,
  AttentionDot,
  AttentionRail,
  attentionInsightColor,
  attentionVisual,
  attentionWeight,
  Button,
  deadlineMetaColor,
  DURATION,
  EASE,
  EmptyState,
  ExpandingSearch,
  Eyebrow,
  getPortalRoot,
  Group,
  HeaderCountSummary,
  InteractiveRow,
  isTinted,
  MailThreadView,
  Reveal,
  ShelfHeading,
  Stagger,
  useOutsideClose,
  usePopoverPosition,
  WorkspacePage,
} from '../../components/workspace';
import {
  attentionFilterCount,
  EMPTY_ATTENTION_FILTER,
  IMPORTANCE_FILTER_OPTIONS,
  NORMAL_ATTENTION,
  passesAttentionFilter,
  summarizeAttention,
  URGENCY_FILTER_OPTIONS,
  type Attention,
  type AttentionFilter,
} from '../../lib/attention';
import { ACTIONS_INTRO, type ActionItem } from '../../lib/workspaceData';
import { useWorkflowStore, workflowActions } from '../../lib/workflowStore';
import {
  mailActions,
  useMailStore,
  type StoredMailRow,
} from '../../lib/mailStore';
import { toBodyContent } from '../../lib/mailContent';
import {
  dueBucketFor,
  formatDueLabel,
  formatRelativeMailTime,
  truncatePreview,
} from '../../lib/mailAdapters';
import {
  compareByDeadline,
  DEADLINE_GROUP_LABEL,
  DEADLINE_GROUP_ORDER,
  deadlineGroupFor,
  type DeadlineGroup,
} from '../../lib/deadlineGroups';

/**
 * Actions — where work gets completed (Design Constitution §16). No unnecessary
 * context: the page opens looking finished rather than configurable.
 *
 * TWO DIMENSIONS, kept apart:
 *
 *   Time  → the five sections (Overdue / Upcoming 7 days / Upcoming 30 days /
 *           Later / No deadline — still tracked) — the SAME grouping
 *           Opportunities and Approvals use (`deadlineGroupFor`,
 *           `lib/deadlineGroups.ts`), never a page-specific set of labels.
 *           Rolling windows from right now, never calendar-week/calendar-
 *           month boundaries — "Upcoming 7 days" says exactly what it means
 *           where "This week" would leave a reader guessing which day it
 *           resets. Purely temporal, computed from each item's `dueDate`. It
 *           says WHEN, not how much.
 *   Attention → the row's red/gold/neutral treatment, read from the backing
 *           mail's one canonical `attention` field (see `lib/attention.ts`).
 *           It says HOW MUCH, not when.
 *
 * These used to be tangled together three ways at once: a HIGH/MED/LOW tag
 * ladder, a `gold` boolean, and the Overdue tier's own rust treatment, each
 * claiming to express importance and each drawn differently. All three are
 * gone. A deadline inside the shared urgency window (`URGENT_DEADLINE_DAYS`)
 * now feeds the one shared attention value, derived fresh in the store on
 * every read (`refreshDerivedState`) rather than baked in once — see
 * `mailStore.ts`'s `StoredMailRow.baseAttention` for why that used to go
 * stale. Overdue is deliberately NOT part of that escalation: it stays its
 * own distinct, calmer state (see the Overdue section below), communicated by
 * the section heading rather than by every card under it.
 *
 * Density still tapers with distance (handoff 7a): Overdue is a card,
 * Upcoming 7 days/Upcoming 30 days are compact rows, Later/No deadline are
 * single lines. What does NOT taper is readability — every tier's text sits
 * on the same shared ladder, and no color anywhere in this file is a
 * function of list index.
 *
 * Interaction, search and filtering reuse the shared Foundation system end to
 * end: rows are real buttons carrying the `.obligo-action-row` token recipe, and
 * the filter popover reuses the `.obligo-menu`/`.obligo-option` pattern.
 */

const TRUNCATE: CSSProperties = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

type GroupKey = DeadlineGroup;

/** The Time facet's options are exactly the five shared sections — the same
 * enum, the same labels, the same order every page's headings use — so
 * filtering by "Upcoming 30 days" can never mean something subtly different
 * from the section named "Upcoming 30 days" two lines below it. */
const TIME_OPTIONS: { key: DeadlineGroup; label: string }[] =
  DEADLINE_GROUP_ORDER.map((key) => ({ key, label: DEADLINE_GROUP_LABEL[key] }));

/** Three facets, three genuinely different questions: how soon this needs
 * attention (urgency), how much it matters (importance), and when it's due
 * (time). Facets combine with AND, values within a facet with OR.
 *
 * Urgency and importance are SEPARATE facets, not values in one list — that's
 * the whole correction. As one mutually-exclusive facet, "Urgent" and
 * "Important" were alternatives, so there was no way to ask for mail that is
 * both, and picking "Important" silently excluded every important mail that
 * had gone urgent. As two facets they compose: Urgent alone returns every
 * urgent item including the important ones, and Urgent + Important narrows to
 * exactly the intersection. See `passesAttentionFilter` for the rule.
 *
 * There was a fourth — Status (needs decision / prepared / waiting /
 * completed) — but it had no real field behind it: it was *derived* from
 * attention plus a regex over the reason text, so "Needs decision" was
 * essentially "not normal" spelled a second way and "Completed" never matched
 * anything in the open list at all. A filter that re-asks the attention
 * question in different words is exactly the kind of duplicate vocabulary
 * this model exists to remove, so it's gone. If a real workflow-state field
 * ever lands on `ActionItem`, it can come back as a genuine facet. */
type Filters = AttentionFilter & { time: Set<DeadlineGroup> };
const EMPTY_FILTERS = (): Filters => ({
  ...EMPTY_ATTENTION_FILTER(),
  time: new Set(),
});

/** Everything this page's search contract covers, each resolved against the
 * ONE canonical source for that field rather than a page-local copy: the
 * item's own title, the backing mail's Obligo insight (its "description" — the
 * same text the row previews and the opened mail shows in full), and the
 * mail's real sender/address/subject as its source.
 *
 * "Source" used to be regex-scraped out of a `from: X ·` prefix hand-typed
 * into each item's `reason` string, so search could only find items whose
 * author had remembered to type that prefix. The backing mail has a real
 * sender and a real address; there was never a reason to parse prose. */
function matchesQuery(
  item: ActionItem,
  row: StoredMailRow | undefined,
  insight: string,
  query: string
): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return [
    item.title,
    insight,
    row?.sender ?? '',
    row?.senderEmail ?? '',
    row?.subject ?? '',
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function passesFilters(
  item: ActionItem,
  row: StoredMailRow | undefined,
  insight: string,
  group: GroupKey,
  attention: Attention,
  filters: Filters,
  query: string
): boolean {
  if (!matchesQuery(item, row, insight, query)) return false;
  if (!passesAttentionFilter(attention, filters)) return false;
  if (filters.time.size && !filters.time.has(group)) return false;
  return true;
}

/** Shown in the insight slot when Obligo genuinely has nothing to say about an
 * item — distinguished by *italic*, not by being faded into invisibility, so
 * it reads as "checked, nothing found" while staying legible. */
const NO_INSIGHT_TEXT = 'no insight for this one';

/**
 * The shared preview/insight line every mail-backed row uses — real email
 * content on the left, Obligo's insight in its own slot on the right. Every tier
 * (`ContextRow`/`CompactRow`/`MinimalRow`) goes through this one component so
 * "This Week" and "Later" can't silently drop the structure just because
 * they're visually quieter than Overdue/Today.
 *
 * THE INSIGHT HERE IS A PREVIEW, NOT THE ONLY COPY. It is the backing mail's
 * one canonical insight (`ThreadDetail.insight`), truncated — the same text
 * the opened mail shows in full in its own Obligo Insight section. This slot used
 * to show a second, Action-only `reason` string instead, which is how a reader
 * could see Obligo's take on a row here and then find nothing at all after
 * opening it.
 *
 * A mail with no insight still gets `NO_INSIGHT_TEXT` in its slot rather than
 * an empty gap — that's a real, distinctly-styled signal that Obligo evaluated
 * the item and found nothing worth surfacing, not a fabricated insight and not
 * a silent hole where one might belong. (The opened mail makes the opposite
 * choice for the same fact — it renders no section at all — because a list
 * needs its columns to line up down the page and a document doesn't.) Renders
 * nothing at all only when there isn't even a preview (no backing mail).
 *
 * Both colors come from the caller as shared ladder tokens (or, for the
 * insight, the one attention palette). Neither is ever computed from a list
 * index — real email content stays readable in every tier.
 */
function DetailLine({
  preview,
  insight,
  fontSize,
  marginTop,
  previewColor,
  insightColor,
  insightWeight = 400,
}: {
  preview?: string;
  insight?: string;
  fontSize: number;
  marginTop: number;
  previewColor: string;
  insightColor: string;
  insightWeight?: number;
}) {
  if (!preview && !insight) return null;
  return (
    // Fixed thirds: preview gets half the row, a quiet quarter of breathing
    // room, then Obligo's insight (or its placeholder) in the last quarter.
    <div style={{ display: 'flex', alignItems: 'baseline', marginTop }}>
      {preview && (
        <span
          style={{
            ...TRUNCATE,
            flex: '0 1 50%',
            minWidth: 0,
            font: `400 calc(var(--type-scale, 1) * ${fontSize}px)/1.3 Inter, sans-serif`,
            color: previewColor,
          }}
        >
          {truncatePreview(preview)}
        </span>
      )}
      <span aria-hidden style={{ flex: '0 0 25%' }} />
      <span
        style={{
          ...TRUNCATE,
          flex: '0 1 25%',
          minWidth: 0,
          font: `${insight ? insightWeight : 400} calc(var(--type-scale, 1) * ${fontSize}px)/1.3 Inter, sans-serif`,
          fontStyle: insight ? undefined : 'italic',
          // The placeholder is set apart by italics, not by dropping to a
          // barely-visible 0.28 alpha the way it used to be.
          color: insight ? insightColor : 'var(--text-muted)',
        }}
      >
        {insight ? truncatePreview(insight) : NO_INSIGHT_TEXT}
      </span>
    </div>
  );
}

/** Real email content preview for a row's backing message, if it has one —
 * the actual last message body from the canonical thread, never `row.snippet`
 * and never the mail's insight (Obligo's words, not the sender's). */
function previewFor(row: StoredMailRow | undefined): string | undefined {
  const detail = row ? mailActions.getThreadDetail(row.id) : undefined;
  const body = detail?.messages[detail.messages.length - 1]?.body;
  // The plain-text side specifically: a row preview is one truncated line, so
  // it reads the text representation even when the message also has HTML.
  return body === undefined ? undefined : toBodyContent(body).text;
}

/** The backing mail's ONE canonical Obligo insight — the same lookup, and so the
 * same text, the opened mail renders in full. An Action no more carries an
 * insight of its own than it carries an attention of its own: both belong to
 * the mail behind it. Empty when Obligo has nothing to say about that mail. */
function insightFor(row: StoredMailRow | undefined): string {
  return (row ? mailActions.getThreadDetail(row.id)?.insight : '') ?? '';
}

/**
 * The high-attention row, used for the Overdue section — the tallest, most
 * present tier. Title + a due signal + the preview/insight line.
 *
 * Its attention treatment (wash, border, accent rail, insight color) comes
 * entirely from `attention`, the backing mail's one canonical value — never
 * from which section it happens to be in. Being overdue DOES by itself make a
 * row read red: overdue escalates urgency the same as being inside the
 * forward-looking urgency window does (see `lib/deadlineGroups.ts`'s
 * `isOverdueByDeadline` and `mailStore.ts`'s `refreshDerivedState`), so every
 * item in this section carries the same coral wash the Overdue heading above
 * it does.
 */
function ContextRow({
  item,
  row,
  attention,
  tall,
  selected,
  onToggle,
}: {
  item: ActionItem;
  /** The backing message, when this item has one — sender/subject/preview/
   * unread all come from here (the shared mail store), not from `item`
   * itself, so this row agrees with every other page reading the same row. */
  row?: StoredMailRow;
  attention: Attention;
  /** Overdue/Today get the taller card treatment; the tier decides height
   * (a density choice), attention decides color (a semantic one). */
  tall: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  const unread = row?.unread ?? false;
  const preview = previewFor(row);
  const insight = insightFor(row);
  // Computed fresh from `item.dueDate` every render — never a hand-typed
  // "2 days overdue"/"due today" string that would freeze at whatever was
  // true the day this record was written.
  const dueBucket = dueBucketFor(item.dueDate);
  const dueLabel = formatDueLabel(item.dueDate, dueBucket);
  const tinted = isTinted(attention);

  return (
    <InteractiveRow
      selected={selected}
      aria-pressed={selected}
      onClick={onToggle}
      visual={attentionVisual(attention, 'card')}
      style={{
        position: 'relative',
        gap: 14,
        height: tall ? 58 : 50,
        padding: '0 14px',
        borderRadius: 11,
        overflow: 'hidden',
      }}
    >
      <AttentionRail attention={attention} />

      {/* Unread (neutral) and attention (coral/gold) are separate dots — see
          `AttentionDot`. The unread dot's shade is fixed everywhere. */}
      <AttentionDot
        style={{ alignSelf: 'center' }}
        attention={attention}
        unread={unread}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          {row?.sender && (
            <span
              style={{
                ...TRUNCATE,
                flex: 'none',
                maxWidth: '32%',
                font: `${attentionWeight(attention)} calc(var(--type-scale, 1) * ${tall ? 13.5 : 13}px) Inter, sans-serif`,
                color: 'var(--text-strong)',
              }}
            >
              {row.sender}
            </span>
          )}
          <span
            style={{
              ...TRUNCATE,
              flex: '1 1 auto',
              minWidth: 0,
              font: `${row?.sender ? 400 : 500} calc(var(--type-scale, 1) * ${tall ? 13.5 : 13}px) Inter, sans-serif`,
              color: row?.sender ? 'var(--text)' : 'var(--text-strong)',
            }}
          >
            {item.title}
          </span>
          {/* The due label is timing metadata, anchored to the row's far
              right regardless of how long the sender/title happen to be
              (`marginLeft: 'auto'` — the same technique Approvals' and
              Opportunities' own timing labels already use, and Dashboard's
              deadline label was given when it was added). It used to sit
              directly after the title with no positioning of its own, which
              read fine only because this page's sample titles happen to be
              short; a longer real one would have pushed it wherever the
              title's own text ended, nowhere near the row's edge.
              Colored via the shared `deadlineMetaColor` — see its own doc
              comment for why it takes an explicit `overdue` flag even though
              an overdue row's `attention.urgency` already reads `urgent`
              here. ContextRow only ever renders Overdue-group items now, so
              there's no other bucket to exclude. */}
          {dueLabel && dueBucket === 'overdue' && (
            <span
              className="obligo-mono"
              style={{
                flex: 'none',
                marginLeft: 'auto',
                font: '500 calc(var(--type-scale, 1) * 10px) "JetBrains Mono", monospace',
                color: deadlineMetaColor(attention, true),
              }}
            >
              {dueLabel}
            </span>
          )}
        </div>
        <DetailLine
          preview={preview}
          insight={insight}
          fontSize={tall ? 10.5 : 10}
          marginTop={tall ? 3 : 2}
          previewColor="var(--text-secondary)"
          insightColor={attentionInsightColor(attention)}
          insightWeight={tinted ? 500 : 400}
        />
      </div>
    </InteractiveRow>
  );
}

/**
 * Upcoming 7 days / Upcoming 30 days — a compact list row rather than a card:
 * distance from Overdue means this tier doesn't demand attention on its own,
 * so it carries a lighter surface. Hover still lifts it into a card via the
 * shared recipe.
 *
 * Density drops here; the attention language does not. An `important` item
 * landing in Upcoming 7 days gets the same gold rail and wash it would get
 * in Overdue, just at `row` intensity — importance doesn't stop being true
 * because the deadline is further out.
 */
function CompactRow({
  item,
  row,
  attention,
  last,
  selected,
  onToggle,
}: {
  item: ActionItem;
  row?: StoredMailRow;
  attention: Attention;
  last: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  const unread = row?.unread ?? false;
  // Same canonical-thread lookup Overdue/Today use — the row stays thinner
  // here, but the underlying mail information hierarchy (preview + insight)
  // doesn't get to disappear just because this tier is quieter.
  const preview = previewFor(row);
  const insight = insightFor(row);
  const hasDetail = Boolean(preview || insight);
  const tinted = isTinted(attention);
  // Computed fresh from `item.dueDate` every render — never a hand-typed
  // weekday string that would stop matching the actual day of the week.
  // CompactRow only ever renders Upcoming 7/30 days items, so `dueBucket`
  // is never actually `'overdue'` in practice — computed properly rather
  // than assumed, so `deadlineMetaColor` below stays correct even if that
  // ever changes, instead of a hardcoded `false` quietly going stale.
  const dueBucket = dueBucketFor(item.dueDate);
  const dueLabel = formatDueLabel(item.dueDate, dueBucket);

  return (
    <InteractiveRow
      selected={selected}
      aria-pressed={selected}
      onClick={onToggle}
      visual={attentionVisual(attention, 'row')}
      style={{
        position: 'relative',
        gap: 14,
        height: hasDetail ? 52 : 40,
        paddingInline: 14,
        borderRadius: 8,
        overflow: tinted ? 'hidden' : undefined,
        borderBottom:
          !tinted && !last ? '1px solid rgb(var(--ink) / 0.06)' : undefined,
      }}
    >
      <AttentionRail attention={attention} />
      <AttentionDot attention={attention} unread={unread} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span
            style={{
              ...TRUNCATE,
              flex: 1,
              minWidth: 0,
              font: `${attentionWeight(attention)} calc(var(--type-scale, 1) * 12.5px) Inter, sans-serif`,
              color: 'var(--text)',
            }}
          >
            {row?.sender && (
              <span style={{ color: 'var(--text-secondary)' }}>
                {row.sender} —{' '}
              </span>
            )}
            {item.title}
          </span>
          {dueLabel && (
            <span
              className="obligo-mono"
              style={{
                flex: 'none',
                marginLeft: 'auto',
                font: '400 calc(var(--type-scale, 1) * 9.5px) "JetBrains Mono", monospace',
                color: deadlineMetaColor(attention, dueBucket === 'overdue'),
              }}
            >
              {dueLabel}
            </span>
          )}
        </div>
        <DetailLine
          preview={preview}
          insight={insight}
          fontSize={10}
          marginTop={2}
          previewColor="var(--text-secondary)"
          insightColor={attentionInsightColor(attention)}
          insightWeight={tinted ? 500 : 400}
        />
      </div>
    </InteractiveRow>
  );
}

/**
 * Later / No deadline (and the Completed footer) — the quietest tier: one
 * line, no resting surface for a normal item. Distance is expressed by
 * dropping the card and shrinking the row, NOT by fading the text: this tier
 * used to compute `titleAlpha = 0.68 - index * 0.05`, which made the fourth
 * item in "Later" nearly unreadable purely for being fourth. It now reads on
 * the same ladder as every other tier.
 *
 * A completed row always has `normal` attention (`mailActions.complete`), so
 * the Completed footer — which renders through this same component — never
 * picks up a rail or wash.
 */
function MinimalRow({
  item,
  row,
  attention,
  last,
  selected,
  onToggle,
}: {
  item: ActionItem;
  row?: StoredMailRow;
  attention: Attention;
  last: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  const unread = row?.unread ?? false;
  const preview = previewFor(row);
  const insight = insightFor(row);
  const hasDetail = Boolean(preview || insight);
  const tinted = isTinted(attention);
  // Two different "when" questions, both computed fresh rather than read off
  // a hand-typed string: a completed row shows how long ago `completedAt`
  // was, a still-pending row shows its own `dueDate`'s label (nothing at all
  // for a genuinely undated item). MinimalRow only ever renders Later/No
  // deadline items — `dueBucket` is never actually `'overdue'` here in
  // practice, computed properly rather than assumed for the same reason
  // CompactRow does.
  const dueBucket = dueBucketFor(item.dueDate);
  const dueLabel = row?.completedAt
    ? formatRelativeMailTime(row.completedAt)
    : formatDueLabel(item.dueDate, dueBucket);

  return (
    <InteractiveRow
      selected={selected}
      aria-pressed={selected}
      onClick={onToggle}
      visual={attentionVisual(attention, 'row')}
      style={{
        position: 'relative',
        gap: 14,
        height: hasDetail ? 44 : 30,
        paddingInline: 14,
        borderRadius: 8,
        overflow: tinted ? 'hidden' : undefined,
        borderBottom:
          !tinted && !last ? '1px solid rgb(var(--ink) / 0.05)' : undefined,
      }}
    >
      <AttentionRail attention={attention} />
      <AttentionDot attention={attention} unread={unread} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span
            style={{
              ...TRUNCATE,
              flex: 1,
              minWidth: 0,
              font: `400 calc(var(--type-scale, 1) * 12px) Inter, sans-serif`,
              color: 'var(--text)',
            }}
          >
            {row?.sender && (
              <span style={{ color: 'var(--text-secondary)' }}>
                {row.sender} —{' '}
              </span>
            )}
            {item.title}
          </span>
          {dueLabel && (
            <span
              className="obligo-mono"
              style={{
                flex: 'none',
                marginLeft: 'auto',
                font: '400 calc(var(--type-scale, 1) * 9.5px) "JetBrains Mono", monospace',
                // A completed row's `dueLabel` is a "completed N days ago"
                // recency note, never a deadline — never colored as overdue
                // regardless of what the original `dueDate` was.
                color: deadlineMetaColor(
                  attention,
                  !row?.completedAt && dueBucket === 'overdue'
                ),
              }}
            >
              {dueLabel}
            </span>
          )}
        </div>
        <DetailLine
          preview={preview}
          insight={insight}
          fontSize={9.5}
          marginTop={2}
          previewColor="var(--text-muted)"
          insightColor={attentionInsightColor(attention)}
        />
      </div>
    </InteractiveRow>
  );
}

/** A sub-heading inside a facet — used for Urgency and Importance, the two
 * axes grouped under the single "Attention" heading. Quieter and more indented
 * than the facet heading above it, so the menu reads as one Attention section
 * containing two lists rather than as two unrelated facets. */
function FacetGroup({ label }: { label: string }) {
  return (
    <div style={{ padding: '4px 8px 3px 10px' }}>
      <span
        style={{
          font: '500 calc(var(--type-scale, 1) * 9.5px) "JetBrains Mono", monospace',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}
      >
        {label}
      </span>
    </div>
  );
}

/** One checkable row inside the filter popover — reuses `.obligo-option`'s hover
 * treatment; the check mirrors Select's own "value is active" indicator. */
function FilterOption({
  label,
  active,
  swatch,
  onToggle,
}: {
  label: string;
  active: boolean;
  /** Optional color chip shown before the label — the attention axes use it so
   * the filter's entries carry the same coral/gold/neutral marks the rows do,
   * rather than being identical text lines. Coral appears only under Urgency
   * and gold only under Importance, which is the color rule stated as UI. */
  swatch?: ReactNode;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="obligo-option"
      role="menuitemcheckbox"
      aria-checked={active}
      data-selected={active}
      onClick={onToggle}
    >
      <span
        aria-hidden
        style={{
          width: 13,
          height: 13,
          flex: 'none',
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: `1px solid rgb(var(--ink) / ${active ? 0 : 0.18})`,
          background: active ? 'rgb(var(--ink) / 0.82)' : 'transparent',
          transition: 'background-color 0.14s ease, border-color 0.14s ease',
        }}
      >
        {active && (
          <Check size={9} strokeWidth={3} color="var(--paper)" aria-hidden />
        )}
      </span>
      {swatch}
      <span style={{ flex: 1 }}>{label}</span>
    </button>
  );
}

/**
 * Filter — facets that answer genuinely different questions, combining with
 * AND across facets and OR within one.
 *
 * Attention is presented as ONE heading with TWO independently-selectable
 * groups under it, Urgency and Importance, because that's exactly what the
 * model is: one concept, two axes. The words and swatch colors are the global
 * vocabulary — coral Urgent, gold Important — the same ones the rows
 * themselves use, so a filter chip and a row can never disagree about what a
 * color means.
 *
 * Deliberately still one compact menu, not a configuration panel: two short
 * grouped lists reusing the existing `FilterOption` checkbox rows, no new
 * interaction paradigm.
 */
function FilterMenu({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
}) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  // Portalled below (same reasoning as `Select`'s listbox) so the panel
  // escapes Actions' own `--content-scale` page zoom instead of inheriting
  // it on top of the shared menu chrome's own `--ui-scale` sizing —
  // `popoverRef` is passed as the extra "inside" node since it's no longer
  // a DOM descendant of the trigger.
  const triggerRef = useOutsideClose<HTMLButtonElement>(
    open,
    () => setOpen(false),
    popoverRef
  );
  const position = usePopoverPosition(triggerRef, popoverRef, open);
  const activeCount = attentionFilterCount(filters) + filters.time.size;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // Keyboard-initiated close returns focus to the trigger (matches
      // `Select`'s own Escape behavior) — a dismissing outside click doesn't.
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, triggerRef]);

  function toggleIn<T>(set: Set<T>, key: T): Set<T> {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  }

  return (
    <div className="obligo-select">
      <button
        ref={triggerRef}
        type="button"
        className="obligo-icon-btn obligo-chip-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={
          {
            height: 28,
            gap: 6,
            padding: '0 10px',
            borderRadius: 8,
            font: '400 calc(var(--type-scale, 1) * 11px) Inter, sans-serif',
            '--chip-color': activeCount
              ? 'var(--text-strong)'
              : 'var(--text-secondary)',
            '--chip-bg': activeCount
              ? 'rgb(var(--ink) / 0.06)'
              : 'rgb(var(--ink) / 0.03)',
            '--chip-border': `rgb(var(--ink) / ${activeCount ? 0.12 : 0.07})`,
          } as CSSProperties
        }
      >
        Filter{activeCount > 0 ? ` · ${activeCount}` : ''}
        <ChevronDown
          size={11}
          strokeWidth={1.6}
          aria-hidden
          style={{
            opacity: 0.6,
            transform: open ? 'rotate(180deg)' : undefined,
            transition: 'transform 0.2s var(--ease)',
          }}
        />
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={popoverRef}
              role="menu"
              aria-label="Filter actions"
              className="obligo-menu"
              style={{ width: 200, minWidth: 200, zIndex: 70, ...position }}
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.16, ease: EASE }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 8px 6px',
                }}
              >
                <Eyebrow alpha={0.55}>Attention</Eyebrow>
                {activeCount > 0 && (
                  <button
                    type="button"
                    className="obligo-icon-btn obligo-chip-btn"
                    onClick={() => onChange(EMPTY_FILTERS())}
                    style={
                      {
                        font: '400 calc(var(--type-scale, 1) * 10px) Inter, sans-serif',
                        '--chip-color': 'var(--text-faint)',
                      } as CSSProperties
                    }
                  >
                    Clear all
                  </button>
                )}
              </div>
              {/* Two groups under one Attention heading. Selecting across
                  them intersects (Urgent + Important = only both); selecting
                  within one unions; selecting neither constrains nothing. */}
              <FacetGroup label="Urgency" />
              {URGENCY_FILTER_OPTIONS.map((opt) => (
                <FilterOption
                  key={`urgency-${opt.key}`}
                  label={opt.label}
                  swatch={
                    <span aria-hidden style={urgencySwatchStyle(opt.key)} />
                  }
                  active={filters.urgency.has(opt.key)}
                  onToggle={() =>
                    onChange({
                      ...filters,
                      urgency: toggleIn(filters.urgency, opt.key),
                    })
                  }
                />
              ))}

              <FacetGroup label="Importance" />
              {IMPORTANCE_FILTER_OPTIONS.map((opt) => (
                <FilterOption
                  key={`importance-${opt.key}`}
                  label={opt.label}
                  swatch={
                    <span aria-hidden style={importanceSwatchStyle(opt.key)} />
                  }
                  active={filters.importance.has(opt.key)}
                  onToggle={() =>
                    onChange({
                      ...filters,
                      importance: toggleIn(filters.importance, opt.key),
                    })
                  }
                />
              ))}

              <div style={{ padding: '8px 8px 6px' }}>
                <Eyebrow alpha={0.55}>Time</Eyebrow>
              </div>
              {TIME_OPTIONS.map((opt) => (
                <FilterOption
                  key={opt.key}
                  label={opt.label}
                  active={filters.time.has(opt.key)}
                  onToggle={() =>
                    onChange({
                      ...filters,
                      time: toggleIn(filters.time, opt.key),
                    })
                  }
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>,
        getPortalRoot()
      )}
    </div>
  );
}

export default function Actions() {
  const workflow = useWorkflowStore();
  const store = useMailStore();

  /** Open items only, split off the one canonical array — completed Actions
   * play no further part on this page at all (see the dedicated Completed
   * page, `pages/workspace/Completed.tsx`, for the unified terminal-state
   * view).
   *
   * Resolution is read from the backing MAIL ROW, not the Action record —
   * that's the shared signal every page's counts agree on, and it's what
   * `mailActions.complete` writes. */
  const pending = useMemo(
    () =>
      workflow.actions.filter((item) => {
        const resolved =
          item.completedAt ||
          (item.mailId &&
            store.rows.find((r) => r.id === item.mailId)?.completedAt);
        return !resolved;
      }),
    [workflow.actions, store.rows]
  );

  // The five sections are derived from each item's own `dueDate` via the one
  // grouping every workflow page shares (`deadlineGroupFor`,
  // `lib/deadlineGroups.ts`) — never read off a hand-picked array. A real
  // backend's due dates move through these groups on their own as real time
  // passes; this is what makes that happen instead of an item staying stuck
  // in one section forever. Within each group, items sort nearest-deadline-
  // first (`compareByDeadline`) rather than in whatever order they happen to
  // appear in `pending`.
  //
  // Keyed on `pending`, not on nothing. This memo used to carry an empty
  // dependency array, which was correct only while the source was a frozen
  // module constant: the moment Actions arrive asynchronously — or one is
  // completed — an empty-dep memo returns the very first bucketing forever
  // and the page silently stops reflecting its own data.
  const { overdue, upcoming7, upcoming30, later, noDeadline } = useMemo(() => {
    const buckets: Record<DeadlineGroup, ActionItem[]> = {
      overdue: [],
      upcoming7: [],
      upcoming30: [],
      later: [],
      noDeadline: [],
    };
    for (const item of pending) {
      buckets[deadlineGroupFor(item.dueDate)].push(item);
    }
    for (const group of DEADLINE_GROUP_ORDER) {
      buckets[group].sort((a, b) => compareByDeadline(a.dueDate, b.dueDate));
    }
    return buckets;
  }, [pending]);

  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const location = useLocation();
  // Which underlying email is open, if any — a handful of Action items are
  // really "this specific email" (`mailId`), so clicking them opens the
  // exact same canonical mail-detail view Inbox/Approvals use instead of
  // just toggling this row's cosmetic selection state. Dashboard (and
  // anywhere else) can also deep-link straight to one by navigating here
  // with `state: { openMailId }` — read synchronously into the initial
  // state (rather than set from a post-mount effect) so the thread view is
  // what AnimatePresence renders on the very first paint, not a key-swap
  // that fights the page's own enter transition and leaves it stuck
  // mid-fade.
  const [openMailId, setOpenMailId] = useState<string | null>(
    () => (location.state as { openMailId?: string } | null)?.openMailId ?? null
  );
  const reduced = useReducedMotion();

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** A row with `mailId` opens mail instead of toggling selection — every
   * Action item carries one now, so this is universal: the cosmetic
   * `toggleSelect` fallback only remains for a future item that genuinely
   * isn't backed by a message. */
  const onRowActivate = (item: ActionItem) =>
    item.mailId ? setOpenMailId(item.mailId) : toggleSelect(item.id);

  /** Every group's items, not just Overdue — the rail (and the set of things
   * that are actually openable) has to include Upcoming 7 days/Upcoming 30
   * days/Later/No deadline too, or those items silently can't be opened at
   * all. */
  const allItems = useMemo(
    () => [...overdue, ...upcoming7, ...upcoming30, ...later, ...noDeadline],
    [overdue, upcoming7, upcoming30, later, noDeadline]
  );
  const mailItems = useMemo(() => allItems.filter((a) => a.mailId), [allItems]);

  /** The open Actions, resolved to store rows.
   *
   * Memoized on the inputs it's derived from. This used to be a bare
   * expression: a brand-new array every render, which made `rowById` below a
   * brand-new Map every render, which in turn invalidated all five
   * `filterTier` memos — so every `useMemo` downstream was doing the full
   * filter pass anyway, on every keystroke, while looking like it was
   * cached. */
  const activeMailRows = useMemo(
    () =>
      mailItems
        .map((a) => store.rows.find((r) => r.id === a.mailId))
        .filter((r): r is StoredMailRow => Boolean(r)),
    [mailItems, store.rows]
  );
  /** Keyed for O(1) access from each row renderer below — every row's
   * sender/subject/preview/unread state comes from here, the one shared
   * store, rather than each tier re-deriving its own text. */
  const rowById = useMemo(
    () => new Map(activeMailRows.map((r) => [r.id, r])),
    [activeMailRows]
  );
  const rowFor = (item: ActionItem) =>
    item.mailId ? rowById.get(item.mailId) : undefined;
  /** An Action's attention IS its backing mail's attention — one value, read
   * from the shared store, never re-derived here. Deadline pressure is
   * already folded into it upstream (see `applyDeadlineEscalation` in
   * `mailStore.ts`), which is why an overdue item comes back `urgent` without
   * this page owning any rule of its own about what overdue means. */
  const attentionFor = (item: ActionItem): Attention =>
    rowFor(item)?.attention ?? NORMAL_ATTENTION;

  // The header's "N open · N urgent · N important" — the shared mechanism,
  // the shared words, the same `attention` field the rows render. "Overdue"
  // is no longer a header word: overdue items are counted as urgent, which
  // is what they now genuinely are everywhere in the app, rather than a
  // count only this page knew how to produce.
  const headerCounts = useMemo(
    () =>
      summarizeAttention(allItems, {
        // Defensive: an item's own array membership already means "still
        // pending", but resolving against the live store means a row
        // completed through some other path can never inflate this count.
        // Read through `rowById` — the same O(1) lookup every row renderer
        // uses — rather than a linear `store.rows.find` per item per axis.
        isCompleted: (item) => Boolean(rowFor(item)?.completedAt),
        attentionOf: (item) => rowFor(item)?.attention ?? NORMAL_ATTENTION,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allItems, rowById]
  );

  /** Stable across renders that change none of its real inputs, so the five
   * per-tier memos below can list it as a dependency honestly instead of
   * suppressing the lint rule and hand-maintaining a deps list that had
   * already drifted (`rowById` was listed, `attentionFor`/`insightFor`'s own
   * inputs weren't). */
  const filterTier = useCallback(
    (items: ActionItem[], group: GroupKey) =>
      items.filter((a) => {
        const row = a.mailId ? rowById.get(a.mailId) : undefined;
        return passesFilters(
          a,
          row,
          insightFor(row),
          group,
          row?.attention ?? NORMAL_ATTENTION,
          filters,
          query
        );
      }),
    [rowById, filters, query]
  );

  const overdueF = useMemo(
    () => filterTier(overdue, 'overdue'),
    [overdue, filterTier]
  );
  const upcoming7F = useMemo(
    () => filterTier(upcoming7, 'upcoming7'),
    [upcoming7, filterTier]
  );
  const upcoming30F = useMemo(
    () => filterTier(upcoming30, 'upcoming30'),
    [upcoming30, filterTier]
  );
  const laterF = useMemo(() => filterTier(later, 'later'), [later, filterTier]);
  const noDeadlineF = useMemo(
    () => filterTier(noDeadline, 'noDeadline'),
    [noDeadline, filterTier]
  );

  const totalVisible =
    overdueF.length +
    upcoming7F.length +
    upcoming30F.length +
    laterF.length +
    noDeadlineF.length;
  const hasActiveFilters =
    attentionFilterCount(filters) + filters.time.size > 0;
  const hasQuery = query.length > 0;
  const clearAll = () => {
    setQuery('');
    setFilters(EMPTY_FILTERS());
  };
  const emptyTitle =
    hasActiveFilters && hasQuery
      ? 'No actions match your search and filters.'
      : hasActiveFilters
        ? 'No actions match your filters.'
        : 'No actions match your search.';

  // Mail ⇄ list is a change of focus inside one page, same crossfade
  // Inbox/Approvals use for their own stream ⇄ thread swap.
  const swap = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -4 },
      };

  // One persistent AnimatePresence wraps both states — never an early
  // `return` that mounts/unmounts its own AnimatePresence instance per
  // toggle. A freshly-mounted AnimatePresence is always on its first
  // render, so `initial={false}` (skip enter animation only when this isn't
  // the first render) never actually applies, and the outgoing/incoming
  // trees aren't siblings it can crossfade between — they're two disjoint
  // subtrees React swaps directly, so the transition doesn't even run. This
  // is the exact shape Inbox/Approvals already use (Reference: docs/frontend
  // "list ⇄ detail" pattern) — kept identical here so Actions' mail open/
  // close reads exactly as smooth as theirs, not a mechanically-different
  // instant swap.
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={openMailId ? 'mail' : 'list'}
        style={{ height: '100%' }}
        initial={swap.initial}
        animate={swap.animate}
        exit={swap.exit}
        transition={{ duration: DURATION.page, ease: EASE }}
      >
        {openMailId ? (
          <MailThreadView
            rows={activeMailRows}
            openId={openMailId}
            railLabel="Actions"
            railCount={activeMailRows.length}
            getThreadDetail={(row) => mailActions.getThreadDetail(row.id)}
            onSelect={setOpenMailId}
            onClose={() => setOpenMailId(null)}
            /* The page's own business action, injected into the canonical
               footer exactly the way Approvals injects its decision buttons.
               Actions had no completion affordance at all: the "Completed"
               footer rendered a hardcoded list, so an item could be read but
               never finished. */
            footer={({ selected }) => {
              const item = workflow.actions.find(
                (a) => a.mailId === selected.id
              );
              if (!item) return null;
              const done = Boolean(item.completedAt || selected.completedAt);
              if (done) {
                return (
                  <span
                    className="obligo-eyebrow"
                    style={{ marginLeft: 'auto', color: 'var(--text-faint)' }}
                  >
                    {item.completedNote ?? 'Completed'}
                  </span>
                );
              }
              return (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginLeft: 'auto',
                  }}
                >
                  <button
                    type="button"
                    className="obligo-btn obligo-btn--outline"
                    onClick={() => {
                      workflowActions.completeAction(item.id);
                      setOpenMailId(null);
                    }}
                  >
                    <Check size={13} strokeWidth={2} aria-hidden />
                    Mark done
                  </button>
                </div>
              );
            }}
          />
        ) : (
          <WorkspacePage scale={1.25} typeScale={0.88}>
            <Stagger style={{ display: 'flex', flexDirection: 'column' }}>
              {/* Control area — title and counts read as one sentence, and the
                  controls collapse to two quiet affordances so the page opens
                  looking finished rather than configurable. */}
              <Reveal>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                    flexWrap: 'wrap',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 10,
                      flexWrap: 'wrap',
                    }}
                  >
                    <h1
                      style={{
                        margin: 0,
                        font: 'var(--type-page-title)',
                        letterSpacing: '-0px',
                        color: 'var(--text-strong)',
                      }}
                    >
                      Actions
                    </h1>
                    <HeaderCountSummary
                      segments={attentionSegments('open', headerCounts)}
                    />
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      flex: 'none',
                    }}
                  >
                    <ExpandingSearch
                      query={query}
                      onQueryChange={setQuery}
                      placeholder="Search title, description, source…"
                      ariaLabel="Search actions"
                    />
                    <FilterMenu filters={filters} onChange={setFilters} />
                  </div>
                </div>
              </Reveal>

              <Reveal>
                <p
                  style={{
                    font: '400 calc(var(--type-scale, 1) * 12.5px)/1.6 Inter, sans-serif',
                    color: 'var(--text-secondary)',
                    margin: '8px 0 0',
                    maxWidth: '60ch',
                  }}
                >
                  {ACTIONS_INTRO}
                </p>
              </Reveal>

              {totalVisible === 0 ? (
                <Reveal style={{ marginTop: 32 }}>
                  <EmptyState
                    title={emptyTitle}
                    description="Obligo didn't find anything in this view — the rest of your actions are still tracked, just outside these criteria."
                    action={
                      <Button variant="outline" onClick={clearAll}>
                        Clear filters
                      </Button>
                    }
                  />
                </Reveal>
              ) : (
                <>
                  {/* The five sections are TEMPORAL groupings — when
                      something is due — and nothing more, shared verbatim
                      with Opportunities and Approvals (`deadlineGroupFor`,
                      `lib/deadlineGroups.ts`). None of them sets a row's
                      color: each row's red/gold/neutral comes from its own
                      `attention`, so an important item looks important in
                      "Later" and a normal one looks normal in "Upcoming 7
                      days". The Overdue heading itself stays coral, and every
                      individual overdue card matches it: being overdue
                      escalates a row's own attention to urgent (see
                      `lib/deadlineGroups.ts`'s `isOverdueByDeadline`, read in
                      `mailStore.ts`'s `refreshDerivedState`), so overdue and
                      urgent read identically everywhere in the app, and an
                      overdue-and-important item still carries its gold dot on
                      top of that same coral wash. */}
                  {overdueF.length > 0 && (
                    <Group
                      id="overdue"
                      label={
                        <ShelfHeading
                          style={{ color: 'var(--attention-urgency-soft)' }}
                        >
                          {DEADLINE_GROUP_LABEL.overdue}
                        </ShelfHeading>
                      }
                      count={overdueF.length}
                      gap={6}
                      marginTop={16}
                      stickyIndex={0}
                    >
                      {overdueF.map((a) => (
                        <ContextRow
                          key={a.id}
                          item={a}
                          row={rowFor(a)}
                          attention={attentionFor(a)}
                          tall
                          selected={selectedIds.has(a.id)}
                          onToggle={() => onRowActivate(a)}
                        />
                      ))}
                    </Group>
                  )}

                  {upcoming7F.length > 0 && (
                    <Group
                      id="upcoming7"
                      label={<ShelfHeading>{DEADLINE_GROUP_LABEL.upcoming7}</ShelfHeading>}
                      count={upcoming7F.length}
                      gap={5}
                      marginTop={14}
                      stickyIndex={1}
                    >
                      {upcoming7F.map((a, i) => (
                        <CompactRow
                          key={a.id}
                          item={a}
                          row={rowFor(a)}
                          attention={attentionFor(a)}
                          last={i === upcoming7F.length - 1}
                          selected={selectedIds.has(a.id)}
                          onToggle={() => onRowActivate(a)}
                        />
                      ))}
                    </Group>
                  )}

                  {upcoming30F.length > 0 && (
                    <Group
                      id="upcoming30"
                      label={<ShelfHeading>{DEADLINE_GROUP_LABEL.upcoming30}</ShelfHeading>}
                      count={upcoming30F.length}
                      gap={5}
                      marginTop={14}
                      stickyIndex={2}
                    >
                      {upcoming30F.map((a, i) => (
                        <CompactRow
                          key={a.id}
                          item={a}
                          row={rowFor(a)}
                          attention={attentionFor(a)}
                          last={i === upcoming30F.length - 1}
                          selected={selectedIds.has(a.id)}
                          onToggle={() => onRowActivate(a)}
                        />
                      ))}
                    </Group>
                  )}

                  {laterF.length > 0 && (
                    <Group
                      id="later"
                      label={<ShelfHeading>{DEADLINE_GROUP_LABEL.later}</ShelfHeading>}
                      count={laterF.length}
                      gap={0}
                      marginTop={12}
                      stickyIndex={3}
                    >
                      {laterF.map((a, i) => (
                        <MinimalRow
                          key={a.id}
                          item={a}
                          row={rowFor(a)}
                          attention={attentionFor(a)}
                          last={i === laterF.length - 1}
                          selected={selectedIds.has(a.id)}
                          onToggle={() => onRowActivate(a)}
                        />
                      ))}
                    </Group>
                  )}

                  {noDeadlineF.length > 0 && (
                    <Group
                      id="noDeadline"
                      label={
                        <ShelfHeading>{DEADLINE_GROUP_LABEL.noDeadline}</ShelfHeading>
                      }
                      count={noDeadlineF.length}
                      gap={0}
                      marginTop={12}
                      stickyIndex={4}
                    >
                      {noDeadlineF.map((a, i) => (
                        <MinimalRow
                          key={a.id}
                          item={a}
                          row={rowFor(a)}
                          attention={attentionFor(a)}
                          last={i === noDeadlineF.length - 1}
                          selected={selectedIds.has(a.id)}
                          onToggle={() => onRowActivate(a)}
                        />
                      ))}
                    </Group>
                  )}
                </>
              )}
            </Stagger>
          </WorkspacePage>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
