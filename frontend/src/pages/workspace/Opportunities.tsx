import type { CSSProperties } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Sparkle } from 'lucide-react';
import {
  attentionInsightColor,
  attentionSegments,
  attentionVisual,
  attentionWeight,
  AttentionDot,
  AttentionRail,
  Button,
  deadlineMetaColor,
  DURATION,
  EASE,
  EmptyState,
  ExpandingSearch,
  Group,
  HeaderCountSummary,
  InteractiveRow,
  isTinted,
  MailThreadView,
  Reveal,
  ShelfHeading,
  Stagger,
  WorkspacePage,
} from '../../components/workspace';
import {
  isImportant,
  NORMAL_ATTENTION,
  summarizeAttention,
  type Attention,
} from '../../lib/attention';
import { OPPORTUNITIES_INTRO, type Opportunity } from '../../lib/workspaceData';
import { useWorkflowStore, workflowActions } from '../../lib/workflowStore';
import {
  mailActions,
  senderFromSource,
  useMailStore,
} from '../../lib/mailStore';
import { formatClosingLabel, truncatePreview } from '../../lib/mailAdapters';
import {
  compareByDeadline,
  DEADLINE_GROUP_LABEL,
  DEADLINE_GROUP_ORDER,
  deadlineGroupFor,
  isOverdueByDeadline,
} from '../../lib/deadlineGroups';

/** The label actually shown in this row's deadline slot — a real closing
 * date's computed label when one exists, else the canonical
 * `NO_DEADLINE_LABEL` `formatClosingLabel` itself now returns. Deliberately
 * NOT `item.timing` ("rolling", "open-ended", "weekly", ...) — that field is
 * opportunity source/cadence metadata, not a deadline state, and using it
 * here was exactly what made this slot disagree with Actions/Approvals for
 * the identical no-deadline case. The field stays on the record for
 * wherever opportunity context is actually relevant to show; it just isn't
 * this slot. */
function timingLabelFor(item: Opportunity): string {
  return formatClosingLabel(item.closesAt);
}

/**
 * Opportunities — awareness of what's out there, shelved by when it closes,
 * the same rolling-window grouping (Overdue / Upcoming 7 days / Upcoming 30
 * days / Later / No deadline — still tracked) Actions and Approvals use
 * (`deadlineGroupFor`, `lib/deadlineGroups.ts`). This page used to shelve by a hand-authored
 * `groupId` — arbitrary prose headings ("Funded, and close to your thesis")
 * with no relationship to time and no way to reconcile with the other two
 * pages' sections. Built on the shared Foundation, following the Sprint 1
 * rebuild guide.
 *
 * Data-driven by construction: `items` is a flat array (the
 * shape a real API would return) and every visual grouping — shelves, the
 * elevated card, lifecycle counts — is *derived* from fields on each record
 * (`closesAt`, `attention`, `lifecycle`) at render time. Nothing here reaches
 * into a specific placeholder item by id; swapping the array for a live fetch
 * later touches this file's data import, not its rendering.
 *
 * Attention is the same global model as everywhere else (see
 * `lib/attention.ts`). This page's old `featured` boolean and its private
 * `isClosingSoon` → rust rule are gone: both resolve into the row's one
 * `attention` value at the store, and the elevated card is derived from that
 * value rather than from a second flag.
 *
 * Interaction reuses the exact system established by Actions: every row is a
 * real `<button className="iil-action-row">` (shared hover/press/focus/
 * selected recipe, see index.css), search is the shared `ExpandingSearch`,
 * and group headers/expand-collapse are the shared `Group` component —
 * both live in `components/workspace` so Actions and Opportunities can't
 * quietly drift apart the way they did before.
 */

const TRUNCATE: CSSProperties = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

/* ------------------------------ Search / match --------------------------- */

/** Every field the search contract calls out: title, organization (`source`),
 * tags, description (`why`), and metadata (timing + lifecycle). */
function matchesQuery(item: Opportunity, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const haystack = [
    item.title,
    item.source,
    item.why,
    timingLabelFor(item),
    item.lifecycle,
    ...(item.tags ?? []),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

/* ----------------------------- Row meta / tags ---------------------------- */

/**
 * Right-aligned meta — the timing label, colored via the shared
 * `deadlineMetaColor` (see its own doc comment for why it takes an explicit
 * `overdue` flag) so an overdue opportunity's "applications closed" reads the
 * same red as an overdue Approval's "9 days overdue" or Actions' own.
 *
 * This used to also render a "Saved"/"Pursuing" lifecycle pill, but nothing
 * in the app ever set or maintained that state beyond this pill and the
 * page's own tab filter — no other surface read it, so it was a label with
 * no mechanism behind it. Removed; the deadline-derived timing label (which
 * IS real, computed data) is all this slot shows now.
 */
function RowMeta({
  item,
  attention,
}: {
  item: Opportunity;
  attention: Attention;
}) {
  return (
    <span
      className="iil-mono"
      style={{
        flex: 'none',
        marginLeft: 'auto',
        font: `${isTinted(attention) ? 500 : 400} calc(var(--type-scale, 1) * 10px) "JetBrains Mono", monospace`,
        color: deadlineMetaColor(attention, isOverdueByDeadline(item.closesAt)),
      }}
    >
      {timingLabelFor(item)}
    </span>
  );
}

/* -------------------------------- Card / row ------------------------------ */

/**
 * One opportunity — the single reusable renderer for every record, elevated
 * or not. `variant` changes only the surface *density* (the one elevated card
 * at the top of the page is bigger and roomier); the interaction recipe and
 * the attention language are identical to every other row in the app.
 *
 * This card used to run its own two-flag system — `featured` for gold,
 * `isClosingSoon(closesAt)` for red, with a hand-written rule about which one
 * "wins" the background. Both now collapse into the row's single `attention`
 * value, resolved once in the store (where the closing-date escalation also
 * happens), so there is nothing left to arbitrate: the rail, the wash, the
 * dot, the timing color and the insight color are all the same one answer.
 *
 * No alpha here is a function of `index`. The list used to fade title,
 * source, preview and meta progressively down the page (`0.86 - index * 0.06`
 * and friends, bottoming out at 0.18), which made the lower shelves genuinely
 * hard to read. Distance is expressed by the elevated card being *bigger*,
 * not by everything else being dimmer.
 */
function OpportunityCard({
  item,
  attention,
  variant,
  last,
  unread,
  selected,
  onToggle,
}: {
  item: Opportunity;
  /** From the shared store row — already `normal` for anything passed. */
  attention: Attention;
  variant: 'elevated' | 'row';
  last: boolean;
  /** Same shared read/unread state every other mail-like row draws from
   * (`mailStore`'s shared `rows`), not a page-local derivation. */
  unread: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  const elevated = variant === 'elevated';
  const tinted = isTinted(attention);
  const sender = senderFromSource(item.source);
  // The forwarded message's own opening line — the same `body[0]` the store
  // puts in this row's snippet and the opened mail shows in full. It is never
  // derived from `item.title`: the subject already sits immediately to its
  // left, and a preview generated from the title just prints it twice.
  const preview = truncatePreview(item.body[0] ?? '');

  return (
    <InteractiveRow
      selected={selected}
      aria-pressed={selected}
      onClick={onToggle}
      visual={attentionVisual(attention, elevated ? 'card' : 'row')}
      style={
        {
          position: 'relative',
          gap: 14,
          overflow: tinted ? 'hidden' : undefined,
          borderRadius: elevated || tinted ? 11 : 8,
          // Real paddingInline: 14, no compensating negative margin — same
          // box edges as Actions' cards and every Group header, so the row's
          // own hover surface/border-bottom lines up with the rest of the
          // page, not just its title text.
          padding: elevated ? '16px 14px' : tinted ? '11px 14px' : undefined,
          paddingInline: elevated || tinted ? undefined : 14,
          paddingBlock: elevated || tinted ? undefined : 9,
          borderBottom:
            !elevated && !tinted && !last
              ? '1px solid rgb(var(--ink) / 0.06)'
              : undefined,
        } as CSSProperties
      }
    >
      <AttentionRail attention={attention} />

      {/* Unread (neutral) and attention (coral/gold) are separate dots — see
          `AttentionDot`. Centers on the row's own `align-items: center` like
          every other page's rows do. */}
      <AttentionDot attention={attention} unread={unread} />

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          {/* Sender first, subject after — same order Inbox's stream rows
              use. */}
          <span
            style={{
              ...TRUNCATE,
              flex: 'none',
              maxWidth: '32%',
              font: `${attentionWeight(attention)} calc(var(--type-scale, 1) * ${elevated ? 14.5 : 13}px) Inter, sans-serif`,
              color: 'var(--text-strong)',
            }}
          >
            {sender}
          </span>
          <span
            style={{
              ...TRUNCATE,
              font: `400 calc(var(--type-scale, 1) * ${elevated ? 12.5 : 11.5}px) Inter, sans-serif`,
              color: 'var(--text)',
            }}
          >
            {item.title}
          </span>
          <RowMeta item={item} attention={attention} />
        </div>
        {/* Fixed thirds: preview gets half the row, a quiet quarter of
            breathing room, then IIL's insight in the last quarter. */}
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          {/* Real content preview — a plausible line from the actual
              message, never IIL's own reasoning (`why`) standing in for it. */}
          <span
            style={{
              ...TRUNCATE,
              flex: '0 1 50%',
              minWidth: 0,
              font: `400 calc(var(--type-scale, 1) * ${elevated ? 11.5 : 11}px)/1.45 Inter, sans-serif`,
              // Real message content — full readable contrast in every shelf,
              // at every position.
              color: 'var(--text-secondary)',
            }}
          >
            {preview}
          </span>
          <span aria-hidden style={{ flex: '0 0 25%' }} />
          {/* IIL's own insight — same right-side slot as Inbox's
              `.iil-stream-insight` column, colored from the one shared
              attention palette. Once passed, there's nothing left to suggest
              — the text itself goes away rather than just losing its color
              (same rule Inbox/Approvals follow). */}
          <span
            style={{
              ...TRUNCATE,
              flex: '0 1 25%',
              minWidth: 0,
              font: `${tinted ? 500 : 400} calc(var(--type-scale, 1) * ${elevated ? 11.5 : 11}px)/1.45 Inter, sans-serif`,
              color: attentionInsightColor(attention),
            }}
          >
            {!item.completedAt && item.why}
          </span>
        </div>
      </div>
    </InteractiveRow>
  );
}

/* --------------------------------- Page ------------------------------------ */

export default function Opportunities() {
  const [query, setQuery] = useState('');
  const location = useLocation();
  // Every opportunity is, underneath, a real message IIL surfaced — clicking
  // one opens the same canonical mail-detail view Inbox/Approvals/Actions use
  // rather than a page-local preview. Dashboard can also deep-link straight
  // to one by navigating here with `state: { openMailId }` — read
  // synchronously into the initial state (rather than set from a post-mount
  // effect) so the thread view is what AnimatePresence renders on the very
  // first paint, not a key-swap that fights the page's own enter transition
  // and leaves it stuck mid-fade.
  const [openId, setOpenId] = useState<string | null>(
    () => (location.state as { openMailId?: string } | null)?.openMailId ?? null
  );
  const workflow = useWorkflowStore();
  const items = workflow.opportunities;
  const store = useMailStore();
  const reduced = useReducedMotion();

  // Passed opportunities never belong in the main list — resolved items play
  // no further part on this page at all (see the dedicated Completed page,
  // `pages/workspace/Completed.tsx`, for the unified terminal-state view).
  const visible = useMemo(
    () => items.filter((i) => i.lifecycle !== 'passed' && matchesQuery(i, query)),
    [items, query]
  );

  /** An opportunity's attention IS its shared store row's attention —
   * resolved once in `opportunityToRow` (including the closing-date
   * escalation), read here, never re-derived. */
  const attentionOf = useCallback(
    (item: Opportunity): Attention =>
      store.rows.find((r) => r.id === item.id)?.attention ?? NORMAL_ATTENTION,
    [store.rows]
  );

  // "N active · N urgent · N important" — the shared mechanism and the shared
  // words. The red segment used to read "closing soon", which was this page's
  // private name for what every other page called urgent; it's the same
  // count, so it now uses the same word. Resolved against the live store, so
  // a passed item can never inflate any of the three.
  const headerCounts = useMemo(
    () =>
      summarizeAttention(items, {
        isCompleted: (o) =>
          Boolean(store.rows.find((r) => r.id === o.id)?.completedAt),
        attentionOf,
      }),
    [items, store.rows, attentionOf]
  );

  /** The one elevated card at the top of the page — derived from the
   * IMPORTANCE axis (the first still-visible opportunity that matters) rather
   * than a separate `featured` flag, so the card and the gold treatment can
   * never disagree about which item is the standout.
   *
   * Importance, specifically, not overall attention rank: elevating means
   * "this is the one worth your consideration", which is what gold says. A
   * merely urgent opportunity — a small grant whose window happens to be
   * closing — gets its coral treatment in the list and does not take over the
   * top of the page. An item that is both still elevates, and keeps its coral
   * treatment while it's up there. */
  const elevated = useMemo(
    () => visible.find((i) => isImportant(attentionOf(i))),
    [visible, attentionOf]
  );

  // The same five chronological sections Actions and Approvals use
  // (`deadlineGroupFor`, `lib/deadlineGroups.ts`), grouped by each
  // opportunity's own `closesAt` — never this page's own hand-authored
  // shelf prose ("Funded, and close to your thesis", etc.), which had no
  // relationship to time at all and couldn't be reconciled with the other
  // two pages' headings. Within a section, nearest closing date first;
  // opportunities with no real closing date fall into "No deadline", sorted
  // in whatever order they were already in.
  //
  // The elevated item is deliberately NOT excluded here. It used to be
  // filtered out of every group (`i.id !== elevated?.id`), which meant an
  // opportunity with a real deadline could be spotlighted above the page and
  // then belong to no visible section at all — an active, dated item with
  // nowhere the deadline sections said it lived. It now appears in both
  // places: spotlighted at the top, AND in the section its own `closesAt`
  // puts it in below, so every active mail with a deadline is always inside
  // exactly the section that deadline maps to, with no exemption for being
  // the featured one.
  const groups = useMemo(() => {
    return DEADLINE_GROUP_ORDER.map((group) => ({
      id: group,
      heading: DEADLINE_GROUP_LABEL[group],
      items: visible
        .filter((i) => deadlineGroupFor(i.closesAt) === group)
        .sort((a, b) => compareByDeadline(a.closesAt, b.closesAt)),
    })).filter((g) => g.items.length > 0);
  }, [visible]);

  const totalVisible = visible.length;

  /** What the opened-mail rail lists, and therefore what its count means.
   *
   * One flat array of every opportunity used to make the rail say
   * "Opportunities · 9" directly beneath a header reading "7 active",
   * because the flat array silently included the passed ones. Excluding
   * them here keeps the rail at exactly the count the header reports. */
  const activeMailRows = items
    .filter((o) => o.lifecycle !== 'passed')
    .map((o) => store.rows.find((r) => r.id === o.id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));

  const unreadIds = useMemo(
    () => new Set(store.rows.filter((r) => r.unread).map((r) => r.id)),
    [store.rows]
  );

  // Mail ⇄ list is a change of focus inside one page, same crossfade
  // Inbox/Approvals/Actions use for their own stream ⇄ thread swap.
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
  // "list ⇄ detail" pattern) — kept identical here so Opportunities' mail
  // open/close reads exactly as smooth as theirs, not a mechanically-
  // different instant swap.
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={openId ? 'mail' : 'list'}
        style={{ height: '100%' }}
        initial={swap.initial}
        animate={swap.animate}
        exit={swap.exit}
        transition={{ duration: DURATION.page, ease: EASE }}
      >
        {openId ? (
          <MailThreadView
            rows={activeMailRows}
            openId={openId}
            railLabel="Opportunities"
            railCount={activeMailRows.length}
            getThreadDetail={(row) => mailActions.getThreadDetail(row.id)}
            onSelect={setOpenId}
            onClose={() => setOpenId(null)}
            /* Lifecycle, in this page's own existing vocabulary — the states
               were already modelled and already displayed in each row's meta
               slot, but nothing could move an opportunity between them. Same
               footer-injection pattern Approvals and Actions use. */
            footer={({ selected }) => {
              const item = items.find((o) => o.id === selected.id);
              if (!item) return null;
              if (item.lifecycle === 'passed') {
                return (
                  <span
                    className="iil-eyebrow"
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
                    flexWrap: 'wrap',
                    marginLeft: 'auto',
                  }}
                >
                  <button
                    type="button"
                    className="iil-btn iil-btn--ghost"
                    onClick={() => {
                      workflowActions.setOpportunityLifecycle(item.id, 'passed');
                      // Passing resolves the item, so it leaves the active
                      // rail — staying on it would strand the reader on a
                      // mail the list behind them no longer shows.
                      setOpenId(null);
                    }}
                  >
                    Pass
                  </button>
                </div>
              );
            }}
          />
        ) : (
          <WorkspacePage scale={1.25} typeScale={0.88}>
            <Stagger style={{ display: 'flex', flexDirection: 'column' }}>
              <Reveal>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
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
                      Opportunities
                    </h1>
                    <HeaderCountSummary
                      segments={attentionSegments('active', headerCounts)}
                    />
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    <ExpandingSearch
                      query={query}
                      onQueryChange={setQuery}
                      placeholder="Search title, organization, tags…"
                      ariaLabel="Search opportunities"
                    />
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
                  {OPPORTUNITIES_INTRO}
                </p>
              </Reveal>

              {totalVisible === 0 ? (
                <Reveal style={{ marginTop: 32 }}>
                  <EmptyState
                    icon={<Sparkle size={20} strokeWidth={1.4} aria-hidden />}
                    title={
                      query
                        ? 'No opportunities match your search.'
                        : 'Nothing here yet'
                    }
                    description={
                      query
                        ? 'Try a different search term, or clear it to see everything in this view.'
                        : 'Opportunities matching this view will show up here as IIL finds them.'
                    }
                    action={
                      query ? (
                        <Button variant="outline" onClick={() => setQuery('')}>
                          Clear search
                        </Button>
                      ) : undefined
                    }
                  />
                </Reveal>
              ) : (
                <>
                  {/* The featured opportunity gets its visual spotlight IN
                      PLACE, inside whichever deadline section its own
                      `closesAt` puts it in — never a second, standalone card
                      floated above the sections. That standalone card used to
                      render the same opportunity a second time (once here,
                      once again in its group below), which meant one real
                      thread had two visible rows and a heading's own count
                      quietly disagreed with what was actually independently
                      renderable as "the featured one" vs "everything in this
                      section". One record, one row: the elevated card is a
                      density/prominence variant applied to that row, not an
                      extra one. */}
                  {groups.map((g, si) => (
                    <Group
                      key={g.id}
                      id={g.id}
                      label={
                        // Overdue is the one heading that carries the coral
                        // urgency color — the cards under it stay visually
                        // calm (closing-date escalation excludes overdue by
                        // design, see `isUrgentByDeadline`), so the SECTION
                        // communicates the urgency, not every card in it.
                        <ShelfHeading
                          style={
                            g.id === 'overdue'
                              ? { color: 'var(--attention-urgency-soft)' }
                              : undefined
                          }
                        >
                          {g.heading}
                        </ShelfHeading>
                      }
                      count={g.items.length}
                      gap={0}
                      marginTop={si === 0 ? 16 : 18}
                      stickyIndex={si}
                    >
                      {g.items.map((item, ri) => (
                        <OpportunityCard
                          key={item.id}
                          item={item}
                          attention={attentionOf(item)}
                          variant={item.id === elevated?.id ? 'elevated' : 'row'}
                          last={ri === g.items.length - 1}
                          unread={unreadIds.has(item.id)}
                          selected={false}
                          onToggle={() => setOpenId(item.id)}
                        />
                      ))}
                    </Group>
                  ))}
                </>
              )}
            </Stagger>
          </WorkspacePage>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
