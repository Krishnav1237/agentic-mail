/**
 * Sample data + types for the Obligo workspace (Sprint 1).
 *
 * The design handoff ships placeholder "Sample:" copy and states content is to
 * be replaced with real bindings. This module is the single seam where that
 * happens: it mirrors the typed-module shape of `lib/api.ts`, so swapping these
 * constants for fetches later touches one file. Pages seed local state from it.
 */

/* ----------------------------- Shared ----------------------------------- */

/** Re-exported so data consumers can reach the one canonical attention model
 * from the same module they get the records from. Defined in
 * `lib/attention.ts` — see that file for the urgency/importance pair
 * and why there are no other tiers. */
export type { Attention } from './attention';
import type { Attention } from './attention';
import type {
  AutomationLevel,
  CleanupAction,
  CleanupCategory,
  FollowUpMode,
  PriorityTopic,
  ReplyDrafting,
  ReplyTone,
} from './agentPreferences';
import type { MailBodyContent, StoredAttachment } from './mailContent';

/**
 * What the model inferred ABOUT a message, as opposed to what the message
 * itself contains.
 *
 * Both fields are assigned by the LLM/ML layer reading the mail — never by
 * anything the frontend can compute — and both are the inputs the user's own
 * settings act on: `classification` is what Inbox Cleanup files against,
 * `topic` is what Priority Weights raise. They're layered in by intersection
 * (`& AgentSignals`) exactly the way `Partial<MailMetadata>` already is, so
 * every mail-shaped record carries them without four copies of the fields.
 *
 * Optional on purpose, and every rule that reads them treats absent as "no
 * opinion" rather than a default bucket. A real backend will not have
 * classified everything — a message can arrive before the model has looked at
 * it, or come back with low enough confidence that it declines to label it —
 * and inventing a class for those is how a mail ends up silently archived by
 * a rule the user never meant to apply to it.
 */
export type AgentSignals = {
  /** Which cleanup bucket the model filed this under, if any. Distinct from
   * `MailRow.category` (the provider's Primary/Updates/Promotions tab), which
   * is coarse, not model-derived, and not a cleanup input. */
  classification?: CleanupCategory;
  /** The subject area the model tagged this with, if any — matched against
   * the user's Priority Weights. */
  topic?: PriorityTopic;
};

/* ------------------------------ Actions --------------------------------- */

export type ActionItem = {
  id: string;
  title: string;
  meta?: string;
  /* No `reason` field here on purpose. It used to hold a short Obligo-authored
   * explanation shown in this page's row-insight slot — a SECOND piece of
   * AI-authored insight text about the same email, sitting beside the mail's
   * own canonical `ThreadDetail.insight`. The two inevitably said nearly the
   * same thing in slightly different words, and (worse) the row preview then
   * showed text that appeared nowhere in the opened mail. An Action's insight
   * IS its backing mail's insight, read from `mailActions.getThreadDetail`,
   * exactly the way an Action's attention is its backing mail's attention. */
  /** The one source of truth for "when is this due" — every displayed
   * label (the Overdue tier's "N days overdue", Today's "due today", This
   * Week's weekday name, Later's "in N wks") AND which of the five tiers
   * this item belongs in are *computed* from this via `dueBucketFor`/
   * `formatDueLabel` (`lib/mailAdapters.ts`), never hand-picked. Omit for
   * an item with no real deadline — it lands in the "No deadline — still
   * tracked" tier, the same way a real backend record with nothing due
   * would, rather than a fabricated one. */
  dueDate?: string;
  /* No attention field here on purpose. An Action's attention is its backing
   * mail's attention (`mailId` below → `StoredMailRow.attention`), never a
   * second value authored beside it — that's how this page ended up with a
   * HIGH/MED/LOW ladder AND a `gold` boolean AND an Overdue tier all claiming
   * to say the same thing. Deadline pressure from `dueDate` is folded into
   * that one shared value once, in `mailStore`'s seed (`escalateUrgency`),
   * so Actions and Dashboard can't disagree about which items are urgent —
   * and it raises the urgency axis only, leaving the mail's importance
   * exactly as authored. */
  /** When set, this item represents (or references) a real email — clicking
   * it opens the canonical mail-detail view for that id. Resolved against
   * `inbox.rows`/`inbox.threadDetails` first (so an Action that's really
   * just "this inbox email" reuses that same row rather than a second,
   * inconsistent copy of it), then `demoMail`. */
  mailId?: string;
  /** Set once this Action is done — the same field `Approval` and
   * `Opportunity` already carry.
   *
   * Completion used to be expressed structurally, by which of two arrays an
   * item lived in (`actions.items` vs `actions.completed`). That made it
   * unmutatable: finishing an Action would have meant moving a record between
   * two collections that pages read independently. One array plus this field
   * is what `workflowActions.completeAction` writes.
   *
   * Note the runtime source of truth for "is this resolved" remains the
   * backing mail row's own `completedAt` — the same convention Approvals and
   * Opportunities follow, and what keeps every page's active counts agreeing.
   * This field is the Action record's own copy of that fact, which is what a
   * backend would persist against the Action itself. */
  completedAt?: string;
  completedNote?: string;
};

/**
 * Real email-header fields, layered onto any of the mail-shaped records
 * below via intersection (`& Partial<MailMetadata>`) rather than duplicated
 * per type. Every field is optional and additive — the canonical message
 * header (`MailThreadView`'s metadata popover) only ever renders a row when
 * the underlying record actually has it, so leaving a field unset here is
 * how a demo message legitimately has no Bcc/Message-ID/etc., not a bug to
 * paper over with a placeholder.
 */
export type MailMetadata = {
  /** Comma-separated direct recipients (e.g. "Alex Rivera <alex@example.com>"). */
  to?: string;
  /** Comma-separated Cc recipients. */
  cc?: string;
  /** Comma-separated Bcc recipients — only ever meaningful from the sending
   * user's own point of view, never fabricated for a received message. */
  bcc?: string;
  /** Full ISO 8601 timestamp backing the row's abbreviated `time` label —
   * the metadata popover's Date row formats this in full; the compact
   * header keeps using `time`. */
  date?: string;
  replyTo?: string;
  deliveredTo?: string;
  messageId?: string;
  mailingList?: string;
  signedBy?: string;
  mailedBy?: string;
  /** Human-readable encryption/authentication status (e.g. "Standard
   * encryption (TLS)") — plain text, not a modeled enum, since this is
   * display-only and comes straight from a real header when one exists. */
  security?: string;
};

/** A minimal, self-contained "this is an email" record for pages that
 * reference specific messages but aren't Inbox itself (Actions today;
 * Opportunities derives its own instead, see `opportunityToDemoMail`).
 * Adapted into the same `StoredMailRow`/`ThreadDetail` shapes Inbox uses —
 * see `lib/mailStore.ts` — so it opens through the one canonical
 * mail-detail component like everything else. */
export type DemoMail = {
  id: string;
  sender: string;
  senderEmail?: string;
  subject: string;
  /** The one source of truth for when this arrived — every row's displayed
   * time (Inbox's rightmost column, the opened-mail header) is *computed*
   * from this via `formatRelativeMailTime`/`formatFullDateTime`, never
   * hand-authored separately, so it can never go stale or drift out of sync
   * with reality no matter how long a message sits in the mailbox. Required
   * (narrows `Partial<MailMetadata>`'s optional `date` below) because every
   * real message has one. */
  date: string;
  /** Obligo's own insight about this mail — never the email's actual content,
   * and never a summary of it either: what Obligo inferred, recommends, or is
   * flagging for the user. THE canonical insight for this message (it becomes
   * `ThreadDetail.insight`), authored in full: the opened mail shows all of
   * it, and every row that previews it truncates a copy rather than storing a
   * second, shorter one. Omit for a mail Obligo genuinely has nothing to say
   * about — an absent insight renders no insight section at all, which is a
   * real and correct outcome, not a gap to fill with filler. */
  insight?: string;
  /** The real email, paragraph by paragraph. */
  body: string[];
  /** An AI-suggested reply, if Obligo has drafted one for this thread — omit
   * for a plain received email with nothing drafted yet. */
  draft?: string[];
  /** How much attention this mail needs — the one canonical channel (see
   * `lib/attention.ts`): an independent `urgency` and `importance` pair, not
   * a single level. Independent of whether a reply's been drafted and of read
   * state. Omit when neither axis is raised; set either, or both. Note the
   * pair is what's authored — "urgent + important" is never a stored value,
   * just both axes being raised at once. */
  attention?: Attention;
  /** Files that arrived with this mail. `StoredAttachment` because a received
   * attachment is already held server-side by definition. */
  attachments?: StoredAttachment[];
  /** Set when this Action is done — see the matching field on `MailRow` for
   * the full contract (one shared completion signal every page's
   * "Completed" footer and the Dashboard's automated-activity note read
   * from, via `StoredMailRow` — never a page-local counter). */
  completedAt?: string;
  /** Short description of what happened, shown in the completed list and
   * (for auto-resolved mail) the Dashboard's "including …" callout. */
  completedNote?: string;
} & Partial<MailMetadata> & AgentSignals;

export const demoMail: Record<string, DemoMail> = {
  'dm-hr-offer': {
    id: 'dm-hr-offer',
    attachments: [
      { kind: 'stored', id: 'dm-hr-offer-att-1', name: 'offer-letter.pdf', size: 184320, mimeType: 'application/pdf' },
    ],
    topic: 'career',
    sender: 'HR — People Ops',
    senderEmail: 'hr@meridianlabs.com',
    subject: 'Signed offer letter — please return a copy',
    // INSIGHT, NO SUGGESTED REPLY. Obligo can't produce a signed copy of the
    // offer letter — that's a physical document only Alex has — so there is
    // genuinely nothing to draft, and the insight is the whole of what Obligo
    // has to offer here. This is the case the opened mail used to lose
    // entirely.
    insight:
      "HR can't schedule your onboarding until they have a signed copy of the offer letter back on file. Obligo hasn't drafted a reply because the signed document has to come from you — attach it and this can go out as-is.",
    body: [
      'Hi Alex — congratulations again on the offer! To finish processing your start date, we need a signed copy of the attached offer letter sent back to us.',
      "We need it on file before onboarding can be scheduled, so please send it back as soon as you're able.",
      'Best,\nHR — People Ops',
    ],
    // URGENT + IMPORTANT. Only `importance` is authored here — a signed offer
    // letter is genuinely consequential — and the urgency arrives separately,
    // from this mail's Action (`a-od1`) being past due, via `escalateUrgency`
    // in mailStore's seed. That the gold survives that escalation is the whole
    // point of the two-axis model: under the old single-level one, going
    // overdue overwrote `important` with `urgent` and the mail silently
    // stopped mattering.
    attention: { urgency: 'normal', importance: 'important' },
    to: 'Alex Rivera <alex.rivera@gmail.com>',
    bcc: 'HR Records <hr-records@meridianlabs.com>',
    date: '2026-08-12T10:05:00',
    replyTo: 'hr@meridianlabs.com',
    deliveredTo: 'alex.rivera@gmail.com',
    messageId: '<CAJb4p7wTn3zRq9vKs2mYd@mail.meridianlabs.com>',
    mailedBy: 'meridianlabs.com',
    security: 'Standard encryption (TLS)',
  },
  'dm-landlord': {
    id: 'dm-landlord',
    topic: 'personal',
    sender: 'Property Management',
    senderEmail: 'property-mgmt@example.com',
    subject: 'Lease renewal — decision needed',
    // INSIGHT, NO SUGGESTED REPLY. Renewal vs. month-to-month is Alex's call,
    // not Obligo's — a reply can't be drafted until that decision is made, so
    // the insight has to carry the whole decision on its own.
    insight:
      'Your lease expires at the end of next month. Property Management is offering a 12-month renewal at your current rate, or a month-to-month arrangement at a modest increase, and they need your choice by the end of the week to prepare the paperwork. Obligo has nothing drafted because the decision between the two options is yours.',
    body: [
      'Hi Alex — your current lease is set to expire at the end of next month. We can offer a 12-month renewal at the same rate, or a month-to-month option at a modest increase.',
      'Let us know which option you\'d like by the end of the week so we can prepare the paperwork.',
      'Property Management',
    ],
    // IMPORTANT ONLY. A real decision the user has to make, and no deadline
    // pressure of its own yet — importance raised, urgency left normal. (Its
    // Action's due date is what could later raise the urgency axis; that
    // happens once, in mailStore's seed, and leaves this gold intact.)
    attention: { urgency: 'normal', importance: 'important' },
    to: 'Alex Rivera <alex.rivera@gmail.com>',
    date: '2026-08-13T09:30:00',
  },
  'dm-visa': {
    id: 'dm-visa',
    topic: 'academic',
    sender: 'International Student Services',
    senderEmail: 'iss@university.edu',
    subject: 'Visa document portal — upload needed',
    insight:
      'The document portal opened earlier than usual this term, so the upload window is longer than it normally is. You need your current I-20 and passport bio page in by Thursday to keep your status in good standing — the upload happens in the portal itself, so there is nothing here for Obligo to reply to.',
    body: [
      'Hi Alex — the visa document portal is now open for this term. Please upload your current I-20 and passport bio page by Thursday to keep your status in good standing.',
      "Reach out if you're missing any of the required documents and we can help track them down.",
      'International Student Services',
    ],
    // NEITHER AXIS AUTHORED. This was hand-authored `urgent` while its own
    // Action (`a-w1`) isn't due until Thursday — several days out — so the
    // mail claimed time pressure that its own data contradicted. Urgency is
    // a claim about the clock, and the clock is already modeled: `dueDate`
    // drives `escalateUrgency` in mailStore's seed, which will raise this
    // on its own once the deadline actually passes. Authoring `urgent`
    // beside a future deadline is exactly the drift the derived model
    // exists to prevent — a hand-set flag that was true the day it was
    // written and then never moved again.
    //
    // Routine paperwork with a clear procedure isn't `important` either:
    // importance is about consequence, and this one has a form and a
    // portal. So it rests at normal until its own deadline says otherwise.
    to: 'Alex Rivera <alex.rivera@gmail.com>',
    cc: 'Registrar <registrar@university.edu>',
    date: '2026-08-11T13:15:00',
  },
  'dm-vendor': {
    id: 'dm-vendor',
    topic: 'finance',
    sender: 'Vendor — Print Services',
    senderEmail: 'orders@printservices.example.com',
    subject: 'Order confirmation — awaiting your response',
    insight:
      "Print Services is still waiting on your go-ahead for the proof they sent, and the print run locks on Friday. Obligo can't approve the artwork on your behalf, so this needs your eyes on the proof before anything goes back to them.",
    body: [
      "Hi Alex — we haven't heard back on the proof we sent over for your order. The print run locks in on Friday, so we'll need your go-ahead before then to keep the timeline.",
      'Let us know if the proof looks good or if you need any changes.',
      'Vendor — Print Services',
    ],
    to: 'Alex Rivera <alex.rivera@gmail.com>',
    date: '2026-08-10T15:40:00',
  },
  'dm-conference': {
    id: 'dm-conference',
    topic: 'finance',
    sender: 'Conference Registration',
    senderEmail: 'billing@regionalconf.example.com',
    subject: 'Registration invoice due',
    insight:
      'Payment is due by the end of the week to hold the early registration rate. Nothing is blocked on a reply — paying the invoice closes this on its own.',
    body: [
      "Hi Alex — attached is your registration invoice for the conference. Payment is due by the end of the week to lock in the early rate.",
      'Let us know if you need an updated receipt for reimbursement.',
      'Conference Registration',
    ],
    to: 'Alex Rivera <alex.rivera@gmail.com>',
    bcc: 'Finance <accounting@regionalconf.example.com>',
    date: '2026-08-09T09:00:00',
  },
  'dm-passport': {
    id: 'dm-passport',
    topic: 'travel',
    sender: 'Passport Services',
    senderEmail: 'noreply@passportrenewal.example.gov',
    subject: 'Renewal reminder — plan ahead of travel',
    insight:
      'Nothing is due here yet. Passports need to be renewed at least six months ahead of travel, so this is worth starting before your next trip is booked rather than after — Obligo is keeping it visible for that reason alone.',
    body: [
      'This is a reminder that passports should be renewed at least 6 months before your travel date to avoid delays.',
      'You can start the renewal process online whenever is convenient.',
      'Passport Services',
    ],
    to: 'Alex Rivera <alex.rivera@gmail.com>',
    date: '2026-08-07T10:00:00',
  },
  'dm-wellness': {
    id: 'dm-wellness',
    topic: 'health',
    sender: 'Wellness Center',
    senderEmail: 'appointments@wellness.example.edu',
    subject: 'Time to schedule your annual checkup',
    insight:
      'A routine annual reminder with no deadline attached. Booking is self-serve, so there is nothing to reply to — Obligo is only keeping it from getting buried.',
    body: [
      "Hi Alex — it's been about a year since your last checkup. Feel free to schedule online whenever works for your calendar.",
      'Wellness Center',
    ],
    to: 'Alex Rivera <alex.rivera@gmail.com>',
    date: '2026-08-07T14:20:00',
  },
  'dm-w9': {
    id: 'dm-w9',
    topic: 'finance',
    sender: 'New Client — Finance',
    senderEmail: 'ap@newclient.example.com',
    subject: 'W-9 needed to set up payment',
    insight:
      "The client can't process any payment to you until a completed W-9 is on file, so this is quietly blocking your first invoice. The form needs your signature and tax details, which is why nothing is drafted here.",
    body: [
      "Hi Alex — before we can process any payments, we'll need a completed W-9 on file. Whenever you get a chance to send it over works for us.",
      'New Client — Finance',
    ],
    to: 'Alex Rivera <alex.rivera@gmail.com>',
    date: '2026-07-31T11:00:00',
  },
  'dm-emergency-contact': {
    id: 'dm-emergency-contact',
    topic: 'personal',
    sender: 'HR — People Ops',
    senderEmail: 'hr@meridianlabs.com',
    subject: 'Please confirm your emergency contact on file',
    // NO INSIGHT, NO SUGGESTED REPLY — deliberately. A routine records
    // refresh with no deadline, no decision and no consequence is exactly the
    // kind of mail Obligo should have nothing to say about, and this is the one
    // demo mail that proves the empty case renders as *nothing* (no header, no
    // empty container, no filler sentence) rather than an insight invented to
    // fill the slot.
    body: [
      "Hi Alex — as part of our annual records refresh, please confirm or update your emergency contact information whenever convenient.",
      'HR — People Ops',
    ],
    to: 'Alex Rivera <alex.rivera@gmail.com>',
    date: '2026-07-31T09:15:00',
  },
  'dm-thesis-extension': {
    id: 'dm-thesis-extension',
    topic: 'academic',
    sender: 'Prof. Okafor',
    senderEmail: 'okafor@university.edu',
    subject: 'Thesis extension — revised timeline needed',
    // INSIGHT, NO SUGGESTED REPLY. The extension hinges on a target date only
    // Alex can commit to — Obligo can't invent one on his behalf.
    insight:
      "Prof. Okafor is willing to approve the extension, but won't sign off until he has a revised timeline — specifically the date you expect the next chapter draft. Obligo can't commit to a date on your behalf, so the reply is waiting on that one answer from you.",
    body: [
      "Hi Alex — following up on your extension request. I can approve a short extension, but I'll need a revised timeline before I sign off, specifically when you expect to have the next chapter draft ready.",
      'Can you send that over so I can confirm?',
      'Prof. Okafor',
    ],
    // IMPORTANT ONLY — an advisor waiting on your thesis timeline matters a
    // great deal, and nothing about it is due today.
    attention: { urgency: 'normal', importance: 'important' },
    to: 'Alex Rivera <alex.rivera@gmail.com>',
    date: '2026-08-13T17:05:00',
  },
  'dm-background-check': {
    id: 'dm-background-check',
    attachments: [
      { kind: 'stored', id: 'dm-background-check-att-1', name: 'background-check-authorization.pdf', size: 96256, mimeType: 'application/pdf' },
    ],
    topic: 'career',
    sender: 'HR — People Ops',
    senderEmail: 'hr@meridianlabs.com',
    subject: 'Background check authorization — signature needed',
    // INSIGHT, NO SUGGESTED REPLY. The form needs Alex's actual signature —
    // nothing Obligo writes in a reply can stand in for that.
    insight:
      'Your onboarding can\'t be completed until the signed background check authorization is back with HR. Your signature is the only thing missing, so there is no reply for Obligo to draft — only a form to sign and return.',
    body: [
      'Hi — as part of finalizing your onboarding, we need a signed copy of the attached background check authorization form.',
      'Please review, sign, and send it back at your earliest convenience so we can complete processing.',
    ],
    to: 'Alex Rivera <alex.rivera@gmail.com>',
    date: '2026-08-11T08:45:00',
  },
  'dm-library-fine': {
    id: 'dm-library-fine',
    topic: 'academic',
    sender: 'University Library',
    senderEmail: 'circulation@library.university.edu',
    subject: 'Overdue book fine — payment confirmed',
    insight:
      'The fine was paid in full and the hold on your borrowing account has been lifted. This one closed itself — nothing is left outstanding.',
    body: [
      'Hi Alex — this confirms your overdue fine has been paid in full. The hold on your borrowing account has been lifted.',
      'University Library',
    ],
    completedAt: '2026-08-08T10:00:00',
    completedNote: 'paid the overdue library fine',
    to: 'Alex Rivera <alex.rivera@gmail.com>',
    date: '2026-08-08T09:40:00',
  },
  'dm-course-eval': {
    id: 'dm-course-eval',
    topic: 'academic',
    sender: 'Office of the Registrar',
    senderEmail: 'evaluations@university.edu',
    subject: 'Course evaluations — submission confirmed',
    insight:
      'Every section was submitted and recorded ahead of the deadline, so nothing here is outstanding.',
    body: [
      "Hi Alex — thanks for submitting your course evaluations for the term. All sections have been recorded.",
      'Office of the Registrar',
    ],
    completedAt: '2026-08-05T16:00:00',
    completedNote: 'submitted course evaluations',
    to: 'Alex Rivera <alex.rivera@gmail.com>',
    date: '2026-08-05T15:30:00',
  },
};

/** Page copy and grouping configuration.
 *
 * Exported apart from the record arrays because they are different kinds of
 * thing: these are static UI text and shelf definitions the frontend owns,
 * while the arrays below are records a backend will eventually supply. Pages
 * import these directly and read the records from `workflowStore`. */
export const ACTIONS_INTRO =
  "Everything here is blocked on you — a decision, a document, or a detail Obligo can't supply on its own.";
export const APPROVALS_INTRO =
  'Obligo has finished preparing these — review the result and decide what happens next.';
export const OPPORTUNITIES_INTRO =
  'Opportunities Obligo surfaced from your inbox that might be worth pursuing.';
export const APPROVAL_SHELF_ORDER = ['Ready to send'];
export const INBOX_CATEGORIES = ['All', 'Primary', 'Updates', 'Promotions'] as const;
export const OPPORTUNITY_TABS = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'saved', label: 'Saved' },
  { key: 'pursuing', label: 'Pursuing' },
] as const;
export type OpportunityGroup = { id: string; heading: string };
export const OPPORTUNITY_GROUPS: OpportunityGroup[] = [
  { id: 'sh1', heading: 'Funded, and close to your thesis' },
  { id: 'sh2', heading: 'People already in motion' },
  { id: 'sh3', heading: 'Worth a passive follow' },
];

export const actions = {
  // Human-in-the-loop: everything on this page is here because Obligo hit a
  // wall it can't get past alone — a decision, a document, or a detail only
  // Alex has. Distinct from Approvals, where Obligo has already finished and
  // is only waiting on a review (see `approvals.intro`).
  intro: "Everything here is blocked on you — a decision, a document, or a detail Obligo can't supply on its own.",
  /** One flat list — which of the five tiers (Overdue/Today/This Week/
   * Later/No deadline) each item belongs in, and the label shown next to
   * it, are both *computed* from `dueDate` (`dueBucketFor`/`formatDueLabel`
   * in `lib/mailAdapters.ts`), never authored by filing an item into a
   * hand-picked array — that's what let "2 days overdue" go stale the
   * moment real time moved past whenever it was written. See `Actions.tsx`
   * for where the five tiers get derived from this array. */
  items: [
    {
      id: 'a-od1',
      title: 'Attach signed offer letter for HR',
      dueDate: '2026-08-13T17:00:00',
      mailId: 'dm-hr-offer',
    },
    {
      id: 'a-t1',
      title: 'Upload transcript and submit scholarship application',
      dueDate: '2026-08-15T17:00:00',
      // Same email as Inbox's "Grad Program — Scholarship portal now open"
      // (id `m3`) — this Action exists *because* of that email, so it opens
      // the identical row/thread rather than a second, drifted copy of it.
      // Its attention comes from that row too (`m3` is `important`), which is
      // why there's no `gold: true` here any more: two fields for one fact is
      // exactly what let them disagree.
      mailId: 'm3',
    },
    {
      id: 'a-t2',
      title: 'Choose a lease renewal option',
      dueDate: '2026-08-15T17:00:00',
      mailId: 'dm-landlord',
    },
    { id: 'a-w1', title: 'Complete visa document upload', dueDate: '2026-08-20T17:00:00', mailId: 'dm-visa' },
    { id: 'a-w2', title: 'Follow up if no reply from vendor', dueDate: '2026-08-21T17:00:00', mailId: 'dm-vendor' },
    { id: 'a-w3', title: 'Pay conference registration', dueDate: '2026-08-22T17:00:00', mailId: 'dm-conference' },
    {
      id: 'a-w4',
      title: 'Confirm revised thesis timeline with Prof. Okafor',
      dueDate: '2026-08-16T17:00:00',
      mailId: 'dm-thesis-extension',
    },
    { id: 'a-l1', title: 'Renew passport before travel', dueDate: '2026-09-19T17:00:00', mailId: 'dm-passport' },
    { id: 'a-l2', title: 'Schedule annual checkup', dueDate: '2026-10-03T17:00:00', mailId: 'dm-wellness' },
    { id: 'a-n1', title: 'Send W-9 to new client', mailId: 'dm-w9' },
    { id: 'a-n2', title: 'Update emergency contact with HR', mailId: 'dm-emergency-contact' },
    {
      id: 'a-n3',
      title: 'Sign and return background check authorization',
      mailId: 'dm-background-check',
    },
  ] as ActionItem[],
  /** Done — excluded from `items` above (a resolved item has no more due
   * date to bucket by) and surfaced only in the page's "Completed" footer.
   * Its "how long ago" label is computed from the resolved mail's own
   * `completedAt` (via `formatRelativeMailTime`, same as everywhere else),
   * not a hand-typed `when` string — see `MinimalRow` in `Actions.tsx`.
   * Each still resolves to a real mail via `mailId`, so opening one uses
   * the same canonical `MailThreadView` every pending Action does. */
  completed: [
    { id: 'a-c1', title: 'Paid overdue library fine', mailId: 'dm-library-fine' },
    { id: 'a-c2', title: 'Submitted course evaluations', mailId: 'dm-course-eval' },
  ] as ActionItem[],
};

/* ------------------------------- Inbox ---------------------------------- */

export type MailRow = {
  id: string;
  sender: string;
  /** Sender's address — shown beside the name in the opened-mail header when present. */
  senderEmail?: string;
  subject: string;
  snippet: string;
  /** The one source of truth for when this arrived — see `DemoMail.date`
   * for why this is required and never paired with a separately-authored
   * display string. */
  date: string;
  /** Workflow state, NOT attention (§2). A mail can be `normal + unread` or
   * `urgent + read`; the two never substitute for each other, and the unread
   * dot never takes on an attention color. */
  unread: boolean;
  /* No `hasInsight` flag here any more. It was a second, hand-maintained
   * answer to a question the data already answers directly: whether a
   * `ThreadDetail` exists for this row, whether that detail has an `insight`,
   * and whether it has a `draftPreview`. Three independent facts were being
   * squeezed into one boolean, which is how a mail with real body paragraphs
   * and a real insight (`dm-vendor`) ended up opening with neither — it
   * simply hadn't been flagged. Every consumer now asks the precise question
   * it actually cares about; see `MailThreadView`. */
  /** How much attention this mail needs — THE canonical channel (see
   * `lib/attention.ts`): an independent `urgency` and `importance` pair.
   * Drives the red/gold/neutral treatment everywhere a row can appear: list
   * rows, cards, the opened-mail rail, Dashboard, and every header count.
   * Independent of `unread`. Absent means neither axis is raised — no
   * fabricated attention.
   *
   * The two axes are set independently, and both can be set at once; there is
   * no combined value and no arbitration between them. Red renders for
   * urgency, gold for importance, and a mail with both shows both. */
  attention?: Attention;
  category: 'Primary' | 'Updates' | 'Promotions';
  /** Set when this item is fully resolved — whether Obligo handled it entirely
   * on its own (a plain Inbox message with nothing ever pending on Alex) or
   * a user completed the workflow around it (approved/rejected in
   * Approvals, done in Actions, passed in Opportunities). The one
   * completion signal every page's own "Completed" footer and the
   * Dashboard's automated-activity note both derive from — via
   * `StoredMailRow` (`lib/mailStore.ts`) — never a page-local counter. */
  completedAt?: string;
  /** Short description of what happened — a noun phrase (e.g. "an order
   * shipment confirmed automatically") meant to read naturally after
   * "including …" in the Dashboard's note, and as the row text in a page's
   * expanded Completed list. Omitted for anything still open. */
  completedNote?: string;
} & Partial<MailMetadata> & AgentSignals;

/** A single message inside a thread — carries its own metadata (rather than
 * inheriting the row's) so the opened-mail header's per-message details
 * popover always shows the message actually being inspected, not the
 * newest one in the thread. */
export type ThreadMessage = {
  id: string;
  initials: string;
  name: string;
  senderEmail?: string;
  /** The one source of truth for when this message was sent/received — see
   * `DemoMail.date`. The thread view derives every displayed time from this
   * (`formatFullDateTime`/`formatRelativeMailTime`), never a separately
   * hand-authored string. */
  date: string;
  /** What the sender wrote.
   *
   * A bare string is plain text — the form every demo message uses, and what
   * `toBodyContent` normalizes. A `MailBodyContent` carries both an HTML part
   * and its text fallback, which is what a real provider payload looks like.
   * Either way `MailBody` is the only thing that renders it (see that
   * component for why inbound HTML has its own type). */
  body: string | MailBodyContent;
  subject?: string;
  /** Files that arrived with this message.
   *
   * `StoredAttachment` specifically, never `LocalAttachment`: a received
   * attachment is by definition already held by someone other than this
   * browser. Absent means none — never an empty array standing in for
   * "not loaded". */
  attachments?: StoredAttachment[];
  /**
   * Whether this message — when it's the user's own outbound one — reasonably
   * expects a response, e.g. a genuine question, request, or scheduling ask.
   * `undefined`/`false` covers everything else, including informational,
   * thank-you and closure messages ("Thanks, looking forward to it!"), which
   * must never read as awaiting a reply just because nothing came back.
   *
   * Deliberately NOT derived from the message body by keyword-matching here
   * — "does this message expect a reply" is a judgment about content the
   * model that wrote or read the message is positioned to make, not
   * something a frontend `.includes('?')` check can honestly claim. This
   * field is the seam: curated by hand on today's demo data, and the exact
   * value a real backend/agent classification would populate. Only ever read
   * for the user's OWN messages (see `isFollowUpCandidate`) — meaningless on
   * an inbound one, so never set there.
   */
  responseExpected?: boolean;
  /* No `AgentSignals` here, unlike the four record types that carry them.
   * Classification and topic describe a CONVERSATION — which bucket it gets
   * filed into, which subject area it belongs to — not each message inside
   * one. Nothing files or weights an individual reply. */
} & Partial<MailMetadata>;

/**
 * Per-row Obligo detail, keyed by `MailRow.id`. THREE DIFFERENT THINGS, kept
 * apart on purpose, because the opened mail renders each in its own place:
 *
 *   messages      what the sender actually wrote — the real thread
 *   insight       what Obligo inferred/recommends/flags about it
 *   draftPreview  a reply Obligo has drafted for the user to review and send
 *
 * AI-authored text never enters `messages`, and the sender's words never
 * enter `insight`. A row can legitimately have any combination of the two AI
 * fields — insight only, draft only, both, or neither — and each renders (or
 * doesn't) independently of the other.
 */
export type ThreadDetail = {
  /** THE canonical Obligo insight for this thread, in full. Empty string means
   * Obligo has nothing to say about this mail, and the opened view renders no
   * insight section at all rather than an empty container. Every row preview
   * that shows an insight truncates a copy of *this* text — the row is never
   * the only place a given piece of AI output can be read. (Was `trace`,
   * which read like a debug artifact and invited exactly the confusion with
   * `reason`/`why`/`summary`/`detail` this contract now forbids.) */
  insight: string;
  messages: ThreadMessage[];
  /** The reply Obligo drafted, if it drafted one. Empty string means there is
   * nothing to review — never a placeholder draft. */
  draftPreview: string;
};

export const inbox = {
  categories: ['All', 'Primary', 'Updates', 'Promotions'] as const,
  rows: [
    {
      id: 'm1',
      topic: 'career',
      sender: 'Aisha Kern',
      senderEmail: 'aisha.kern@meridianlabs.com',
      subject: 'Recruiter offer — reply by Friday',
      snippet: "thanks again for the conversation last week — we'd love to move forward...",
      unread: true,
      // URGENT + IMPORTANT as authored — a live offer is consequential, and it
      // expires Friday, two separate facts about the same mail.
      //
      // Note this is what the mail IS, not what renders: `mailStore` seeds an
      // already-sent reply on this thread (`sent-1`), and
      // `mergeSentReplyIntoThread` clears BOTH axes once a reply goes out, so
      // the row shows neutral in the running app. That's correct — a thread
      // you've already answered needs nothing from you regardless of how it
      // started — and it's worth keeping the authored pair honest so the
      // record still describes the mail rather than describing its aftermath.
      // Priya Nathan's approval (`ap1`) is the live urgent + important row
      // Inbox actually displays.
      attention: { urgency: 'urgent', importance: 'important' },
      category: 'Primary',
      to: 'Alex Rivera <alex.rivera@gmail.com>',
      date: '2026-08-14T09:14:00',
      replyTo: 'aisha.kern@meridianlabs.com',
      deliveredTo: 'alex.rivera@gmail.com',
      messageId: '<CADf7x92kQz1p3vLh6mW9s@mail.meridianlabs.com>',
      mailedBy: 'meridianlabs.com',
      signedBy: 'meridianlabs.com',
      security: 'Standard encryption (TLS)',
    },
    {
      id: 'm2',
      classification: 'newsletters',
      topic: 'academic',
      sender: 'Dept. Newsletter',
      senderEmail: 'newsletter@dept-newsletter.edu',
      subject: 'This week in the program',
      snippet: 'a roundup of events, deadlines, and announcements...',
      unread: true,
      category: 'Updates',
      to: 'Alex Rivera <alex.rivera@gmail.com>',
      date: '2026-08-14T08:02:00',
    },
    {
      id: 'm3',
      topic: 'academic',
      sender: 'Grad Program',
      senderEmail: 'gradprogram@university.edu',
      subject: 'Scholarship portal now open',
      snippet: 'the scholarship portal is now open for the fall cycle, applications due in 11 days...',
      unread: false,
      // IMPORTANT ONLY — a scholarship worth applying for, with 11 days still
      // on the clock. Nothing about it is urgent yet.
      attention: { urgency: 'normal', importance: 'important' },
      category: 'Updates',
      to: 'Alex Rivera <alex.rivera@gmail.com>',
      cc: 'Academic Advising <advising@university.edu>',
      date: '2026-08-13T14:35:00',
    },
    {
      id: 'm4',
      classification: 'promotions',
      topic: 'shopping',
      sender: 'Storeline',
      senderEmail: 'orders@storeline.example.com',
      subject: 'Your order has shipped',
      snippet: 'tracking number and expected delivery window...',
      unread: false,
      category: 'Promotions',
      completedAt: '2026-08-13T11:10:00',
      completedNote: 'an order shipment confirmed automatically',
      to: 'Alex Rivera <alex.rivera@gmail.com>',
      date: '2026-08-13T11:10:00',
    },
    {
      id: 'm5',
      topic: 'personal',
      sender: 'Marcus Diaz',
      senderEmail: 'marcus.diaz@gmail.com',
      subject: 're: weekend plans',
      snippet: "sounds good, let's confirm the time closer to...",
      unread: false,
      category: 'Primary',
      to: 'Alex Rivera <alex.rivera@gmail.com>',
      date: '2026-08-10T16:45:00',
    },
    {
      id: 'm6',
      topic: 'networking',
      sender: 'Campus Events',
      senderEmail: 'events@campus.university.edu',
      subject: 'Career fair — RSVP',
      snippet: "dozens of employers confirmed for this term's fair...",
      unread: false,
      category: 'Updates',
      completedAt: '2026-08-10T10:20:00',
      completedNote: 'a career fair RSVP filed automatically',
      to: 'Alex Rivera <alex.rivera@gmail.com>',
      date: '2026-08-10T10:20:00',
    },
    {
      id: 'm7',
      topic: 'academic',
      sender: 'Registrar',
      senderEmail: 'registrar@university.edu',
      subject: 'Course withdrawal deadline reminder',
      snippet: 'the deadline to withdraw from a course without penalty is this Friday...',
      unread: false,
      category: 'Updates',
      completedAt: '2026-08-12T08:00:00',
      completedNote: 'a course withdrawal deadline flagged early',
      to: 'Alex Rivera <alex.rivera@gmail.com>',
      date: '2026-08-12T08:00:00',
    },
    {
      id: 'm8',
      topic: 'personal',
      sender: 'IT Helpdesk',
      senderEmail: 'helpdesk@university.edu',
      subject: 'Password reset confirmed',
      snippet: 'your requested password reset completed successfully',
      unread: false,
      category: 'Updates',
      completedAt: '2026-08-10T07:30:00',
      completedNote: 'a password reset confirmed automatically',
      to: 'Alex Rivera <alex.rivera@gmail.com>',
      date: '2026-08-10T07:30:00',
    },
  ] as MailRow[],
  /** One entry per row that has real thread history, an Obligo insight, or a
   * drafted reply — the opened-email view looks this up by the selected
   * row's id, so every thread carries its own insight/messages/draft instead
   * of sharing one. A row with no entry here is a plain email: it opens
   * showing exactly what the sender wrote and nothing else. */
  threadDetails: {
    m1: {
      // Authored as the live state of this thread. Note the seeded Sent reply
      // (`sent-1` in mailStore) has already gone out, and merging a sent
      // reply CLEARS both AI fields — so in the running app this thread opens
      // with no insight and no draft, which is correct: you've answered it.
      insight:
        'Aisha needs an answer by end of day Friday to hold the offer open. Everything she asked for in the earlier messages has already been covered, so the only thing outstanding is the yes or no itself.',
      messages: [
        {
          id: 't1a',
          initials: 'AK',
          name: 'Aisha Kern',
          senderEmail: 'aisha.kern@meridianlabs.com',
          body: 'Hi Alex — following up after our conversation last week. The team was impressed, and we’d like to move forward with an offer. I’ll send the details shortly.',
          subject: 'Recruiter offer — reply by Friday',
          to: 'Alex Rivera <alex.rivera@gmail.com>',
          date: '2026-08-10T11:02:00',
          deliveredTo: 'alex.rivera@gmail.com',
          messageId: '<CADf7x91aQz1p3vLh6mW9s@mail.meridianlabs.com>',
          security: 'Standard encryption (TLS)',
        },
        {
          id: 't1b',
          initials: 'AL',
          name: 'Alex',
          senderEmail: 'alex.rivera@gmail.com',
          body: 'That’s great to hear, thank you Aisha! Looking forward to the details.',
          subject: 'Recruiter offer — reply by Friday',
          to: 'Aisha Kern <aisha.kern@meridianlabs.com>',
          date: '2026-08-10T13:47:00',
          deliveredTo: 'aisha.kern@meridianlabs.com',
          messageId: '<CADf7x91bRz2q4wMi7nX0t@mail.gmail.com>',
          security: 'Standard encryption (TLS)',
          // A closing acknowledgment, not a question or request — exactly the
          // "Thanks for your help" case Follow-ups must never treat as
          // awaiting a reply.
          responseExpected: false,
        },
        {
          id: 't1',
          initials: 'AK',
          name: 'Aisha Kern',
          senderEmail: 'aisha.kern@meridianlabs.com',
          body: 'thanks again for the conversation last week — we’d love to move forward and would need to hear back by end of day Friday to hold the offer.',
          subject: 'Recruiter offer — reply by Friday',
          to: 'Alex Rivera <alex.rivera@gmail.com>',
          date: '2026-08-14T09:14:00',
          replyTo: 'aisha.kern@meridianlabs.com',
          deliveredTo: 'alex.rivera@gmail.com',
          messageId: '<CADf7x92kQz1p3vLh6mW9s@mail.meridianlabs.com>',
          mailedBy: 'meridianlabs.com',
          signedBy: 'meridianlabs.com',
          security: 'Standard encryption (TLS)',
        },
      ],
      draftPreview: '"Hi Aisha — thank you for the offer, I’m happy to accept..."',
    },
    m3: {
      // INSIGHT *AND* SUGGESTED REPLY — the case where both AI elements show
      // at once, each in its own place: the insight explains what matters,
      // the draft below it is the proposed response.
      insight:
        'The fall cycle is open and your program qualifies for it. Obligo caught the deadline four days before the portal announcement usually circulates and added the application to Actions, so the transcript and the form both have time to come together — the only hard constraint is the closing date itself.',
      messages: [
        {
          id: 't3a',
          initials: 'GP',
          name: 'Grad Program',
          senderEmail: 'gradprogram@university.edu',
          body: 'Reminder: the fall scholarship cycle opens soon — keep an eye on your inbox for the application portal link.',
          subject: 'Scholarship portal now open',
          to: 'Alex Rivera <alex.rivera@gmail.com>',
          date: '2026-08-06T09:00:00',
        },
        {
          id: 't3',
          initials: 'GP',
          name: 'Grad Program',
          senderEmail: 'gradprogram@university.edu',
          body: 'The scholarship portal is now open for the fall cycle. Applications are due in 11 days — since your program qualifies, we flagged it early so there’s time to pull materials together.',
          subject: 'Scholarship portal now open',
          to: 'Alex Rivera <alex.rivera@gmail.com>',
          cc: 'Academic Advising <advising@university.edu>',
          date: '2026-08-13T14:35:00',
        },
      ],
      draftPreview: '"Thanks for the heads up — I\'ll get my application materials together this week."',
    },
  } as Partial<Record<string, ThreadDetail>>,
};

/* --------------------------- Opportunities ------------------------------ */

export type Lifecycle = 'new' | 'saved' | 'pursuing' | 'passed';

/**
 * A single backend record. Flat and self-describing on purpose — `groupId`
 * and `attention` are just fields on the record (the way a real API would
 * return them), not structural nesting the UI has to special-case. Grouping,
 * filtering and the "elevated" treatment are all *derived* from these fields
 * at render time, so replacing this array with a live fetch later requires
 * no UI changes.
 */
export type Opportunity = {
  id: string;
  title: string;
  source: string;
  /** Address behind `source` (e.g. the mailing list's own address) — shown
   * in the opened-mail header/metadata popover when known. Not every
   * opportunity's originating message has one on file. */
  senderEmail?: string;
  /** When the originating message arrived — the one source of truth the
   * shared row's "received" column (Inbox's rightmost date) is *computed*
   * from via `formatRelativeMailTime`, never a separately-authored string.
   * Distinct from `timing` (this opportunity's own deadline/cadence status,
   * e.g. "closes in 11 days") — the two used to be conflated, which put
   * "closes in 11 days" in the slot every other Inbox row uses for "when
   * this arrived", inconsistent with the rest of the list. Required (narrows
   * `Partial<MailMetadata>`'s optional `date` below) since every real
   * opportunity has an originating message with a real received time. */
  date: string;
  /** Fallback/evergreen timing text ("rolling", "open-ended", "weekly") for
   * an opportunity with no real closing date — shown as-is. For one that
   * DOES have a real deadline, this is overridden at render time instead:
   * `closesAt` drives both the displayed label and the "urgent" tint (via
   * `formatClosingLabel`/`isClosingSoon` in `lib/mailAdapters.ts`), so
   * neither can go stale or drift out of sync with the real date the way a
   * hand-typed "closes in 11 days" and an independently hand-set `urgent`
   * flag used to. */
  timing: string;
  /** The real closing/deadline date this opportunity's `timing` label and
   * urgency are computed from. Omitted for anything genuinely date-less
   * (rolling admissions, an open-ended offer, a recurring weekly meetup) —
   * `timing`'s own evergreen text covers those, never a fabricated date. */
  closesAt?: string;
  /** The real forwarded message, paragraph by paragraph — the same field
   * `DemoMail.body` and `Approval.receivedBody` already carry, so all three
   * mail-shaped records answer "what did the sender actually write" the same
   * way. Its first paragraph is what the row previews.
   *
   * This used to be GENERATED from the record's own fields rather than
   * authored (`Thought you'd want to see this — ${title}.`), which meant the
   * row printed its subject twice: once in the subject column and again,
   * verbatim, in the preview column beside it. A preview derived from the
   * title can only ever restate the title. It must never mention the title,
   * and it must never make a relative-time claim ("closes tomorrow") — the
   * meta column computes timing from `closesAt`, and authored prose would
   * freeze at whatever was true the day it was written. */
  body: string[];
  /** THE canonical Obligo insight for this opportunity — why Obligo surfaced it and
   * what's worth knowing before deciding. Becomes `ThreadDetail.insight` for
   * the mail this opportunity opens as (see `opportunityToThreadDetail`), so
   * the shelf row's truncated preview and the opened mail's full Insight
   * section are the same text, never two separately-authored ones. Never the
   * email's own content — that's `body` above. */
  why: string;
  /** Workflow state (new/saved/pursuing/passed) — a different question from
   * attention, and deliberately kept separate (§15). A `pursuing` item can be
   * `normal`; a `new` one can be `urgent`. */
  lifecycle: Lifecycle;
  /** How much attention this opportunity needs — the same canonical channel
   * every mail carries (see `lib/attention.ts`): an independent `urgency` and
   * `importance` pair. Replaces the old `featured` boolean, which was this
   * page's private spelling of `important`. The elevated card at the top of
   * the page is *derived* from the importance axis rather than driven by a
   * second flag, so the card and the gold dot can never disagree.
   *
   * A real closing date inside its window raises the URGENCY axis once, in
   * `mailStore`'s seed — never re-derived per page, and never at the expense
   * of importance: a fellowship closing on Friday is both. */
  attention?: Attention;
  /** Which shelf this record belongs to; shelves are derived by grouping on
   * this field against `groups` below, the way a `GROUP BY` would. */
  groupId: string;
  /** Free-text tags, searchable but not (yet) rendered — demonstrates the
   * search contract without requiring new UI surface. */
  tags?: string[];
  /** Set once this opportunity's `lifecycle` reaches `'passed'` — the
   * matching field every other completable record carries (see `MailRow`
   * for the full contract). Drives the page's "Completed" footer count/window
   * and excludes the item from the main list regardless of the active tab. */
  completedAt?: string;
  completedNote?: string;
} & Partial<MailMetadata> & AgentSignals;


export const opportunities = {
  intro: 'Opportunities Obligo surfaced from your inbox that might be worth pursuing.',
  tabs: [
    { key: 'all', label: 'All' },
    { key: 'new', label: 'New' },
    { key: 'saved', label: 'Saved' },
    { key: 'pursuing', label: 'Pursuing' },
  ] as const,
  groups: [
    { id: 'sh1', heading: 'Funded, and close to your thesis' },
    { id: 'sh2', heading: 'People already in motion' },
    { id: 'sh3', heading: 'Worth a passive follow' },
  ] as OpportunityGroup[],
  items: [
    {
      id: 'op-elev',
      topic: 'academic',
      title: 'Research Fellowship — Linden Institute',
      source: 'via faculty mailing list',
      senderEmail: 'fellowships@lindeninstitute.example.edu',
      timing: 'closes soon',
      closesAt: '2026-08-26T23:59:00',
      body: [
        "Linden is funding a small number of places this cycle and, unusually for them, opening it to applicants who haven't finished their doctorate yet.",
        "Details and the application form are on their site — happy to make an introduction to the programme office if that would help.",
      ],
      why:
        'This fellowship lines up directly with the research direction in your thesis proposal, and Linden rarely opens it to applicants at your stage. It is the closest match to your own work that Obligo has seen come through this term, which is why it sits at the top of the page.',
      lifecycle: 'new',
      // IMPORTANT ONLY — a rare, directly-relevant fellowship, and its close
      // date is still outside the closing window, so nothing raises urgency.
      attention: { urgency: 'normal', importance: 'important' },
      groupId: 'sh1',
      tags: ['fellowship', 'research', 'thesis'],
      to: 'Alex Rivera <alex.rivera@gmail.com>',
      mailingList: 'grad-faculty-announce@university.edu',
      date: '2026-08-13T15:20:00',
      deliveredTo: 'alex.rivera@gmail.com',
      messageId: '<CAKq9nR2sVw4Xy8fPm1oJc@mail.lindeninstitute.example.edu>',
      security: 'Standard encryption (TLS)',
    },
    {
      id: 'op1',
      topic: 'career',
      title: 'Summer Data Fellowship — Meridian Labs',
      source: 'via Career Center newsletter',
      senderEmail: 'newsletter@careercenter.university.edu',
      timing: 'closes soon',
      closesAt: '2026-08-18T23:59:00',
      body: [
        "Meridian have moved this year's cohort onto a paid footing; previous intakes were for credit only, so the terms are materially different this time.",
        "The application portal is open now. Let me know if you'd like a look at last year's brief.",
      ],
      why:
        'Matches your stated interest in applied ML, and this is the first cohort where the roles are paid rather than for credit. You already marked it as pursuing, so the remaining question is only whether the application goes in before the window closes.',
      lifecycle: 'pursuing',
      // URGENT + IMPORTANT. Only `importance` is authored; the urgency comes
      // from `closesAt` landing inside the closing window, via
      // `escalateUrgency` in mailStore's seed — and, as with `dm-hr-offer`,
      // the gold survives it. A fellowship doesn't stop being worth having
      // because the deadline got close.
      attention: { urgency: 'normal', importance: 'important' },
      groupId: 'sh1',
      tags: ['fellowship', 'stipend', 'machine learning'],
      to: 'Alex Rivera <alex.rivera@gmail.com>',
      date: '2026-08-11T09:00:00',
    },
    {
      id: 'op2',
      topic: 'academic',
      title: 'Dept. Travel Grant — Conference Presenters',
      source: 'via advisor forward',
      senderEmail: 'advisor@university.edu',
      timing: 'rolling',
      body: [
        "The department will reimburse flights and accommodation for anyone presenting an accepted paper, up to the usual per-trip cap.",
        "Submit once you have an acceptance letter in hand — the form is short.",
      ],
      why:
        'The grant covers travel costs for accepted conference papers. Applications are rolling, so there is no deadline to race — it can wait until you actually have an acceptance in hand.',
      lifecycle: 'new',
      groupId: 'sh1',
      tags: ['grant', 'travel', 'conference'],
      to: 'Alex Rivera <alex.rivera@gmail.com>',
      date: '2026-08-05T10:00:00',
    },
    {
      id: 'op3',
      topic: 'networking',
      title: 'Regional Hackathon — Open Track',
      source: 'via campus mailing list',
      senderEmail: 'organizers@regionalhackathon.dev',
      timing: 'in a few weeks',
      closesAt: '2026-09-05T23:59:00',
      body: [
        "Registration for the open track is up, and a couple of people from your programme have already signed up looking for a third.",
        "Shout if you'd like an introduction to either of them.",
      ],
      why:
        'Two teammates from your program have already registered for the open track, so the team side of this is largely solved before you start.',
      lifecycle: 'saved',
      groupId: 'sh2',
      tags: ['hackathon', 'team'],
      to: 'Alex Rivera <alex.rivera@gmail.com>',
      date: '2026-08-12T14:00:00',
    },
    {
      id: 'op4',
      topic: 'networking',
      title: 'Alumni Coffee Chat — Product @ Northwind',
      source: 'via LinkedIn connection',
      senderEmail: 'dana.ruiz@northwind.co',
      timing: 'open-ended',
      body: [
        "Dana made the same move out of your programme into product two years ago and offered to walk through how it actually went.",
        "Let me know and I'll pass your details along.",
      ],
      why:
        'Dana offered to talk through their move from your program into product management. Open-ended and low cost — the value here is the conversation, not the timing.',
      lifecycle: 'saved',
      groupId: 'sh2',
      tags: ['networking', 'alumni', 'product'],
      to: 'Alex Rivera <alex.rivera@gmail.com>',
      date: '2026-08-09T16:30:00',
    },
    {
      id: 'op5',
      topic: 'academic',
      title: 'Design Systems Reading Group',
      source: 'via Slack community',
      senderEmail: 'design-systems@slack-community.example.com',
      timing: 'weekly',
      body: [
        "The group works through one paper a week and keeps each session to an hour — drop-in, with no reading required beforehand.",
        "Come to whichever sessions look useful; there's no commitment either way.",
      ],
      why:
        'The group is adjacent to what you have been reading lately and meets weekly, with no commitment beyond showing up when a session is useful.',
      lifecycle: 'new',
      groupId: 'sh3',
      tags: ['reading group', 'design systems'],
      to: 'Alex Rivera <alex.rivera@gmail.com>',
      date: '2026-08-13T08:00:00',
    },
    {
      id: 'op6',
      topic: 'finance',
      title: 'Local Grant — First-Gen Student Fund',
      source: 'via financial aid office',
      senderEmail: 'financial-aid@university.edu',
      timing: 'closes soon',
      closesAt: '2026-08-17T23:59:00',
      body: [
        "The aid office is holding a modest award for first-generation students. The form is a single page and needs no references.",
        "It's listed on the aid portal under first-generation support.",
      ],
      why:
        'A modest award with a short, simple application — small enough that the only thing that would make you miss it is the window closing first.',
      lifecycle: 'new',
      // URGENT ONLY, and entirely derived: nothing is authored here, but
      // `closesAt` is inside the closing window so `escalateUrgency` raises
      // the urgency axis alone. A modest award with a short form is worth
      // doing before it shuts — it isn't worth calling important.
      groupId: 'sh3',
      tags: ['grant', 'financial aid'],
      to: 'Alex Rivera <alex.rivera@gmail.com>',
      date: '2026-08-13T19:00:00',
    },
    {
      id: 'op-p1',
      topic: 'academic',
      title: 'Peer Mentorship Program',
      source: 'via student affairs',
      senderEmail: 'mentorship@studentaffairs.university.edu',
      timing: 'applications closed',
      body: [
        "Student affairs are pairing later-year students with incoming cohorts — roughly an hour a fortnight across one term.",
        "Sign-up runs through the student affairs portal.",
      ],
      why:
        'This matched your interests, but the application window closed before you responded, so nothing further can be done with it.',
      lifecycle: 'passed',
      groupId: 'sh3',
      tags: ['mentorship'],
      to: 'Alex Rivera <alex.rivera@gmail.com>',
      date: '2026-08-01T09:00:00',
      completedAt: '2026-08-06T09:00:00',
      completedNote: 'passed — application window closed',
    },
    {
      id: 'op-p2',
      topic: 'networking',
      title: 'Startup Pitch Night',
      source: 'via campus mailing list',
      senderEmail: 'events@campus.university.edu',
      timing: 'schedule conflict',
      body: [
        "Six teams pitching to a panel of local investors, with a drinks reception afterwards for anyone who just wants to listen.",
        "Open to all students; no registration needed to attend.",
      ],
      why:
        'This overlapped with a standing commitment on your calendar, so you declined it at the time.',
      lifecycle: 'passed',
      groupId: 'sh3',
      tags: ['networking', 'startups'],
      to: 'Alex Rivera <alex.rivera@gmail.com>',
      date: '2026-08-04T12:00:00',
      completedAt: '2026-08-09T12:00:00',
      completedNote: 'passed — schedule conflict',
    },
  ] as Opportunity[],
};

/* ----------------------------- Approvals -------------------------------- */

/** Workflow state — where this approval sits in its own process. A separate
 * dimension from attention (§2/§15): an approval can be `ready + normal` or
 * `waiting + urgent`. Kept as-is; only the old `timingTone` (which mixed
 * urgency, importance, a schedule state and a "muted" non-state into one
 * enum) was removed. */
export type ApprovalStatus = 'ready' | 'waiting' | 'scheduled';

export type Approval = {
  id: string;
  shelf: string;
  status: ApprovalStatus;
  /** The actual email subject — never a workflow label like "Reply to X".
   * Used everywhere this approval's email appears: the list row, the rail,
   * and the opened-mail header, so there's exactly one subject value, not
   * one per surface. */
  subject: string;
  /* No `detail` field here any more. It held a short AI-authored line shown
   * in this page's row-insight slot, while `summary` held a slightly longer
   * AI-authored line saying nearly the same thing — two fields, one fact,
   * differing only in length, and neither reachable in full once the mail was
   * opened. `summary` below is now the single canonical insight; the row
   * truncates it for its preview instead of storing a second copy. */
  /** When the originating message arrived — the one source of truth the
   * shared row's "received" column (Inbox's rightmost date) is *computed*
   * from via `formatRelativeMailTime`, never a separately-authored string.
   * Distinct from `timing` (this approval's own send-urgency status, e.g.
   * "expected in 4h") — the two used to be conflated, which put "expected in
   * 4h"/"no rush" in the slot every other Inbox row uses for "when this
   * arrived". Required (narrows `Partial<MailMetadata>`'s optional `date`
   * below) since every real approval has a real received time. */
  date: string;
  /** Fallback/evergreen urgency text ("no rush") for an item with no real
   * deadline to compute from — shown as-is. For an item that DOES have a
   * real time claim behind it, this is overridden at render time instead of
   * trusted directly: a still-pending urgent item's "expected in …" comes
   * from `respondBy` (via `dueBucketFor`/`formatDueLabel`), and a completed
   * item's "sent … ago" comes from `completedAt` (via
   * `formatRelativeMailTime`) — see `ApprovalRow` in `Approvals.tsx`. Kept
   * required as the one field every item still needs *something* to show;
   * just never the source of truth once a real date exists. */
  timing: string;
  /** When a reply genuinely has to go out by — the source `dueBucketFor`/
   * `formatDueLabel` compute a still-pending urgent item's "expected in …"
   * label from, the same way Actions' `dueDate` drives its own labels.
   * Omitted for anything without a real deadline (a muted "no rush" item
   * has nothing to compute — `timing`'s own evergreen text covers it). */
  respondBy?: string;
  /** How much attention this approval needs — the same canonical channel
   * every mail carries (see `lib/attention.ts`): an independent `urgency` and
   * `importance` pair. Replaces `timingTone`, which was this page's private
   * four-value enum blending attention (`urgent`/`gold`) with workflow state
   * (`scheduled`) and a placeholder non-value (`muted`). Workflow state lives
   * on `status`; timing lives on `respondBy`/`timing`; this field is attention
   * and only attention.
   *
   * A `respondBy` that's already passed raises the URGENCY axis once, in
   * `mailStore`'s seed. It never touches importance — being late says nothing
   * about whether the mail mattered. */
  attention?: Attention;
  recipient: string;
  /** THE canonical Obligo insight for this approval — what Obligo wants the user to
   * know before deciding on the drafted reply, authored in full. Becomes
   * `ThreadDetail.insight` (see `approvalToThreadDetail`), so the list row's
   * truncated preview and the opened mail's Insight section are the same
   * text. Never the email itself (`receivedBody`) and never the drafted reply
   * (`draft`) — three different things this data used to blur into one.
   * Optional: an approval where the draft speaks entirely for itself has no
   * insight, and no insight section renders. */
  summary?: string;
  /** The actual received email `recipient` sent, paragraph by paragraph —
   * what the opened-mail view's message body shows. Distinct from
   * `summary` (Obligo's extraction) and `draft` (Obligo's suggested reply):
   * three different things this data used to blur into one. */
  receivedBody: string[];
  draft: string[];
  /** Set once this approval has been approved (and sent) or rejected — the
   * matching field every other completable record carries (see `MailRow`
   * for the full contract). An approval with this set no longer belongs in
   * a pending shelf; it surfaces only in the page's "Completed" footer. */
  completedAt?: string;
  completedNote?: string;
} & Partial<MailMetadata> & AgentSignals;

export const approvals = {
  // Final review: everything on this page is already fully prepared — Obligo
  // has drafted the reply and nothing is still pending from Alex. Distinct
  // from Actions, where Obligo is blocked waiting on something only he can
  // provide (see `actions.intro`). No shelf here should ever hold an item
  // that's still waiting on unresolved input — that belongs in Actions, and
  // no item should be a scheduled-send or a draft-only message either —
  // those already have dedicated views (Sent/Scheduled, this page's own
  // drafted replies) and don't belong duplicated here as a shelf of their
  // own; every item below is either still awaiting the human's final
  // decision or already resolved (see `completedAt`).
  intro: 'Obligo has finished preparing these — review the result and decide what happens next.',
  shelfOrder: ['Ready to send'],
  items: [
    {
      id: 'ap1',
      topic: 'career',
      shelf: 'Ready to send',
      status: 'ready',
      subject: 'Recruiter availability for final loop',
      timing: 'expected soon',
      respondBy: '2026-08-15T17:00:00',
      // URGENT + IMPORTANT, both authored. Scheduling the final loop is a
      // consequential step in a real hiring process, and the recruiter is
      // waiting on it today. Two independent facts, both raised.
      attention: { urgency: 'urgent', importance: 'important' },
      recipient: 'PRIYA NATHAN <priya@meridianlabs.com>',
      // INSIGHT *AND* SUGGESTED REPLY — both render, separately: the insight
      // below explains what the recruiter actually needs, the drafted reply
      // is the proposed answer to it.
      summary:
        'Priya is moving you to the final loop for the Software Engineer role and needs your availability for next week — Tuesday through Thursday, roughly 90 minutes. Nothing else is outstanding on your side, so naming two workable windows is enough to get it scheduled.',
      receivedBody: [
        "Hi Alex — hope you're doing well! We'd like to move you forward to the final loop for the Software Engineer role. Could you share your availability for next week? We're looking at Tuesday through Thursday, roughly 90 minutes for the full loop.",
        "Let me know what works and I'll get it scheduled on our end.",
        'Best,\nPriya',
      ],
      to: 'Alex Rivera <alex.rivera@gmail.com>',
      cc: 'Recruiting Coordination <recruiting-coord@meridianlabs.com>',
      date: '2026-08-14T06:31:00',
      replyTo: 'priya@meridianlabs.com',
      deliveredTo: 'alex.rivera@gmail.com',
      messageId: '<CAHq3m8vRt2yPz6nKj5wLd@mail.meridianlabs.com>',
      mailedBy: 'meridianlabs.com',
      signedBy: 'meridianlabs.com',
      security: 'Standard encryption (TLS)',
      draft: [
        'Hi Priya — thanks for reaching out. I’m available Tuesday or Wednesday afternoon next week for the loop, whichever works better on your end. Looking forward to it.',
        'Best,\nAlex',
      ],
    },
    {
      id: 'ap2',
      topic: 'networking',
      shelf: 'Ready to send',
      status: 'ready',
      subject: 'Coffee chat scheduling',
      timing: 'no rush',
      // URGENT ONLY, and entirely derived. Nothing is authored: a friendly
      // coffee chat is pleasant, not consequential, so importance stays
      // normal. But `respondBy` has already passed and leaving someone hanging
      // is a real (if small) time pressure, so `escalateUrgency` in
      // `approvalToRow` raises the urgency axis alone. The row goes coral and
      // stays gold-free — which is correct, and is what the previous model got
      // wrong in the opposite direction: it authored this `important` and then
      // had the overdue escalation silently overwrite that word with `urgent`,
      // so the same field meant two different things depending on the clock.
      respondBy: '2026-08-14T17:00:00',
      recipient: 'DANA RUIZ <dana.ruiz@northwind.co>',
      summary:
        'Dana followed up after the mixer and offered two windows — Tuesday afternoon or Thursday morning next week. This has been sitting past the day a reply would normally have gone out, so a short answer either way is what closes it.',
      receivedBody: [
        "Hey! It was great meeting you at the mixer last week. I'd love to grab coffee sometime and hear more about your work — I'm generally free Tuesday afternoons or Thursday mornings next week if either works for you.",
        'Let me know!',
        'Dana',
      ],
      draft: [
        'Hi Dana — great to connect. I’m free Tuesday after 2pm or Thursday morning next week. Happy to work around your schedule either way.',
        'Best,\nAlex',
      ],
      to: 'Alex Rivera <alex.rivera@gmail.com>',
      date: '2026-08-13T12:15:00',
      replyTo: 'dana.ruiz@northwind.co',
      deliveredTo: 'alex.rivera@gmail.com',
      security: 'Standard encryption (TLS)',
    },
    {
      id: 'ap3',
      classification: 'newsletters',
      topic: 'personal',
      shelf: 'Ready to send',
      status: 'ready',
      subject: 'Unsubscribe confirmation',
      timing: 'no rush',
      recipient: 'lists@dept-newsletter.edu',
      // SUGGESTED REPLY, NO INSIGHT — deliberately. A one-line unsubscribe
      // confirmation has nothing Obligo could usefully add beyond the draft
      // itself, so no insight is authored and no insight section renders.
      // Inventing one here ("this is an unsubscribe request") would be
      // narration, not insight.
      receivedBody: [
        'You are currently subscribed to the Department Newsletter distribution list.',
        "If you no longer wish to receive these emails, reply to this message with 'unsubscribe' and we will remove your address within 3-5 business days.",
      ],
      draft: ['Confirmed — please remove this address from the distribution list. Thanks.'],
      to: 'Alex Rivera <alex.rivera@gmail.com>',
      date: '2026-08-12T09:40:00',
      mailingList: 'lists@dept-newsletter.edu',
    },
    {
      // IMPORTANT ONLY — the fourth attention state on this page, so all four
      // are visible here: `ap1` urgent + important, `ap2` urgent, `ap4`
      // important, `ap3` neither. A reference letter from your own advisor is
      // about as consequential as academic mail gets, and there is deliberately
      // no `respondBy`: the professor asked to be told "whenever you know",
      // so nothing raises the urgency axis and the row stays gold.
      id: 'ap4',
      topic: 'academic',
      shelf: 'Ready to send',
      status: 'ready',
      subject: 'Reference letter — which programs to write for',
      timing: 'no deadline given',
      attention: { urgency: 'normal', importance: 'important' },
      recipient: 'PROF. OKAFOR <okafor@university.edu>',
      summary:
        "Prof. Okafor has already agreed to write the letter and only needs the list of programs before he starts, so he can tailor each one. He explicitly said there's no rush, which is why nothing here is time-pressured — the draft below simply confirms the four you settled on.",
      receivedBody: [
        "Alex — happy to write your reference letter. Before I start, send me the list of programs you're applying to and I'll tailor it to each one.",
        "No rush on my end; whenever you've settled on the list is fine.",
        'Prof. Okafor',
      ],
      draft: [
        'Hi Prof. Okafor — thank you, that means a lot. The four programs I’ve settled on are attached, in the order I’m prioritising them. Happy to send along my proposal draft if that would help.',
        'Best,\nAlex',
      ],
      to: 'Alex Rivera <alex.rivera@gmail.com>',
      date: '2026-08-13T16:20:00',
      replyTo: 'okafor@university.edu',
      deliveredTo: 'alex.rivera@gmail.com',
      mailedBy: 'university.edu',
      security: 'Standard encryption (TLS)',
    },
    {
      // Was "Scheduled & draft-only" — that shelf duplicated Sent/Scheduled's
      // own dedicated view, so it's gone; this item is real, though (already
      // approved and since actually sent), so it stays as a completed entry
      // rather than being deleted outright.
      id: 'ap5',
      topic: 'networking',
      shelf: 'Ready to send',
      status: 'ready',
      subject: 'Hackathon registration',
      timing: 'sent 1d ago',
      recipient: 'organizers@regionalhackathon.dev',
      summary:
        'The organizers need your team roster confirmed before the registration is locked in. This was approved and sent Thursday morning, so nothing is outstanding.',
      receivedBody: [
        "Hi — thanks for registering for the Regional Hackathon Open Track! Your spot is confirmed pending final confirmation from your team.",
        "Please reply to confirm your team roster is finalized so we can lock in your registration.",
      ],
      draft: [
        'Hi team — confirming our registration for the open track. Looking forward to it, and let me know if you need anything else from our side.',
        'Best,\nAlex',
      ],
      to: 'Alex Rivera <alex.rivera@gmail.com>',
      cc: 'Team Roster <hackathon-team@example.com>',
      date: '2026-08-12T11:00:00',
      security: 'Standard encryption (TLS)',
      completedAt: '2026-08-13T09:00:00',
      completedNote: 'hackathon registration approved and sent',
    },
    {
      id: 'ap-c1',
      classification: 'banking',
      topic: 'finance',
      shelf: 'Ready to send',
      status: 'ready',
      subject: 'Invoice approval — office supplies',
      timing: 'sent 3d ago',
      recipient: 'billing@officesupplyco.example.com',
      summary:
        'The monthly office supply invoice needed your approval before accounts payable could release payment. Approved and sent.',
      receivedBody: [
        "Hi Alex — attached is the invoice for this month's office supply order. Please approve for payment at your convenience.",
        'Office Supply Co. Billing',
      ],
      draft: ['Approved — please proceed with payment. Thanks for the quick turnaround.'],
      to: 'Alex Rivera <alex.rivera@gmail.com>',
      date: '2026-08-11T10:00:00',
      completedAt: '2026-08-11T10:20:00',
      completedNote: 'office supplies invoice approved and sent',
    },
  ] as Approval[],
};

/* ------------------------------ Settings --------------------------------- */

export type SettingsRow = {
  key: string;
  label: string;
  value: string;
  options: string[];
  /** Options present in the list but not yet selectable — rendered dimmed
   * and inert rather than omitted, so the capability is visibly "coming
   * soon" instead of silently absent. */
  disabledOptions?: string[];
};

/** Reply Drafting's own scale — "Auto-send" is listed but intentionally
 * disabled for now (Obligo never sends unattended, even in automatic mode). */
export const REPLY_DRAFTING_OPTIONS = ["Don't draft", 'Draft for approval', 'Auto-send'];
export const REPLY_DRAFTING_DISABLED = ['Auto-send'];
/** Shared scale for Archiving — a lighter-weight action than replying, so it
 * gets a plain never/suggest/automatic ladder instead of Reply Drafting's
 * approval-gated one. */
export const AUTOMATION_OPTIONS = ['Never', 'Suggest', 'Automatically'];
/** Follow-ups is a plain on/off switch — see `FollowUpMode`. Obligo either may
 * or may not identify follow-up opportunities; there is no "automatic"
 * rung, since Follow-ups never sends anything on its own either way. */
export const FOLLOWUP_OPTIONS = ['Off', 'On'];
export const TONE_OPTIONS = ['Neutral', 'Professional', 'Friendly', 'Personalized'];
export const CLEANUP_OPTIONS = ['Keep', 'Archive', 'Spam', 'Delete'];

/**
 * Display label ⇄ stored value, per control.
 *
 * The Settings page renders the left-hand side; `settingsStore` and the
 * backend only ever see the right. Keeping the two separated here is what
 * lets a control be relabelled ("Draft for approval" → "Review before
 * sending") without changing a single byte of what gets sent over the wire,
 * and stops a display string from ever becoming an API value by accident.
 */
export const REPLY_DRAFTING_BY_LABEL: Readonly<Record<string, ReplyDrafting>> = {
  "Don't draft": 'off',
  'Draft for approval': 'review',
  'Auto-send': 'auto',
};

export const REPLY_TONE_BY_LABEL: Readonly<Record<string, ReplyTone>> = {
  Neutral: 'neutral',
  Professional: 'professional',
  Friendly: 'friendly',
  Personalized: 'personalized',
};

export const AUTOMATION_BY_LABEL: Readonly<Record<string, AutomationLevel>> = {
  Never: 'never',
  Suggest: 'suggest',
  Automatically: 'automatic',
};

export const FOLLOWUP_BY_LABEL: Readonly<Record<string, FollowUpMode>> = {
  Off: 'off',
  On: 'on',
};

export const CLEANUP_BY_LABEL: Readonly<Record<string, CleanupAction>> = {
  Keep: 'keep',
  Archive: 'archive',
  Spam: 'spam',
  Delete: 'delete',
};

/** The Priorities list, label ⇄ the topic key the model tags mail with —
 * display order over these is `PRIORITY_TOPICS` (`lib/agentPreferences.ts`),
 * the one canonical topic ordering; this file no longer keeps a second copy
 * of it. */
export const TOPIC_BY_LABEL: Readonly<Record<string, PriorityTopic>> = {
  Career: 'career',
  Academic: 'academic',
  Finance: 'finance',
  Personal: 'personal',
  Health: 'health',
  Networking: 'networking',
  Travel: 'travel',
  Shopping: 'shopping',
};

/** Reverse lookup for rendering a stored value back as its label. Falls back
 * to the first label rather than throwing — a value from an older build or a
 * newer backend should render as *something* selectable, not blank. */
export function labelForValue<V extends string>(
  map: Readonly<Record<string, V>>,
  value: V,
): string {
  return Object.keys(map).find((label) => map[label] === value) ?? Object.keys(map)[0];
}

/** Forward lookup, with the same never-throw contract in the other
 * direction: a label the map doesn't know resolves to `fallback` rather than
 * writing `undefined` into a preference the rules will later read. */
export function valueForLabel<V extends string>(
  map: Readonly<Record<string, V>>,
  label: string,
  fallback: V,
): V {
  return map[label] ?? fallback;
}

export const settings = {
  howIHelp: [
    {
      key: 'reply',
      label: 'Reply Drafting',
      value: 'Draft for approval',
      options: REPLY_DRAFTING_OPTIONS,
      disabledOptions: REPLY_DRAFTING_DISABLED,
    },
    { key: 'archive', label: 'Archiving', value: 'Suggest', options: AUTOMATION_OPTIONS },
    { key: 'followup', label: 'Follow-ups', value: 'Off', options: FOLLOWUP_OPTIONS },
    { key: 'tone', label: 'Reply Tone', value: 'Neutral', options: TONE_OPTIONS },
  ] as SettingsRow[],
  inboxCleanup: [
    { key: 'promotions', label: 'Promotions', value: 'Keep', options: CLEANUP_OPTIONS },
    { key: 'newsletters', label: 'Newsletters', value: 'Keep', options: CLEANUP_OPTIONS },
    { key: 'marketing', label: 'Marketing', value: 'Keep', options: CLEANUP_OPTIONS },
    { key: 'banking', label: 'Banking', value: 'Keep', options: CLEANUP_OPTIONS },
  ] as SettingsRow[],
};
