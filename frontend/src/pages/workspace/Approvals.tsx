import type { CSSProperties } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { MailOpen } from 'lucide-react';
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
  NORMAL_ATTENTION,
  summarizeAttention,
  type Attention,
} from '../../lib/attention';
import { APPROVALS_INTRO, type Approval } from '../../lib/workspaceData';
import { useWorkflowStore, workflowActions } from '../../lib/workflowStore';
import { mailActions, useMailStore } from '../../lib/mailStore';
import {
  dueBucketFor,
  formatDueLabel,
  formatRelativeMailTime,
  parseRecipient,
  truncatePreview,
} from '../../lib/mailAdapters';
import {
  compareByDeadline,
  DEADLINE_GROUP_LABEL,
  DEADLINE_GROUP_ORDER,
  deadlineGroupFor,
} from '../../lib/deadlineGroups';

/**
 * Approvals — everything shown here has already passed review; the only work
 * left is a human decision, so the page reads as a stack of finished drafts
 * waiting for a signature, not a task list.
 *
 * The title used to be the one <h1> in the product filled with gold, on
 * Constitution §4's "rare exception when the title *is* the primary
 * intelligence". V1.0 drops that exception: page titles are wayfinding, and
 * every other workspace page states where you are in the same neutral
 * `--text-strong`. Gold is still the importance signal everywhere it means
 * something on this page — it just no longer appears somewhere it doesn't.
 *
 * Built on the same skeleton as Actions/Opportunities — `WorkspacePage`,
 * shared `Group` shelves, `InteractiveRow` for every row, `ExpandingSearch`
 * — plus the List ⇄ Detail swap Inbox established for "open one item to see
 * more" (Reference §49). The opened view is the exact same canonical
 * `MailThreadView` Inbox uses (see below); this page's own identity lives
 * in its *layout* (a review-oriented list, the gold page title) and in the
 * business actions (Approve & send / Reject / Save as draft) it injects into
 * that canonical view's footer — NOT in a private attention vocabulary. Its
 * old `timingTone` enum is gone; attention here is the same urgency +
 * importance pair every other page reads, from the same store field.
 *
 * Read/unread and starred state for these rows live in the shared
 * `mailStore` (see `lib/mailStore.ts`'s `rows`) — the same store
 * Inbox's own rows use — not a page-local copy. `Approval` itself only
 * carries this page's business fields (status/shelf/timing); mailStore is
 * where "is this read" lives, for every page, once.
 */

const TRUNCATE: CSSProperties = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

function matchesQuery(item: Approval, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  // `summary` is the one canonical insight now — the old `detail` field was a
  // second, shorter copy of the same AI sentence and searching both meant
  // searching the same fact twice.
  return [item.subject, item.recipient, item.summary ?? '']
    .join(' ')
    .toLowerCase()
    .includes(q);
}

/* -------------------------------- List row -------------------------------- */

/**
 * One approval in the shelf list.
 *
 * Attention comes from the shared store row (`attention`), exactly like every
 * other page's rows — the same field, the same two independent axes, the same tint/
 * rail/insight treatment. This page used to own a private four-value
 * `timingTone` enum (urgent / gold / scheduled / muted) that blended
 * attention with workflow state and drew its own colors; that's gone.
 * Workflow state still lives on `status`, and timing still lives on
 * `respondBy`/`timing` — they just aren't pretending to be priority any more.
 *
 * `unread` layers the same read-state contrast (bolder sender, neutral dot)
 * every other list uses, from the one shared read/unread state.
 */
function ApprovalRow({
  item,
  attention,
  unread,
  last,
  onOpen,
}: {
  item: Approval;
  /** From the shared store row — already `normal` for anything completed
   * (`mailActions.complete`), so a resolved approval can't keep carrying a
   * treatment it's no longer entitled to. */
  attention: Attention;
  unread: boolean;
  last: boolean;
  onOpen: () => void;
}) {
  const tinted = isTinted(attention);
  const tall = tinted;
  const sender = parseRecipient(item.recipient).name;
  const subject = item.subject;
  const preview = truncatePreview(item.receivedBody[0] ?? '');
  // Computed fresh, never trusted as authored text, whenever there's a real
  // date behind it: a completed item shows how long ago it was actually
  // resolved (`completedAt`), a still-pending item shows its own live-
  // computed due label — both would otherwise freeze at whatever was true
  // the day this record was written (e.g. "expected in 4h" staying "4h"
  // forever). `dueBucketFor` already resolves an absent/unparseable
  // `respondBy` to `'noDeadline'`, so `formatDueLabel` alone — the same
  // canonical formatter Actions uses — is the single source for this slot;
  // no page-local fallback to `timing`'s own evergreen text, which is
  // unrelated approval context, not a deadline state.
  const respondByBucket = dueBucketFor(item.respondBy);
  const displayTiming = item.completedAt
    ? `sent ${formatRelativeMailTime(item.completedAt)}`
    : formatDueLabel(item.respondBy, respondByBucket);
  // A completed row's `displayTiming` is a "sent N ago" recency note, never
  // a deadline — never colored as overdue regardless of the original
  // `respondBy`.
  const overdue = !item.completedAt && respondByBucket === 'overdue';

  return (
    <InteractiveRow
      onClick={onOpen}
      visual={attentionVisual(attention, 'card')}
      style={
        {
          position: 'relative',
          gap: 10,
          overflow: tinted ? 'hidden' : undefined,
          borderRadius: tall ? 11 : 8,
          // Real paddingInline: 14, no compensating negative margin — see
          // the same note in Opportunities' OpportunityCard.
          padding: tall ? '13px 14px' : undefined,
          paddingInline: tall ? undefined : 14,
          paddingBlock: tall ? undefined : 9,
          borderBottom:
            !tall && !last ? '1px solid rgb(var(--ink) / 0.06)' : undefined,
        } as CSSProperties
      }
    >
      <AttentionRail attention={attention} />
      {/* Unread (neutral) and attention (coral/gold) are separate dots — see
          `AttentionDot`. The unread dot's shade never changes with
          attention. */}
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
          <span
            style={{
              ...TRUNCATE,
              flex: 'none',
              maxWidth: '38%',
              font: `${unread ? 600 : attentionWeight(attention)} calc(var(--type-scale, 1) * ${tall ? 13.5 : 13}px) Inter, sans-serif`,
              color: 'var(--text-strong)',
            }}
          >
            {sender}
          </span>
          <span
            style={{
              ...TRUNCATE,
              font: `${unread ? 500 : 400} calc(var(--type-scale, 1) * ${tall ? 13.5 : 13}px) Inter, sans-serif`,
              color: unread ? 'var(--text)' : 'var(--text-secondary)',
            }}
          >
            {subject}
          </span>
          {/* Timing metadata, colored by this row's attention — the same
              accent the rail carries, from the one shared palette. */}
          <span
            className="obligo-mono"
            style={{
              flex: 'none',
              marginLeft: 'auto',
              font: '400 calc(var(--type-scale, 1) * 10px) "JetBrains Mono", monospace',
              color: deadlineMetaColor(attention, overdue),
            }}
          >
            {displayTiming}
          </span>
        </div>
        {/* Fixed thirds: preview gets half the row, a quiet quarter of
            breathing room, then Obligo's insight in the last quarter — so the
            preview never crowds toward the insight column regardless of how
            long either text is. */}
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          {/* Real email content preview — never Obligo's own extraction text
              standing in for what the sender actually wrote. */}
          <span
            style={{
              ...TRUNCATE,
              flex: '0 1 50%',
              minWidth: 0,
              font: `400 calc(var(--type-scale, 1) * ${tall ? 10.5 : 10}px)/1.3 Inter, sans-serif`,
              // Real email content — always readable, never dimmed to signal
              // that this row is less important than another one.
              color: 'var(--text-secondary)',
            }}
          >
            {preview}
          </span>
          <span aria-hidden style={{ flex: '0 0 25%' }} />
          {/* Obligo's own insight — its own right-side slot, same treatment as
              Inbox's `.obligo-stream-insight` column, so "what the email says"
              and "what Obligo thinks is important about it" never blend.
              Colored from the one shared attention palette while still
              active; once completed, there's nothing left to suggest — the
              text itself goes away rather than just losing its color.

              A TRUNCATED PREVIEW of the same `summary` the opened mail shows
              in full (it becomes that mail's `ThreadDetail.insight`), never a
              separately-authored short version — the row is a way in, not the
              only place this text can be read. */}
          <span
            style={{
              ...TRUNCATE,
              flex: '0 1 25%',
              minWidth: 0,
              font: `${tinted ? 500 : 400} calc(var(--type-scale, 1) * ${tall ? 10.5 : 10}px)/1.3 Inter, sans-serif`,
              color: attentionInsightColor(attention),
            }}
          >
            {!item.completedAt && item.summary
              ? truncatePreview(item.summary)
              : ''}
          </span>
        </div>
      </div>
    </InteractiveRow>
  );
}

/* --------------------------------- List view -------------------------------- */

function ListView({
  items,
  attentionOf,
  unreadIds,
  query,
  onQueryChange,
  onOpen,
}: {
  items: Approval[];
  /** Resolves an approval to its shared store row's attention — the same
   * lookup the rows themselves use, so the header counts and the rows can't
   * disagree. */
  attentionOf: (item: Approval) => Attention;
  unreadIds: Set<string>;
  query: string;
  onQueryChange: (next: string) => void;
  onOpen: (id: string) => void;
}) {
  // "N pending · N urgent · N important" — the shared mechanism and the
  // shared words. `items` is already the active (non-completed) set the
  // parent maintains live via `mailActions.complete`, hence the trivial
  // `isCompleted`; the attention counts read the same store field the rows
  // render, never a page-local flag.
  const headerCounts = useMemo(
    () => summarizeAttention(items, { isCompleted: () => false, attentionOf }),
    [items, attentionOf]
  );
  const visible = useMemo(
    () => items.filter((i) => matchesQuery(i, query)),
    [items, query]
  );

  // The same five chronological sections Actions and Opportunities use
  // (`deadlineGroupFor`, `lib/deadlineGroups.ts`), grouped by each
  // approval's own `respondBy` — never this page's own shelf vocabulary.
  // Within a section, nearest deadline first.
  const shelves = useMemo(
    () =>
      DEADLINE_GROUP_ORDER.map((group) => ({
        group,
        name: DEADLINE_GROUP_LABEL[group],
        rows: visible
          .filter((i) => deadlineGroupFor(i.respondBy) === group)
          .sort((a, b) => compareByDeadline(a.respondBy, b.respondBy)),
      })).filter((s) => s.rows.length > 0),
    [visible]
  );

  const totalVisible = shelves.reduce((n, s) => n + s.rows.length, 0);

  return (
    <WorkspacePage scale={1.25} typeScale={0.88}>
      <Stagger style={{ display: 'flex', flexDirection: 'column' }}>
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
              {/* The canonical page title, identical to Dashboard, Inbox,
                  Actions, Opportunities and Settings: the shared
                  `--type-page-title` shorthand plus `--text-strong`.

                  It used to fill with `--gold-title-grad` on the argument
                  that this is the page where gold is the subject. That was
                  true of the page's CONTENT and never of its heading — a
                  title's job is to say which page you're on, and doing it in
                  the one colour that elsewhere means "important" made
                  Approvals the only page whose <h1> carried a semantic
                  reading. Gold inside the page (rails, dots, the approve
                  band) is untouched. */}
              <h1
                style={{
                  margin: 0,
                  font: 'var(--type-page-title)',
                  letterSpacing: '-0px',
                  color: 'var(--text-strong)',
                }}
              >
                Approvals
              </h1>
              <HeaderCountSummary
                segments={attentionSegments('pending', headerCounts)}
              />
            </div>
            <ExpandingSearch
              query={query}
              onQueryChange={onQueryChange}
              placeholder="Search title, recipient, summary…"
              ariaLabel="Search approvals"
            />
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
            {APPROVALS_INTRO}
          </p>
        </Reveal>

        {totalVisible === 0 ? (
          <Reveal style={{ marginTop: 32 }}>
            <EmptyState
              title={
                query
                  ? 'No approvals match your search.'
                  : 'Nothing needs your review right now.'
              }
              description={
                query
                  ? 'Try a different search term, or clear it to see everything.'
                  : 'Approvals will show up here as Obligo prepares them for your review.'
              }
              action={
                query ? (
                  <Button variant="outline" onClick={() => onQueryChange('')}>
                    Clear search
                  </Button>
                ) : undefined
              }
            />
          </Reveal>
        ) : (
          shelves.map((shelf, si) => (
            <Group
              key={shelf.group}
              id={shelf.group}
              label={
                // Overdue is the one section whose heading carries the coral
                // urgency color — everything under it stays visually calm
                // (see `ApprovalRow`/`isUrgentByDeadline`), so the SECTION is
                // what communicates the urgency, not every card inside it.
                <ShelfHeading
                  style={
                    shelf.group === 'overdue'
                      ? { color: 'var(--attention-urgency-soft)' }
                      : undefined
                  }
                >
                  {shelf.name}
                </ShelfHeading>
              }
              count={shelf.rows.length}
              gap={0}
              marginTop={si === 0 ? 16 : 18}
              stickyIndex={si}
            >
              {shelf.rows.map((row, ri) => (
                <ApprovalRow
                  key={row.id}
                  item={row}
                  attention={attentionOf(row)}
                  unread={unreadIds.has(row.id)}
                  last={ri === shelf.rows.length - 1}
                  onOpen={() => onOpen(row.id)}
                />
              ))}
            </Group>
          ))
        )}
      </Stagger>
    </WorkspacePage>
  );
}

/* ------------------------------ Review surface ------------------------------ */

/**
 * Thin wrapper around the canonical `MailThreadView` — supplies Approvals'
 * own rows (already adapted into `StoredMailRow`/`ThreadDetail` by
 * `mailStore.ts`, the same way Inbox's own rows are) and this page's
 * business actions. The actual header, star, thread rendering, reply
 * composer, formatting, attachments, and link insertion are all the shared
 * component's, not reimplemented here.
 */
function ReviewSurface({
  items,
  selectedId,
  onSelect,
  onClose,
  onApprove,
  onReject,
}: {
  items: Approval[];
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const store = useMailStore();
  const rows = items
    .map((a) => store.rows.find((r) => r.id === a.id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));

  return (
    <MailThreadView
      rows={rows}
      openId={selectedId}
      railLabel="Approvals"
      railCount={items.length}
      getThreadDetail={(row) => mailActions.getThreadDetail(row.id)}
      onSelect={onSelect}
      onClose={onClose}
      // Same collapsed-by-default AI Suggested Reply as Inbox — the draft
      // isn't dumped into the mail body or force-expanded just because
      // this page's whole purpose is reviewing it. Approve & send /
      // Schedule below are the composer's own Send/Schedule-send, reached
      // the same way Inbox's are: expand the control, then act.
      sendLabel="Approve & send"
      // "Approve & send" is a real send followed by the approval being
      // resolved — the payload carries the reviewed draft, its recipients and
      // anything attached, so approving records the message that actually
      // went out rather than only marking the queue item done.
      onSend={(row, payload) => {
        mailActions.sendReply({
          ...payload,
          subject: `re: ${row.subject}`,
          threadId: row.id,
        });
        onApprove(row.id);
      }}
      onSchedule={(row, payload, date) => {
        mailActions.scheduleReply({
          ...payload,
          subject: `re: ${row.subject}`,
          threadId: row.id,
          date,
        });
        onApprove(row.id);
      }}
      footer={({ selected }) => {
        const approval = items.find((a) => a.id === selected.id);
        if (!approval) return null;
        // Already resolved — nothing left to decide, so no action buttons;
        // just what happened and when, the same way a completed Action's
        // row reads once opened.
        if (approval.completedAt) {
          return (
            <span
              className="obligo-eyebrow"
              style={{ marginLeft: 'auto', color: 'var(--text-faint)' }}
            >
              {approval.completedNote ?? 'Completed'}
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
              className="obligo-btn obligo-btn--outline"
              onClick={() => {
                mailActions.markUnread(approval.id);
                onClose();
              }}
            >
              <MailOpen size={13} strokeWidth={2} aria-hidden />
              Mark unread
            </button>
            <button
              type="button"
              className="obligo-btn obligo-btn--outline"
              onClick={() => onReject(approval.id)}
            >
              Reject
            </button>
          </div>
        );
      }}
    />
  );
}

/* ---------------------------------- Page ------------------------------------ */

export default function Approvals() {
  const location = useLocation();
  // Dashboard can deep-link straight to one approval's mail by navigating
  // here with `state: { openMailId }` — read synchronously into the initial
  // state (rather than set from a post-mount effect) so the review view is
  // what AnimatePresence renders on the very first paint, not a key-swap
  // that fights the page's own enter transition and leaves it stuck
  // mid-fade.
  const [selectedId, setSelectedId] = useState<string | null>(
    () => (location.state as { openMailId?: string } | null)?.openMailId ?? null
  );
  const [query, setQuery] = useState('');
  const workflow = useWorkflowStore();
  const store = useMailStore();
  const reduced = useReducedMotion();

  // Resolved against the full list, not just `pendingItems` — a deep link
  // opened right as an approval resolves should still find the record for
  // this one render rather than come up empty.
  const selected = workflow.approvals.find((i) => i.id === selectedId) ?? null;
  const unreadIds = useMemo(
    () => new Set(store.rows.filter((r) => r.unread).map((r) => r.id)),
    [store.rows]
  );
  /** An approval's attention IS its shared store row's attention — resolved
   * once in the adapter (`approvalToRow`), read here, never re-derived. */
  const attentionOf = useCallback(
    (item: Approval): Attention =>
      store.rows.find((r) => r.id === item.id)?.attention ?? NORMAL_ATTENTION,
    [store.rows]
  );

  // Pending only, derived off the shared store rather than a page-local
  // mirror of it. `items` used to be `useState`, seeded once from
  // `approvals.items` and spliced by hand on approve/reject — a second copy
  // of a fact `mailActions.complete` already writes to
  // `StoredMailRow.completedAt`. Resolved approvals play no further part on
  // this page at all (see the dedicated Completed page,
  // `pages/workspace/Completed.tsx`, for the unified terminal-state view).
  const pendingItems = useMemo(
    () =>
      workflow.approvals.filter(
        (a) => !store.rows.find((r) => r.id === a.id)?.completedAt
      ),
    [workflow.approvals, store.rows]
  );

  /** Moves the review on to whatever will be next in the pending queue once
   * `id` leaves it. Computed from the CURRENT pending list before the
   * completion is applied — the store mutation below is what actually removes
   * the item, so this has to read the list as it still is. Deliberately a
   * plain function called alongside the mutation rather than a `setState`
   * call nested inside another state updater: an updater must be pure (React
   * invokes it twice under StrictMode), and this one was scheduling an
   * unrelated state change from inside it. */
  const advancePast = (id: string) => {
    const idx = pendingItems.findIndex((i) => i.id === id);
    const remaining = pendingItems.filter((i) => i.id !== id);
    setSelectedId((remaining[idx] ?? remaining[idx - 1])?.id ?? null);
  };

  const resolve = (id: string, note: string) => {
    // Through the workflow store: it writes the Approval record's own
    // resolution AND delegates the shared part to `mailActions.complete`.
    workflowActions.resolveApproval(id, note);
    advancePast(id);
  };
  const handleApprove = (id: string) => resolve(id, 'approved and sent');
  const handleReject = (id: string) => resolve(id, 'rejected');

  // List ⇄ review is a change of focus inside one page, so it crossfades
  // in place rather than borrowing the route transition — the same
  // pattern Inbox's stream ⇄ thread swap uses (Reference §53).
  const swap = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -4 },
      };

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={selectedId ? 'review' : 'list'}
        style={{ height: '100%' }}
        initial={swap.initial}
        animate={swap.animate}
        exit={swap.exit}
        transition={{ duration: DURATION.page, ease: EASE }}
      >
        {selectedId && selected ? (
          <ReviewSurface
            items={pendingItems}
            selectedId={selected.id}
            onSelect={setSelectedId}
            onClose={() => setSelectedId(null)}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        ) : (
          <ListView
            items={pendingItems}
            attentionOf={attentionOf}
            unreadIds={unreadIds}
            query={query}
            onQueryChange={setQuery}
            onOpen={setSelectedId}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
}
