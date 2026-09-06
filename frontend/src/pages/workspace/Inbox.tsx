import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  FilePen,
  Inbox as InboxIcon,
  Paperclip,
  Send,
  Star,
  Trash2,
} from 'lucide-react';
import {
  attentionSegments,
  AttentionDot,
  AttentionRail,
  attentionVisual,
  attentionWeight,
  Button,
  Chip,
  ConfirmDialog,
  DURATION,
  EASE,
  EmptyState,
  ExpandingSearch,
  HeaderCountSummary,
  type HeaderCountSegment,
  InteractiveRow,
  isTinted,
  MailThreadView,
  Reveal,
  Stagger,
  WorkspacePage,
} from '../../components/workspace';
import { summarizeAttention } from '../../lib/attention';
import { INBOX_CATEGORIES } from '../../lib/workspaceData';
import {
  getDraftThreadDetail,
  getDraftThreadRow,
  getOutgoingThreadDetail,
  mailActions,
  outgoingRowToStoredMailRow,
  useMailStore,
  type DraftRow,
  type OutgoingRow,
  type StoredMailRow,
} from '../../lib/mailStore';
import { mailViewById } from '../../lib/mailViews';
import {
  formatRelativeMailTime,
  truncatePreview,
} from '../../lib/mailAdapters';
import { formatScheduled } from '../../lib/scheduling';

/**
 * Inbox — awareness, not work (Design Constitution §15). Reading happens here;
 * working happens in Actions. So the page never asks for anything: it opens as
 * one continuous stream that quiets as it descends, and only expands into a
 * reading surface when the user chooses a thread (Reference §49, List + Detail).
 *
 * Built on the shared foundation — page template, motion vocabulary and surface
 * tokens are inherited, never redefined (Sprint 1 Rebuild Guide).
 *
 * Also renders the mail-management views (Starred/Snoozed/Scheduled/Sent/
 * Archive/Trash/Spam) reached via `/inbox/:view` — same component, same
 * Stream/ThreadView rendering, filtered to a different slice of the shared
 * `mailStore`. There is no in-page navigation between them; the only entry
 * points are whichever views are pinned to Quick Access (Settings → Quick
 * Access) — see plan note in the repo's planning doc for why.
 */

/* --------------------------------- Search -------------------------------- */

/** Matches the same fields a reader actually sees in the row: sender, address,
 * subject and the real content preview — never IIL insight text (Inbox has
 * none of its own) and never a page-specific extra field, so "search inbox"
 * means the same thing on every mail-management view this page renders. */
function matchesRowQuery(row: StoredMailRow, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return [row.sender, row.senderEmail ?? '', row.subject, row.snippet]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

/** Sent/Scheduled search — recipients (the column a reader actually scans for
 * "did I already write to them"), subject and preview. */
function matchesOutgoingQuery(row: OutgoingRow, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return [...row.recipients.to, ...row.recipients.cc, ...row.recipients.bcc, row.subject, row.snippet]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

/** Drafts search — recipients, subject and the draft's own written text. */
function matchesDraftQuery(draft: DraftRow, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return [
    ...draft.recipients.to,
    ...draft.recipients.cc,
    ...draft.recipients.bcc,
    draft.subject,
    draft.body.text,
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

/** Search-aware empty-state copy — every mail-list flavor on this page needs
 * the same distinction (nothing here at all, vs. nothing matches the current
 * search) and the same "Clear search" way out, so the mechanism (when to
 * switch copy, the Clear button) lives here once; each caller still supplies
 * its own grammatically-correct search-miss text ("mail" is a mass noun,
 * "drafts" isn't — a single templated string can't get both right). Falls
 * back to the view's own default copy when there's no active, zero-result
 * search. */
function searchEmptyState(
  query: string,
  visibleCount: number,
  totalCount: number,
  defaults: { title: string; description: string },
  onClearSearch: () => void,
  searchMiss: { title: string; description: string }
): { title: string; description: string; action?: ReactNode } {
  if (query && visibleCount === 0 && totalCount > 0) {
    return {
      ...searchMiss,
      action: (
        <Button variant="outline" onClick={onClearSearch}>
          Clear search
        </Button>
      ),
    };
  }
  return defaults;
}

/* --------------------------------- Stream -------------------------------- */

const TRUNCATE: CSSProperties = {
  minWidth: 0,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

/**
 * One line of the stream.
 *
 * Two independent signals, exactly as everywhere else: read state (the
 * neutral leading dot + the sender's weight) and attention (the coral/gold
 * dot, plus the same accent rail and background wash every other page uses,
 * run at Inbox's quieter `row` density). Inbox used to be dot-only, which
 * meant an *urgent* mail was visually indistinguishable from a normal one
 * here while being unmissable on Actions — the same mail, two different
 * answers. It now speaks the same language as every other surface, just
 * softly.
 *
 * READABILITY IS NOT A SIGNAL. This row used to fade sender/subject/preview/
 * time by list position (`0.94 - index * 0.06` and friends), so the sixth
 * mail down was materially harder to read than the first — for no reason
 * other than being sixth. Every text color here is now a fixed ladder token.
 * Attention adds a wash and a rail; it never subtracts contrast.
 *
 * Runs through the same `InteractiveRow` engine as Actions/Opportunities, but
 * dialed quieter — no lift, no elevation shadow, just the background wash —
 * matching "awareness, not work".
 */
function StreamRow({
  row,
  last,
  onOpen,
  onToggleStar,
}: {
  row: StoredMailRow;
  last: boolean;
  onOpen: () => void;
  onToggleStar: () => void;
}) {
  const attention = row.attention;
  const tinted = isTinted(attention);

  return (
    <InteractiveRow
      onClick={onOpen}
      // The star below is a real control inside this row — see
      // `containsInteractive` for why that means the row can't itself be a
      // `<button>`.
      containsInteractive
      visual={{
        ...attentionVisual(attention, 'row'),
        lift: 0,
        hoverShadow: 'none',
      }}
      className="iil-stream-row"
      style={{
        position: 'relative',
        overflow: tinted ? 'hidden' : undefined,
        minHeight: 48,
        paddingInline: 14,
        borderRadius: 8,
        borderBottom:
          last || tinted ? 'none' : '1px solid rgb(var(--ink) / 0.05)',
      }}
    >
      {/* The same 3px accent rail every other surface carries: coral for
          urgent, gold for important, nothing for normal. */}
      <AttentionRail attention={attention} />

      {/* Unread dot (neutral, fixed shade) and attention dot (coral/gold) are
          separate marks — see `AttentionDot`. The unread dot never takes an
          attention color, and neither is ever faded by list position. */}
      <AttentionDot
        className="iil-stream-dot"
        attention={attention}
        unread={row.unread}
      />

      <span
        className="iil-stream-sender"
        style={{
          ...TRUNCATE,
          font: `${row.unread ? 600 : attentionWeight(attention)} 12.5px Inter, sans-serif`,
          color: row.unread ? 'var(--text-strong)' : 'var(--text)',
        }}
      >
        {row.sender}
      </span>

      <span
        className="iil-stream-subject"
        style={{
          ...TRUNCATE,
          font: `${row.unread ? 500 : 400} 12.5px Inter, sans-serif`,
          color: row.unread ? 'var(--text)' : 'var(--text-secondary)',
        }}
      >
        {row.subject}
      </span>

      {/* The email's own preview — Inbox is deliberately kept Gmail-plain
          (Constitution: familiar ground for a new user), so this is always
          real content, never IIL's own insight text, and never tinted by
          attention: the rail and dot carry that, this stays plain readable
          body text. Always rendered, even for a completed row — a resolved
          item still had a real email. */}
      <span
        className="iil-stream-insight"
        style={{
          ...TRUNCATE,
          font: '400 12px Inter, sans-serif',
          color: 'var(--text-secondary)',
        }}
      >
        {truncatePreview(row.snippet)}
      </span>

      <span
        className="iil-mono iil-stream-time"
        style={{
          font: '400 10.5px "JetBrains Mono", monospace',
          color: 'var(--text-muted)',
          textAlign: 'right',
        }}
      >
        {formatRelativeMailTime(row.date)}
      </span>

      {/* Star — the one mandated row-level control. Always visible (not
          hover-only), inactive reads as a faint outline, active fills gold.
          Stops propagation so it toggles state without ever opening the
          thread underneath it. */}
      <button
        type="button"
        className="iil-stream-star"
        aria-label={
          row.starred ? `Unstar ${row.subject}` : `Star ${row.subject}`
        }
        aria-pressed={row.starred}
        onClick={(e) => {
          e.stopPropagation();
          onToggleStar();
        }}
        style={{
          width: 22,
          height: 22,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          color: row.starred ? 'var(--gold-ink)' : 'var(--text-faint)',
        }}
      >
        <Star
          size={14}
          strokeWidth={1.75}
          fill={row.starred ? 'currentColor' : 'none'}
          aria-hidden
        />
      </button>
    </InteractiveRow>
  );
}

function Stream({
  rows,
  heading,
  count,
  meta,
  category,
  categoryCounts,
  showCategories,
  onCategory,
  onOpen,
  onToggleStar,
  emptyTitle,
  emptyDescription,
  emptyAction,
  query,
  onQueryChange,
}: {
  /** Already narrowed to the current search query — the full, unfiltered set
   * still backs `railCount`/the thread rail (see `Inbox()`), the same split
   * Actions/Opportunities use between their visible tiers and their rail. */
  rows: StoredMailRow[];
  heading: string;
  count: number;
  /** The shared "N mails · N urgent · N important" header pattern — only the
   * default Inbox view supplies this; Starred/Snoozed/Archive/Trash/Spam keep
   * their existing bare count (they're mail-management views over an
   * arbitrary slice, not a queue with an attention shape of its own). */
  meta?: HeaderCountSegment[];
  category: string;
  categoryCounts: Record<string, number>;
  showCategories: boolean;
  onCategory: (c: string) => void;
  onOpen: (id: string) => void;
  onToggleStar: (id: string) => void;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: ReactNode;
  query: string;
  onQueryChange: (next: string) => void;
}) {
  return (
    <WorkspacePage scale={1.1}>
      {/* One tight cluster, not islands — Inbox is a single continuous surface,
          so it sets its own internal rhythm inside the shared rail. */}
      <Stagger style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Reveal>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
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
                {heading}
              </h1>
              {meta ? (
                <HeaderCountSummary segments={meta} />
              ) : (
                <span
                  style={{
                    font: '400 12px/1.4 Inter, sans-serif',
                    color: 'var(--text-muted)',
                  }}
                >
                  {count}
                </span>
              )}
            </div>
            <ExpandingSearch
              query={query}
              onQueryChange={onQueryChange}
              placeholder={`Search ${heading.toLowerCase()}…`}
              ariaLabel={`Search ${heading.toLowerCase()}`}
            />
          </div>
        </Reveal>

        {showCategories && (
          <Reveal>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              {INBOX_CATEGORIES.map((c) => (
                <Chip
                  key={c}
                  active={category === c}
                  onClick={() => onCategory(c)}
                >
                  {c} · {categoryCounts[c] ?? 0}
                </Chip>
              ))}
            </div>
          </Reveal>
        )}

        <Reveal>
          {rows.length === 0 ? (
            <EmptyState
              icon={<InboxIcon size={22} strokeWidth={1.5} aria-hidden />}
              title={emptyTitle}
              description={emptyDescription}
              action={emptyAction}
            />
          ) : (
            <div>
              {rows.map((row, i) => (
                <StreamRow
                  key={row.id}
                  row={row}
                  last={i === rows.length - 1}
                  onOpen={() => onOpen(row.id)}
                  onToggleStar={() => onToggleStar(row.id)}
                />
              ))}
            </div>
          )}
        </Reveal>
      </Stagger>
    </WorkspacePage>
  );
}

/* ------------------------------ Outgoing (Sent/Scheduled) ----------------- */

/** Sent and Scheduled hold outgoing mail, not received `MailRow`s — a
 * simpler, single-line row (no unread/gold/category), with Scheduled rows
 * additionally getting functional "Send now" / "Cancel" controls. Clicking
 * the row itself (same `InteractiveRow` engine every other openable row
 * uses) opens it through the canonical mail-detail view — a sent or
 * scheduled reply is still a real message, and there's no reason it should
 * be the one place in the app you can't read what you actually wrote. */
function OutgoingRowView({
  row,
  last,
  scheduled,
  onOpen,
}: {
  row: OutgoingRow;
  last: boolean;
  scheduled: boolean;
  onOpen: () => void;
}) {
  return (
    <InteractiveRow
      onClick={onOpen}
      // Scheduled rows carry their own Send now / Cancel controls — same
      // nested-interactive rule as Inbox's star.
      containsInteractive={scheduled}
      visual={{
        hoverBg: 'rgb(var(--ink) / 0.04)',
        lift: 0,
        hoverShadow: 'none',
      }}
      style={{
        gap: 12,
        minHeight: 48,
        paddingInline: 14,
        borderBottom: last ? 'none' : '1px solid rgb(var(--ink) / 0.05)',
      }}
    >
      <span
        style={{
          ...TRUNCATE,
          flex: '0 1 220px',
          font: '500 12.5px Inter, sans-serif',
          color: 'rgb(var(--ink) / 0.8)',
        }}
      >
        {row.recipients.to.join(', ')}
      </span>
      <span
        style={{
          ...TRUNCATE,
          flex: '0 1 260px',
          font: '400 12.5px Inter, sans-serif',
          color: 'rgb(var(--ink) / 0.66)',
        }}
      >
        {row.subject}
      </span>
      <span
        style={{
          ...TRUNCATE,
          flex: 1,
          font: '400 12px Inter, sans-serif',
          color: 'var(--text-faint)',
        }}
      >
        {truncatePreview(row.snippet)}
      </span>
      {scheduled && row.scheduledFor && (
        <span
          className="iil-mono"
          style={{
            flex: 'none',
            font: '400 10px "JetBrains Mono", monospace',
            color: 'var(--gold-ink)',
          }}
        >
          {formatScheduled(new Date(row.scheduledFor))}
        </span>
      )}
      {scheduled ? (
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flex: 'none',
          }}
        >
          <button
            type="button"
            className="iil-btn iil-btn--outline"
            onClick={(e) => {
              // Stops the click from also bubbling up to the row's own
              // `onOpen` — these two buttons act on the row directly, they
              // shouldn't also open it.
              e.stopPropagation();
              mailActions.sendScheduledNow(row.id);
            }}
          >
            <Send size={12} strokeWidth={2} aria-hidden />
            Send now
          </button>
          <button
            type="button"
            className="iil-btn iil-btn--ghost"
            onClick={(e) => {
              e.stopPropagation();
              mailActions.cancelScheduled(row.id);
            }}
          >
            Cancel
          </button>
        </span>
      ) : (
        <span
          className="iil-mono"
          style={{
            flex: 'none',
            font: '400 10.5px "JetBrains Mono", monospace',
            color: 'var(--text-faint)',
          }}
        >
          {formatRelativeMailTime(row.date)}
        </span>
      )}
    </InteractiveRow>
  );
}

function OutgoingStream({
  rows,
  totalCount,
  heading,
  scheduled,
  emptyTitle,
  emptyDescription,
  emptyAction,
  onOpen,
  query,
  onQueryChange,
}: {
  /** Already narrowed to the current search query. */
  rows: OutgoingRow[];
  /** The full, unfiltered count — the header number stays "how many total",
   * the same convention Stream's own `count` prop uses. */
  totalCount: number;
  heading: string;
  scheduled: boolean;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: ReactNode;
  onOpen: (id: string) => void;
  query: string;
  onQueryChange: (next: string) => void;
}) {
  return (
    <WorkspacePage scale={1.1}>
      <Stagger style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Reveal>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <h1
                style={{
                  margin: 0,
                  font: 'var(--type-page-title)',
                  letterSpacing: '-0px',
                  color: 'var(--text-strong)',
                }}
              >
                {heading}
              </h1>
              <span
                style={{
                  font: '400 12px/1.4 Inter, sans-serif',
                  color: 'var(--text-muted)',
                }}
              >
                {totalCount}
              </span>
            </div>
            <ExpandingSearch
              query={query}
              onQueryChange={onQueryChange}
              placeholder={`Search ${heading.toLowerCase()}…`}
              ariaLabel={`Search ${heading.toLowerCase()}`}
            />
          </div>
        </Reveal>
        <Reveal>
          {rows.length === 0 ? (
            <EmptyState
              icon={<InboxIcon size={22} strokeWidth={1.5} aria-hidden />}
              title={emptyTitle}
              description={emptyDescription}
              action={emptyAction}
            />
          ) : (
            <div>
              {rows.map((row, i) => (
                <OutgoingRowView
                  key={row.id}
                  row={row}
                  last={i === rows.length - 1}
                  scheduled={scheduled}
                  onOpen={() => onOpen(row.id)}
                />
              ))}
            </div>
          )}
        </Reveal>
      </Stagger>
    </WorkspacePage>
  );
}

/* --------------------------------- Drafts --------------------------------- */

/**
 * One unsent reply.
 *
 * Its own row rather than a variant of `OutgoingRowView` above, because a
 * draft genuinely carries different columns: no send time (it hasn't been
 * sent and isn't scheduled to be), a modified time instead, and an attachment
 * count — the one piece of a draft that is otherwise invisible until you
 * reopen it, and the one most worth knowing before you do.
 *
 * Laid out on the same container-query grid `.iil-stream-row` uses (see
 * index.css) rather than the flex line Sent/Scheduled use: five pieces of
 * text that each have to truncate inside their own track, which is exactly
 * the problem that grid already solves on this page.
 */
function DraftRowView({
  draft,
  last,
  onOpen,
  onDiscard,
}: {
  draft: DraftRow;
  last: boolean;
  onOpen: () => void;
  onDiscard: () => void;
}) {
  // Everyone the reply is addressed to, in the composer's own order. Cc is
  // counted rather than listed — the row has one recipient column, and a
  // reply's To is what identifies it; "+2" is enough to know there are more
  // without the column losing the name that matters.
  const to = draft.recipients.to.join(', ');
  const extra = draft.recipients.cc.length + draft.recipients.bcc.length;

  return (
    <InteractiveRow
      onClick={onOpen}
      // Carries its own Discard control — same nested-interactive rule as
      // Inbox's star and Scheduled's Send now / Cancel.
      containsInteractive
      visual={{
        hoverBg: 'rgb(var(--ink) / 0.04)',
        lift: 0,
        hoverShadow: 'none',
      }}
      className="iil-draft-row"
      style={{
        minHeight: 48,
        paddingInline: 14,
        borderRadius: 8,
        borderBottom: last ? 'none' : '1px solid rgb(var(--ink) / 0.05)',
      }}
    >
      <span
        className="iil-draft-recipient"
        style={{
          ...TRUNCATE,
          font: '500 12.5px Inter, sans-serif',
          color: 'var(--text)',
        }}
      >
        {/* A draft saved before its recipient was filled in is a real state
            the composer allows (Save as draft has no valid-recipient gate —
            only Send does), so this says so rather than rendering blank. */}
        {to || 'No recipient'}
        {extra > 0 && (
          <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>
            {' '}
            +{extra}
          </span>
        )}
      </span>

      <span
        className="iil-draft-subject"
        style={{
          ...TRUNCATE,
          font: '400 12.5px Inter, sans-serif',
          color: 'var(--text-secondary)',
        }}
      >
        {draft.subject}
      </span>

      <span
        className="iil-draft-preview"
        style={{
          ...TRUNCATE,
          font: '400 12px Inter, sans-serif',
          color: 'var(--text-faint)',
        }}
      >
        {truncatePreview(draft.body.text)}
      </span>

      <span
        className="iil-draft-meta"
        style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}
      >
        {draft.attachments.length > 0 && (
          <span
            aria-label={`${draft.attachments.length} attachment${draft.attachments.length === 1 ? '' : 's'}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              font: '400 10.5px Inter, sans-serif',
              color: 'var(--text-muted)',
            }}
          >
            <Paperclip size={11} strokeWidth={2} aria-hidden />
            {draft.attachments.length}
          </span>
        )}
        {/* Last modified, computed from the stored ISO timestamp at render —
            the same treatment (and the same helper) every other time on this
            page gets, never a stored "2 hours ago". */}
        <span
          className="iil-mono"
          style={{
            font: '400 10.5px "JetBrains Mono", monospace',
            color: 'var(--text-faint)',
          }}
        >
          {formatRelativeMailTime(draft.updatedAt)}
        </span>
      </span>

      <span className="iil-draft-actions" style={{ flex: 'none' }}>
        <button
          type="button"
          className="iil-btn iil-btn--ghost"
          onClick={(e) => {
            // Acts on the row directly — it must not also open it.
            e.stopPropagation();
            onDiscard();
          }}
        >
          Discard
        </button>
      </span>
    </InteractiveRow>
  );
}

function DraftStream({
  drafts,
  totalCount,
  heading,
  emptyTitle,
  emptyDescription,
  emptyAction,
  onOpen,
  query,
  onQueryChange,
}: {
  /** Already narrowed to the current search query. */
  drafts: DraftRow[];
  /** The full, unfiltered count. */
  totalCount: number;
  heading: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: ReactNode;
  onOpen: (threadId: string) => void;
  query: string;
  onQueryChange: (next: string) => void;
}) {
  // Discarding a draft permanently deletes real, user-authored content — no
  // trash/undo path exists for it (unlike Trash/Spam/Archive, which are all
  // reversible and correctly fire immediately). Same confirmation tier as
  // Settings' Reset/Delete Account, gated locally here since `DraftStream`
  // already owns the row list end to end.
  const [confirmThreadId, setConfirmThreadId] = useState<string | null>(null);
  const confirmDraft = drafts.find((d) => d.threadId === confirmThreadId);

  return (
    <WorkspacePage scale={1.1}>
      <Stagger style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Reveal>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <h1
                style={{
                  margin: 0,
                  font: 'var(--type-page-title)',
                  letterSpacing: '-0px',
                  color: 'var(--text-strong)',
                }}
              >
                {heading}
              </h1>
              <span
                style={{
                  font: '400 12px/1.4 Inter, sans-serif',
                  color: 'var(--text-muted)',
                }}
              >
                {totalCount}
              </span>
            </div>
            <ExpandingSearch
              query={query}
              onQueryChange={onQueryChange}
              placeholder={`Search ${heading.toLowerCase()}…`}
              ariaLabel={`Search ${heading.toLowerCase()}`}
            />
          </div>
        </Reveal>
        <Reveal>
          {drafts.length === 0 ? (
            <EmptyState
              icon={<FilePen size={22} strokeWidth={1.5} aria-hidden />}
              title={emptyTitle}
              description={emptyDescription}
              action={emptyAction}
            />
          ) : (
            <div>
              {drafts.map((draft, i) => (
                <DraftRowView
                  // Keyed by thread, not by `draft.id`. Both are unique — one
                  // draft per thread — but `id` is provisional until a server
                  // assigns the real one, and keying off it would make that
                  // reconciliation tear down and rebuild the row for a change
                  // the reader has no reason to see. The thread is what this
                  // row *is*.
                  key={draft.threadId}
                  draft={draft}
                  last={i === drafts.length - 1}
                  onOpen={() => onOpen(draft.threadId)}
                  onDiscard={() => setConfirmThreadId(draft.threadId)}
                />
              ))}
            </div>
          )}
        </Reveal>
      </Stagger>
      <ConfirmDialog
        open={confirmDraft !== undefined}
        title="Discard this draft?"
        message={`This permanently deletes the reply to ${confirmDraft?.recipients.to.join(', ') || 'no recipient'}. This can't be undone.`}
        confirmLabel="Discard draft"
        onConfirm={() => {
          if (confirmThreadId) mailActions.discardDraft(confirmThreadId);
          setConfirmThreadId(null);
        }}
        onCancel={() => setConfirmThreadId(null)}
      />
    </WorkspacePage>
  );
}

/* ---------------------------------- Page --------------------------------- */

export default function Inbox() {
  const { view } = useParams<{ view?: string }>();
  const viewDef = view ? mailViewById(view) : undefined;
  const store = useMailStore();
  const [category, setCategory] = useState<string>('All');
  // Guards the opened-draft detail view's own "Discard draft" button — same
  // reasoning as `DraftStream`'s row-level confirm: this permanently deletes
  // unrecoverable, user-authored content, unlike the reversible Delete/
  // Archive/Snooze/Spam actions every other opened-mail view offers.
  const [confirmDiscardOpenDraft, setConfirmDiscardOpenDraft] = useState<
    string | null
  >(null);
  // One query, reused across every mail-list flavor this page renders — the
  // same "one shared piece of state, page-local matching logic" split
  // `ExpandingSearch` already establishes for Actions/Opportunities/
  // Approvals, not a separate search implementation per view.
  const [query, setQuery] = useState('');
  const location = useLocation();
  // Dashboard can deep-link straight to one Inbox mail by navigating here
  // with `state: { openMailId }` — read synchronously into the initial
  // state (rather than set from a post-mount effect) so the thread view is
  // what AnimatePresence renders on the very first paint, not a key-swap
  // that fights the page's own enter transition and leaves it stuck
  // mid-fade.
  const [openId, setOpenId] = useState<string | null>(
    () => (location.state as { openMailId?: string } | null)?.openMailId ?? null
  );
  const reduced = useReducedMotion();

  // Reset the open thread whenever the view itself changes (navigating
  // between Quick Access links) — nothing in the new view guarantees the
  // previously open id still exists there. Skipped on the very first render
  // so it doesn't immediately clear an id just seeded from a deep link.
  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current) {
      setOpenId(null);
      // A query that matched something in the previous view has no reason to
      // still apply here — carrying it over would silently hide mail in the
      // new view for a search term the reader never typed with THIS list in
      // mind.
      setQuery('');
    }
    mountedRef.current = true;
  }, [view]);

  const isOutgoing = viewDef?.id === 'sent' || viewDef?.id === 'scheduled';
  const isDrafts = viewDef?.id === 'drafts';

  const rows = useMemo(() => {
    const filtered = !viewDef
      ? store.rows.filter(
          (r) =>
            r.status === 'inbox' &&
            (category === 'All' || r.category === category)
        )
      : (() => {
          switch (viewDef.id) {
            case 'starred':
              return store.rows.filter((r) => r.starred);
            case 'snoozed':
            case 'trash':
            case 'spam':
              return store.rows.filter((r) => r.status === viewDef.id);
            case 'archive':
              return store.rows.filter((r) => r.status === 'archived');
            default:
              return [];
          }
        })();
    // Newest first by default, same as every real inbox — keyed on the
    // row's own `date` (the thread's latest message, kept current by
    // `mergeSentReplyIntoThread` whenever a reply goes out), never
    // insertion order. A plain numeric comparator, not a fixed snapshot: it
    // re-sorts from whatever `store.rows` looks like on every render, so a
    // message arriving, a reply going out, or one just sitting untouched
    // for months all keep landing in the right place without this needing
    // to know or care which of those happened.
    return [...filtered].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [store.rows, category, viewDef]);

  // Narrowed to the search query — `rows` above stays the view's full set
  // (it still backs the thread rail below, the same split Actions/
  // Opportunities keep between their full active set and their filtered
  // visible tiers), this is only what the list itself renders.
  const visibleRows = useMemo(
    () => rows.filter((r) => matchesRowQuery(r, query)),
    [rows, query]
  );

  // Total mailbox count and per-category breakdown, both independent of the
  // currently selected tab — "how many mails are actually in each bucket",
  // not "how many are currently displayed" (mirrors Opportunities' own
  // `counts` memo, which does the same for its lifecycle tabs).
  const categoryCounts = useMemo(() => {
    const visible = store.rows.filter((r) => r.status === 'inbox');
    const counts: Record<string, number> = { All: visible.length };
    for (const c of INBOX_CATEGORIES) {
      if (c === 'All') continue;
      counts[c] = visible.filter((r) => r.category === c).length;
    }
    return counts;
  }, [store.rows]);
  const inboxCount = categoryCounts.All ?? 0;

  // The header's "N mails · N urgent · N important" — the same
  // segments, the same words and the same counting mechanism every other
  // page uses (`summarizeAttention` → `attentionSegments`), off the same
  // `row.attention` field the rows themselves render.
  //
  // The one page-specific part is the total. Unlike Actions/Approvals/
  // Opportunities — real workflow queues, where a completed item genuinely
  // leaves the active set — a resolved Inbox message doesn't disappear from
  // the inbox; it's still real mail sitting there, just handled. So nothing
  // is treated as "completed" for the total here, and the number matches the
  // "All" chip. The urgent/important counts still can't be inflated by
  // resolved mail, because completing a row sets its attention to `normal`
  // at the store (`mailActions.complete`) rather than relying on each page
  // to filter it back out.
  const inboxCounts = useMemo(
    () =>
      summarizeAttention(
        store.rows.filter((r) => r.status === 'inbox'),
        { isCompleted: () => false, attentionOf: (r) => r.attention }
      ),
    [store.rows]
  );

  // Sent/Scheduled are already prepended-on-send (newest at index 0), but
  // sorting explicitly by `date` — the same comparator `rows` above uses —
  // means this stays correct even if that insertion assumption ever stops
  // holding (e.g. a future bulk-import), rather than silently relying on it.
  const outgoingRows = useMemo(() => {
    const base =
      viewDef?.id === 'sent'
        ? store.sent
        : viewDef?.id === 'scheduled'
          ? store.scheduled
          : [];
    return [...base].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [store.sent, store.scheduled, viewDef]);

  // Narrowed to the search query, same split as `visibleRows` above.
  const visibleOutgoingRows = useMemo(
    () => outgoingRows.filter((r) => matchesOutgoingQuery(r, query)),
    [outgoingRows, query]
  );

  // Sent/Scheduled don't share the unified `rows` array (no unread/starred/
  // status to track for something you already sent), so opening one through
  // the same canonical `MailThreadView` every other page uses means adapting
  // each row on the fly rather than reading it pre-adapted from the store.
  const adaptedOutgoingRows = useMemo(
    () => outgoingRows.map(outgoingRowToStoredMailRow),
    [outgoingRows]
  );

  // Newest-modified first. A draft's place in the list is its `updatedAt`, so
  // editing one moves it to the top — the ordering every Drafts folder uses,
  // and the reason `saveDraft` stores a real ISO timestamp rather than
  // relying on insertion order (its upsert replaces in place, so position
  // alone would leave an edited draft stranded wherever it started).
  //
  // Sorted here rather than in the store, the same as `rows` and
  // `outgoingRows` above: order is a property of this view, not of the record.
  const draftRows = useMemo(
    () =>
      [...store.drafts].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
    [store.drafts]
  );

  // Narrowed to the search query, same split as `visibleRows` above.
  const visibleDraftRows = useMemo(
    () => draftRows.filter((d) => matchesDraftQuery(d, query)),
    [draftRows, query]
  );

  // The conversation behind each draft, in the same order — this is what the
  // thread rail lists and what `openId` (a draft's `threadId`) indexes into.
  // Resolved through the store rather than here so the Drafts page stays a
  // pure view; see `getDraftThreadRow` for what happens to a draft whose
  // thread this client isn't holding.
  const draftThreadRows = useMemo(
    () => draftRows.map(getDraftThreadRow),
    // The mailbox deps are load-bearing, not decorative: `getDraftThreadRow`
    // is a plain import, so the exhaustive-deps rule can't see that it reads
    // the store's own mutable state — but it does, and sending a reply from
    // one of these threads changes the thread without changing the draft
    // list. Dropping them (as the rule suggests) would leave the rail holding
    // pre-reply rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draftRows, store.rows, store.sent, store.scheduled]
  );

  // Stream ⇄ thread is a change of focus inside one page, so it crossfades in
  // place rather than borrowing the route transition (Reference §53).
  const swap = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -4 },
      };

  // The draft currently open, if any. Derived from the canonical list rather
  // than tracked separately, so a draft that leaves that list — discarded,
  // sent, scheduled — takes the open view with it instead of leaving
  // `MailThreadView` to fall back to `rows[0]` and silently show a different
  // person's reply under the id the user opened.
  const openDraft =
    isDrafts && openId
      ? draftRows.find((d) => d.threadId === openId)
      : undefined;

  if (isDrafts && viewDef) {
    return (
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={openDraft ? 'thread' : 'stream'}
          style={{ height: '100%' }}
          initial={swap.initial}
          animate={swap.animate}
          exit={swap.exit}
          transition={{ duration: DURATION.page, ease: EASE }}
        >
          {openDraft ? (
            <>
            <MailThreadView
              // The threads the drafts belong to, not the drafts themselves —
              // opening a draft opens the conversation it was written inside,
              // which is the whole reason `DraftRow` is keyed by `threadId`.
              // The composer resumes from `mailActions.getDraft(selected.id)`
              // exactly as it does when the same thread is reopened from
              // Inbox; there is no second draft-editing surface.
              rows={draftThreadRows}
              openId={openDraft.threadId}
              railLabel={viewDef.label}
              railCount={draftRows.length}
              getThreadDetail={(row) => {
                const draft = draftRows.find((d) => d.threadId === row.id);
                return draft ? getDraftThreadDetail(draft) : undefined;
              }}
              // Opens straight onto the composer, resumed. Reaching a draft
              // and being shown the idle Reply button — with the draft one
              // more click away — would be the same "did that save?" doubt
              // the Drafts view exists to remove.
              defaultExpanded
              onSelect={setOpenId}
              onClose={() => setOpenId(null)}
              // Sending or scheduling consumes the draft (see `sendReply`), so
              // the record being viewed stops existing at that moment and the
              // view returns to the list — where it is visibly gone, and has
              // visibly arrived in Sent or Scheduled.
              onSend={(selected, payload) => {
                const draft = draftRows.find((d) => d.threadId === selected.id);
                mailActions.sendReply({
                  threadId: selected.id,
                  recipients: payload.recipients,
                  // The subject already on the draft, not a freshly rebuilt
                  // `re:` — this reply has one on file and it is the one the
                  // user saved.
                  subject: draft?.subject ?? `re: ${selected.subject}`,
                  body: payload.body,
                  attachments: payload.attachments,
                });
                setOpenId(null);
              }}
              onSchedule={(selected, payload, date) => {
                const draft = draftRows.find((d) => d.threadId === selected.id);
                mailActions.scheduleReply({
                  threadId: selected.id,
                  recipients: payload.recipients,
                  subject: draft?.subject ?? `re: ${selected.subject}`,
                  body: payload.body,
                  attachments: payload.attachments,
                  date,
                });
                setOpenId(null);
              }}
              // Replaces the default Delete/Archive/Snooze/Spam bar: those act
              // on a received message, and what is being read here is an
              // unsent reply. Discarding it is the only email-level action a
              // draft has that the composer above doesn't already own.
              footer={({ selected }) => (
                <>
                  <button
                    type="button"
                    className="iil-btn iil-btn--danger"
                    onClick={() => setConfirmDiscardOpenDraft(selected.id)}
                  >
                    <Trash2 size={13} strokeWidth={2} aria-hidden />
                    Discard draft
                  </button>
                  <span />
                </>
              )}
            />
            <ConfirmDialog
              open={confirmDiscardOpenDraft !== null}
              title="Discard this draft?"
              message="This permanently deletes the reply. This can't be undone."
              confirmLabel="Discard draft"
              onConfirm={() => {
                if (confirmDiscardOpenDraft) {
                  mailActions.discardDraft(confirmDiscardOpenDraft);
                }
                setConfirmDiscardOpenDraft(null);
                setOpenId(null);
              }}
              onCancel={() => setConfirmDiscardOpenDraft(null)}
            />
            </>
          ) : (
            (() => {
              const empty = searchEmptyState(
                query,
                visibleDraftRows.length,
                draftRows.length,
                { title: viewDef.emptyTitle, description: viewDef.emptyDescription },
                () => setQuery(''),
                {
                  title: 'No drafts match your search.',
                  description: 'Try a different search term, or clear it to see every draft.',
                }
              );
              return (
                <DraftStream
                  drafts={visibleDraftRows}
                  totalCount={draftRows.length}
                  heading={viewDef.label}
                  emptyTitle={empty.title}
                  emptyDescription={empty.description}
                  emptyAction={empty.action}
                  onOpen={setOpenId}
                  query={query}
                  onQueryChange={setQuery}
                />
              );
            })()
          )}
        </motion.div>
      </AnimatePresence>
    );
  }

  if (isOutgoing && viewDef) {
    const scheduled = viewDef.id === 'scheduled';
    return (
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={openId ? 'thread' : 'stream'}
          style={{ height: '100%' }}
          initial={swap.initial}
          animate={swap.animate}
          exit={swap.exit}
          transition={{ duration: DURATION.page, ease: EASE }}
        >
          {openId ? (
            <MailThreadView
              rows={adaptedOutgoingRows}
              openId={openId}
              railLabel={viewDef.label}
              railCount={outgoingRows.length}
              // A reply that's linked back to where it came from
              // (`threadId`, set whenever the reply was actually sent from
              // an opened thread) opens showing that thread's own earlier
              // messages, exactly like a real client's Sent view — this
              // row is one message in an ongoing conversation, not a
              // freestanding one. Only truly standalone outgoing rows (no
              // `threadId` on file) fall back to `MailThreadView`'s own
              // single-message rendering.
              getThreadDetail={(row) => {
                const raw = outgoingRows.find((r) => r.id === row.id);
                return raw ? getOutgoingThreadDetail(raw) : undefined;
              }}
              onSelect={setOpenId}
              onClose={() => setOpenId(null)}
              // Sent/Scheduled rows carry no read/starred state of their
              // own to toggle — these stay no-ops rather than silently
              // mutating the unrelated `rows` array an id collision might
              // otherwise touch.
              onToggleStar={() => {}}
              onMarkRead={() => {}}
              onMarkUnread={() => {}}
              // Replying here should go back to the original recipient
              // (`selected.to`, preserved by the adapter above) — never to
              // `selected.senderEmail`, which for an outgoing row is this
              // mailbox's own address. Carries the *original* thread id
              // forward (not this reply's own id) so a reply to a reply
              // still lands in the same conversation instead of starting a
              // new, disconnected one.
              onSend={(selected, payload) => {
                const raw = outgoingRows.find((r) => r.id === selected.id);
                mailActions.sendReply({
                  ...payload,
                  subject: `re: ${selected.subject}`,
                  threadId: raw?.threadId ?? selected.id,
                });
              }}
              onSchedule={(selected, payload, date) => {
                const raw = outgoingRows.find((r) => r.id === selected.id);
                mailActions.scheduleReply({
                  ...payload,
                  subject: `re: ${selected.subject}`,
                  threadId: raw?.threadId ?? selected.id,
                  date,
                });
              }}
              // Replaces the default Delete/Archive/Snooze/Spam bar, none
              // of which make sense for mail you've already sent (or is
              // waiting to send) — Scheduled keeps its own "Send now" /
              // "Cancel" pair instead, same actions the list row offers;
              // Sent has no further action beyond reading/replying.
              footer={
                scheduled
                  ? ({ selected }) => (
                      <>
                        <span />
                        <span
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <button
                            type="button"
                            className="iil-btn iil-btn--outline"
                            onClick={() => {
                              mailActions.sendScheduledNow(selected.id);
                              setOpenId(null);
                            }}
                          >
                            <Send size={13} strokeWidth={2} aria-hidden />
                            Send now
                          </button>
                          <button
                            type="button"
                            className="iil-btn iil-btn--ghost"
                            onClick={() => {
                              mailActions.cancelScheduled(selected.id);
                              setOpenId(null);
                            }}
                          >
                            Cancel
                          </button>
                        </span>
                      </>
                    )
                  : // Sent has nothing left to act on — reading and replying
                    // both live above the bar. Returning null removes the bar
                    // rather than drawing its divider rule over an empty row.
                    () => null
              }
            />
          ) : (
            (() => {
              const empty = searchEmptyState(
                query,
                visibleOutgoingRows.length,
                outgoingRows.length,
                { title: viewDef.emptyTitle, description: viewDef.emptyDescription },
                () => setQuery(''),
                scheduled
                  ? {
                      title: 'No scheduled messages match your search.',
                      description: 'Try a different search term, or clear it to see everything scheduled.',
                    }
                  : {
                      title: 'No sent mail matches your search.',
                      description: 'Try a different search term, or clear it to see everything sent.',
                    }
              );
              return (
                <OutgoingStream
                  rows={visibleOutgoingRows}
                  totalCount={outgoingRows.length}
                  heading={viewDef.label}
                  scheduled={scheduled}
                  emptyTitle={empty.title}
                  emptyDescription={empty.description}
                  emptyAction={empty.action}
                  onOpen={setOpenId}
                  query={query}
                  onQueryChange={setQuery}
                />
              );
            })()
          )}
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={openId ? 'thread' : 'stream'}
        style={{ height: '100%' }}
        initial={swap.initial}
        animate={swap.animate}
        exit={swap.exit}
        transition={{ duration: DURATION.page, ease: EASE }}
      >
        {openId ? (
          <MailThreadView
            rows={rows}
            openId={openId}
            viewId={viewDef?.id}
            railLabel="Inbox"
            railCount={inboxCount}
            getThreadDetail={(row) => mailActions.getThreadDetail(row.id)}
            onSelect={setOpenId}
            onClose={() => setOpenId(null)}
          />
        ) : (
          (() => {
            const empty = searchEmptyState(
              query,
              visibleRows.length,
              rows.length,
              {
                title: viewDef?.emptyTitle ?? `Nothing in ${category}`,
                description:
                  viewDef?.emptyDescription ??
                  'Mail filed under this category will appear here as it arrives.',
              },
              () => setQuery(''),
              {
                title: 'No mail matches your search.',
                description: 'Try a different search term, or clear it to see everything here.',
              }
            );
            return (
              <Stream
                rows={visibleRows}
                heading={viewDef?.label ?? 'Inbox'}
                count={viewDef ? rows.length : inboxCount}
                meta={viewDef ? undefined : attentionSegments('mails', inboxCounts)}
                category={category}
                categoryCounts={categoryCounts}
                showCategories={!viewDef}
                onCategory={setCategory}
                onOpen={setOpenId}
                onToggleStar={(id) => mailActions.toggleStar(id)}
                emptyTitle={empty.title}
                emptyDescription={empty.description}
                emptyAction={empty.action}
                query={query}
                onQueryChange={setQuery}
              />
            );
          })()
        )}
      </motion.div>
    </AnimatePresence>
  );
}
