/**
 * The canonical opened-mail/thread-detail surface — extracted verbatim from
 * Inbox's original `ThreadView` (the newer, load-bearing mail-detail design)
 * so every page that opens an individual email/thread renders through this
 * one component instead of hand-rolling its own header/thread/reply/footer
 * markup. Inbox itself now just supplies Inbox-shaped data; Approvals (and
 * any future opened-mail surface) supplies its own data through the same
 * props rather than reimplementing the UI.
 *
 * What stays fixed here, for every caller: header (subject/sender/star/
 * close), the thread-history + current-message region, the IIL Insight
 * section (backed by the shared `IILInsight`), the Reply / IIL Suggested
 * Reply response area (backed by the shared `ReplyComposer`), and the
 * two-region flex layout that keeps the original email visible instead of
 * letting the composer push it off-screen. What callers can vary: which rows
 * appear in the rail, where thread detail/draft content comes from, whether
 * the AI draft starts expanded, the primary send button's label, what
 * actually happens on send/schedule, and the footer's actions.
 *
 * ONE READING ORDER, EVERYWHERE. Sender and subject, then the sender's own
 * message, then IIL's insight, then IIL's drafted reply, then the user's
 * actions. Because Inbox/Actions/Approvals/Opportunities/Dashboard all open
 * through this one component, that order — and the rule that AI-authored text
 * never appears inside the message body — holds on every page by
 * construction, rather than by five renderers each remembering it.
 */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  // The same `Archive` glyph the sidebar's Archive destination renders — its
  // registry entry (`lib/mailViews.ts`) imports this exact symbol from this
  // exact package, so the footer button and the nav item are one icon, not a
  // lookalike. Imported directly rather than read back out of `MAIL_VIEWS`
  // to match the three sibling buttons beside it, which already name their
  // icons here the same way (note `ShieldAlert` below is Spam's registry icon
  // reached by the same route).
  Archive,
  Check,
  ChevronDown,
  Clock,
  Inbox as InboxIcon,
  MailOpen,
  Reply as ReplyIcon,
  ShieldAlert,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { EASE } from './motion';
import { AttentionRail, Eyebrow } from './primitives';
import {
  attentionDotFill,
  attentionVisual,
  attentionWeight,
  isTinted,
} from './attention';
import { IILDisclosure, IILInsight } from './IILInsight';
import { createPortal } from 'react-dom';
import { InteractiveRow } from './InteractiveRow';
import {
  getPortalRoot,
  ReplyComposer,
  usePopoverPosition,
  type ComposerPayload,
} from './ReplyComposer';
import {
  mailActions,
  type OutgoingInput,
  type StoredMailRow,
} from '../../lib/mailStore';
import { toBodyContent } from '../../lib/mailContent';
import { MailBody } from './MailBody';
import { AttachmentList } from './AttachmentList';
import type { MailViewId } from '../../lib/mailViews';
import type { ThreadDetail, ThreadMessage } from '../../lib/workspaceData';
import { computePresetDate, SCHEDULE_PRESETS } from '../../lib/scheduling';
import {
  CURRENT_USER_EMAIL,
  formatFullDateTime,
  initialsOf,
  stripHtml,
  truncatePreview,
} from '../../lib/mailAdapters';
import { RecipientDisclosure, type MessageMeta } from './MessageMetaPopover';
import {
  compareByDeadline,
  DEADLINE_GROUP_LABEL,
  DEADLINE_GROUP_ORDER,
  deadlineGroupFor,
} from '../../lib/deadlineGroups';

export { initialsOf, stripHtml };

/** A single thread message's own metadata for the details popover — used
 * for every message shown in the thread (the header's `current` message
 * included), so an earlier message's details never show the newest
 * message's From/To/date by accident, and the header never shows the
 * newest message's identity for anything other than the newest message.
 * Falls back to the row's subject (a thread has exactly one subject line)
 * when the message itself doesn't carry one. */
function threadMessageToMessageMeta(
  message: ThreadMessage,
  fallbackSubject: string
): MessageMeta {
  return {
    fromName: message.name,
    fromEmail: message.senderEmail,
    to: message.to,
    cc: message.cc,
    bcc: message.bcc,
    subject: message.subject ?? fallbackSubject,
    replyTo: message.replyTo,
    deliveredTo: message.deliveredTo,
    messageId: message.messageId,
    mailingList: message.mailingList,
    signedBy: message.signedBy,
    mailedBy: message.mailedBy,
    security: message.security,
  };
}

const TRUNCATE: CSSProperties = {
  minWidth: 0,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

/**
 * Runs through the shared `InteractiveRow` engine too, quiet like the
 * stream's own rows (no lift, no elevation shadow) — a compressed list row
 * carrying the same red/gold/neutral attention language every other row in
 * the app carries, at `row` density.
 *
 * No index term anywhere in here. The rail used to fade sender and subject
 * by list position (`0.66 - index * 0.06`, floored at 0.24/0.16), which made
 * the fifth thread down genuinely hard to read for no reason other than
 * being fifth. Position is not attention; both lines now sit on the shared
 * text ladder, and the *open* thread is distinguished by weight, not by
 * everything else being dimmed.
 */
function RailRow({
  row,
  index,
  active,
  onSelect,
}: {
  row: StoredMailRow;
  index: number;
  active: boolean;
  onSelect: () => void;
}) {
  const attention = row.attention;
  const tinted = isTinted(attention);
  // The rail's single attention dot — same rule as every other list on the
  // product (`attentionDotFill`): gold when important, coral when urgent and
  // not important, nothing when neither.
  const dotFill = attentionDotFill(attention);
  // Width the subject line indents by to clear the dots above it: one 5px dot
  // plus its 6px gap, per dot actually rendered. Computed rather than
  // hard-coded so the attention dot can't leave the subject hanging under it.
  const subjectIndent = ((row.unread ? 1 : 0) + (dotFill ? 1 : 0)) * 11;

  return (
    <InteractiveRow
      onClick={onSelect}
      selected={active}
      aria-current={active ? 'true' : undefined}
      visual={{
        ...attentionVisual(attention, 'row'),
        lift: 0,
        hoverShadow: 'none',
      }}
      style={{
        position: 'relative',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 3,
        padding: tinted ? '8px 6px 8px 10px' : '8px 6px',
        minHeight: active ? 52 : 46,
        borderRadius: 10,
        overflow: 'hidden',
        borderTop:
          active || index === 0 ? 'none' : '1px solid rgb(var(--ink) / 0.05)',
      }}
    >
      {/* The same accent rail every list row carries — visible in the rail
          too, not just before a thread is opened. */}
      <AttentionRail attention={attention} />
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Unread stays neutral and fixed-brightness here exactly as it does
            in `AttentionDot` — never tinted by attention, never faded by
            position. */}
        {row.unread && (
          <span
            aria-hidden
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              flex: 'none',
              background: 'rgb(var(--ink) / 0.85)',
            }}
          />
        )}
        {/* The one attention dot, at this rail's smaller 5px size. The wash
            and accent rail already carry urgency, so a gold dot here means
            "and it's important" — the same read as on every wider row. */}
        {dotFill && (
          <span
            aria-hidden
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              flex: 'none',
              background: dotFill,
            }}
          />
        )}
        <span
          style={{
            ...TRUNCATE,
            font: `${active ? 600 : attentionWeight(attention)} 11.5px Inter, sans-serif`,
            color: 'var(--text)',
          }}
        >
          {row.sender}
        </span>
      </span>
      <span
        style={{
          ...TRUNCATE,
          font: '400 10.5px Inter, sans-serif',
          color: 'var(--text-secondary)',
          paddingLeft: subjectIndent,
        }}
      >
        {row.subject}
      </span>
    </InteractiveRow>
  );
}

/**
 * The rail's own sub-heading — the identical Overdue/Upcoming 7 days/Upcoming
 * 30 days/Later/No deadline vocabulary the main list page's own section
 * headings use (`DEADLINE_GROUP_LABEL`, `lib/deadlineGroups.ts`), just at the
 * rail's smaller scale. Before this, the rail was one flat list regardless of
 * what page opened it — "Approvals · 4" over four rows with no sense of which
 * were overdue and which had weeks left, while the very same four rows sat
 * under real deadline sections one click away, on the list this rail is a
 * compressed version of. Same rule as the section heading it mirrors: only
 * Overdue carries the coral tint, every other heading stays neutral.
 */
function RailGroupHeading({ children, urgent }: { children: ReactNode; urgent: boolean }) {
  return (
    <div
      style={{
        padding: '10px 6px 4px',
        font: '600 9px "JetBrains Mono", monospace',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: urgent ? 'var(--attention-urgency-soft)' : 'var(--text-faint)',
      }}
    >
      {children}
    </div>
  );
}

/** Small outside-pointerdown-dismiss popover for the Snooze presets — same
 * contract as the composer's own popovers. Exported so a caller building a
 * custom footer (e.g. Approvals) can reuse the exact same control instead of
 * a second snooze implementation. */
export function SnoozeMenu({ onPick }: { onPick: (date: Date) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLUListElement>(null);
  // Portalled + viewport-aware, matching every other popover in the app
  // (Select, LinkDialog, SchedulePopover). This menu always opened upward
  // (`bottom: calc(100% + 6px)`) because its trigger — this action bar — sits
  // near the bottom of the reading pane almost always; but "almost always"
  // isn't "always", and a fixed upward direction with no fallback meant a
  // short viewport or a scrolled-up pane could push it off the top instead.
  // `usePopoverPosition` picks whichever side actually has room.
  const position = usePopoverPosition(ref, popoverRef, open);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="iil-btn iil-btn--outline"
        onClick={() => setOpen((o) => !o)}
      >
        <Clock size={13} strokeWidth={2} aria-hidden />
        Snooze
      </button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.ul
              ref={popoverRef}
              role="menu"
              aria-label="Snooze until"
              className="iil-menu"
              style={{
                margin: 0,
                listStyle: 'none',
                minWidth: 160,
                zIndex: 70,
                ...position,
              }}
              initial={{ opacity: 0, y: 4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.98 }}
              transition={{ duration: 0.16, ease: EASE }}
            >
              {SCHEDULE_PRESETS.map((p) => (
                <li key={p.key}>
                  <button
                    type="button"
                    role="menuitem"
                    className="iil-option"
                    style={{ width: '100%' }}
                    onClick={() => {
                      setOpen(false);
                      onPick(computePresetDate(p.key, new Date()));
                    }}
                  >
                    {p.label}
                  </button>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>,
        getPortalRoot()
      )}
    </div>
  );
}

export interface MailThreadViewProps {
  rows: StoredMailRow[];
  openId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  /** Rail eyebrow, e.g. "Inbox" or "Approvals". */
  railLabel: string;
  /** Rail eyebrow count, e.g. total inbox count or approvals count — not
   * necessarily `rows.length` (Inbox's eyebrow shows the whole mailbox
   * count even when `rows` is a filtered slice). */
  railCount: number;
  /** Where thread history / AI draft content comes from for a given row.
   * Inbox reads `inbox.threadDetails[row.id]`; a page with a different data
   * shape (Approvals) adapts its own item into a `ThreadDetail` here. */
  getThreadDetail: (row: StoredMailRow) => ThreadDetail | undefined;

  /** Which mail view this thread is being read from — decides the default
   * footer's variant (an Inbox/Starred message can be archived/trashed/
   * snoozed/spammed; an Archive/Trash/Spam/Snoozed message's only action is
   * to come back). Irrelevant when `footer` is supplied. */
  viewId?: MailViewId;
  /** Full footer override — used where the page's own business actions
   * (e.g. Approvals' Reject / Save as draft) replace the default Delete/
   * Archive/Mark unread/Snooze/Spam bar entirely, rather than living
   * alongside it. */
  footer?: (ctx: { selected: StoredMailRow }) => ReactNode;

  /** State actions default to the shared `mailActions` store (Inbox's
   * existing behavior) — a caller whose rows aren't backed by that store
   * (Approvals) supplies its own. */
  onToggleStar?: (id: string) => void;
  onMarkRead?: (id: string) => void;
  onMarkUnread?: (id: string) => void;

  /** Starts the AI Suggested Reply expanded instead of behind its compact
   * control — Approvals opens straight onto the draft under review, since
   * reviewing it *is* the point of the page. */
  defaultExpanded?: boolean;
  /** Label on the AI-draft composer's primary send button — "Approve &
   * send" for Approvals, "Send" (the default) everywhere else. */
  sendLabel?: string;

  /** Send/schedule handlers default to recording through `mailActions`
   * (Inbox's existing Sent/Scheduled behavior). Override for a page whose
   * "send" means something else (Approvals: approve and remove from the
   * queue). */
  /** Replaces what "send" means for this page — Approvals turns it into
   * "approve and remove from the queue". Receives the composer's full
   * payload, so an override can still read the real recipients, body and
   * attachments rather than being handed only a snippet. */
  onSend?: (selected: StoredMailRow, payload: ComposerPayload) => void;
  onSchedule?: (
    selected: StoredMailRow,
    payload: ComposerPayload,
    date: Date
  ) => void;
}

/**
 * Thread open — the list compresses into a rail and a reading surface
 * expands beside it. Deliberately one continuous surface change rather than
 * a route change: the user never leaves the page, they just look closer.
 */
export function MailThreadView({
  rows,
  openId,
  onSelect,
  onClose,
  railLabel,
  railCount,
  getThreadDetail,
  viewId,
  footer,
  onToggleStar = mailActions.toggleStar,
  onMarkRead = mailActions.markRead,
  onMarkUnread = mailActions.markUnread,
  defaultExpanded = false,
  sendLabel,
  onSend,
  onSchedule,
}: MailThreadViewProps) {
  // The rail groups by the same shared deadline categorization the main list
  // page uses (`deadlineGroupFor`) rather than a second classification this
  // component invents — only when at least one row actually carries a
  // deadline. Pages with no deadline concept at all (Inbox, Sent, Completed)
  // fall back to the flat list rather than showing a single redundant "No
  // deadline" heading over every row.
  const hasAnyDeadline = rows.some((r) => r.deadlineIso);
  const railGroups = hasAnyDeadline
    ? DEADLINE_GROUP_ORDER.map((group) => ({
        group,
        rows: rows
          .filter((r) => deadlineGroupFor(r.deadlineIso) === group)
          .sort((a, b) => compareByDeadline(a.deadlineIso, b.deadlineIso)),
      })).filter((g) => g.rows.length > 0)
    : null;

  const selected = rows.find((r) => r.id === openId) ?? rows[0];
  // Each row owns its own insight/messages/draft — looking this up
  // per-selection (rather than reading one shared object) is what keeps two
  // different opened emails from ever rendering the same insight/draft
  // content.
  const threadDetail = selected ? getThreadDetail(selected) : undefined;

  // THREE INDEPENDENT QUESTIONS, asked separately. These used to be one
  // boolean on the row (`hasInsight`), which meant a mail with real thread
  // content and a real insight could show neither simply because nobody had
  // flagged it — and, worse, that the insight was only ever reachable as the
  // suggested reply's one-line description, so an insight with no draft
  // behind it had nowhere to appear at all. Each surface now gates on the
  // fact it actually depends on:
  //
  //   hasThread   is there a real message exchange to render, or does this
  //               fall back to the row's own one-line snippet?
  //   insight     does IIL have something to tell the reader about this mail?
  //   hasDraft    has IIL drafted a reply worth opening?
  //
  // They're genuinely independent: a Sent/Scheduled reply has thread history
  // and no draft; a blocked Action has an insight and no draft; a one-line
  // unsubscribe confirmation has a draft and no insight; a plain email has
  // none of the three.
  const hasThread = Boolean(threadDetail);
  const insight = threadDetail?.insight?.trim() ?? '';
  const hasDraft = Boolean(threadDetail?.draftPreview);

  /**
   * The unsent reply already on file for this thread, if any.
   *
   * A saved draft outranks both the blank manual composer and IIL's suggested
   * one: it is the user's own work, and the whole point of saving it was to
   * come back to it. Read on every render so it is picked up when the thread
   * is reopened — which is the behaviour "Save as draft" always implied and
   * never had.
   */
  const savedDraft = selected ? mailActions.getDraft(selected.id) : undefined;

  /**
   * Which reply surface a caller asking for `defaultExpanded` lands on.
   *
   * 'ai' can only render when IIL actually drafted something (see the
   * composer blocks below), so choosing it unconditionally meant "open
   * expanded" silently rendered NOTHING on any thread without an AI draft —
   * which is every thread the Drafts view opens. It also has to yield to a
   * saved draft: the user's own writing is what should be resumed, under its
   * own "Reply" eyebrow, rather than presented back to them as IIL's
   * suggestion.
   */
  const expandedMode = () => (hasDraft && !savedDraft ? 'ai' : 'manual');

  // Single source of truth for which reply surface is active. 'idle' shows
  // the compact Reply / IIL Suggested Reply controls; 'manual' and 'ai' each
  // mount the *same* `ReplyComposer`, just with different starting content —
  // never two composer instances at once, never a composer hidden with CSS.
  const [replyMode, setReplyMode] = useState<'idle' | 'manual' | 'ai'>(() =>
    defaultExpanded ? expandedMode() : 'idle'
  );

  // 'ai' with nothing to show is otherwise a blank response area: reachable
  // by turning Reply Drafting off in Settings while an AI composer is open,
  // which empties `draftPreview` underneath it (see `getThreadDetail`).
  const activeReplyMode =
    replyMode === 'ai' && !hasDraft ? 'manual' : replyMode;

  // Two independent layers, not one: `historyPreviewsVisible` is whether the
  // earlier-message section shows anything at all (the "N earlier messages"
  // line's own toggle) — closed by default, so opening a thread reveals
  // nothing below the latest message until asked. `expandedHistoryIds` is,
  // separately, which of those *visible* messages are showing their full
  // body rather than a one-line preview — controlled by clicking an
  // individual row, or all at once via the "Expand all" button. Collapsing
  // the section back (re-clicking "N earlier messages") only hides it;
  // individual expand state is preserved underneath so re-opening it
  // doesn't lose what the reader had already opened.
  const [historyPreviewsVisible, setHistoryPreviewsVisible] = useState(false);
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<Set<string>>(
    () => new Set()
  );

  // Opening a thread (or switching to a different one) marks it read —
  // keyed on `selected?.id` alone, not `selected?.unread`, so this fires
  // exactly once per open rather than re-firing (and instantly undoing)
  // when "Mark unread" flips the same row's `unread` back to true while
  // it's still the open thread.
  useEffect(() => {
    if (selected?.unread) onMarkRead(selected.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  // Switching threads (via the rail) shouldn't carry an in-progress reply
  // over onto the newly selected email.
  useEffect(() => {
    setReplyMode(defaultExpanded ? expandedMode() : 'idle');
    setHistoryPreviewsVisible(false);
    setExpandedHistoryIds(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  // The conversation has to belong to the thread that's actually open. Where
  // IIL was involved we have the real exchange; elsewhere the row's own
  // preview is the message, so the surface never shows someone else's mail.
  const messages =
    hasThread && threadDetail
      ? threadDetail.messages
      : selected
        ? [
            {
              id: selected.id,
              initials: initialsOf(selected.sender),
              name: selected.sender,
              // Carries the row's own metadata through — the header
              // sources its identity/recipient/date from `current` (below),
              // not `selected`, so without these fields a plain
              // (non-thread) message would silently lose its sender
              // address, recipients, and full date the moment this
              // fallback engages.
              senderEmail: selected.senderEmail,
              body: selected.snippet,
              subject: selected.subject,
              to: selected.to,
              cc: selected.cc,
              bcc: selected.bcc,
              date: selected.date,
              replyTo: selected.replyTo,
              deliveredTo: selected.deliveredTo,
              messageId: selected.messageId,
              mailingList: selected.mailingList,
              signedBy: selected.signedBy,
              mailedBy: selected.mailedBy,
              security: selected.security,
            },
          ]
        : [];

  // The header above names the sender/recipient/date of the *actual latest
  // message* being read — that's always the last entry here, and for a
  // real thread (a Sent/Scheduled reply merged back in, most obviously)
  // that's frequently a different person than `selected.sender` (the row
  // still identifies "who this conversation is with", not who sent the
  // newest message in it). Everything before `current` is genuine
  // conversation history and keeps its own identity line; the last one
  // renders as content only so that identity isn't printed twice.
  const history = messages.slice(0, -1);
  const current =
    messages.length > 0 ? messages[messages.length - 1] : undefined;

  // "All expanded" is derived, not tracked separately — it's just whether
  // every history id happens to be in the set, so there's no way for the
  // two to drift out of sync (e.g. expanding every message one at a time
  // still correctly flips the "Expand all" button to its "Collapse all"
  // state).
  const allHistoryExpanded =
    history.length > 0 && history.every((m) => expandedHistoryIds.has(m.id));
  const toggleHistoryPreviews = () => setHistoryPreviewsVisible((v) => !v);
  const toggleAllHistory = () => {
    // Expanding always also reveals the section — there's no reason to make
    // "Expand all" a second click after opening previews first.
    if (!allHistoryExpanded) setHistoryPreviewsVisible(true);
    setExpandedHistoryIds(
      allHistoryExpanded ? new Set() : new Set(history.map((m) => m.id))
    );
  };
  const toggleHistoryMessage = (id: string) => {
    setExpandedHistoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isParked =
    viewId === 'archive' || viewId === 'trash' || viewId === 'spam';
  const isSnoozed = viewId === 'snoozed';

  /** Resolved once so "does this thread have an action bar at all" is one
   * question with one answer — the bar's own divider rule is drawn from it,
   * and a caller returning `null` ("nothing to act on here") should get no
   * rule either. Only meaningful when a custom `footer` is supplied; the
   * default bars below always have content. */
  const footerContent = footer && selected ? footer({ selected }) : undefined;

  // Whether the newest message in this thread was sent by this mailbox
  // itself — i.e. a reply has already gone out. Some default-footer actions
  // stop making sense once that's true: reporting spam on a thread you just
  // personally replied to is a contradiction (spam is "I never engaged with
  // this"), and snoozing — "hide this, remind me to deal with it later" —
  // no longer describes a thread you've already dealt with. Archive/Delete/
  // Mark unread stay available regardless; those are ordinary organizing
  // actions independent of reply state, in this app and in Gmail/Outlook
  // alike.
  const alreadyRepliedByMe = current?.senderEmail === CURRENT_USER_EMAIL;

  // Shared starting recipients for both the manual and AI composer — same
  // "who this thread is with" derivation either way, so switching between
  // Reply and IIL Suggested Reply never changes who the draft is addressed
  // to. (`savedDraft`, which outranks both, is resolved further up — the
  // initial reply mode depends on it.)
  const replyTo = selected ? [selected.senderEmail ?? selected.sender] : [];
  const replyCc = selected?.cc
    ? selected.cc
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  /**
   * Turns whatever the composer currently holds into the one outgoing shape
   * every mutation takes.
   *
   * THE COMPOSER'S OWN VALUES, not a re-derivation of them. The send path
   * used to rebuild the recipient from `selected.senderEmail` and pass only a
   * stripped one-line snippet, which meant three things the user could see on
   * screen were silently discarded at the moment of sending: any recipient
   * they had edited, every Cc, and every attachment they had picked. Editing
   * the To field changed nothing about where the mail went.
   */
  const outgoingFrom = (payload: ComposerPayload): OutgoingInput | null => {
    if (!selected) return null;
    return {
      threadId: selected.id,
      recipients: payload.recipients,
      subject: `re: ${selected.subject}`,
      body: payload.body,
      attachments: payload.attachments,
    };
  };

  // None of these collapse `replyMode` back to idle on their own — the
  // composer keeps showing its own "Sent"/"Scheduled" confirmation (as it
  // always has) until the user explicitly collapses it via the eyebrow's
  // close control, rather than yanking that confirmation away the instant
  // it appears.
  const doSend = (payload: ComposerPayload) => {
    if (!selected) return;
    if (onSend) {
      onSend(selected, payload);
      return;
    }
    const input = outgoingFrom(payload);
    if (input) mailActions.sendReply(input);
  };
  const doSchedule = (date: Date, payload: ComposerPayload) => {
    if (!selected) return;
    if (onSchedule) {
      onSchedule(selected, payload, date);
      return;
    }
    const input = outgoingFrom(payload);
    if (input) mailActions.scheduleReply({ ...input, date });
  };
  /** Persists the composer's current contents as this thread's draft. The
   * button that calls this used to close the view and keep nothing. */
  const doSaveDraft = (payload: ComposerPayload) => {
    const input = outgoingFrom(payload);
    if (input) mailActions.saveDraft(input);
  };

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Compressed stream — hidden below the container-query breakpoint in
          index.css (`.iil-thread-rail`), where the split no longer leaves
          the reading pane a comfortable width; the message then takes the
          full canvas instead of squeezing next to a rail that has nowhere
          left to shrink. */}
      <aside
        aria-label={railLabel}
        className="iil-thread-rail"
        style={{
          width: 238,
          flex: 'none',
          flexDirection: 'column',
          padding: '16px 12px',
          borderRight: '1px solid rgb(var(--ink) / 0.06)',
        }}
      >
        <Eyebrow style={{ marginBottom: 10, flex: 'none' }}>
          {railLabel} · {railCount}
        </Eyebrow>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {railGroups
            ? railGroups.map((g) => (
                <div key={g.group}>
                  <RailGroupHeading urgent={g.group === 'overdue'}>
                    {DEADLINE_GROUP_LABEL[g.group]}
                  </RailGroupHeading>
                  {g.rows.map((r, ri) => (
                    <RailRow
                      key={r.id}
                      row={r}
                      index={ri}
                      active={r.id === openId}
                      onSelect={() => onSelect(r.id)}
                    />
                  ))}
                </div>
              ))
            : rows.map((r, i) => (
                <RailRow
                  key={r.id}
                  row={r}
                  index={i}
                  active={r.id === openId}
                  onSelect={() => onSelect(r.id)}
                />
              ))}
        </div>
      </aside>

      {/* Reading surface — `.iil-thread-pane` carries the responsive padding
          (see index.css); once the rail hides, this fills the whole canvas
          rather than staying pinned to its split-view width. */}
      <div
        className="iil-thread-pane"
        style={{ flex: 1, minWidth: 0, position: 'relative' }}
      >
        {/* A thread of light carrying continuity from the rail to the
            surface — only makes sense when the rail is actually visible, so
            it hides alongside it (`.iil-thread-rail-glow`). */}
        <span
          aria-hidden
          className="iil-thread-rail-glow"
          style={{
            position: 'absolute',
            left: 0,
            top: 38,
            width: 22,
            height: 1,
            background:
              'linear-gradient(90deg, rgb(var(--gold-2) / 0.35), transparent)',
          }}
        />
        <article
          style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            padding: '26px 30px',
            borderRadius: 22,
            /* The same smoked-glass treatment as the shell's own floating
               chrome (topbar/sidebar) — translucent enough that the room and
               its beam still read faintly through the blur, rather than the
               heavier, near-opaque --overlay reserved for modals/menus that
               have to sit legibly over arbitrary content beneath them. */
            background: 'var(--sidebar)',
            border: '1px solid var(--sidebar-border)',
            boxShadow: 'var(--panel-shadow), inset 0 1px 0 var(--inset-hi)',
            backdropFilter: 'blur(var(--glass-blur-shell))',
            WebkitBackdropFilter: 'blur(var(--glass-blur-shell))',
          }}
        >
          {/* Header — subject and close only. There is deliberately no
              persistent "thread-level" avatar/sender/date block here: every
              message in a thread (the current one included) shows its own
              identity where its own body is, exactly like every earlier
              message already does below. A single fixed identity row up
              here would misrepresent whichever message is actually newest —
              wrongly implying one avatar/sender speaks for the whole
              conversation, rather than each message speaking for itself. */}
          <header
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 16,
              flex: 'none',
            }}
          >
            <h2
              style={{
                margin: 0,
                minWidth: 0,
                font: '500 17px/1.35 Inter, sans-serif',
                letterSpacing: '-0.01em',
                color: 'var(--text-strong)',
              }}
            >
              {selected?.subject ?? ''}
            </h2>
            <button
              type="button"
              className="iil-icon-btn"
              aria-label="Close thread"
              onClick={onClose}
              style={{
                flex: 'none',
                color: 'var(--text-muted)',
                padding: 4,
                margin: -4,
              }}
            >
              <X size={16} strokeWidth={1.75} aria-hidden />
            </button>
          </header>

          {/* THE reading column, and the only scroller between the header and
              the action bar. Message, insight and response area are stacked
              siblings inside it; each takes its own natural height and this
              wrapper scrolls when their total exceeds the space the article
              has left.

              It used to be three nested scroll regions competing for a fixed
              box — the message region shrinkable to a 96px floor with its own
              `overflow: auto`, the insight at `flex: none`, the response area
              shrinkable with `overflow: visible`. Two things fell out of that,
              both verified in the browser rather than reasoned about:

                · At 900px tall, an open composer's own Attach/Edit/Send row
                  was cut in half by the bottom of this box. `flex-shrink: 1`
                  plus `overflow: visible` means the content doesn't scroll,
                  it just spills past the clip edge — so the primary action on
                  the Approvals page was unreachable without scrolling a
                  region that gave no indication it scrolled.
                · At tablet and phone heights, the email itself collapsed to
                  its 96px floor — two lines, sometimes one — while the IIL
                  insight beside it kept every pixel of its natural height,
                  because `flex: none` doesn't shrink and `0 1 auto` does. The
                  assistant's text outranking the sender's is the one thing
                  this whole component is arranged to prevent.

              Both disappear once nothing shrinks: children size to content,
              this column scrolls, and short viewports get an ordinary
              top-to-bottom read instead of three fighting sub-viewports. */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              marginTop: 18,
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
            }}
          >
            {/* Message body — the received message(s) and nothing else. IIL's
                insight and its drafted reply live in their own sections
                below, never inside this one, so the sender's words and the
                assistant's can never read as one continuous message.

                `flex-grow: 1` only when nothing real sits below it, which is
                what keeps the idle Reply control pinned to the bottom of an
                otherwise-empty pane. With an insight or a composer present it
                stops at its content size rather than also soaking up the
                slack (that would push the insight down past a wall of blank
                space under a short email) — but it never shrinks BELOW that
                size either. `minHeight` stays as a floor for the degenerate
                case of a message with no body at all. */}
            <div
              style={{
                flex:
                  activeReplyMode === 'idle' && !insight
                    ? '1 0 auto'
                    : '0 0 auto',
                minHeight: 96,
                paddingTop: 16,
                borderTop: '1px solid rgb(var(--ink) / 0.07)',
                display: 'flex',
                flexDirection: 'column',
                gap: 18,
              }}
            >
              {/* A plain text disclosure, not another avatar — the header
                  above already owns the one avatar this thread gets. An
                  empty circle here (no initials, no image) would just be
                  that same avatar motif repeated with nothing in it, which
                  is what earlier reads as a duplicate identity marker.
                  Gated on `history.length > 0`, not just `hasThread`: a
                  insight-bearing thread with no earlier messages (a single
                  received email, nothing before it) has nothing for this
                  control to disclose — rendering it anyway was an empty,
                  functionless chevron that also ate vertical space no
                  thread history actually needed.

                  Label is derived from `history.length` itself, not a
                  hand-authored string on the mock data — the two could
                  silently drift apart (a thread edited to add a message
                  without also updating a separate "N earlier messages"
                  field elsewhere), and this is the one place that count is
                  ever shown, so there's nothing to gain from storing it
                  twice.

                  Two separate controls, not one: this line only reveals or
                  hides the earlier-message previews (nothing is shown until
                  it's clicked); the "Expand all" button on the right is the
                  one that opens every visible message to its full body.
                  Collapsing the section back here doesn't discard whatever
                  had been individually expanded — only hides it — so
                  reopening it returns to exactly where the reader left it. */}
              {hasThread && history.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    marginBottom: 4,
                  }}
                >
                  <button
                    type="button"
                    className="iil-icon-btn"
                    aria-expanded={historyPreviewsVisible}
                    onClick={toggleHistoryPreviews}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      textAlign: 'left',
                      // Flush with the left edge of the sender avatar/
                      // hairline divider above (both start at the reading
                      // pane's own left edge), not indented to the
                      // message-text column — this reads as belonging to
                      // the thread's structural left edge rather than
                      // floating under the sender name.
                      marginLeft: 0,
                    }}
                  >
                    <span
                      style={{
                        font: '400 11px Inter, sans-serif',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {history.length} earlier message
                      {history.length === 1 ? '' : 's'}
                    </span>
                    <ChevronDown
                      size={12}
                      strokeWidth={2}
                      aria-hidden
                      style={{
                        transform: historyPreviewsVisible
                          ? 'rotate(180deg)'
                          : undefined,
                        transition: 'transform .16s ease',
                      }}
                    />
                  </button>
                  {/* Only shown once the previews themselves are visible —
                      before that there's nothing on screen for "expand
                      all"/"collapse all" to act on, so the control would be
                      live before the section it controls even exists. Also
                      only worth its own control once there's more than one
                      earlier message — with exactly one, this button and
                      the row's own individual toggle would do the identical
                      thing. */}
                  {historyPreviewsVisible && history.length > 1 && (
                    <button
                      type="button"
                      className="iil-icon-btn"
                      aria-pressed={allHistoryExpanded}
                      onClick={toggleAllHistory}
                      style={{
                        flex: 'none',
                        font: '400 11px Inter, sans-serif',
                        color: 'var(--text-faint)',
                      }}
                    >
                      {allHistoryExpanded ? 'Collapse all' : 'Expand all'}
                    </button>
                  )}
                </div>
              )}

              {/* Earlier messages — hidden entirely until "N earlier
                  messages" above is clicked; once visible, each one is a
                  one-line preview by default (real sender/time still shown
                  so a reader can tell them apart without opening any of
                  them) unless individually expanded, or all at once via
                  "Expand all". Never rendered pre-expanded on first open: a
                  reader opening a thread should see the latest message
                  first, not scroll past the whole history to reach it. */}
              {historyPreviewsVisible &&
                history.map((m) => {
                  const isExpanded = expandedHistoryIds.has(m.id);
                  return (
                    <div key={m.id} style={{ display: 'flex', gap: 10 }}>
                      <span
                        aria-hidden
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: 'rgb(var(--ink) / 0.08)',
                          flex: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          font: '500 11px Inter, sans-serif',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {m.initials}
                      </span>
                      {isExpanded ? (
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'baseline',
                              gap: 6,
                              flexWrap: 'wrap',
                            }}
                          >
                            <button
                              type="button"
                              aria-label={`Collapse message from ${m.name}`}
                              onClick={() => toggleHistoryMessage(m.id)}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                cursor: 'pointer',
                                padding: 0,
                                font: '500 12px Inter, sans-serif',
                                color: 'var(--text)',
                              }}
                            >
                              {m.name}
                            </button>
                            {/* Full date/time, same as the current message and
                              same reason: an abbreviated label like "Mon"
                              isn't a real timestamp, and every message in a
                              thread should show exactly when it was sent. */}
                            <span
                              style={{
                                font: '400 10px Inter, sans-serif',
                                color: 'var(--text-faint)',
                              }}
                            >
                              {formatFullDateTime(m.date)}
                            </span>
                            {/* This earlier message's own details — deliberately
                              built from `m` (this history entry), never
                              `selected`, so an older message in the thread
                              always discloses its own From/To/date instead of
                              the newest message's. */}
                            <RecipientDisclosure
                              meta={threadMessageToMessageMeta(
                                m,
                                selected?.subject ?? ''
                              )}
                            />
                          </div>
                          <MailBody body={toBodyContent(m.body)} />
                          <AttachmentList attachments={m.attachments} />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggleHistoryMessage(m.id)}
                          aria-expanded={false}
                          aria-label={`Expand message from ${m.name}: ${truncatePreview(toBodyContent(m.body).text, 60)}`}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            display: 'flex',
                            alignItems: 'baseline',
                            gap: 6,
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            padding: '2px 0',
                            textAlign: 'left',
                            borderRadius: 6,
                          }}
                          className="iil-thread-collapsed-row"
                        >
                          <span
                            style={{
                              flex: 'none',
                              font: '500 12px Inter, sans-serif',
                              color: 'var(--text)',
                            }}
                          >
                            {m.name}
                          </span>
                          {/* The small preview that lets a reader pick which
                            earlier message is worth opening, rather than
                            expanding all of them (or the wrong one) just to
                            find out. */}
                          <span
                            style={{
                              ...TRUNCATE,
                              flex: 1,
                              font: '400 12px/1.5 Inter, sans-serif',
                              color: 'var(--text-faint)',
                            }}
                          >
                            {truncatePreview(toBodyContent(m.body).text, 90)}
                          </span>
                          <span
                            style={{
                              flex: 'none',
                              font: '400 10px Inter, sans-serif',
                              color: 'var(--text-faint)',
                            }}
                          >
                            {formatFullDateTime(m.date)}
                          </span>
                        </button>
                      )}
                    </div>
                  );
                })}

              {/* The current/latest message — the one the reader actually
                  opened this thread to read. Owns exactly the same kind of
                  identity row every earlier message owns (avatar, name,
                  address if known, recipient disclosure, full date) rather
                  than borrowing a separate thread-level header for it; the
                  one thing that's unique to it is the star control, which
                  belongs to the row/thread as a whole and has to live
                  somewhere — this, the message actually being read, is
                  that somewhere. */}
              {current && (
                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    // A hairline above the latest message whenever there's
                    // history above it (expanded or not) — without it, an
                    // expanded final history entry visually runs straight
                    // into this one, reading as a single continuation
                    // instead of two separate messages.
                    borderTop:
                      history.length > 0
                        ? '1px solid rgb(var(--ink) / 0.06)'
                        : undefined,
                    paddingTop: history.length > 0 ? 14 : 0,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      flex: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'rgb(var(--ink) / 0.08)',
                      font: '500 12px Inter, sans-serif',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {current.initials}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                      }}
                    >
                      <div
                        style={{
                          flex: 1,
                          minWidth: 0,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 2,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'baseline',
                            gap: 7,
                            flexWrap: 'wrap',
                          }}
                        >
                          <span
                            style={{
                              font: '500 12.5px/1.4 Inter, sans-serif',
                              color: 'var(--text)',
                            }}
                          >
                            {current.name}
                          </span>
                          {/* Only rendered when the data actually has an
                              address — the mock rows don't always, so this
                              stays hidden rather than fabricating one. */}
                          {current.senderEmail && (
                            <span
                              style={{
                                font: '400 11px Inter, sans-serif',
                                color: 'var(--text-faint)',
                              }}
                            >
                              {current.senderEmail}
                            </span>
                          )}
                        </div>
                        {/* This message's own details — click (or its
                            chevron) to open the full metadata popover
                            (From/To/Cc/Bcc, Reply-To, Message-ID, ...) for
                            *this* message specifically. */}
                        <RecipientDisclosure
                          meta={threadMessageToMessageMeta(
                            current,
                            selected?.subject ?? ''
                          )}
                        />
                        {/* Full date/time — the popover has no Date row of
                            its own, so this is the one place it's shown.
                            Falls back to the abbreviated label only when no
                            real timestamp is on file. */}
                        <span
                          className="iil-mono"
                          style={{
                            font: '400 10px "JetBrains Mono", monospace',
                            color: 'var(--text-faint)',
                            marginTop: 1,
                          }}
                        >
                          {formatFullDateTime(current.date)}
                        </span>
                      </div>
                      {/* Same control, same underlying starred state as the
                          row list's own star — no second source of truth,
                          so starring here and returning to the list (or
                          reopening the thread) always agree. */}
                      {selected && (
                        <button
                          type="button"
                          className="iil-stream-star"
                          aria-label={
                            selected.starred
                              ? `Unstar ${selected.subject}`
                              : `Star ${selected.subject}`
                          }
                          aria-pressed={selected.starred}
                          onClick={() => onToggleStar(selected.id)}
                          style={{
                            width: 22,
                            height: 22,
                            flex: 'none',
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            color: selected.starred
                              ? 'var(--gold-ink)'
                              : 'var(--text-faint)',
                          }}
                        >
                          <Star
                            size={15}
                            strokeWidth={1.75}
                            fill={selected.starred ? 'currentColor' : 'none'}
                            aria-hidden
                          />
                        </button>
                      )}
                    </div>
                    <MailBody body={toBodyContent(current.body)} />
                    <AttachmentList attachments={current.attachments} />
                  </div>
                </div>
              )}
            </div>

            {/* IIL INSIGHT — what IIL inferred about this mail, in full.
                Positioned exactly here on purpose: after everything the
                sender actually wrote (the region above, which it is
                deliberately NOT inside — the insight is never part of the
                email body's scroll area, so the two can't read as one
                continuous message) and before any of the response controls,
                because the insight is context for the decision those
                controls act on.

                `flex: 'none'` — it sizes to its own content and no more. It
                never competes with the message body or the composer for the
                column's flexible space; if the insight is long enough to
                need it, the shared column scrolls, which is the one thing
                that keeps "show the complete insight" and "keep the footer
                reachable" both true at once.

                Keyed by the open mail's id so the collapsed/expanded state
                belongs to *that* mail — the same reason `ReplyComposer` is
                keyed below. Without it, collapsing one mail's insight would
                silently hide the next mail's, which the reader has never
                seen. Renders nothing when there's no insight; there is no
                empty-state form of this section.

                Note `flex: 'none'` is now the same "don't shrink" contract
                every sibling in this column has, not a privilege this one
                section holds over the email above it — see the column's own
                note for why that distinction mattered. */}
            {insight && (
              <div style={{ flex: 'none', marginTop: 16 }}>
                <IILInsight key={`insight-${openId}`} insight={insight} />
              </div>
            )}

            {/* The leftover space, given a home of its own.

                Two things want to be true at once here, and they pull in
                opposite directions: the insight has to sit directly under the
                email it's about (not floating at the far end of a wall of
                blank space), and the idle Reply / IIL Suggested Reply
                controls have to stay pinned to the bottom of the reading
                pane, where they've always been. Without an insight, the
                message region's own `flex-grow: 1` does both jobs at once —
                it absorbs the slack, which incidentally pushes the controls
                down. With an insight, that same growth would push the
                insight down too, so the region stops growing (see its `flex`
                above) — and the controls would come up with it.

                So the slack becomes explicit rather than a side effect of
                who happens to be growing: this spacer takes it, and the
                controls stay at the bottom. Only while idle — once a
                composer is open, the composer is what should be absorbing
                that space, not an empty gap above it. `minHeight: 0` so it
                collapses away entirely rather than pushing the controls off
                the bottom when the email and insight together already fill
                the column; the response area's own `marginTop` still holds
                the two apart in that case. */}
            {activeReplyMode === 'idle' && insight && (
              <div aria-hidden style={{ flex: '1 1 auto', minHeight: 0 }} />
            )}

            {/* Response area — one coherent slot, one mode at a time
                (`replyMode`). Idle shows compact entry points only, so the
                received message is never sharing space with a permanently
                expanded draft. Reply and IIL Suggested Reply both mount the
                *same* `ReplyComposer`, just seeded differently — never two
                composer instances at once.

                Idle stays `flex: 'none'` — it's just two buttons, no reason
                for it to claim growable space the message body could use
                instead. Once a composer is mounted this grows into whatever
                slack the column has left (so the editor gets a comfortable
                writing area on a tall window) but never shrinks below its own
                content — `1 0 auto`, not `1 1 auto`. Shrinking is what cut
                the composer's own Send row in half on shorter windows: its
                overflow is `visible`, so a shrunk box doesn't scroll, it just
                loses whatever falls past the edge. */}
            {selected && (
              <div
                style={{
                  flex: activeReplyMode === 'idle' ? 'none' : '1 0 auto',
                  marginTop: 16,
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {activeReplyMode === 'idle' && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      flexWrap: 'wrap',
                    }}
                  >
                    {/* Compact entry point for the AI draft — the same
                        `IILDisclosure` control the insight collapses into, so
                        the two IIL elements are visibly one family.

                        Its preview is the DRAFT'S OWN opening line, not the
                        insight. It used to be the insight, which is how the
                        insight ended up with no home of its own: attached to
                        this control, it was invisible for every mail without
                        a draft, and duplicated for every mail with one. A
                        draft's own first words are the honest description of
                        what opening this reveals.

                        IT COMES FIRST. IIL's suggestion is the path this
                        product is arguing for, so it takes the leading
                        position and "Reply yourself" sits beside it as the
                        alternative — which is also what that label now says
                        out loud, where a bare "Reply" read as the default
                        action and left the draft looking like the option. */}
                    {hasDraft && threadDetail && (
                      // The panel fills this wrapper; the wrapper decides how
                      // much of the row the panel gets. Splitting it that way
                      // keeps `IILDisclosure` ignorant of the one row it
                      // happens to share with a button — the insight above
                      // renders the same component with no wrapper at all.
                      //
                      // `1 1 <basis>`: it GROWS so the two controls together
                      // always span the full content width (the panel is never
                      // sized by its preview text), and the basis is a wrap
                      // THRESHOLD, not a width — below it the row's `flexWrap`
                      // drops "Reply yourself" to its own line rather than
                      // letting either control squeeze to a sliver, which is
                      // what a bare `minWidth: 0` would have allowed on a
                      // phone. Nothing here fixes the panel's rendered width.
                      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                        <IILDisclosure
                          label="IIL Suggested Reply"
                          preview={truncatePreview(
                            threadDetail.draftPreview,
                            70
                          )}
                          expanded={false}
                          ariaLabel="Open IIL suggested reply"
                          onToggle={() => setReplyMode('ai')}
                        />
                      </div>
                    )}

                    {/* Unchanged behaviour: still the same `manual` mode, the
                        same blank composer, the same handler. Only the label
                        and the position moved. `flex: none` so the longer
                        label can't be compressed by the disclosure beside it,
                        which is free to truncate its own preview (it already
                        does) — and the row's `flexWrap` drops this onto its
                        own line before either control has to overflow.

                        The label itself is conditional on `hasDraft`, the
                        same flag that gates the disclosure beside it.
                        "Reply yourself" only makes sense as a CONTRAST to
                        IIL's own suggestion — with no draft to contrast
                        against, there's nothing to be the alternative to, so
                        the button reverts to the plain, un-contrasted
                        "Reply" a mail with no suggestion actually needs. */}
                    <button
                      type="button"
                      className="iil-btn iil-btn--outline"
                      style={{ flex: 'none' }}
                      onClick={() => setReplyMode('manual')}
                    >
                      <ReplyIcon size={13} strokeWidth={2} aria-hidden />
                      {hasDraft ? 'Reply yourself' : 'Reply'}
                    </button>
                  </div>
                )}

                {/* Manual reply — a genuine blank composer, never seeded
                    from the AI draft, so ignoring IIL entirely is a real
                    path, not just a hidden one. */}
                {activeReplyMode === 'manual' && (
                  <ReplyComposer
                    key={`manual-${openId}`}
                    eyebrow="Reply"
                    initialDraft={savedDraft ? savedDraft.body.text : ''}
                    initialTo={savedDraft ? savedDraft.recipients.to : replyTo}
                    initialCc={savedDraft ? savedDraft.recipients.cc : replyCc}
                    initialAttachments={savedDraft?.attachments}
                    onDiscard={() => setReplyMode('idle')}
                    onSend={doSend}
                    onSchedule={doSchedule}
                    onSaveDraft={doSaveDraft}
                  />
                )}

                {/* AI suggested reply, expanded — the standalone Reply
                    button is gone while this is active (see the
                    `idle`-only block above): the draft itself is the reply
                    interface now, so there's never a second, competing way
                    to start one. */}
                {activeReplyMode === 'ai' && threadDetail && (
                  <ReplyComposer
                    key={`ai-${openId}`}
                    eyebrow="IIL suggested reply"
                    sendLabel={sendLabel}
                    initialDraft={
                      savedDraft
                        ? savedDraft.body.text
                        : threadDetail.draftPreview
                    }
                    initialTo={savedDraft ? savedDraft.recipients.to : replyTo}
                    initialCc={savedDraft ? savedDraft.recipients.cc : replyCc}
                    initialAttachments={savedDraft?.attachments}
                    onDiscard={
                      defaultExpanded ? undefined : () => setReplyMode('idle')
                    }
                    onSend={doSend}
                    onSchedule={doSchedule}
                    onSaveDraft={doSaveDraft}
                  />
                )}
              </div>
            )}
          </div>

          {/* Action bar — email-level actions only (destructive isolated on
              the left, secondary actions on the right). Send belongs solely
              to the reply composer above, never to the received email.
              Which actions make sense depends on where this thread is being
              read from: a live message (Inbox/Starred) can be snoozed,
              archived, trashed or marked spam; a parked one (Archive/Trash/
              Spam) can only come back to Inbox; a snoozed one can wake now.
              A caller with its own business actions (Approvals) supplies
              `footer` to replace this entirely, in the same position — and a
              `footer` that returns nothing removes the bar altogether rather
              than leaving its divider rule floating above empty space, which
              is what Sent (a message with no action beyond reading and
              replying) and a resolved-but-unresolvable Approval both want. */}
          {footerContent !== null && (
            <footer
              style={{
                flex: 'none',
                marginTop: 14,
                borderTop: '1px solid rgb(var(--ink) / 0.08)',
                paddingTop: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              {footer && selected ? (
                footerContent
              ) : isParked || isSnoozed ? (
                <>
                  <span />
                  <button
                    type="button"
                    className="iil-btn iil-btn--outline"
                    onClick={() => {
                      if (!selected) return;
                      mailActions.restoreToInbox(selected.id);
                      onClose();
                    }}
                  >
                    <InboxIcon size={13} strokeWidth={2} aria-hidden />
                    Move to Inbox
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="iil-btn iil-btn--danger"
                    onClick={() => {
                      if (!selected) return;
                      mailActions.trash(selected.id);
                      onClose();
                    }}
                  >
                    <Trash2 size={13} strokeWidth={2} aria-hidden />
                    Delete
                  </button>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    <button
                      type="button"
                      className="iil-btn iil-btn--outline"
                      onClick={() => {
                        if (!selected) return;
                        mailActions.archive(selected.id);
                        onClose();
                      }}
                    >
                      {/* Same size/stroke as Mark unread, Snooze and Spam
                          beside it — this was the one action in the bar
                          carrying a bare label. */}
                      <Archive size={13} strokeWidth={2} aria-hidden />
                      Archive
                    </button>
                    <button
                      type="button"
                      className="iil-btn iil-btn--outline"
                      onClick={() => {
                        if (!selected) return;
                        onMarkUnread(selected.id);
                        onClose();
                      }}
                    >
                      <MailOpen size={13} strokeWidth={2} aria-hidden />
                      Mark unread
                    </button>
                    {/* The generic "I know this is done" control (§ Mark as
                        Completed) — for mail that isn't already tracked by
                        one of Actions/Approvals/Opportunities' own
                        domain-specific completion buttons (Mark done /
                        Approve & send /  Reject / Pass), which each supply
                        their own `footer` and never reach this default bar
                        at all. Sometimes IIL can't tell a thread is finished,
                        but the person reading it can; this is that signal,
                        in the same outline-button language as every other
                        action here rather than a new kind of control. Hidden
                        once already completed — completing twice has nothing
                        left to do. */}
                    {!selected.completedAt && (
                      <button
                        type="button"
                        className="iil-btn iil-btn--outline"
                        onClick={() => {
                          mailActions.complete(selected.id);
                          onClose();
                        }}
                      >
                        <Check size={13} strokeWidth={2} aria-hidden />
                        Mark completed
                      </button>
                    )}
                    {/* Hidden once you've already replied — see
                      `alreadyRepliedByMe`'s own comment for why these two
                      specifically (not Archive/Delete/Mark unread) stop
                      making sense at that point. */}
                    {!alreadyRepliedByMe && (
                      <SnoozeMenu
                        onPick={(date) => {
                          if (!selected) return;
                          mailActions.snooze(selected.id, date);
                          onClose();
                        }}
                      />
                    )}
                    {!alreadyRepliedByMe && (
                      <button
                        type="button"
                        className="iil-btn iil-btn--outline"
                        onClick={() => {
                          if (!selected) return;
                          mailActions.markSpam(selected.id);
                          onClose();
                        }}
                      >
                        <ShieldAlert size={13} strokeWidth={2} aria-hidden />
                        Spam
                      </button>
                    )}
                  </div>
                </>
              )}
            </footer>
          )}
        </article>
      </div>
    </div>
  );
}
