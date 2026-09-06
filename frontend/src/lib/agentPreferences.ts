/**
 * THE contract between the user's settings and the agent that acts on them.
 *
 * Two halves live here, both pure and both free of React, storage and UI:
 *
 *   AgentPreferences  what the user has told IIL to do — the exact payload a
 *                     backend would receive on save and hand to the LLM/ML
 *                     layer as its operating instructions.
 *   The rules         given a mail's agent-derived SIGNALS and those
 *                     preferences, what should be true of that mail.
 *
 * WHY THE RULES LIVE IN THE FRONTEND EVEN THOUGH THE BACKEND WILL RUN THEM.
 * They are product decisions ("Promotions set to Archive means promotional
 * mail leaves the inbox"), not implementation details, and both sides have to
 * agree on them exactly. Written here as pure, tested functions they are an
 * executable specification: the frontend can run them against mock data
 * today, and when the backend runs them for real the two cannot silently
 * disagree about what a setting meant.
 *
 * WHAT IS NOT HERE, DELIBERATELY. Nothing in this file inspects or rewrites
 * mail CONTENT. Classifying a message as a newsletter, tagging it with a
 * topic, and writing a reply in a given tone are all model work — the
 * backend's. This file only consumes the labels that work produces. The
 * split matters: `replyTone` below is carried and transmitted but has no rule
 * attached, because tone is realised by the model that writes the draft, not
 * by anything the frontend can compute.
 */
import type { Attention } from './attention';
import { attentionOr, isImportant } from './attention';
import {
  DEFAULT_IMPORTANCE_COLOR,
  DEFAULT_URGENCY_COLOR,
  IMPORTANCE_COLOR_KEYS,
  URGENCY_COLOR_KEYS,
  type ImportanceColor,
  type UrgencyColor,
} from './attentionColors';
import { dayDiffFor, FOLLOW_UP_WAIT_DAYS } from './deadlineGroups';

/* ----------------------------- Preferences ------------------------------- */

/**
 * How much of the reply IIL should produce.
 *
 * `off` IS AN INSTRUCTION, NOT A DISPLAY TOGGLE. It means "do not generate
 * drafts at all" — the model never runs, and no draft is produced to be shown
 * or hidden. That distinction is the whole point: suppressing an already-
 * generated draft in the UI would burn the tokens and the latency anyway. See
 * {@link shouldGenerateDrafts}.
 *
 * `auto` is reserved and currently not selectable (IIL never sends
 * unattended); it exists in the type because the backend contract has to name
 * the state even while the UI refuses to enter it.
 */
export type ReplyDrafting = 'off' | 'review' | 'auto';

/** Voice the model writes a draft in. Realised entirely by the backend — the
 * frontend transmits it and never derives anything from it. `personalized`
 * additionally implies learning from this mailbox's own sent mail. */
export type ReplyTone =
  | 'neutral'
  | 'professional'
  | 'friendly'
  | 'personalized';

/** How far IIL may act on its own for the lighter-weight housekeeping
 * actions. `suggest` surfaces a recommendation; `automatic` performs it. */
export type AutomationLevel = 'never' | 'suggest' | 'automatic';

/** Whether IIL may proactively identify follow-up opportunities. `on` only
 * ever surfaces a suggestion — it never sends anything on its own; the user
 * always chooses to send. */
export type FollowUpMode = 'off' | 'on';

/** What should happen to mail the model has classified into a given bucket. */
export type CleanupAction = 'keep' | 'archive' | 'spam' | 'delete';

/** The buckets Inbox Cleanup can act on. These are ASSIGNED BY THE MODEL —
 * `MailRow.classification` — not inferred from anything the frontend can see.
 * Distinct from `MailRow.category` (Primary/Updates/Promotions), which is the
 * provider's own coarse tab and is not a cleanup input. */
export type CleanupCategory =
  | 'promotions'
  | 'newsletters'
  | 'marketing'
  | 'banking';

/** Subject areas the model tags mail with, and that the user weights. Also
 * model-assigned (`MailRow.topic`). */
export type PriorityTopic =
  | 'career'
  | 'academic'
  | 'finance'
  | 'personal'
  | 'health'
  | 'networking'
  | 'travel'
  | 'shopping';

export const CLEANUP_CATEGORIES: CleanupCategory[] = [
  'promotions',
  'newsletters',
  'marketing',
  'banking',
];

export const PRIORITY_TOPICS: PriorityTopic[] = [
  'career',
  'academic',
  'finance',
  'personal',
  'health',
  'networking',
  'travel',
  'shopping',
];

/** Legacy neutral weight boundary — no longer part of the user-facing model
 * (see {@link AgentPreferences.highPriorityTopics}), kept only so
 * `sanitizePreferences` can interpret a preferences blob written by an older
 * build that still stores a 1–10 `topicWeights` map. Not exported: nothing
 * downstream of migration should ever need a numeric weight again. */
const LEGACY_NEUTRAL_TOPIC_WEIGHT = 5;

/**
 * Everything the user has configured, in one serialisable object.
 *
 * This shape IS the API payload — a backend `PUT /preferences` takes exactly
 * this, and the model layer reads exactly this. It deliberately holds typed
 * values rather than the display strings the Settings page renders
 * ("Draft for approval"), so that relabelling a control in the UI can never
 * change what gets sent over the wire.
 */
export type AgentPreferences = {
  replyDrafting: ReplyDrafting;
  replyTone: ReplyTone;
  automation: {
    archive: AutomationLevel;
    followup: FollowUpMode;
  };
  cleanup: Record<CleanupCategory, CleanupAction>;
  /**
   * Which topics IIL should treat as mattering more than the rest, MOST
   * IMPORTANT FIRST — a plain ordered list, not a numeric score. A topic
   * absent from this list is low priority; there is nothing else to say
   * about it, so low-priority topics carry no weight, rank or record of
   * their own anywhere in this object.
   *
   * Replaces a previous 1–10-per-topic `topicWeights` map. That let two
   * users both describe "Career matters more than Shopping" with numbers
   * that could disagree in magnitude for no meaningful reason (a 6 vs. an
   * 8 the UI could not explain and neither could recreate on demand) —
   * exactly the fine-grained-numbers problem {@link isHighPriorityTopic}
   * and {@link applyTopicPriority} never actually needed an answer to: both
   * only ever ask "is this topic in the high set", a yes/no question a
   * numeric weight only ever answered by way of an arbitrary threshold.
   * Order here is for the user's own organization (rendered top-to-bottom
   * in Settings, reorderable by drag the same way Quick Access is) — it is
   * NOT read by any attention rule below, which is why it costs nothing to
   * simplify away the numbers without touching what the agent actually
   * does with a high-priority topic.
   */
  highPriorityTopics: PriorityTopic[];
  /**
   * Whether the Advanced section's beta features are on.
   *
   * The one field here that carries no rule of its own — nothing in "The
   * rules" below reads it, because it doesn't describe agent behavior the way
   * `replyDrafting`/`cleanup`/`topicWeights` do. It lives in this object
   * anyway rather than as page-local state, for the same reason every other
   * field here does: it is user configuration, and §103 (Eng Constitution —
   * "Pages should never individually manage preference storage") draws no
   * exception for a preference that happens to be UI-only. Persisted,
   * restored on reload, and reset by the same `settingsActions.reset()` as
   * everything else on the page.
   */
  beta: boolean;
  /**
   * Which pigment each attention axis is drawn in — see `attentionColors.ts`
   * for why these are NAMES and not colours.
   *
   * Same "carried, not acted on" category as `beta` above: no rule below
   * reads them, because they change how attention LOOKS, never what is
   * urgent or important. They live here rather than in a private store for
   * the ordinary reason — they are user configuration, and this object is
   * where user configuration lives and what a backend `PUT /preferences`
   * carries.
   */
  urgencyColor: UrgencyColor;
  importanceColor: ImportanceColor;
  /**
   * Whether the sidebar's Quick Access section is collapsed to just its
   * heading.
   *
   * A navigation preference, so it belongs to the persisted, backend-ready
   * settings object rather than to `AppShell`'s render state — which is also
   * the only way it survives the unmount every route change performs.
   *
   * Deliberately stores ONLY the collapsed flag. Which views are pinned, and
   * in what order, stays in `useQuickAccess`; this never enumerates them, so
   * adding, removing or reordering a Quick Access entry needs no change here
   * and cannot desynchronise from it.
   */
  quickAccessCollapsed: boolean;
};

export const DEFAULT_PREFERENCES: AgentPreferences = {
  replyDrafting: 'review',
  replyTone: 'neutral',
  automation: { archive: 'suggest', followup: 'off' },
  cleanup: {
    promotions: 'keep',
    newsletters: 'keep',
    marketing: 'keep',
    banking: 'keep',
  },
  // Deterministic default: nothing pinned high — every topic behaves exactly
  // as the old all-neutral-weights default did (no rule raises importance
  // for any topic until the user says otherwise).
  highPriorityTopics: [],
  beta: false,
  urgencyColor: DEFAULT_URGENCY_COLOR,
  importanceColor: DEFAULT_IMPORTANCE_COLOR,
  quickAccessCollapsed: false,
};

/* -------------------------------- The rules ------------------------------- */

/**
 * Whether the agent should be producing drafted replies at all.
 *
 * The frontend's obligation on `false` is NOT to hide drafts — it's to expect
 * none and render correctly without them, which `MailThreadView` already does
 * (its `hasDraft` reads the data, not a setting). The saving is upstream: no
 * generation, no tokens, no latency.
 */
export function shouldGenerateDrafts(prefs: AgentPreferences): boolean {
  return prefs.replyDrafting !== 'off';
}

/**
 * Whether a drafted reply, once produced, still needs a human decision before
 * it goes out. True for `review`; false for `auto`, which is not currently
 * reachable through the UI. Meaningless when drafting is off.
 */
export function draftsNeedApproval(prefs: AgentPreferences): boolean {
  return prefs.replyDrafting === 'review';
}

/** Where a mail should sit given how the model classified it. `null` means
 * "no cleanup rule applies" — either the model hasn't classified it, or the
 * rule for that class is `keep`, which is not an action but the absence of
 * one. */
export function cleanupActionFor(
  classification: CleanupCategory | undefined,
  prefs: AgentPreferences
): Exclude<CleanupAction, 'keep'> | null {
  if (!classification) return null;
  const action = prefs.cleanup[classification];
  return action && action !== 'keep' ? action : null;
}

/**
 * Whether IIL may identify this thread as a follow-up opportunity — THE ONE
 * authoritative predicate; no page/component/selector re-derives any piece
 * of this itself.
 *
 * ALL of the following must hold:
 *   1. Follow-ups is on (an instruction, not a display toggle — the same
 *      "off is off" contract `shouldGenerateDrafts` follows: everything
 *      below is still evaluated the same way underneath, so the setting
 *      never changes what "needs a follow-up" means, only whether IIL may
 *      say so).
 *   2. The thread's own workflow is still active — enforced by the CALLER
 *      (`mailStore.getFollowUpSuggestion` gates on `isIILEligible`, i.e.
 *      `!completedAt`), not here: this file never imports mail/workflow
 *      state, so "is this thread done" isn't a fact it can ask on its own.
 *   3-4. The user's own message is the thread's last one, and nothing has
 *      come back since — `lastMessageFromUser`/`repliedSinceLastOutbound`.
 *      A caller with real thread data derives both from the identical fact
 *      (is the last message in the thread the user's?), but they're kept as
 *      two named inputs here because they ARE two different questions in
 *      the product rule this mirrors, and collapsing them would hide that
 *      from anyone testing this function directly.
 *   5. `responseExpected` — the structured, backend-populated signal (see
 *      `ThreadMessage.responseExpected`) that this specific outbound message
 *      is the kind that wants an answer. This is what keeps "Thanks for
 *      your help!" from ever becoming a candidate merely because time
 *      passed and nobody replied to a message that was never a question.
 *   6. At least `FOLLOW_UP_WAIT_DAYS` full calendar days have elapsed since
 *      that outbound message — computed via `dayDiffFor`, the one shared
 *      day-math function every other "how many days" question in this app
 *      already goes through, never a second copy of that arithmetic.
 *
 * NEVER implies sending, scheduling or replying — this returns a candidate
 * flag for a suggestion the user still has to act on, exactly like
 * `isSafeToAutoArchive`'s "suggest only reads it" contract.
 */
export function isFollowUpCandidate(
  thread: {
    lastMessageFromUser: boolean;
    repliedSinceLastOutbound: boolean;
    responseExpected: boolean;
    /** ISO 8601 timestamp of the user's own last outbound message on this
     * thread — the real one from canonical thread data, not a proxy field
     * repurposed for this. Absent whenever `lastMessageFromUser` is false. */
    lastOutboundAt?: string;
  },
  prefs: AgentPreferences,
  now: Date = new Date()
): boolean {
  if (prefs.automation.followup !== 'on') return false;
  if (!thread.lastMessageFromUser || thread.repliedSinceLastOutbound) return false;
  if (!thread.responseExpected) return false;
  const dayDiff = dayDiffFor(thread.lastOutboundAt, now);
  // `dayDiffFor` measures forward (due date minus now); a past outbound
  // message yields a negative value, so the elapsed count is its negation.
  return dayDiff !== null && -dayDiff >= FOLLOW_UP_WAIT_DAYS;
}

/**
 * Whether a thread meets the bar for IIL to archive it without asking.
 *
 * Deliberately NOT age/read-count based — those are not reliable signals
 * that a thread is actually done. The only signals used are canonical: the
 * thread's own workflow is finished (`completedAt` is set) and it has no
 * pending Opportunity/Action/Approval left requiring attention. `suggest`
 * and `automatic` share this exact predicate; `suggest` only reads it
 * without mutating anything, `automatic` is the one level allowed to act on
 * it (see `mailStore.refreshDerivedState`).
 */
export function isSafeToAutoArchive(
  thread: { completedAt?: string; hasPendingWorkflow: boolean }
): boolean {
  return Boolean(thread.completedAt) && !thread.hasPendingWorkflow;
}

/**
 * Whether the user has told IIL that a topic matters more than the rest —
 * simply membership in {@link AgentPreferences.highPriorityTopics}. A topic
 * not in that list is low priority, which means "don't raise this" and
 * never "push this down" — see {@link applyTopicPriority} for why that
 * asymmetry is deliberate. Where a high-priority topic ranks WITHIN the list
 * has no bearing here; rank is user-facing organization, not an input to
 * this rule.
 */
export function isHighPriorityTopic(
  topic: PriorityTopic | undefined,
  prefs: AgentPreferences
): boolean {
  if (!topic) return false;
  return prefs.highPriorityTopics.includes(topic);
}

/**
 * Raises a mail's IMPORTANCE when the user has marked its topic high
 * priority — the exact counterpart to `escalateUrgency` in
 * `lib/attention.ts`, and deliberately built to the same three rules:
 *
 *   · it touches ONE axis. Marking a topic high priority says how much a
 *     subject matters to this user; it says nothing about when anything is
 *     due, so urgency passes through untouched.
 *   · it only ever RAISES. A topic NOT on the high-priority list does not
 *     strip importance the mail was already given. "Shopping isn't high
 *     priority for me" is a reason not to promote a shopping mail, never a
 *     reason to demote a genuinely consequential one the model already
 *     flagged — and honouring it would break the model's "escalation only
 *     goes up" invariant, which the rest of the attention system relies on.
 *   · the authored/model-supplied value stays the BASELINE. Preferences
 *     modulate what the agent produced; they don't replace it.
 */
export function applyTopicPriority(
  base: Attention | undefined,
  topic: PriorityTopic | undefined,
  prefs: AgentPreferences
): Attention {
  const attention = attentionOr(base);
  return isHighPriorityTopic(topic, prefs) && !isImportant(attention)
    ? { ...attention, importance: 'important' }
    : attention;
}

/* ------------------------------ Serialisation ----------------------------- */

/**
 * Recovers an ordered `highPriorityTopics` list from whatever shape a stored
 * blob actually has.
 *
 * Two cases:
 *   · the current shape — an array already. Validated and de-duplicated
 *     (first occurrence wins, so a corrupted double-entry can't silently
 *     double a topic's rank) rather than trusted outright, since this still
 *     reads from the same untyped `unknown` a backend or an old build could
 *     have written.
 *   · the LEGACY shape — a `{ [topic]: 1-10 }` weight map from before this
 *     field existed. Anything strictly above the old neutral value (5) was
 *     "high priority" under the old rule (`isHighPriorityTopic`'s previous
 *     body), so that exact threshold is reapplied here, once, to migrate
 *     forward rather than silently dropping every existing user's
 *     preference back to neutral. Ordered highest-weight-first — the closest
 *     available approximation of "rank" the old data can express — with
 *     `PRIORITY_TOPICS`' own canonical order breaking ties (via a stable
 *     sort), so migration is deterministic rather than depending on
 *     `Object.entries` key order.
 *
 * A blob with neither shape (or no `topicWeights` mention at all — a brand
 * new user) yields `[]`, the same deterministic default as
 * `DEFAULT_PREFERENCES.highPriorityTopics`.
 */
function migrateHighPriorityTopics(
  input: Partial<AgentPreferences> & {
    topicWeights?: Partial<Record<PriorityTopic, unknown>>;
  }
): PriorityTopic[] {
  if (Array.isArray(input.highPriorityTopics)) {
    const seen = new Set<PriorityTopic>();
    const result: PriorityTopic[] = [];
    for (const t of input.highPriorityTopics) {
      if (PRIORITY_TOPICS.includes(t) && !seen.has(t)) {
        seen.add(t);
        result.push(t);
      }
    }
    return result;
  }

  const legacyWeights = input.topicWeights;
  if (!legacyWeights || typeof legacyWeights !== 'object') return [];

  return PRIORITY_TOPICS.filter((t) => {
    const w = legacyWeights[t];
    return typeof w === 'number' && w > LEGACY_NEUTRAL_TOPIC_WEIGHT;
  }).sort((a, b) => (legacyWeights[b] as number) - (legacyWeights[a] as number));
}

/**
 * Reconciles a stored/received blob against the current shape — any missing
 * or unrecognised field falls back to its default rather than propagating
 * `undefined` into a rule.
 *
 * Needed in both directions and for the same reason: a preferences object
 * written by an older build of this app, and one returned by a backend on a
 * different deploy cadence, are the same problem. Rules downstream can then
 * treat every field as present.
 */
export function sanitizePreferences(raw: unknown): AgentPreferences {
  if (!raw || typeof raw !== 'object') return DEFAULT_PREFERENCES;
  const input = raw as Partial<AgentPreferences> & {
    topicWeights?: Partial<Record<PriorityTopic, unknown>>;
  };

  const oneOf = <T extends string>(
    value: unknown,
    allowed: readonly T[],
    fallback: T
  ): T => (allowed.includes(value as T) ? (value as T) : fallback);

  const level = (value: unknown, fallback: AutomationLevel) =>
    oneOf<AutomationLevel>(value, ['never', 'suggest', 'automatic'], fallback);

  // A blob written before Follow-ups collapsed to Off/On may still carry the
  // old three-state value ('never'|'suggest'|'automatic'). Migrate rather
  // than silently resetting an existing user's choice: 'never' -> 'off',
  // anything that previously surfaced or acted ('suggest'|'automatic') ->
  // 'on', since both meant "IIL may identify follow-ups" under the old model.
  const followUpMode = (value: unknown): FollowUpMode => {
    if (value === 'off' || value === 'on') return value;
    if (value === 'never') return 'off';
    if (value === 'suggest' || value === 'automatic') return 'on';
    return DEFAULT_PREFERENCES.automation.followup;
  };

  return {
    replyDrafting: oneOf<ReplyDrafting>(
      input.replyDrafting,
      ['off', 'review', 'auto'],
      DEFAULT_PREFERENCES.replyDrafting
    ),
    replyTone: oneOf<ReplyTone>(
      input.replyTone,
      ['neutral', 'professional', 'friendly', 'personalized'],
      DEFAULT_PREFERENCES.replyTone
    ),
    automation: {
      archive: level(
        input.automation?.archive,
        DEFAULT_PREFERENCES.automation.archive
      ),
      followup: followUpMode(input.automation?.followup),
    },
    cleanup: Object.fromEntries(
      CLEANUP_CATEGORIES.map((c) => [
        c,
        oneOf<CleanupAction>(
          input.cleanup?.[c],
          ['keep', 'archive', 'spam', 'delete'],
          DEFAULT_PREFERENCES.cleanup[c]
        ),
      ])
    ) as Record<CleanupCategory, CleanupAction>,
    highPriorityTopics: migrateHighPriorityTopics(input),
    beta:
      typeof input.beta === 'boolean' ? input.beta : DEFAULT_PREFERENCES.beta,
    // A blob written before these fields existed has no `urgencyColor` at
    // all, and `oneOf` resolves that to the shipped default — which is the
    // colour that build was already rendering. So an existing user's mailbox
    // looks identical after this ships, without a migration step.
    urgencyColor: oneOf<UrgencyColor>(
      input.urgencyColor,
      URGENCY_COLOR_KEYS,
      DEFAULT_PREFERENCES.urgencyColor
    ),
    importanceColor: oneOf<ImportanceColor>(
      input.importanceColor,
      IMPORTANCE_COLOR_KEYS,
      DEFAULT_PREFERENCES.importanceColor
    ),
    quickAccessCollapsed:
      typeof input.quickAccessCollapsed === 'boolean'
        ? input.quickAccessCollapsed
        : DEFAULT_PREFERENCES.quickAccessCollapsed,
  };
}
