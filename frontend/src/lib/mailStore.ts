/**
 * Shared, mutable mail state — one canonical `rows` array for the whole
 * mailbox. `Inbox.tsx` used to seed a page-local copy of `inbox.rows` into
 * `useState` — fine when Inbox was the only page reading mail, but
 * Starred/Snoozed/Archive/Trash/Spam/Sent/Scheduled are separate routes
 * rendered by the same `Inbox` component, and Approvals/Actions/
 * Opportunities all open the same canonical mail-detail view too. All of
 * them need to observe the same underlying rows change (star a message in
 * Inbox, see it starred in Approvals; open it in Inbox, see it read
 * everywhere). This is a plain module-level external store — same "module
 * state, no Redux/Context" approach `Group.tsx`'s `collapsedGroups` already
 * uses — exposed via `useSyncExternalStore` so every consumer re-renders on
 * any mutation.
 *
 * `rows` is seeded from every source IIL has processed — Inbox's own mail
 * plus Approvals/demo-mail/Opportunities, each adapted into the same
 * `StoredMailRow` shape — so Inbox is the literal superset of what the
 * other pages show, not a separate six-message demo set. Approvals/Actions/
 * Opportunities still show only their own subset by joining against their
 * own id lists (`approvals.items`, `actions.*`, `opportunities.items`);
 * they just resolve those ids against this one array instead of a second
 * slice. `getThreadDetail` is the matching single lookup for thread/body/
 * draft content across all of them.
 *
 * This store is also THE source of truth for attention (see
 * `lib/attention.ts`). Every adapter below resolves each record's own domain
 * signals — an Approval's `respondBy`, an Opportunity's `closesAt`, an
 * Action's `dueDate` — down to exactly one `attention` value on the row, and
 * every page reads that value rather than re-deriving its own. That's what
 * makes "urgent means the same thing on Dashboard as on Actions" structurally
 * true instead of a convention six renderers each have to remember.
 *
 * Not persisted to localStorage: this is mock data seeded fresh each load,
 * matching the rest of the workspace's prototype-data convention (only real
 * user *preferences*, like Quick Access, persist).
 */
import { useSyncExternalStore } from 'react';
import {
  actions,
  approvals,
  demoMail,
  inbox,
  opportunities,
  type ActionItem,
  type Approval,
  type DemoMail,
  type MailRow,
  type Opportunity,
  type ThreadDetail,
  type ThreadMessage,
} from './workspaceData';
import {
  attentionOr,
  escalateUrgency,
  NORMAL_ATTENTION,
  type Attention,
} from './attention';
import {
  applyTopicPriority,
  cleanupActionFor,
  isFollowUpCandidate,
  isSafeToAutoArchive,
  shouldGenerateDrafts,
  type AgentPreferences,
} from './agentPreferences';
import { getAgentPreferences, subscribeToPreferences } from './settingsStore';
import {
  CURRENT_USER_EMAIL,
  CURRENT_USER_NAME,
  initialsOf,
  parseRecipient,
  truncatePreview,
} from './mailAdapters';
import { isOverdueByDeadline, isUrgentByDeadline } from './deadlineGroups';
import type {
  Attachment,
  MailBodyContent,
  StoredAttachment,
} from './mailContent';

export type MailStatus = 'inbox' | 'archived' | 'trash' | 'spam' | 'snoozed';

/**
 * THE single authoritative rule for whether IIL may generate or show
 * anything new about a thread — its Insight, its Suggested Reply. One
 * boolean, one call site (`getThreadDetail`, below), rather than each
 * surface re-deciding "should I show this" after the fact.
 *
 * A completed thread fails this check. Finishing a thread's workflow is the
 * one signal in this model that unambiguously means "there is nothing left
 * for IIL to assist with here" — continuing to process it would mean
 * spending real inference on a thread nobody is going to read new AI text
 * about, and displaying stale insight/draft text on an already-resolved
 * thread previously did happen (see `mailActions.complete`'s own history):
 * a thread could be marked done on one page while its opened-mail view, on
 * another, still showed IIL urging a reply to it.
 *
 * Reactivating a thread (`mailActions.reactivate`) clears `completedAt`,
 * which makes this true again on the very next read — there is no separate
 * flag to flip back, because eligibility was never a fact stored anywhere
 * other than completion status itself.
 */
export function isIILEligible(row: StoredMailRow): boolean {
  return !row.completedAt;
}

/**
 * Fires whenever a mail row reactivates out of `completedAt` — the one
 * signal `workflowStore` needs to also clear the matching Action/Approval/
 * Opportunity record's own `completedAt` (and, for a passed Opportunity,
 * its `lifecycle`), the same way it already listens for nothing today
 * because nothing ever went backwards before `mailActions.reactivate`
 * existed.
 *
 * An event, not a direct call, because the dependency runs one way:
 * `workflowStore` imports `mailStore` (for `mailActions.complete`), and
 * `mailStore` importing back would make that circular. Subscribed at module
 * scope in `workflowStore.ts`, matching how `mailStore` itself subscribes to
 * `settingsStore`'s preference changes.
 */
const reactivationListeners = new Set<(id: string) => void>();
export function subscribeToReactivation(cb: (id: string) => void): () => void {
  reactivationListeners.add(cb);
  return () => reactivationListeners.delete(cb);
}
function notifyReactivated(id: string) {
  reactivationListeners.forEach((l) => l(id));
}

/**
 * Whether a row still has an open Opportunity/Action/Approval — the one
 * piece of "one coherent workflow state" this store needs and does not own.
 * `workflowStore` registers the real check at module scope; defaults to
 * "nothing pending" so this store works before that registration runs (and
 * in tests that only import this file). Same one-way decoupling as
 * `subscribeToReactivation` above and for the identical reason: `mailStore`
 * must never import `workflowStore`.
 */
let pendingWorkflowCheck: (id: string) => boolean = () => false;
export function registerPendingWorkflowCheck(fn: (id: string) => boolean) {
  pendingWorkflowCheck = fn;
}

export type StoredMailRow = MailRow & {
  starred: boolean;
  status: MailStatus;
  /** ISO 8601 — when a snoozed row should come back. Storing a formatted
   * string here instead is what made this unusable: it could be printed and
   * nothing else. Whatever eventually wakes a snoozed mail has to compare it
   * to the clock. */
  snoozedUntil?: string;
  /** Always present on a stored row (narrowing `MailRow`'s optional field):
   * every adapter below resolves attention explicitly, so no consumer ever
   * has to decide what `undefined` means. THE one value every page reads —
   * Inbox's dot, Actions' tiers, Approvals' cards, Opportunities' shelves,
   * Dashboard's ranking, and every header count.
   *
   * DERIVED, not authoritative: this is `baseAttention` with the user's
   * Priority Weights applied on top (see `refreshDerivedState`). Pages keep
   * reading it exactly as before — the derivation happens here so no renderer
   * has to know preferences exist. */
  attention: Attention;
  /** The agent's own authored assessment, BEFORE the user's priority weights
   * AND before deadline escalation are applied.
   *
   * Kept separately from `attention` because three inputs change on three
   * different schedules: the agent's assessment changes when mail changes,
   * the user's weights change whenever they touch a slider, and deadline
   * escalation changes purely because time passes, with no new mail and no
   * settings change at all. Collapsing them into one field would make a
   * weight change unrecoverable — turning a topic back down could not
   * restore the importance the mail actually had, because the original value
   * would already have been overwritten. It would also freeze deadline
   * escalation: baking "is this overdue/urgent right now" into a value that
   * is only ever recomputed on a mail change or a settings change is exactly
   * what let a mail's card sit uncolored inside a section already labeled
   * for its deadline. `attention` (below) is re-derived from this, the
   * user's weights, AND a fresh read of `deadlineIso` against the current
   * time, every time `refreshDerivedState` runs. */
  baseAttention: Attention;
  /** This row's own deadline, if it has one — an Approval's `respondBy`, an
   * Opportunity's `closesAt`, or (joined by mailId) an Action's `dueDate`.
   * The ONE input `attention`'s urgency escalation reads, so a page's live
   * section grouping (`deadlineGroupFor`) and this row's coral/gold treatment
   * are always answering the same question against the same fact, never two
   * separately-maintained ones. */
  deadlineIso?: string;
  /** When a reply from this mailbox last went out on this thread. Set by
   * `mergeSentReplyIntoThread`; the reason an answered thread stays quiet
   * even if its topic is weighted high — you've dealt with it, so no
   * preference should pull it back to the top. Recorded as a field rather
   * than baked into `attention` so it survives re-derivation. */
  repliedAt?: string;
  /** Who put this row in its current `status`.
   *
   * `'cleanup'` means an Inbox Cleanup rule filed it, and the row goes back
   * to the inbox if that rule is relaxed. `'automation'` means the Archiving
   * setting's automatic level filed it once it judged the thread safe to
   * archive, and the row goes back if that judgment stops holding (setting
   * turned down, or the thread reactivates). `'user'` means a person
   * archived, trashed, snoozed or spammed it deliberately, and no rule
   * change may ever undo that. Absent means untouched. Without this
   * distinction, relaxing a cleanup rule would drag back mail the user had
   * archived by hand, and tightening one would look identical to a manual
   * action. */
  statusSource?: 'user' | 'cleanup' | 'automation';
  /** ISO 8601 — when this row was moved to Trash/Spam. The one fact a 30-day
   * purge needs and nothing else: not "how long has it been unread" or any
   * other proxy, just the actual moment retention started. Cleared on
   * `restoreToInbox`. A real backend enforces the actual deletion; this is
   * the timestamp that lets it, and the frontend's own deterministic purge
   * below, agree on when 30 days is up. */
  trashedAt?: string;
  spamAt?: string;
};

/**
 * What the record adapters below produce: everything a stored row needs
 * except `baseAttention`, which `seed()` stamps once from whatever the
 * adapter resolved.
 *
 * Split out so an adapter can't set the baseline itself. There is exactly one
 * correct value for it — the agent's own assessment, before any user
 * preference — and four adapters each writing it is four chances for one of
 * them to write something subtly different.
 */
type AdaptedMailRow = Omit<StoredMailRow, 'baseAttention'>;

/** Who an outgoing message is addressed to. Lists, not one joined string:
 * recipients are plural by nature, the composer already edits them as chips,
 * and any backend takes them as arrays. Joined for display only. */
export type Recipients = {
  to: string[];
  cc: string[];
  bcc: string[];
};

export type OutgoingRow = {
  id: string;
  /** Everyone this went to — `to`, plus `cc`/`bcc` when the composer had
   * them. Replaces a single `to: string`, which silently dropped Cc entirely
   * and could not represent Bcc at all. */
  recipients: Recipients;
  subject: string;
  /** One-line plain-text preview for list rows. DERIVED from `body`, never
   * the message itself — see `body` below. */
  snippet: string;
  /** What was actually written, in full.
   *
   * The store used to keep only `snippet`, so opening a sent message showed a
   * stripped one-liner instead of the message: everything the user typed past
   * the first clause, and all of its formatting, was discarded at send. */
  body: MailBodyContent;
  /** Files sent with the message. Still `LocalAttachment`s here — nothing has
   * uploaded them, and this store deliberately doesn't pretend otherwise. */
  attachments: Attachment[];
  /** ISO 8601, like every other timestamp in the model. Was a
   * `toLocaleString()` display string, which no backend can parse, no code
   * can compare, and which silently changes meaning with the user's locale. */
  scheduledFor?: string;
  /** The id of the `rows` entry this is a reply *to* — the same thread
   * linkage a real backend would carry on every outgoing message (a reply
   * is never a freestanding record; it belongs to the conversation it
   * replied within). Omitted for the rare outgoing message that isn't a
   * reply to anything already in the mailbox. Lets Sent/Scheduled open
   * through the *same* thread the original message lives in, instead of
   * showing the reply as if it had no history before it. */
  threadId?: string;
  /** Full ISO timestamp this message was (or will be) sent — the actual
   * send time for `sendReply`/`sendScheduledNow`, or the intended future
   * send time for a still-pending `scheduleReply`. The one source of truth
   * every displayed time (Sent's row list, the full-date popover) is
   * *computed* from via `formatRelativeMailTime`/`formatFullDateTime`,
   * never a separately hand-authored label — that used to be `'Just now'`,
   * frozen forever the moment a reply sent, instead of aging into "2h ago"
   * the way a real Sent folder's timestamps do as real time passes. */
  date: string;
  /** Same field, same meaning as `ThreadMessage.responseExpected` — carried
   * here so it survives the trip through `outgoingRowToThreadMessage` once
   * this reply merges into its thread. `undefined` for anything the composer
   * sends today (no UI asks for this; see that field's own doc for why it is
   * never guessed from the body), which is the same safe default as
   * everywhere else this reads: no signal, no follow-up candidate. */
  responseExpected?: boolean;
};

/**
 * A reply the user has written but not sent.
 *
 * A real record with a stable id, not a UI scratchpad: "Save as draft" used
 * to close the composer and discard everything, which is indistinguishable
 * from saving right up until the user comes back for it. One draft per thread
 * — reopening a thread you have a draft on resumes it, which is what every
 * mail client does and what the Approvals "Save as draft" button implies.
 *
 * Shaped as the eventual `POST /drafts` body. `attachments` may hold
 * `LocalAttachment`s: until an upload endpoint exists the bytes only live in
 * this tab, and that limit is real rather than papered over.
 */
export type DraftRow = {
  /**
   * This draft's own identity — PROVISIONAL WHILE CLIENT-ISSUED.
   *
   * A draft saved here gets a `local-` id (see {@link isProvisionalId}) purely
   * so the record can exist before any server has seen it. THE SERVER ASSIGNS
   * THE PERMANENT ID, and it is not assumed to echo this one back.
   *
   * That swap is safe because NOTHING IN THE APP KEYS OFF THIS FIELD.
   * `threadId` below is the collection's real primary key: the upsert, the
   * lookup, the discard, the thread resolvers and the Drafts list's own React
   * keys all use it. This id is carried so a server round trip has something
   * to correlate against, and for no other purpose. Reconciliation is
   * therefore a field rewrite on one record, not a graph update —
   *
   *     saveDraft()            → draft.id = 'local-draft-3'
   *     POST /drafts           → { id: 'drf_9f2c', ... }
   *     → replace that draft's `id` with the server's, in place
   *
   * — and the invariant that makes it safe is pinned by test, so a future
   * consumer that starts keying off `id` fails there rather than in
   * integration.
   */
  id: string;
  /** The thread this reply belongs to. Drafts are keyed by it — this, not
   * `id`, is the collection's primary key. */
  threadId: string;
  recipients: Recipients;
  subject: string;
  body: MailBodyContent;
  attachments: Attachment[];
  /** ISO 8601. When the draft was last written. */
  updatedAt: string;
};

type State = {
  /** Every mail IIL knows about — Inbox's own rows plus Approvals/demo-mail/
   * Opportunities, all adapted into the same shape — one array so
   * `toggleStar`/`markRead`/`markUnread` stay one code path and every page
   * agrees on the same underlying state. */
  rows: StoredMailRow[];
  sent: OutgoingRow[];
  scheduled: OutgoingRow[];
  /** Unsent replies, one per thread. */
  drafts: DraftRow[];
  /** Message history per thread, keyed by the `rows` id it belongs to.
   * Reactive (unlike the old module-level constant this replaced) because
   * sending a reply actually mutates the thread it belongs to — see
   * `mergeSentReplyIntoThread` — so every page reading the same id agrees
   * on the same conversation, the way a real backend's thread record
   * would. */
  threadDetails: Record<string, ThreadDetail>;
};

/** An Approval reviewed/sent through Approvals is still, underneath, just an
 * email with a suggested reply — same shape Inbox's own rows use. Three
 * separate things stay separate through this adapter: `receivedBody` is the
 * actual email (goes in the body and the row snippet), `summary` is IIL's
 * insight (goes in `ThreadDetail.insight`, never the body), and `draft` is
 * IIL's suggested reply (goes in `draftPreview`, never either of the other
 * two). */
function approvalToRow(a: Approval): AdaptedMailRow {
  const { name, email } = parseRecipient(a.recipient);
  const done = Boolean(a.completedAt);
  return {
    id: a.id,
    sender: name,
    senderEmail: email,
    subject: a.subject,
    // Inbox stays Gmail-plain: the row's snippet is always the real received
    // email's own opening line. It deliberately does NOT fall back to
    // `summary` (IIL's insight) when a body is missing — an AI sentence in the
    // slot every other row uses for the sender's own words is precisely the
    // blur this data model exists to prevent, so an approval with no body
    // shows an empty preview rather than a plausible-looking wrong one.
    snippet: a.receivedBody[0] ?? '',
    unread: !done,
    // The agent's own authored attention, resolved here once for every
    // surface that will ever show this approval — a resolved approval's
    // attention ends with it, the same rule every completable record
    // follows. Deadline-driven urgency is NOT folded in here: it's derived
    // fresh from `deadlineIso` on every `refreshDerivedState` pass instead
    // (see `StoredMailRow.baseAttention`), so it can't freeze at whatever was
    // true the moment this row was built.
    attention: done ? NORMAL_ATTENTION : attentionOr(a.attention),
    deadlineIso: a.respondBy,
    category: 'Primary',
    starred: false,
    status: 'inbox',
    completedAt: a.completedAt,
    completedNote: a.completedNote,
    to: a.to,
    cc: a.cc,
    bcc: a.bcc,
    date: a.date,
    replyTo: a.replyTo,
    deliveredTo: a.deliveredTo,
    messageId: a.messageId,
    mailingList: a.mailingList,
    signedBy: a.signedBy,
    mailedBy: a.mailedBy,
    security: a.security,
    classification: a.classification,
    topic: a.topic,
  };
}

function approvalToThreadDetail(a: Approval): ThreadDetail {
  const { name, email } = parseRecipient(a.recipient);
  return {
    // IIL's insight about this approval — never `receivedBody` (the email)
    // and never `draft` (the suggested reply), both of which live in their
    // own fields below.
    insight: a.summary ?? '',
    messages: [
      {
        id: a.id,
        initials: initialsOf(name),
        name,
        senderEmail: email,
        body: a.receivedBody.join('\n\n'),
        subject: a.subject,
        to: a.to,
        cc: a.cc,
        bcc: a.bcc,
        date: a.date,
        replyTo: a.replyTo,
        deliveredTo: a.deliveredTo,
        messageId: a.messageId,
        mailingList: a.mailingList,
        signedBy: a.signedBy,
        mailedBy: a.mailedBy,
        security: a.security,
      },
    ],
    draftPreview: a.draft.join('\n\n'),
  };
}

function demoMailToRow(m: DemoMail): AdaptedMailRow {
  const done = Boolean(m.completedAt);
  const attention: Attention = done
    ? NORMAL_ATTENTION
    : attentionOr(m.attention);
  return {
    id: m.id,
    sender: m.sender,
    senderEmail: m.senderEmail,
    subject: m.subject,
    // Inbox stays Gmail-plain: always the real email's own opening line,
    // never `m.insight` (IIL's own words) — that belongs to the opened
    // thread view's dedicated Insight section, not the shared row list.
    snippet: m.body[0] ?? '',
    unread: !done,
    attention,
    category: 'Primary',
    starred: false,
    status: 'inbox',
    completedAt: m.completedAt,
    completedNote: m.completedNote,
    to: m.to,
    cc: m.cc,
    bcc: m.bcc,
    date: m.date,
    replyTo: m.replyTo,
    deliveredTo: m.deliveredTo,
    messageId: m.messageId,
    mailingList: m.mailingList,
    signedBy: m.signedBy,
    mailedBy: m.mailedBy,
    security: m.security,
    classification: m.classification,
    topic: m.topic,
  };
}

function demoMailToThreadDetail(m: DemoMail): ThreadDetail {
  return {
    insight: m.insight ?? '',
    messages: [
      {
        id: m.id,
        initials: initialsOf(m.sender),
        name: m.sender,
        senderEmail: m.senderEmail,
        body: m.body.join('\n\n'),
        attachments: m.attachments,
        subject: m.subject,
        to: m.to,
        cc: m.cc,
        bcc: m.bcc,
        date: m.date,
        replyTo: m.replyTo,
        deliveredTo: m.deliveredTo,
        messageId: m.messageId,
        mailingList: m.mailingList,
        signedBy: m.signedBy,
        mailedBy: m.mailedBy,
        security: m.security,
      },
    ],
    draftPreview: (m.draft ?? []).join('\n\n'),
  };
}

/** "via faculty mailing list" -> "Faculty Mailing List" — a plausible
 * sender name for an opportunity's originating message. Exported so the
 * Opportunities list row can show the same sender identity the opened-mail
 * rail/header does, instead of re-deriving its own. */
export function senderFromSource(source: string): string {
  const stripped = source.replace(/^via\s+/i, '');
  return stripped.replace(/\b\w/g, (c) => c.toUpperCase());
}

function opportunityToRow(o: Opportunity): AdaptedMailRow {
  return {
    id: o.id,
    sender: senderFromSource(o.source),
    senderEmail: o.senderEmail,
    subject: o.title,
    // Real content preview, not `why` (IIL's reasoning) — same rule as
    // `demoMailToRow`: the row's snippet is the email's own opening line,
    // and `why` belongs in the dedicated insight position instead.
    //
    // `body` is now authored per opportunity, the same way `DemoMail.body`
    // and `Approval.receivedBody` are. It used to be GENERATED from the
    // record's own fields as `Thought you'd want to see this — ${title}.`,
    // which made every row print its own subject twice, side by side: the
    // subject column and the preview column said the same words. A generated
    // preview can only ever restate what the row already shows.
    snippet: o.body[0] ?? '',
    unread: o.lifecycle === 'new',
    // A passed opportunity's attention ends with it — the same rule every
    // completable record follows. Otherwise: the record's own authored
    // level, plain. Deadline-driven urgency (its real closing date inside
    // the urgency window) is NOT folded in here — it's derived fresh from
    // `deadlineIso` on every `refreshDerivedState` pass instead (see
    // `StoredMailRow.baseAttention`), so Opportunities' own list, the Inbox
    // row for the same mail, and Dashboard's ranking read the same
    // always-current answer rather than one frozen at whatever was true the
    // moment this row was built.
    attention: o.completedAt ? NORMAL_ATTENTION : attentionOr(o.attention),
    deadlineIso: o.closesAt,
    category: 'Updates',
    starred: false,
    status: 'inbox',
    completedAt: o.completedAt,
    completedNote: o.completedNote,
    to: o.to,
    cc: o.cc,
    bcc: o.bcc,
    date: o.date,
    replyTo: o.replyTo,
    deliveredTo: o.deliveredTo,
    messageId: o.messageId,
    mailingList: o.mailingList,
    signedBy: o.signedBy,
    mailedBy: o.mailedBy,
    security: o.security,
    classification: o.classification,
    topic: o.topic,
  };
}

function opportunityToThreadDetail(o: Opportunity): ThreadDetail {
  const sender = senderFromSource(o.source);
  return {
    // IIL's reasoning about this opportunity — the one place it belongs.
    // Never the message body: that's `o.body`, the real forwarded message.
    insight: o.why,
    messages: [
      {
        id: o.id,
        initials: initialsOf(sender),
        name: sender,
        senderEmail: o.senderEmail,
        body: o.body.join('\n\n'),
        subject: o.title,
        to: o.to,
        cc: o.cc,
        bcc: o.bcc,
        date: o.date,
        replyTo: o.replyTo,
        deliveredTo: o.deliveredTo,
        messageId: o.messageId,
        mailingList: o.mailingList,
        signedBy: o.signedBy,
        mailedBy: o.mailedBy,
        security: o.security,
      },
    ],
    draftPreview: '',
  };
}

/** Adapts a Sent/Scheduled `OutgoingRow` into the shape the canonical
 * mail-detail view needs to open it. Sent/Scheduled don't share the unified
 * `rows` array above — there's no unread/starred/status to track for
 * something already sent (or waiting to be) — so this is the one place
 * they're ever turned into something resembling a receivable message,
 * called straight from the page rather than folded into `seed()`.
 * Rendered as *this* mailbox's own identity (`CURRENT_USER_NAME`/`_EMAIL`)
 * sending to the original `to` — the same "from you, to them" shape a real
 * Sent view uses, so the opened-mail header reads correctly either way. */
export function outgoingRowToStoredMailRow(row: OutgoingRow): StoredMailRow {
  return {
    id: row.id,
    sender: CURRENT_USER_NAME,
    senderEmail: CURRENT_USER_EMAIL,
    // `MailMetadata` carries recipients as comma-joined display strings;
    // the outgoing record carries them as real lists. Joined here, at the
    // one boundary between the two, rather than stored twice.
    to: joinRecipients(row.recipients.to),
    cc: joinRecipients(row.recipients.cc),
    bcc: joinRecipients(row.recipients.bcc),
    subject: row.subject,
    snippet: row.snippet,
    date: row.date,
    unread: false,
    // Mail you've already sent (or scheduled) never needs your attention —
    // it's outgoing, not something waiting on you. Baseline matches, so no
    // topic weight can raise it either: a weighted subject says what to look
    // at, and there is nothing to look at in your own outbox.
    attention: NORMAL_ATTENTION,
    baseAttention: NORMAL_ATTENTION,
    category: 'Primary',
    starred: false,
    status: 'inbox',
  };
}

/** The message history a thread has on file — its real `ThreadDetail` if
 * one exists, otherwise a single-message thread built from the row itself
 * (the same fallback `MailThreadView` uses for a plain, undrafted message).
 * Shared by both the real send-time merge and the read-only Scheduled
 * preview below, so they can never disagree on what "this thread so far"
 * means. Returns undefined only when `id` resolves to nothing at all. */
function threadMessagesFor(
  rows: StoredMailRow[],
  threadDetailsById: Record<string, ThreadDetail>,
  id: string
): ThreadMessage[] | undefined {
  const existing = threadDetailsById[id];
  if (existing) return existing.messages;
  const original = rows.find((r) => r.id === id);
  if (!original) return undefined;
  return [
    {
      id: original.id,
      initials: initialsOf(original.sender),
      name: original.sender,
      senderEmail: original.senderEmail,
      body: original.snippet,
      subject: original.subject,
      to: original.to,
      date: original.date,
    },
  ];
}

function outgoingRowToThreadMessage(row: OutgoingRow): ThreadMessage {
  return {
    id: row.id,
    initials: initialsOf(CURRENT_USER_NAME),
    name: CURRENT_USER_NAME,
    senderEmail: CURRENT_USER_EMAIL,
    // The message itself, not its preview. This used to be `row.snippet`, so
    // reopening something you had sent showed a truncated plain-text line
    // where the message should be.
    body: row.body,
    subject: row.subject,
    to: joinRecipients(row.recipients.to),
    cc: joinRecipients(row.recipients.cc),
    bcc: joinRecipients(row.recipients.bcc),
    // Only what a server could actually serve back. A `LocalAttachment`'s
    // bytes exist solely in the sending tab, so it is not something a reader
    // of this thread could ever open.
    attachments: row.attachments.filter(
      (a): a is StoredAttachment => a.kind === 'stored'
    ),
    date: row.date,
    responseExpected: row.responseExpected,
  };
}

/** Folds a reply into the real thread it belongs to — same "a reply is
 * never freestanding" reasoning `threadId` itself carries. This is the one
 * place that connection actually happens: the thread's own message list
 * gains the reply as its newest entry (so Inbox/Approvals/Actions/
 * Opportunities all see it, not just Sent), its drafted-reply prompt clears
 * (there's a real reply now, nothing left to suggest), and the row's
 * "needs a reply" decoration turns off — the same way replying in Gmail or
 * Outlook updates the one thread everywhere it's shown, not just the
 * message list you happened to reply from. A no-op if the reply is already
 * on file (guards against double-applying the same send) or its `threadId`
 * doesn't resolve to anything. */
function mergeSentReplyIntoThread(
  rows: StoredMailRow[],
  threadDetailsById: Record<string, ThreadDetail>,
  reply: OutgoingRow
): { rows: StoredMailRow[]; threadDetails: Record<string, ThreadDetail> } {
  if (!reply.threadId) return { rows, threadDetails: threadDetailsById };
  const baseMessages = threadMessagesFor(
    rows,
    threadDetailsById,
    reply.threadId
  );
  if (!baseMessages || baseMessages.some((m) => m.id === reply.id)) {
    return { rows, threadDetails: threadDetailsById };
  }

  const mergedDetail: ThreadDetail = {
    // BOTH AI fields clear once a reply has actually gone out, for the same
    // reason: they described work that is now done. The drafted reply is
    // spent (it was sent), and the insight — "they need an answer by Friday",
    // "this is blocked on your decision" — describes a state that no longer
    // holds. Leaving it would mean opening an answered thread and being told
    // to answer it, which is exactly the kind of stale AI text this contract
    // is meant to keep off the screen. A *scheduled* (not yet sent) reply
    // deliberately doesn't reach this path — see `scheduleReply`.
    insight: '',
    messages: [...baseMessages, outgoingRowToThreadMessage(reply)],
    draftPreview: '',
  };

  return {
    rows: rows.map((r) =>
      r.id === reply.threadId
        ? {
            ...r,
            snippet: `Me: ${reply.snippet}`,
            // The row's displayed time always reads as "the latest message
            // in this thread" — after a reply goes out, that's the reply
            // itself, not whatever inbound message started the thread, so
            // this has to move forward too or the row would keep sorting/
            // displaying by a now-stale date.
            date: reply.date,
            // Attention drops to `normal`: the thread no longer needs
            // anything from you now that the reply has gone out. (Read state
            // is a separate dimension and isn't touched here.)
            //
            // Recorded on `repliedAt` as well as zeroing the value, because
            // attention is re-derived whenever preferences change — without
            // the fact on the row, a high-weighted topic would pull an
            // already-answered thread back to gold on the next slider move.
            attention: NORMAL_ATTENTION,
            baseAttention: NORMAL_ATTENTION,
            repliedAt: reply.date,
          }
        : r
    ),
    threadDetails: { ...threadDetailsById, [reply.threadId]: mergedDetail },
  };
}

/** The thread a Sent/Scheduled row opens onto. For an already-sent reply
 * this is just the real, permanent thread (already merged — see
 * `mergeSentReplyIntoThread`); for a still-pending Scheduled reply, this
 * previews it appended on top of the real thread *without* mutating
 * anything, since Gmail/Outlook don't show an unsent scheduled reply in
 * the thread either — only `sendScheduledNow` actually merges it in.
 * Returns undefined when the row isn't linked to anything. */
export function getOutgoingThreadDetail(
  row: OutgoingRow
): ThreadDetail | undefined {
  if (!row.threadId) return undefined;
  const baseMessages = threadMessagesFor(
    state.rows,
    state.threadDetails,
    row.threadId
  );
  if (!baseMessages) return undefined;

  if (baseMessages.some((m) => m.id === row.id)) {
    return (
      state.threadDetails[row.threadId] ?? {
        insight: '',
        messages: baseMessages,
        draftPreview: '',
      }
    );
  }

  return {
    // A scheduled reply hasn't gone out yet, so whatever IIL had to say about
    // this thread still stands — unlike the already-sent case above, which
    // clears it (see `mergeSentReplyIntoThread`).
    insight: state.threadDetails[row.threadId]?.insight ?? '',
    messages: [...baseMessages, outgoingRowToThreadMessage(row)],
    draftPreview: '',
  };
}

/** Every id this store knows a `ThreadDetail` for at seed time — Inbox's
 * own detailed threads plus every Approval/demo-mail/Opportunity, adapted
 * the same way their rows are. Just the *starting* content: `seed()` below
 * folds the seeded Sent/Scheduled examples into this before it ever
 * becomes reactive `state`, and `mailActions.sendReply`/etc. go on mutating
 * it from there — see `mergeSentReplyIntoThread`. */
/**
 * Thread content for a whole mailbox, assembled from every record type that
 * can carry one.
 *
 * Was a module-level constant computed from the demo imports at load time,
 * which meant thread content existed before — and independently of — any
 * hydration. A function taking its sources as arguments is what lets a
 * backend response produce the same map.
 */
function buildThreadDetails(input: {
  threadDetails?: Record<string, ThreadDetail>;
  approvals?: Approval[];
  demoMail?: DemoMail[];
  opportunities?: Opportunity[];
}): Record<string, ThreadDetail> {
  return {
    ...(input.threadDetails ?? {}),
    ...Object.fromEntries(
      (input.approvals ?? []).map((a) => [a.id, approvalToThreadDetail(a)])
    ),
    ...Object.fromEntries(
      (input.demoMail ?? []).map((m) => [m.id, demoMailToThreadDetail(m)])
    ),
    ...Object.fromEntries(
      (input.opportunities ?? []).map((o) => [
        o.id,
        opportunityToThreadDetail(o),
      ])
    ),
  };
}

/**
 * Joins Actions' own deadline (`dueDate`, which lives on the `ActionItem`,
 * not the mail) onto the shared row's `deadlineIso` — the one field
 * `refreshDerivedState` reads to derive urgency, the same as an Approval's
 * `respondBy` or an Opportunity's `closesAt`.
 *
 * Only fills a row that doesn't already have a `deadlineIso`: an Approval or
 * Opportunity record IS the mail (its own `respondBy`/`closesAt` is that
 * record's genuine deadline); an Action merely REFERENCES an existing mail by
 * `mailId`, so its `dueDate` never overrides a deadline the mail already owns
 * in its own right.
 */
function applyActionDeadlines(
  rows: AdaptedMailRow[],
  actionItems: ActionItem[]
): AdaptedMailRow[] {
  const dueDateByMailId = new Map(
    actionItems
      .filter((item): item is ActionItem & { mailId: string; dueDate: string } =>
        Boolean(item.mailId && item.dueDate)
      )
      .map((item) => [item.mailId, item.dueDate])
  );
  if (dueDateByMailId.size === 0) return rows;
  return rows.map((r) =>
    !r.deadlineIso && dueDateByMailId.has(r.id)
      ? { ...r, deadlineIso: dueDateByMailId.get(r.id) }
      : r
  );
}

/* ------------------------- Preferences → mail state ----------------------- */

/**
 * Re-derives everything the user's settings control, from inputs that are
 * themselves never overwritten.
 *
 * THIS FUNCTION IS THE SIMULATION OF THE BACKEND AGENT, and it is the piece
 * to delete when the real one arrives. With a live backend none of this runs
 * on the client: preferences go up (`settingsStore.save`), the model acts on
 * them, and mail comes back already drafted-or-not, already filed, already
 * weighted. What must NOT change at that point is anything downstream —
 * every page reads `row.attention`, `row.status` and `getThreadDetail`, and
 * none of them knows a preference exists. That's the whole design: the rules
 * move, the renderers don't.
 *
 * Idempotent and fully reversible by construction. Each derived value is
 * computed from a preserved input (`baseAttention`, `deadlineIso`,
 * `statusSource`) rather than from its own previous output, so turning a
 * setting off restores exactly what was there before it was turned on — no
 * re-seed, and no accumulated drift from being applied twice. Deadline
 * escalation is included in that: it's re-derived from `deadlineIso` against
 * the CURRENT time on every call here, rather than being baked into
 * `baseAttention` once at hydrate — see `StoredMailRow.baseAttention` for why
 * that used to go stale.
 */
function refreshDerivedState(
  rows: StoredMailRow[],
  prefs: AgentPreferences,
  now: Date = new Date()
): StoredMailRow[] {
  return rows.map((row) => {
    // Attention. An item that's resolved, or that you've already replied to,
    // stays quiet whatever its topic is weighted at — a preference says how
    // much a subject matters, never that finished work needs you again.
    const settled = Boolean(row.completedAt || row.repliedAt);
    // Overdue mail IS urgent — overdue is a subset of urgent, not a distinct
    // state (see `attention.ts`'s module doc). `isUrgentByDeadline` only
    // covers the forward-looking 0..URGENT_DEADLINE_DAYS window by design
    // (see its own doc comment), so a deadline that has already passed is
    // escalated here from `isOverdueByDeadline` instead — the two together
    // cover every deadline that demands the urgent/red treatment, future or
    // past. Escalation only ever raises, same as `escalateUrgency` itself, so
    // an authored `urgency: 'urgent'` that has nothing to do with the
    // deadline is untouched either way.
    const escalated = escalateUrgency(
      applyTopicPriority(row.baseAttention, row.topic, prefs),
      isUrgentByDeadline(row.deadlineIso, now) || isOverdueByDeadline(row.deadlineIso, now)
    );
    const attention = settled ? NORMAL_ATTENTION : escalated;

    // Cleanup. Only ever moves rows the rules themselves are responsible for:
    // a row the user filed by hand carries `statusSource: 'user'` and is left
    // strictly alone, in both directions.
    let status = row.status;
    let statusSource = row.statusSource;
    if (statusSource !== 'user') {
      const action = cleanupActionFor(row.classification, prefs);
      if (action) {
        status =
          action === 'delete'
            ? 'trash'
            : action === 'spam'
              ? 'spam'
              : 'archived';
        statusSource = 'cleanup';
      } else if (statusSource === 'cleanup') {
        // The rule that filed this has been relaxed — put it back.
        status = 'inbox';
        statusSource = undefined;
      }
    }

    // Archiving automation. Deliberately NOT age/read-count based — see
    // `isSafeToAutoArchive`. Only ever touches a row nobody has already
    // placed by hand or by a cleanup rule, and only while it's still sitting
    // in the inbox after the cleanup pass above.
    if (statusSource !== 'user' && statusSource !== 'cleanup') {
      const shouldAutoArchive =
        prefs.automation.archive === 'automatic' &&
        isSafeToAutoArchive({
          completedAt: row.completedAt,
          hasPendingWorkflow: pendingWorkflowCheck(row.id),
        });
      if (shouldAutoArchive && status === 'inbox') {
        status = 'archived';
        statusSource = 'automation';
      } else if (statusSource === 'automation' && !shouldAutoArchive) {
        // Either the setting was turned down or the thread no longer meets
        // the bar (e.g. it reactivated) — put it back, the same "undo what
        // we filed" rule cleanup follows above.
        status = 'inbox';
        statusSource = undefined;
      }
    }

    return { ...row, attention, status, statusSource };
  });
}

/** How long Trash/Spam retain a row before permanent deletion. The actual
 * retention rule belongs on the backend; this is the frontend/demo model of
 * it, kept explicit (a timestamp compared to now) rather than a frontend
 * timer, so it purges the same way whether the tab has been open five
 * minutes or five weeks. */
const PURGE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Permanently drops any row whose Trash/Spam retention has elapsed.
 *
 * Deterministic and clock-based, not a `setTimeout` — called from `hydrate`
 * (every load/refresh) so a row purges the moment enough real time has
 * passed since `trashedAt`/`spamAt`, never relying on the browser having
 * stayed open across the window. A future backend enforces the actual
 * deletion; this keeps the frontend's own view consistent with what that
 * backend would already have dropped.
 */
export function purgeExpired(rows: StoredMailRow[], now: Date = new Date()): StoredMailRow[] {
  const cutoff = now.getTime() - PURGE_AFTER_MS;
  return rows.filter((r) => {
    if (r.status === 'trash' && r.trashedAt) return new Date(r.trashedAt).getTime() > cutoff;
    if (r.status === 'spam' && r.spamAt) return new Date(r.spamAt).getTime() > cutoff;
    return true;
  });
}

/**
 * THE hydration boundary: raw records in, canonical mailbox state out.
 *
 * Everything a mailbox is built from arrives here as an argument. Nothing in
 * this function reaches for a module-level import, which is the entire point
 * — `seed()` used to read the demo constants directly, so "where the mail
 * comes from" was welded into the store's own definition and there was no
 * point at which a backend response could take its place.
 *
 * The eventual flow is unchanged in shape:
 *
 *     backend response → buildMailbox(...) → hydrate() → rows → pages
 *
 * with the demo bootstrap at the bottom of this file passing the demo
 * constants through exactly the same path.
 */
export type MailboxInput = {
  /** Rows already authored in the canonical shape (Inbox's own mail). */
  rows?: MailRow[];
  approvals?: Approval[];
  demoMail?: DemoMail[];
  opportunities?: Opportunity[];
  /** Read only for deadline escalation — an Action past due makes the mail
   * behind it urgent. Passed in rather than imported so the store has no
   * opinion about where Actions come from. */
  actions?: ActionItem[];
  /** Thread history/insight/draft, keyed by row id. */
  threadDetails?: Record<string, ThreadDetail>;
  sent?: OutgoingRow[];
  scheduled?: OutgoingRow[];
  drafts?: DraftRow[];
};

export function buildMailbox(input: MailboxInput): State {
  const rows = refreshDerivedState(
    applyActionDeadlines(
      [
        // Rows already authored in the canonical shape; the only thing to
        // resolve is an absent `attention`, which always means `normal`
        // (never a page-specific default).
        ...(input.rows ?? []).map((r) => ({
          ...r,
          starred: false,
          status: 'inbox' as MailStatus,
          attention: r.completedAt
            ? NORMAL_ATTENTION
            : attentionOr(r.attention),
        })),
        ...(input.approvals ?? []).map(approvalToRow),
        ...(input.demoMail ?? []).map(demoMailToRow),
        ...(input.opportunities ?? []).map(opportunityToRow),
      ],
      input.actions ?? []
    ).map((r) => ({
      // Whatever the adapters resolved is the agent's own assessment, and
      // becomes the baseline every later preference change re-derives from.
      ...r,
      baseAttention: r.attention,
    })),
    getAgentPreferences()
  );

  const sent = input.sent ?? [];

  // An already-sent reply is folded into its thread the same way an actual
  // send would fold it, so every page agrees on the thread's state from the
  // first render rather than only after the user sends something themselves.
  const merged = sent.reduce(
    (acc, row) => mergeSentReplyIntoThread(acc.rows, acc.threadDetails, row),
    { rows, threadDetails: buildThreadDetails(input) }
  );

  return {
    rows: purgeExpired(merged.rows),
    sent,
    scheduled: input.scheduled ?? [],
    drafts: input.drafts ?? [],
    threadDetails: merged.threadDetails,
  };
}

/** An empty mailbox — what the store holds before anything has hydrated it.
 * Every page already renders correctly against it (see the empty states);
 * this is what a real app shows while the first fetch is in flight. */
const EMPTY_MAILBOX: State = {
  rows: [],
  sent: [],
  scheduled: [],
  drafts: [],
  threadDetails: {},
};

let state: State = EMPTY_MAILBOX;
const listeners = new Set<() => void>();

/**
 * Preferences changing is a mail-state change.
 *
 * Weighting a topic up re-colours rows; setting a cleanup rule files them;
 * turning drafting off empties every suggested reply. Every one of those is
 * something a page is already rendering, so a preference change has to reach
 * the same subscribers a mail mutation does — otherwise the Settings page
 * updates and the Inbox behind it doesn't until something unrelated forces a
 * render.
 *
 * Subscribed at module scope rather than from a component: this store has no
 * lifecycle, and the relationship is between the two stores, not between two
 * views of them.
 */
subscribeToPreferences(() => {
  set({ rows: refreshDerivedState(state.rows, getAgentPreferences()) });
});

/**
 * Deadline escalation isn't only preference-driven — it's driven by the
 * clock. Without this, a mail whose deadline crosses into (or out of) the
 * urgency window while the tab just sits open would only ever pick up the
 * right `attention.urgency` on the next preference change or the next
 * `hydrate()` — i.e. never, in a real session, until something unrelated
 * happened to trigger one. Re-running `refreshDerivedState` on an interval is
 * what makes urgency genuinely live rather than "live until the next
 * incidental re-derivation", matching every other computed-from-now value in
 * this app (`formatRelativeMailTime`, `dueBucketFor`) already reading real
 * time on every render — this is the one piece of that story the STORE has
 * to own, since `attention.urgency` is read as a plain field, not recomputed
 * per render. A minute's staleness at worst is an acceptable tradeoff against
 * a real push channel, which is what a live backend replaces this with.
 */
setInterval(() => {
  set({ rows: refreshDerivedState(state.rows, getAgentPreferences()) });
}, 60_000);

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return state;
}

function set(next: Partial<State>) {
  state = { ...state, ...next };
  emit();
}

/** The one path every mail action (star, read/unread, archive, snooze, ...)
 * goes through regardless of which page the row came from. */
function updateRow(id: string, patch: Partial<StoredMailRow>) {
  set({ rows: state.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
}

function findRow(id: string): StoredMailRow | undefined {
  return state.rows.find((r) => r.id === id);
}

/**
 * Namespace for every id this client issues itself.
 *
 * Load-bearing, not decoration. Hydrated records carry ids from their source
 * (the demo bootstrap seeds `sent-1`), and a bare counter starting at 1
 * collides with them on the very first send — producing two rows with the same
 * key, which React reports and which makes "open the message I just sent"
 * ambiguous. It also makes a client-issued id recognisable on sight, which is
 * exactly what reconciliation needs.
 */
const LOCAL_ID_PREFIX = 'local-';

/**
 * Whether `id` was issued by this client and is still waiting for the server's
 * own.
 *
 * THE ONE QUESTION RECONCILIATION ASKS. A provisional id is a placeholder the
 * client minted so a record could exist, be rendered and be edited before any
 * server had seen it; the server assigns the permanent one, and it is not
 * assumed to be this value. Exported so that question is answerable in code
 * rather than by re-deriving a prefix convention from a comment.
 *
 * INTENTIONALLY UNUSED TODAY — same reasoning as `sanitizedHtmlFromBackend`.
 * Nothing calls it because nothing reconciles yet; it exists so the reconcile
 * pass has one obvious place to start instead of inventing its own test.
 */
export function isProvisionalId(id: string): boolean {
  return id.startsWith(LOCAL_ID_PREFIX);
}

let outgoingSeq = 0;
/**
 * Ids for records this client creates before any server has seen them.
 *
 * CLIENT-ISSUED AND THEREFORE PROVISIONAL. Once a backend exists it will
 * assign the real id, and these become temporary keys to reconcile against its
 * response — see {@link isProvisionalId} and `DraftRow.id`.
 */
function nextOutgoingId(kind: 'sent' | 'sched' | 'draft' | 'in') {
  outgoingSeq += 1;
  return `${LOCAL_ID_PREFIX}${kind}-${outgoingSeq}`;
}

/** Comma-joined form for the `MailMetadata` display fields. The inverse of
 * `splitRecipients`, which is what parses them back. */
function joinRecipients(list: string[]): string | undefined {
  return list.length ? list.join(', ') : undefined;
}

/**
 * Everything needed to send, schedule or save a reply — the composer's full
 * output, in one object.
 *
 * One shape for all three because they are the same message at different
 * moments. The previous per-mutation parameter lists took only
 * `{to, subject, snippet, threadId}`, which is why Cc, Bcc, attachments and
 * the actual message body had nowhere to go and were dropped without a trace.
 */
export type OutgoingInput = {
  threadId: string;
  recipients: Recipients;
  subject: string;
  body: MailBodyContent;
  attachments: Attachment[];
  /** See `OutgoingRow.responseExpected`. Nothing in today's composer sets
   * this — it exists so a future AI-assisted send (or a backend that
   * classifies a message as it goes out) has somewhere to put the signal
   * without a shape change here. */
  responseExpected?: boolean;
};

function outgoingRowFrom(
  input: OutgoingInput,
  date: string,
  kind: 'sent' | 'sched' = 'sent'
): OutgoingRow {
  return {
    id: nextOutgoingId(kind),
    recipients: input.recipients,
    subject: input.subject,
    // Derived here, once, so the preview can never disagree with the message.
    snippet: truncatePreview(input.body.text, 120),
    body: input.body,
    attachments: input.attachments,
    threadId: input.threadId,
    date,
    responseExpected: input.responseExpected,
  };
}

export const mailActions = {
  /* ------------------------------- Hydration ------------------------------- */

  /**
   * Replaces the entire mailbox with a freshly-built one.
   *
   * THIS IS THE BACKEND ENTRY POINT. A `GET /mail` response is adapted into
   * `MailboxInput`, passed here, and every page updates — none of them know
   * or care where the records came from. Replaces, rather than merges: a
   * fetch returns the mailbox as the server believes it to be, and silently
   * keeping local rows the server didn't mention is how two views of the same
   * account drift apart.
   *
   * Derived state is rebuilt as part of `buildMailbox`, so attention,
   * cleanup filing and `baseAttention` are all correct the moment this
   * returns — there is no second step a caller can forget.
   */
  hydrate(input: MailboxInput) {
    state = buildMailbox(input);
    emit();
  },
  /** Empties the mailbox — sign-out, account switch, or a test wanting a
   * clean store. */
  reset() {
    state = EMPTY_MAILBOX;
    emit();
  },

  toggleStar(id: string) {
    const row = findRow(id);
    if (row) updateRow(id, { starred: !row.starred });
  },
  markRead(id: string) {
    updateRow(id, { unread: false });
  },
  markUnread(id: string) {
    updateRow(id, { unread: true });
  },
  /* Every status change made by a person is stamped `statusSource: 'user'`.
   * That stamp is what makes it permanent against the Inbox Cleanup rules:
   * `refreshDerivedState` files and un-files rows on its own as those rules
   * change, and it must never reach a row someone archived, trashed or
   * snoozed deliberately. Restoring to Inbox clears the stamp back to
   * untouched, so a row put back by hand becomes eligible for the rules
   * again — which is the behaviour that reads correctly either way round. */
  snooze(id: string, until: Date) {
    updateRow(id, {
      status: 'snoozed',
      // ISO, like every other timestamp on a row. Was `toLocaleString()`,
      // which is a rendering of a date rather than a date: no backend can
      // parse it, no code can compare it, and its meaning changes with the
      // reader's locale. Formatting happens at the point of display.
      snoozedUntil: until.toISOString(),
      statusSource: 'user',
    });
  },
  archive(id: string) {
    updateRow(id, { status: 'archived', statusSource: 'user' });
  },
  trash(id: string) {
    updateRow(id, {
      status: 'trash',
      statusSource: 'user',
      trashedAt: new Date().toISOString(),
    });
  },
  markSpam(id: string) {
    updateRow(id, {
      status: 'spam',
      statusSource: 'user',
      spamAt: new Date().toISOString(),
    });
  },
  restoreToInbox(id: string) {
    updateRow(id, {
      status: 'inbox',
      snoozedUntil: undefined,
      statusSource: undefined,
      trashedAt: undefined,
      spamAt: undefined,
    });
  },
  /** Marks a row fully resolved — the one path every workflow completion
   * goes through regardless of which page it happened on (approve/reject in
   * Approvals, done in Actions, pass in Opportunities), the same way every
   * mail mutation already goes through `updateRow`.
   *
   * Only `attention` (the derived value) is zeroed — `baseAttention` (the
   * agent's own authored assessment) is deliberately left as it was.
   * Zeroing both used to be load-bearing against a slider move re-raising a
   * completed item, but `refreshDerivedState`'s own `settled` check already
   * forces `attention` back to normal for anything with a `completedAt`
   * regardless of `baseAttention` — so preserving it costs nothing today,
   * and is what lets `reactivate` (below) restore a thread's real attention
   * instead of coming back permanently flattened. `note`, if passed, becomes
   * the short description shown in that page's expanded Completed list and,
   * for auto-resolved mail, the Dashboard's "including" callout. */
  complete(id: string, note?: string) {
    updateRow(id, {
      completedAt: new Date().toISOString(),
      ...(note !== undefined ? { completedNote: note } : null),
      attention: NORMAL_ATTENTION,
    });
    // Completion is exactly the moment Archiving automation's predicate can
    // newly become true (a thread just went from "open" to "done, nothing
    // pending") — re-derive right away rather than waiting for the next
    // preference change or the 60s clock tick, so Automatic acts the moment
    // it is entitled to rather than on some unrelated timer.
    set({ rows: refreshDerivedState(state.rows, getAgentPreferences()) });
  },
  /**
   * Reverses `complete` — the one path a thread leaves its terminal state
   * through, whether that's the user manually replying to something the
   * Completed page already shows (see `sendReply`/`sendScheduledNow` below,
   * which call this automatically before merging the reply in) or a future
   * "reopen this" control.
   *
   * Clears `completedAt`/`completedNote` and re-derives `attention` from the
   * row's preserved `baseAttention` against the current prefs and clock —
   * the same derivation every other row's attention goes through, rather
   * than leaving it at the flattened `NORMAL_ATTENTION` `complete` set. That
   * derivation is also what makes the thread IIL-eligible again
   * (`isIILEligible` reads `completedAt` alone) and restores whichever
   * workflow page(s) it belongs to, since those pages already gate on this
   * same row's `completedAt` — there is no second "which page" decision to
   * make here. `notifyReactivated` is what lets `workflowStore` also clear
   * the matching Action/Approval/Opportunity record's own `completedAt`.
   *
   * A no-op on a row that isn't actually completed, so calling it
   * speculatively (as `sendReply` does, on every send) never affects an
   * ordinary active thread.
   */
  reactivate(id: string) {
    const row = findRow(id);
    if (!row || !row.completedAt) return;
    set({
      rows: refreshDerivedState(
        state.rows.map((r) =>
          r.id === id
            ? { ...r, completedAt: undefined, completedNote: undefined }
            : r
        ),
        getAgentPreferences()
      ),
    });
    notifyReactivated(id);
  },
  /** Everything the composer produced. One shape for send, schedule and
   * save-as-draft, because they are the same message at three moments — and
   * because a parameter list that omits a field is how Cc, Bcc, the real body
   * and every attachment used to get dropped silently on the way out. */
  sendReply(input: OutgoingInput) {
    // Replying to a thread the Completed page already shows is exactly the
    // "manual reply reactivates a completed thread" path — a no-op on any
    // ordinary active thread (see `reactivate`'s own guard).
    mailActions.reactivate(input.threadId);
    const row = outgoingRowFrom(input, new Date().toISOString());
    // A real send — fold it into the thread right away (unlike
    // `scheduleReply` below, which deliberately doesn't) so Inbox and every
    // other page reading this thread's id see the reply immediately, the
    // way Gmail/Outlook keep one thread in sync everywhere.
    const merged = mergeSentReplyIntoThread(
      state.rows,
      state.threadDetails,
      row
    );
    set({
      sent: [row, ...state.sent],
      rows: merged.rows,
      threadDetails: merged.threadDetails,
      // The draft this reply came from, if any, is spent the moment it goes
      // out — leaving it would resume a draft for a thread already answered.
      drafts: input.threadId
        ? state.drafts.filter((d) => d.threadId !== input.threadId)
        : state.drafts,
    });
  },
  scheduleReply(input: OutgoingInput & { date: Date }) {
    const row: OutgoingRow = {
      ...outgoingRowFrom(input, input.date.toISOString(), 'sched'),
      // ISO, like every other timestamp. Formatted for display at the point
      // of render (`formatScheduled`), never stored pre-formatted.
      scheduledFor: input.date.toISOString(),
    };
    // Deliberately NOT merged into the thread yet — a scheduled reply
    // hasn't actually gone out, so the thread it'll eventually join
    // shouldn't show it until it's really sent (`sendScheduledNow` below is
    // where that merge happens). `getOutgoingThreadDetail` still previews
    // it appended when *this* row is opened, without touching the real
    // thread.
    set({
      scheduled: [row, ...state.scheduled],
      drafts: input.threadId
        ? state.drafts.filter((d) => d.threadId !== input.threadId)
        : state.drafts,
    });
  },
  sendScheduledNow(id: string) {
    const row = state.scheduled.find((r) => r.id === id);
    if (!row) return;
    // Same reactivation as `sendReply` — this is the point a scheduled
    // reply actually goes out and genuinely merges into the thread, so it's
    // also the correct point for a thread the Completed page shows to leave
    // that state, not `scheduleReply` itself (which hasn't sent anything
    // yet).
    if (row.threadId) mailActions.reactivate(row.threadId);
    // Sent right now, ahead of its original schedule — the timestamp
    // updates to match the actual send time rather than keeping the
    // originally-scheduled one.
    const sentRow: OutgoingRow = {
      ...row,
      scheduledFor: undefined,
      date: new Date().toISOString(),
    };
    const merged = mergeSentReplyIntoThread(
      state.rows,
      state.threadDetails,
      sentRow
    );
    set({
      scheduled: state.scheduled.filter((r) => r.id !== id),
      sent: [sentRow, ...state.sent],
      rows: merged.rows,
      threadDetails: merged.threadDetails,
    });
  },

  /**
   * A new inbound message arrives on a thread — the one mutation nothing in
   * this store had before, because until now every message this app knew
   * about was something the user sent. A real backend calls exactly this on
   * a push/poll; nothing else changes.
   *
   * Reactivation rules, per thread's current mailbox state:
   *   - archived/snoozed: restored to Inbox (a `snoozedUntil` is cleared
   *     either way — "not now" doesn't apply once something new arrived).
   *   - trash/spam: left as-is. No reactivation policy exists for either
   *     today, and inventing one here would risk exactly the kind of
   *     silent-duplicate/undefined-behavior this pass is meant to avoid.
   *   - completed: goes through `reactivate`, the one existing path back to
   *     an active workflow, which already cascades into `workflowStore`.
   *
   * `repliedAt` is cleared unconditionally — an incoming message means the
   * user is no longer the last to have spoken, which is also what makes
   * `getFollowUpSuggestion` correct without a separate timestamp compare.
   */
  receiveReply(input: { threadId: string; body: string; senderName?: string; senderEmail?: string }) {
    const row = findRow(input.threadId);
    if (!row) return;
    const baseMessages =
      threadMessagesFor(state.rows, state.threadDetails, input.threadId) ?? [];
    const senderName = input.senderName ?? row.sender;
    const senderEmail = input.senderEmail ?? row.senderEmail;
    const date = new Date().toISOString();
    const message: ThreadMessage = {
      id: nextOutgoingId('in'),
      initials: initialsOf(senderName),
      name: senderName,
      senderEmail,
      body: input.body,
      subject: row.subject,
      to: CURRENT_USER_EMAIL,
      date,
    };
    const restoreInbox = row.status === 'archived' || row.status === 'snoozed';
    set({
      rows: state.rows.map((r) =>
        r.id === input.threadId
          ? {
              ...r,
              snippet: truncatePreview(input.body, 120),
              date,
              unread: true,
              repliedAt: undefined,
              ...(restoreInbox
                ? {
                    status: 'inbox' as MailStatus,
                    snoozedUntil: undefined,
                    statusSource: undefined,
                  }
                : null),
            }
          : r
      ),
      threadDetails: {
        ...state.threadDetails,
        [input.threadId]: {
          insight: state.threadDetails[input.threadId]?.insight ?? '',
          messages: [...baseMessages, message],
          draftPreview: state.threadDetails[input.threadId]?.draftPreview ?? '',
        },
      },
    });
    if (row.completedAt) mailActions.reactivate(input.threadId);
  },

  /* --------------------------------- Drafts -------------------------------- */
  /* Every draft operation in the app goes through the four functions below,
     and each maps 1:1 onto the endpoint that will eventually back it:

       hydrate({ drafts })            ← GET    /drafts
       saveDraft(input)               → POST   /drafts   (new)
                                        PUT    /drafts/:id (existing — the
                                        upsert already distinguishes the two
                                        by whether the thread has one)
       discardDraft(threadId)         → DELETE /drafts/:id
       sendReply / scheduleReply      → POST   /drafts/:id/send | /schedule,
                                        whose response removes the draft and
                                        yields the sent/scheduled record —
                                        which is exactly what both mutations
                                        already do locally.

     Nothing reads drafts except through `getDraft` and the store snapshot, so
     swapping the bodies of these four for awaited fetches is the whole
     integration; no consumer learns about it. IDs issued here are provisional
     (see `nextOutgoingId`) and are the temporary keys a server response would
     reconcile against. */

  /**
   * Saves (or overwrites) the unsent reply for a thread.
   *
   * One draft per thread, so this is an upsert rather than an append: coming
   * back to the same conversation resumes what you had, it doesn't stack a
   * second copy. Returns the draft so a caller can hold its id.
   *
   * This is the mutation "Save as draft" never had — the button previously
   * closed the composer and dropped everything, which is indistinguishable
   * from saving until you come back for it.
   */
  saveDraft(input: OutgoingInput): DraftRow {
    const existing = state.drafts.find((d) => d.threadId === input.threadId);
    const draft: DraftRow = {
      id: existing?.id ?? nextOutgoingId('draft'),
      threadId: input.threadId,
      recipients: input.recipients,
      subject: input.subject,
      body: input.body,
      attachments: input.attachments,
      updatedAt: new Date().toISOString(),
    };
    set({
      drafts: existing
        ? state.drafts.map((d) => (d.id === existing.id ? draft : d))
        : [draft, ...state.drafts],
    });
    return draft;
  },
  discardDraft(threadId: string) {
    set({ drafts: state.drafts.filter((d) => d.threadId !== threadId) });
  },
  /** The saved reply for a thread, if there is one — what the composer seeds
   * itself from when a thread is reopened. */
  getDraft(threadId: string): DraftRow | undefined {
    return state.drafts.find((d) => d.threadId === threadId);
  },

  cancelScheduled(id: string) {
    set({ scheduled: state.scheduled.filter((r) => r.id !== id) });
  },
  /**
   * The one lookup every canonical mail-detail instance uses for thread/
   * body/draft content, regardless of which page opened it.
   *
   * When Reply Drafting is off, the draft comes back empty — because with a
   * real backend it would never have been written in the first place. That is
   * the setting's actual meaning: "don't run the model", not "run it and hide
   * the result". Applying it here, at the single canonical read, rather than
   * in the renderers is what keeps `MailThreadView` honest — its `hasDraft`
   * asks the data whether a draft exists, and never asks whether it's allowed
   * to show one. Swap this store for the API and that component is already
   * correct.
   *
   * The same reasoning governs a COMPLETED thread's insight and draft — see
   * `isIILEligible`: a finished thread gets neither, projected off here
   * rather than generated and hidden downstream, so every caller (rail
   * previews, `hasDraft`, `insight`) sees the same "nothing to show" answer
   * without separately having to know the thread is done.
   *
   * Projected on read rather than erased from `threadDetails` so the switch
   * is reversible: turning drafting back on, or reactivating a completed
   * thread, restores exactly what was there — the underlying content was
   * never deleted, only withheld.
   */
  getThreadDetail(id: string): ThreadDetail | undefined {
    const detail = state.threadDetails[id];
    if (!detail) return undefined;
    const row = state.rows.find((r) => r.id === id);
    if (row && !isIILEligible(row)) {
      return { ...detail, insight: '', draftPreview: '' };
    }
    return shouldGenerateDrafts(getAgentPreferences())
      ? detail
      : { ...detail, draftPreview: '' };
  },
  /**
   * Whether IIL should identify this thread as a follow-up opportunity.
   *
   * A suggestion only, gated by `isFollowUpCandidate`/the Follow-ups
   * setting — this never sends anything. Reads the REAL canonical thread
   * data rather than `repliedAt` (a coarse proxy kept for attention-settling
   * elsewhere, see `StoredMailRow.repliedAt`'s own doc — unrelated concern,
   * left untouched): the thread's own last message tells us directly
   * whether the user spoke last, and if so, that message's own `date`/
   * `responseExpected` are the real `lastOutboundAt`/response-expected
   * signals `isFollowUpCandidate` needs. Nothing has arrived since a
   * message that is itself the last entry in the array, by definition — so
   * `lastMessageFromUser` and `repliedSinceLastOutbound` both fall out of
   * this one check.
   *
   * A completed thread never reaches `isFollowUpCandidate` at all — gated
   * here by the same `isIILEligible` every other IIL output already reads,
   * not a second completion check invented for this one feature.
   */
  getFollowUpSuggestion(id: string): boolean {
    const row = state.rows.find((r) => r.id === id);
    if (!row || !isIILEligible(row)) return false;
    const messages = state.threadDetails[id]?.messages;
    const last = messages?.[messages.length - 1];
    const lastMessageFromUser = Boolean(last && last.senderEmail === CURRENT_USER_EMAIL);
    return isFollowUpCandidate(
      {
        lastMessageFromUser,
        repliedSinceLastOutbound: false,
        responseExpected: lastMessageFromUser ? Boolean(last?.responseExpected) : false,
        lastOutboundAt: lastMessageFromUser ? last?.date : undefined,
      },
      getAgentPreferences()
    );
  },
};

export function useMailStore() {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * The current snapshot, for readers that aren't React components — the
 * conventional counterpart to `useMailStore` for any `useSyncExternalStore`
 * store (the same role `getState` plays elsewhere). `mailActions` already
 * reads and writes this state; this is the matching read side, exposed under
 * a name rather than left private.
 *
 * Returns the live snapshot object, which is replaced (never mutated) on
 * every change, so a caller holding one is holding a stable point-in-time
 * value.
 */
export function getMailSnapshot(): Readonly<State> {
  return getSnapshot();
}

/* ------------------------- Drafts: their threads -------------------------- */

/**
 * Which record a draft's `threadId` actually points at.
 *
 * A draft is keyed by whatever the composer was open on when it was saved:
 * usually a received row, but a reply written from Sent or Scheduled points
 * at that outgoing record instead. Both resolutions live here, in one place,
 * so "which conversation is this draft part of" is one question with one
 * answer — the Drafts page stays a pure view over canonical state rather than
 * re-deriving thread linkage itself.
 */
function draftThreadSource(
  threadId: string
): StoredMailRow | OutgoingRow | undefined {
  return (
    state.rows.find((r) => r.id === threadId) ??
    state.sent.find((r) => r.id === threadId) ??
    state.scheduled.find((r) => r.id === threadId)
  );
}

/**
 * The thread a draft belongs to, in the shape the canonical mail-detail view
 * opens — so a draft opens the real conversation it was written inside,
 * exactly as reopening that thread from Inbox or Sent already does.
 *
 * ORPHAN DRAFTS. A draft whose thread this client isn't holding still has to
 * be openable: it is the user's own writing, and refusing to open it because
 * the conversation around it hasn't loaded would be losing it. That can't
 * happen against the demo bootstrap (every draft is written on a loaded
 * thread) but is entirely ordinary once `GET /drafts` and the mailbox are two
 * independently-paged requests. Those fall back to a row built from the
 * draft's own recipients and subject — enough for the rail and header to
 * identify it, and deliberately carrying an empty snippet rather than a
 * fabricated received message. `getDraftThreadDetail` returns an empty thread
 * to match, so the reading pane shows nothing above the composer instead of
 * echoing the draft back as if someone had sent it.
 */
export function getDraftThreadRow(draft: DraftRow): StoredMailRow {
  const source = draftThreadSource(draft.threadId);
  if (source)
    return 'recipients' in source ? outgoingRowToStoredMailRow(source) : source;
  return {
    id: draft.threadId,
    sender: joinRecipients(draft.recipients.to) ?? 'No recipient',
    to: joinRecipients(draft.recipients.to),
    cc: joinRecipients(draft.recipients.cc),
    bcc: joinRecipients(draft.recipients.bcc),
    subject: draft.subject,
    snippet: '',
    date: draft.updatedAt,
    unread: false,
    attention: NORMAL_ATTENTION,
    baseAttention: NORMAL_ATTENTION,
    category: 'Primary',
    starred: false,
    status: 'inbox',
  };
}

/** What an orphan draft's reading pane shows: a real (empty) thread rather
 * than `undefined`, which would send `MailThreadView` down its
 * single-message fallback and render the row's own snippet as a message. */
const EMPTY_DRAFT_THREAD: ThreadDetail = {
  insight: '',
  messages: [],
  draftPreview: '',
};

/**
 * The message history behind a draft — the same two lookups Inbox and Sent
 * each already use, picked by which kind of record the draft hangs off, so
 * neither surface gets a third, subtly different notion of "this thread so
 * far". Inherits `getThreadDetail`'s Reply Drafting projection for received
 * threads, which is what keeps that setting honest here too.
 *
 * `undefined` still means "this thread has no stored detail" (a plain
 * received mail whose row snippet is the whole message) — only a genuinely
 * unresolvable thread gets the empty one.
 */
export function getDraftThreadDetail(
  draft: DraftRow
): ThreadDetail | undefined {
  const source = draftThreadSource(draft.threadId);
  if (!source) return EMPTY_DRAFT_THREAD;
  return 'recipients' in source
    ? getOutgoingThreadDetail(source)
    : mailActions.getThreadDetail(source.id);
}

/* ========================================================================
   DEMO BOOTSTRAP — THE REPLACEMENT POINT
   ========================================================================
   Everything below this line is the mock data source, and nothing above it
   knows the demo constants exist. When the backend lands, this block is what
   gets deleted: the fetch adapts its response into a `MailboxInput` and calls
   the same `mailActions.hydrate` used here.

   It runs at import so the demo has a populated mailbox on first paint, which
   is the one thing a real app would NOT do — there, hydrate is called when
   the request resolves, and every page renders the empty mailbox until then.
   That path is already exercised: `mailActions.reset()` puts the store in
   exactly the state a pre-fetch app starts in.
   ======================================================================== */
export function demoMailboxInput(): MailboxInput {
  return {
    rows: inbox.rows,
    approvals: approvals.items,
    demoMail: Object.values(demoMail),
    opportunities: opportunities.items,
    actions: actions.items,
    threadDetails: inbox.threadDetails as Record<string, ThreadDetail>,
    sent: [
      {
        id: 'sent-1',
        // The same reply `inbox.threadDetails.m1.draftPreview` describes as
        // already drafted — this row is that reply, already sent. Linking
        // back to `m1` is what lets opening it from Sent show Aisha's
        // earlier messages too, instead of just this one line in isolation.
        threadId: 'm1',
        recipients: {
          to: ['Aisha Kern <aisha.kern@meridianlabs.com>'],
          cc: [],
          bcc: [],
        },
        subject: 're: Recruiter offer — reply by Friday',
        snippet: 'Hi Aisha — thank you for the offer, I’m happy to accept...',
        body: {
          text: 'Hi Aisha — thank you for the offer, I’m happy to accept...',
        },
        attachments: [],
        // A reply can't predate the message it's replying to — `m1`'s last
        // inbound message (`t1` in workspaceData.ts) arrived 2026-08-14T09:14,
        // so this has to land after that, not the day before it.
        date: '2026-08-14T09:26:00',
        // Accepting a job offer is exactly the kind of outbound message that
        // reasonably expects a reply back (next steps, paperwork,
        // confirmation) — a genuine positive Follow-ups fixture, unlike the
        // "thank you" acknowledgment earlier in this same thread.
        responseExpected: true,
      },
    ],
  };
}

mailActions.hydrate(demoMailboxInput());

/**
 * DEV-ONLY QA HOOK — never shipped to production.
 *
 * There is no inbound-mail UI in this app (only outgoing send/schedule
 * exist), so `receiveReply` — the mutation a real backend push/poll would
 * call — has nothing in the product to trigger it from. Exposing it here
 * under `import.meta.env.DEV` lets browser QA drive the "archived/snoozed/
 * completed thread receives a reply" transitions for real, without adding a
 * simulate-incoming-mail feature to the product itself.
 */
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (
    window as unknown as {
      __mailActions: typeof mailActions;
      __getMailSnapshot: typeof getMailSnapshot;
    }
  ).__mailActions = mailActions;
  (
    window as unknown as {
      __mailActions: typeof mailActions;
      __getMailSnapshot: typeof getMailSnapshot;
    }
  ).__getMailSnapshot = getMailSnapshot;
}
