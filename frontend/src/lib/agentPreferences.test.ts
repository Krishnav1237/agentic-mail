/**
 * The settings → agent contract (`lib/agentPreferences.ts`).
 *
 * These rules are the shared specification between this frontend and the
 * backend that will eventually run them, so what's pinned here is MEANING:
 * what "Don't draft" instructs, which direction a topic's priority can push,
 * and what an unclassified mail is entitled to. A backend that disagrees with
 * any assertion below disagrees with the product.
 */
import { describe, expect, it } from 'vitest';
import {
  applyTopicPriority,
  cleanupActionFor,
  DEFAULT_PREFERENCES,
  draftsNeedApproval,
  isFollowUpCandidate,
  isHighPriorityTopic,
  isSafeToAutoArchive,
  PRIORITY_TOPICS,
  sanitizePreferences,
  shouldGenerateDrafts,
  type AgentPreferences,
  type PriorityTopic,
} from './agentPreferences';
import type { Attention } from './attention';

/** Defaults with a few fields overridden — the nested groups merge, so a case
 * can name the one rule it cares about instead of restating all four. */
const prefs = (
  patch: Partial<Omit<AgentPreferences, 'cleanup' | 'automation'>> & {
    cleanup?: Partial<AgentPreferences['cleanup']>;
    automation?: Partial<AgentPreferences['automation']>;
  } = {}
): AgentPreferences => ({
  ...DEFAULT_PREFERENCES,
  ...patch,
  automation: { ...DEFAULT_PREFERENCES.automation, ...patch.automation },
  cleanup: { ...DEFAULT_PREFERENCES.cleanup, ...patch.cleanup },
});

const NORMAL: Attention = { urgency: 'normal', importance: 'normal' };
const URGENT: Attention = { urgency: 'urgent', importance: 'normal' };
const IMPORTANT: Attention = { urgency: 'normal', importance: 'important' };

describe('defaults', () => {
  it('ship neutral — nothing filed, nothing pinned high, drafting on for review', () => {
    expect(shouldGenerateDrafts(DEFAULT_PREFERENCES)).toBe(true);
    expect(draftsNeedApproval(DEFAULT_PREFERENCES)).toBe(true);
    expect(
      Object.values(DEFAULT_PREFERENCES.cleanup).every((a) => a === 'keep')
    ).toBe(true);
    expect(DEFAULT_PREFERENCES.highPriorityTopics).toEqual([]);
  });
});

describe('reply drafting is an instruction, not a display toggle', () => {
  it('stops generation entirely when off', () => {
    expect(shouldGenerateDrafts(prefs({ replyDrafting: 'off' }))).toBe(false);
  });

  it('generates for both review and auto — they differ on who sends, not on whether to write', () => {
    expect(shouldGenerateDrafts(prefs({ replyDrafting: 'review' }))).toBe(true);
    expect(shouldGenerateDrafts(prefs({ replyDrafting: 'auto' }))).toBe(true);
    expect(draftsNeedApproval(prefs({ replyDrafting: 'review' }))).toBe(true);
    expect(draftsNeedApproval(prefs({ replyDrafting: 'auto' }))).toBe(false);
  });
});

describe('cleanup', () => {
  it('does nothing for a class the user left on Keep', () => {
    expect(cleanupActionFor('promotions', prefs())).toBeNull();
  });

  it('returns the configured action for a class the user filed', () => {
    expect(
      cleanupActionFor(
        'promotions',
        prefs({ cleanup: { promotions: 'archive' } })
      )
    ).toBe('archive');
    expect(
      cleanupActionFor(
        'newsletters',
        prefs({ cleanup: { newsletters: 'spam' } })
      )
    ).toBe('spam');
    expect(
      cleanupActionFor('banking', prefs({ cleanup: { banking: 'delete' } }))
    ).toBe('delete');
  });

  it('never acts on mail the model has not classified', () => {
    // The rule can only act on a label the model actually produced. Guessing
    // a bucket for unlabelled mail is how something gets silently archived by
    // a rule the user never meant to apply to it.
    const aggressive = prefs({
      cleanup: {
        promotions: 'delete',
        newsletters: 'delete',
        marketing: 'delete',
        banking: 'delete',
      },
    });
    expect(cleanupActionFor(undefined, aggressive)).toBeNull();
  });

  it('only acts on the class that was configured, not its neighbours', () => {
    const p = prefs({ cleanup: { promotions: 'archive' } });
    expect(cleanupActionFor('promotions', p)).toBe('archive');
    expect(cleanupActionFor('newsletters', p)).toBeNull();
    expect(cleanupActionFor('marketing', p)).toBeNull();
    expect(cleanupActionFor('banking', p)).toBeNull();
  });
});

describe('topic priority', () => {
  const highOn = (...topics: PriorityTopic[]) =>
    prefs({ highPriorityTopics: topics });

  it('counts a topic as high only when it is in the list', () => {
    expect(isHighPriorityTopic('career', prefs())).toBe(false);
    expect(isHighPriorityTopic('career', highOn('career'))).toBe(true);
    expect(isHighPriorityTopic('career', highOn('academic'))).toBe(false);
    expect(isHighPriorityTopic(undefined, highOn('career'))).toBe(false);
  });

  it('rank within the high-priority list has no bearing on the yes/no rule', () => {
    // Order is for the user's own organization (rendered top-to-bottom in
    // Settings) — the rule below only ever asks "is this topic in the set",
    // never "how high does it rank", so a topic pinned last is exactly as
    // high-priority as one pinned first.
    expect(isHighPriorityTopic('shopping', highOn('career', 'academic', 'shopping'))).toBe(true);
    expect(isHighPriorityTopic('career', highOn('career', 'academic', 'shopping'))).toBe(true);
  });

  it('raises importance on a high-priority topic', () => {
    expect(applyTopicPriority(NORMAL, 'career', highOn('career'))).toEqual(
      IMPORTANT
    );
  });

  it('leaves urgency untouched — high priority says how much, never when', () => {
    // The mirror of `escalateUrgency`'s own guarantee, and the reason the two
    // axes survive having two independent inputs.
    expect(applyTopicPriority(URGENT, 'career', highOn('career'))).toEqual({
      urgency: 'urgent',
      importance: 'important',
    });
  });

  it('only ever raises — a topic left off the list never strips importance the agent assigned', () => {
    // "Shopping isn't high priority for me" is a reason not to promote
    // shopping mail. It is not a reason to demote a genuinely consequential
    // message the model already flagged.
    expect(applyTopicPriority(IMPORTANT, 'shopping', prefs())).toEqual(
      IMPORTANT
    );
  });

  it('leaves an unpinned or untagged mail exactly as the agent left it', () => {
    expect(applyTopicPriority(NORMAL, 'career', prefs())).toEqual(NORMAL);
    expect(
      applyTopicPriority(NORMAL, undefined, highOn('career'))
    ).toEqual(NORMAL);
  });

  it('is idempotent, so re-deriving on every preference change cannot drift', () => {
    const once = applyTopicPriority(NORMAL, 'career', highOn('career'));
    expect(applyTopicPriority(once, 'career', highOn('career'))).toEqual(once);
  });

  it('treats an absent baseline as fully normal rather than throwing', () => {
    expect(
      applyTopicPriority(undefined, 'career', highOn('career'))
    ).toEqual(IMPORTANT);
  });
});

describe('sanitizePreferences', () => {
  it('fills a completely absent or malformed blob with defaults', () => {
    expect(sanitizePreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
    expect(sanitizePreferences('nonsense')).toEqual(DEFAULT_PREFERENCES);
    expect(sanitizePreferences({})).toEqual(DEFAULT_PREFERENCES);
  });

  it('keeps recognised values and replaces unrecognised ones', () => {
    const result = sanitizePreferences({
      replyDrafting: 'off',
      replyTone: 'not-a-tone',
      cleanup: { promotions: 'archive', newsletters: 'explode' },
    });
    expect(result.replyDrafting).toBe('off');
    expect(result.replyTone).toBe(DEFAULT_PREFERENCES.replyTone);
    expect(result.cleanup.promotions).toBe('archive');
    expect(result.cleanup.newsletters).toBe('keep');
  });

  it('keeps a valid highPriorityTopics array, in order', () => {
    const result = sanitizePreferences({
      highPriorityTopics: ['finance', 'career'],
    });
    expect(result.highPriorityTopics).toEqual(['finance', 'career']);
  });

  it('drops unrecognised entries and de-duplicates, keeping first occurrence', () => {
    const result = sanitizePreferences({
      highPriorityTopics: ['career', 'not-a-topic', 'career', 'finance'],
    });
    expect(result.highPriorityTopics).toEqual(['career', 'finance']);
  });

  it('falls back to an empty list for a malformed highPriorityTopics field', () => {
    expect(sanitizePreferences({ highPriorityTopics: 'career' }).highPriorityTopics).toEqual([]);
    expect(sanitizePreferences({ highPriorityTopics: null }).highPriorityTopics).toEqual([]);
  });

  describe('migrates the legacy topicWeights shape', () => {
    it('carries forward every topic weighted strictly above the old neutral value (5)', () => {
      const result = sanitizePreferences({
        topicWeights: { career: 8, academic: 5, finance: 3, personal: 6 },
      });
      expect(result.highPriorityTopics).toEqual(['career', 'personal']);
    });

    it('orders migrated topics by weight, highest first', () => {
      const result = sanitizePreferences({
        topicWeights: { career: 6, academic: 9, finance: 7 },
      });
      expect(result.highPriorityTopics).toEqual(['academic', 'finance', 'career']);
    });

    it('breaks weight ties using the canonical topic order, deterministically', () => {
      const result = sanitizePreferences({
        topicWeights: { shopping: 8, career: 8, academic: 8 },
      });
      // PRIORITY_TOPICS order is career, academic, ..., shopping — ties keep
      // that relative order rather than depending on object key order.
      expect(result.highPriorityTopics).toEqual(['career', 'academic', 'shopping']);
    });

    it('produces an empty list when every legacy weight was at or below neutral', () => {
      const result = sanitizePreferences({
        topicWeights: { career: 5, academic: 2, finance: 1 },
      });
      expect(result.highPriorityTopics).toEqual([]);
    });

    it('prefers the new shape over the legacy one when a blob somehow has both', () => {
      const result = sanitizePreferences({
        highPriorityTopics: ['travel'],
        topicWeights: { career: 9 },
      });
      expect(result.highPriorityTopics).toEqual(['travel']);
    });

    it('no longer exposes topicWeights on the sanitized result', () => {
      const result = sanitizePreferences({ topicWeights: { career: 9 } });
      expect(result).not.toHaveProperty('topicWeights');
    });
  });

  it('produces a complete object from a partial one, so no rule reads undefined', () => {
    const result = sanitizePreferences({ replyDrafting: 'off' });
    expect(Object.keys(result.cleanup)).toHaveLength(4);
    expect(Array.isArray(result.highPriorityTopics)).toBe(true);
    expect(result.automation.archive).toBe(
      DEFAULT_PREFERENCES.automation.archive
    );
  });

  it('defaults beta to off and keeps a real boolean through sanitization', () => {
    expect(DEFAULT_PREFERENCES.beta).toBe(false);
    expect(sanitizePreferences({}).beta).toBe(false);
    expect(sanitizePreferences({ beta: true }).beta).toBe(true);
    // Not a recognised-value enum like the others — any non-boolean falls
    // back to the default rather than being coerced.
    expect(sanitizePreferences({ beta: 'yes' }).beta).toBe(false);
  });
});

describe('Labeling is gone', () => {
  it('automation carries no label field anywhere in the shape', () => {
    expect(DEFAULT_PREFERENCES.automation).not.toHaveProperty('label');
    expect(sanitizePreferences({ automation: { label: 'automatic' } }).automation).not.toHaveProperty(
      'label'
    );
  });
});

describe('Follow-ups is Off/On only', () => {
  it('defaults to off', () => {
    expect(DEFAULT_PREFERENCES.automation.followup).toBe('off');
  });

  it('sanitize accepts the new off/on values as-is', () => {
    expect(sanitizePreferences({ automation: { followup: 'off' } }).automation.followup).toBe('off');
    expect(sanitizePreferences({ automation: { followup: 'on' } }).automation.followup).toBe('on');
  });

  it('migrates a legacy three-state value: never -> off, suggest/automatic -> on', () => {
    expect(sanitizePreferences({ automation: { followup: 'never' } }).automation.followup).toBe(
      'off'
    );
    expect(sanitizePreferences({ automation: { followup: 'suggest' } }).automation.followup).toBe(
      'on'
    );
    expect(sanitizePreferences({ automation: { followup: 'automatic' } }).automation.followup).toBe(
      'on'
    );
  });

  it('falls back to the default for anything unrecognised', () => {
    expect(sanitizePreferences({ automation: { followup: 'garbage' } }).automation.followup).toBe(
      DEFAULT_PREFERENCES.automation.followup
    );
  });
});

describe('isFollowUpCandidate', () => {
  // Monday. `now` moves forward from here in whole calendar days for the
  // elapsed-time cases below — real ISO timestamps throughout, never a
  // hand-written "3 days ago" string.
  const SENT_AT = '2026-08-10T09:00:00';
  const on = prefs({ automation: { followup: 'on' } });
  const off = prefs({ automation: { followup: 'off' } });

  const thread = (over: {
    lastMessageFromUser?: boolean;
    repliedSinceLastOutbound?: boolean;
    responseExpected?: boolean;
    lastOutboundAt?: string;
  } = {}) => ({
    lastMessageFromUser: true,
    repliedSinceLastOutbound: false,
    responseExpected: true,
    lastOutboundAt: SENT_AT,
    ...over,
  });

  it('1. never surfaces anything when Follow-ups is off, however the thread looks', () => {
    const fiveDaysLater = new Date('2026-08-15T09:00:00');
    expect(isFollowUpCandidate(thread(), off, fiveDaysLater)).toBe(false);
  });

  it('never surfaces on a thread we did not send last, even when on', () => {
    const fiveDaysLater = new Date('2026-08-15T09:00:00');
    expect(
      isFollowUpCandidate(thread({ lastMessageFromUser: false }), on, fiveDaysLater)
    ).toBe(false);
  });

  it('7. never surfaces once a reply has actually come back', () => {
    const fiveDaysLater = new Date('2026-08-15T09:00:00');
    expect(
      isFollowUpCandidate(thread({ repliedSinceLastOutbound: true }), on, fiveDaysLater)
    ).toBe(false);
  });

  it('3. is not yet eligible after only 1 day', () => {
    const oneDayLater = new Date('2026-08-11T09:00:00');
    expect(isFollowUpCandidate(thread(), on, oneDayLater)).toBe(false);
  });

  it('4. becomes eligible at exactly the 3-day threshold', () => {
    const threeDaysLater = new Date('2026-08-13T09:00:00');
    expect(isFollowUpCandidate(thread(), on, threeDaysLater)).toBe(true);
  });

  it('5. stays eligible well past the threshold', () => {
    const fiveDaysLater = new Date('2026-08-15T09:00:00');
    expect(isFollowUpCandidate(thread(), on, fiveDaysLater)).toBe(true);
  });

  it('6. never surfaces without responseExpected, no matter how much time passed', () => {
    const fiveDaysLater = new Date('2026-08-15T09:00:00');
    expect(
      isFollowUpCandidate(thread({ responseExpected: false }), on, fiveDaysLater)
    ).toBe(false);
  });

  it('8. an informational/thank-you outbound message is never a candidate', () => {
    // The exact "Thanks for your help" case the naive lastMessageFromUser-
    // and-no-reply rule used to misfire on — responseExpected is what keeps
    // it out regardless of elapsed time.
    const tenDaysLater = new Date('2026-08-20T09:00:00');
    expect(
      isFollowUpCandidate(thread({ responseExpected: false }), on, tenDaysLater)
    ).toBe(false);
  });

  it('is only ever a suggestion — nothing in this rule sends anything', () => {
    // isFollowUpCandidate returns a boolean, not an action — asserting the
    // return type/shape is the closest a unit test gets to pinning "this
    // never sends": there is no send path reachable from this function.
    const fiveDaysLater = new Date('2026-08-15T09:00:00');
    expect(typeof isFollowUpCandidate(thread(), on, fiveDaysLater)).toBe('boolean');
  });

  it('treats a missing/unparseable lastOutboundAt as never eligible, not "always overdue"', () => {
    expect(isFollowUpCandidate(thread({ lastOutboundAt: undefined }), on)).toBe(false);
  });
});

describe('isSafeToAutoArchive', () => {
  it('is unsafe while the thread is still open (no completedAt)', () => {
    expect(isSafeToAutoArchive({ completedAt: undefined, hasPendingWorkflow: false })).toBe(false);
  });

  it('is unsafe while a workflow item is still pending, even if completedAt is set', () => {
    // Shouldn't happen in practice (completed and pending disagree), but the
    // rule stays conservative either way.
    expect(isSafeToAutoArchive({ completedAt: '2026-01-01T00:00:00Z', hasPendingWorkflow: true })).toBe(
      false
    );
  });

  it('is safe once the thread is done and nothing is pending', () => {
    expect(
      isSafeToAutoArchive({ completedAt: '2026-01-01T00:00:00Z', hasPendingWorkflow: false })
    ).toBe(true);
  });

  it('never uses age or read state — the predicate has no such inputs to accept', () => {
    // Structural guarantee: the only fields the function's own signature
    // accepts are completedAt/hasPendingWorkflow, so an age- or read-based
    // decision is not merely unused but impossible to express here.
    expect(isSafeToAutoArchive.length).toBe(1);
  });
});

describe('PRIORITY_TOPICS', () => {
  it('names exactly the eight topics the model tags mail with', () => {
    expect(PRIORITY_TOPICS).toHaveLength(8);
    expect(new Set(PRIORITY_TOPICS).size).toBe(8);
  });
});
