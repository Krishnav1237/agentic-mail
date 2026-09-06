/**
 * Settings → mail, end to end through the two stores.
 *
 * `agentPreferences.test.ts` pins what each rule MEANS in isolation. This
 * file pins that changing a setting actually reaches the mail every page
 * renders — which is the thing that was broken: every control on the Settings
 * page was correct, labelled correctly, and connected to nothing.
 *
 * Both stores are module singletons, so each test takes a fresh pair via
 * `vi.resetModules()`. `localStorage` is stubbed per test for the same
 * reason — preferences persist, and a leaked value would silently seed the
 * next case.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { needsAttention } from './attention';
import { opportunities } from './workspaceData';

type MailStore = typeof import('./mailStore');
type SettingsStore = typeof import('./settingsStore');

let mail: MailStore;
let settings: SettingsStore;

/** Survives `vi.resetModules()` so a "reload" of the store re-reads what the
 * previous instance wrote — which is the only way to test persistence. */
let storage: Map<string, string>;

beforeEach(async () => {
  storage = new Map();
  // `window`, not just `localStorage`: the store guards on
  // `typeof window === 'undefined'` (correctly — it runs during render), so
  // in this node environment it would otherwise never reach storage at all
  // and every persistence assertion would pass vacuously.
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
      removeItem: (k: string) => void storage.delete(k),
    },
  });
  vi.resetModules();
  // Order matters: `mailStore` seeds from the preferences store at import.
  settings = await import('./settingsStore');
  mail = await import('./mailStore');
});

const rowById = (id: string) =>
  mail.getMailSnapshot().rows.find((r) => r.id === id)!;

/** A mail the demo data classifies as promotional, and one it doesn't. */
const PROMO_ID = 'm4';
const UNCLASSIFIED_ID = 'm1';

describe('Reply Drafting', () => {
  /** `ap1` ships with a drafted reply. */
  const DRAFTED_ID = 'ap1';

  it('serves the drafted reply while drafting is on', () => {
    expect(
      mail.mailActions.getThreadDetail(DRAFTED_ID)?.draftPreview
    ).toBeTruthy();
  });

  it('serves no draft once drafting is turned off', () => {
    settings.settingsActions.update({ replyDrafting: 'off' });
    expect(mail.mailActions.getThreadDetail(DRAFTED_ID)?.draftPreview).toBe('');
  });

  it('leaves the insight and the message body alone — only the draft stops', () => {
    // Turning off drafting instructs the model not to WRITE. It is not a
    // blanket "stop analysing": the insight is a different output and has to
    // survive.
    const before = mail.mailActions.getThreadDetail(DRAFTED_ID)!;
    settings.settingsActions.update({ replyDrafting: 'off' });
    const after = mail.mailActions.getThreadDetail(DRAFTED_ID)!;
    expect(after.insight).toBe(before.insight);
    expect(after.messages).toEqual(before.messages);
  });

  it('restores drafts when turned back on, rather than losing them', () => {
    const original = mail.mailActions.getThreadDetail(DRAFTED_ID)!.draftPreview;
    settings.settingsActions.update({ replyDrafting: 'off' });
    settings.settingsActions.update({ replyDrafting: 'review' });
    expect(mail.mailActions.getThreadDetail(DRAFTED_ID)!.draftPreview).toBe(
      original
    );
  });

  it('suppresses every draft in the mailbox, not just one', () => {
    const drafted = () =>
      mail
        .getMailSnapshot()
        .rows.filter(
          (r) => mail.mailActions.getThreadDetail(r.id)?.draftPreview
        );
    expect(drafted().length).toBeGreaterThan(0);
    settings.settingsActions.update({ replyDrafting: 'off' });
    expect(drafted()).toHaveLength(0);
  });
});

describe('Inbox Cleanup', () => {
  it('leaves everything in the inbox on the default Keep', () => {
    expect(rowById(PROMO_ID).status).toBe('inbox');
  });

  it.each([
    ['archive', 'archived'],
    ['spam', 'spam'],
    ['delete', 'trash'],
  ] as const)(
    'files classified mail when Promotions is set to %s',
    (action, status) => {
      settings.settingsActions.update({ cleanup: { promotions: action } });
      expect(rowById(PROMO_ID).status).toBe(status);
      expect(rowById(PROMO_ID).statusSource).toBe('cleanup');
    }
  );

  it('puts filed mail back when the rule is relaxed', () => {
    settings.settingsActions.update({ cleanup: { promotions: 'archive' } });
    expect(rowById(PROMO_ID).status).toBe('archived');

    settings.settingsActions.update({ cleanup: { promotions: 'keep' } });
    expect(rowById(PROMO_ID).status).toBe('inbox');
    expect(rowById(PROMO_ID).statusSource).toBeUndefined();
  });

  it('never touches mail the model has not classified', () => {
    settings.settingsActions.update({
      cleanup: {
        promotions: 'delete',
        newsletters: 'delete',
        marketing: 'delete',
        banking: 'delete',
      },
    });
    expect(rowById(UNCLASSIFIED_ID).status).toBe('inbox');
  });

  it('never undoes what a person did by hand', () => {
    // The user archives a promotional mail themselves, then relaxes the rule.
    // Relaxing a rule must not drag back mail they deliberately filed.
    mail.mailActions.archive(PROMO_ID);
    expect(rowById(PROMO_ID).statusSource).toBe('user');

    settings.settingsActions.update({ cleanup: { promotions: 'archive' } });
    settings.settingsActions.update({ cleanup: { promotions: 'keep' } });

    expect(rowById(PROMO_ID).status).toBe('archived');
    expect(rowById(PROMO_ID).statusSource).toBe('user');
  });

  it('never overrides a person mid-rule either', () => {
    // Same guarantee in the other direction: a mail the user pulled back to
    // the inbox stays there even while a rule that would file it is active.
    settings.settingsActions.update({ cleanup: { promotions: 'archive' } });
    mail.mailActions.restoreToInbox(PROMO_ID);
    settings.settingsActions.update({ cleanup: { promotions: 'spam' } });
    // Restore clears the stamp, so the row is eligible again — the rule may
    // re-file it, which is correct: the user put it back into the pool, they
    // didn't pin it there.
    expect(rowById(PROMO_ID).status).toBe('spam');
  });
});

describe('Follow-ups', () => {
  /** `ap1` has a repliedAt-free row by default; we manufacture the "we sent
   * last" signal directly through a real reply, the same path a user takes.
   * Real ISO timestamps throughout via fake timers — never a hand-written
   * relative-time string — since the V1 rule's 3-day wait is measured
   * against actual elapsed calendar days. */
  const THREAD_ID = 'm1';
  const SENT_AT = new Date('2026-08-10T09:00:00');
  const THREE_DAYS_LATER = new Date('2026-08-13T09:00:00');
  const ONE_DAY_LATER = new Date('2026-08-11T09:00:00');

  const sendFollowUpWorthy = (responseExpected = true) => {
    mail.mailActions.sendReply({
      threadId: THREAD_ID,
      recipients: { to: ['someone@example.com'], cc: [], bcc: [] },
      subject: 'Re: test',
      body: { text: 'Could you confirm the details by end of week?' },
      attachments: [],
      responseExpected,
    });
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  it('2. suggests nothing while off, even once every other condition is met', () => {
    vi.useFakeTimers();
    vi.setSystemTime(SENT_AT);
    sendFollowUpWorthy();
    vi.setSystemTime(THREE_DAYS_LATER);
    expect(mail.mailActions.getFollowUpSuggestion(THREAD_ID)).toBe(false);
  });

  it('3. is not yet eligible after only 1 day', () => {
    settings.settingsActions.update({ automation: { followup: 'on' } });
    vi.useFakeTimers();
    vi.setSystemTime(SENT_AT);
    sendFollowUpWorthy();
    vi.setSystemTime(ONE_DAY_LATER);
    expect(mail.mailActions.getFollowUpSuggestion(THREAD_ID)).toBe(false);
  });

  it('4/5. suggests once on, the last message was ours, it expected a response, and 3+ days have passed', () => {
    settings.settingsActions.update({ automation: { followup: 'on' } });
    vi.useFakeTimers();
    vi.setSystemTime(SENT_AT);
    sendFollowUpWorthy();
    vi.setSystemTime(THREE_DAYS_LATER);
    expect(mail.mailActions.getFollowUpSuggestion(THREAD_ID)).toBe(true);
  });

  it('6/8. never suggests a message that never expected a response, however long it waits', () => {
    // The exact "Thanks for your help" case: without `responseExpected`,
    // elapsed time alone must never manufacture a follow-up.
    settings.settingsActions.update({ automation: { followup: 'on' } });
    vi.useFakeTimers();
    vi.setSystemTime(SENT_AT);
    sendFollowUpWorthy(false);
    vi.setSystemTime(new Date('2026-08-20T09:00:00'));
    expect(mail.mailActions.getFollowUpSuggestion(THREAD_ID)).toBe(false);
  });

  it('7. stops suggesting the moment a reply actually comes back', () => {
    settings.settingsActions.update({ automation: { followup: 'on' } });
    vi.useFakeTimers();
    vi.setSystemTime(SENT_AT);
    sendFollowUpWorthy();
    vi.setSystemTime(THREE_DAYS_LATER);
    expect(mail.mailActions.getFollowUpSuggestion(THREAD_ID)).toBe(true);

    mail.mailActions.receiveReply({ threadId: THREAD_ID, body: 'here is my answer' });
    expect(mail.mailActions.getFollowUpSuggestion(THREAD_ID)).toBe(false);
  });

  it('never suggests a follow-up on a completed thread, however long it has waited', () => {
    settings.settingsActions.update({ automation: { followup: 'on' } });
    vi.useFakeTimers();
    vi.setSystemTime(SENT_AT);
    sendFollowUpWorthy();
    mail.mailActions.complete(THREAD_ID, 'done');
    vi.setSystemTime(THREE_DAYS_LATER);
    expect(mail.mailActions.getFollowUpSuggestion(THREAD_ID)).toBe(false);
  });

  it('9. a completed thread that later reactivates is evaluated normally again', () => {
    settings.settingsActions.update({ automation: { followup: 'on' } });
    vi.useFakeTimers();
    vi.setSystemTime(SENT_AT);
    sendFollowUpWorthy();
    mail.mailActions.complete(THREAD_ID, 'done');
    vi.setSystemTime(THREE_DAYS_LATER);
    expect(mail.mailActions.getFollowUpSuggestion(THREAD_ID)).toBe(false);

    // A new reply reactivates the thread — the same message that was
    // waiting for a response is still the last outbound one, so once it
    // clears the completed gate the rule evaluates it exactly as before.
    mail.mailActions.reactivate(THREAD_ID);
    expect(mail.mailActions.getFollowUpSuggestion(THREAD_ID)).toBe(true);
  });

  it('10. a snoozed thread keeps its workflow state — follow-up eligibility is not destroyed by snoozing', () => {
    settings.settingsActions.update({ automation: { followup: 'on' } });
    vi.useFakeTimers();
    vi.setSystemTime(SENT_AT);
    sendFollowUpWorthy();
    mail.mailActions.snooze(THREAD_ID, new Date('2026-09-01T09:00:00'));
    vi.setSystemTime(THREE_DAYS_LATER);

    expect(rowById(THREAD_ID).status).toBe('snoozed');
    expect(rowById(THREAD_ID).completedAt).toBeUndefined();
    expect(mail.mailActions.getFollowUpSuggestion(THREAD_ID)).toBe(true);
  });

  it('never sends anything on its own — no send-related state changes from the suggestion alone', () => {
    settings.settingsActions.update({ automation: { followup: 'on' } });
    const before = mail.getMailSnapshot().sent.length;
    mail.mailActions.getFollowUpSuggestion(THREAD_ID);
    expect(mail.getMailSnapshot().sent.length).toBe(before);
  });
});

describe('Archiving automation', () => {
  const ID = 'm2';

  it('never files anything while Never', () => {
    settings.settingsActions.update({ automation: { archive: 'never' } });
    mail.mailActions.complete(ID, 'done');
    expect(rowById(ID).status).toBe('inbox');
  });

  it('never mutates status on Suggest — only Automatic acts', () => {
    settings.settingsActions.update({ automation: { archive: 'suggest' } });
    mail.mailActions.complete(ID, 'done');
    expect(rowById(ID).status).toBe('inbox');
  });

  it('archives a completed, no-longer-pending thread once Automatic', () => {
    settings.settingsActions.update({ automation: { archive: 'automatic' } });
    mail.mailActions.complete(ID, 'done');
    expect(rowById(ID).status).toBe('archived');
    expect(rowById(ID).statusSource).toBe('automation');
  });

  it('never archives a thread that is still open, regardless of the setting', () => {
    settings.settingsActions.update({ automation: { archive: 'automatic' } });
    expect(rowById(ID).completedAt).toBeUndefined();
    expect(rowById(ID).status).toBe('inbox');
  });

  it('puts it back when the setting is turned back down', () => {
    settings.settingsActions.update({ automation: { archive: 'automatic' } });
    mail.mailActions.complete(ID, 'done');
    expect(rowById(ID).status).toBe('archived');

    settings.settingsActions.update({ automation: { archive: 'never' } });
    expect(rowById(ID).status).toBe('inbox');
    expect(rowById(ID).statusSource).toBeUndefined();
  });

  it('never undoes a manual archive, the same rule Cleanup follows', () => {
    mail.mailActions.archive(ID);
    expect(rowById(ID).statusSource).toBe('user');
    settings.settingsActions.update({ automation: { archive: 'automatic' } });
    mail.mailActions.complete(ID, 'done');
    expect(rowById(ID).status).toBe('archived');
    expect(rowById(ID).statusSource).toBe('user');
  });

  it('restores the thread automation filed once it reactivates', () => {
    settings.settingsActions.update({ automation: { archive: 'automatic' } });
    mail.mailActions.complete(ID, 'done');
    expect(rowById(ID).status).toBe('archived');

    mail.mailActions.reactivate(ID);
    expect(rowById(ID).status).toBe('inbox');
    expect(rowById(ID).statusSource).toBeUndefined();
  });
});

describe('Priority (high priority topics)', () => {
  /** `m5` is tagged `personal` and is otherwise unremarkable — normal on both
   * axes, so any gold on it can only have come from being pinned high. */
  const PERSONAL_ID = 'm5';

  it('leaves attention alone with nothing pinned high', () => {
    expect(needsAttention(rowById(PERSONAL_ID).attention)).toBe(false);
  });

  it('turns a mail gold when its topic is pinned to high priority', () => {
    settings.settingsActions.update({ highPriorityTopics: ['personal'] });
    expect(rowById(PERSONAL_ID).attention.importance).toBe('important');
  });

  it('takes the gold back off when the topic is removed from high priority', () => {
    settings.settingsActions.update({ highPriorityTopics: ['personal'] });
    settings.settingsActions.update({ highPriorityTopics: [] });
    expect(rowById(PERSONAL_ID).attention.importance).toBe('normal');
  });

  it('preserves what the agent decided underneath', () => {
    // The point of keeping `baseAttention`: pinning a topic high and then
    // unpinning it restores the mail's own assessment exactly, rather than
    // flattening it to whatever the last derivation produced.
    const importantByAgent = mail
      .getMailSnapshot()
      .rows.find((r) => r.baseAttention.importance === 'important' && r.topic)!;
    settings.settingsActions.update({ highPriorityTopics: [] });
    expect(rowById(importantByAgent.id).attention.importance).toBe('important');
  });

  it('never raises a completed item', () => {
    const done = mail
      .getMailSnapshot()
      .rows.find((r) => r.completedAt && r.topic)!;
    settings.settingsActions.update({ highPriorityTopics: [done.topic!] });
    expect(needsAttention(rowById(done.id).attention)).toBe(false);
  });

  it('never raises a thread you have already replied to', () => {
    // `m1` carries the seeded sent reply, so it is answered from the start.
    expect(rowById('m1').repliedAt).toBeTruthy();
    settings.settingsActions.update({ highPriorityTopics: ['career'] });
    expect(needsAttention(rowById('m1').attention)).toBe(false);
  });

  it('quiets a thread on reply even while its topic is pinned high', () => {
    settings.settingsActions.update({ highPriorityTopics: ['academic'] });
    expect(rowById('m3').attention.importance).toBe('important');

    mail.mailActions.sendReply({
      threadId: 'm3',
      recipients: { to: ['someone@example.com'], cc: [], bcc: [] },
      subject: 're: test',
      body: { text: 'Done.' },
      attachments: [],
    });
    expect(needsAttention(rowById('m3').attention)).toBe(false);

    // ...and stays quiet through a later preference change.
    settings.settingsActions.update({ highPriorityTopics: ['academic', 'career'] });
    expect(needsAttention(rowById('m3').attention)).toBe(false);
  });

  it('leaves urgency untouched when it raises importance', () => {
    const urgent = mail
      .getMailSnapshot()
      .rows.find(
        (r) => r.attention.urgency === 'urgent' && r.topic && !r.completedAt
      )!;
    settings.settingsActions.update({ highPriorityTopics: [urgent.topic!] });
    const after = rowById(urgent.id);
    expect(after.attention.urgency).toBe('urgent');
    expect(after.attention.importance).toBe('important');
  });

  it('rank within the list has no effect — being pinned high is binary', () => {
    const a = mail
      .getMailSnapshot()
      .rows.find((r) => r.topic === 'travel' && !r.completedAt)!;
    settings.settingsActions.update({
      highPriorityTopics: ['career', 'academic', 'travel'],
    });
    const rankedLast = rowById(a.id).attention.importance;
    settings.settingsActions.update({
      highPriorityTopics: ['travel', 'career', 'academic'],
    });
    expect(rowById(a.id).attention.importance).toBe(rankedLast);
    expect(rankedLast).toBe('important');
  });
});

describe('the derivation is stable', () => {
  it('does not drift when preferences change repeatedly', () => {
    const snapshot = () =>
      mail
        .getMailSnapshot()
        .rows.map(
          (r) =>
            `${r.id}:${r.status}:${r.attention.urgency}/${r.attention.importance}`
        );

    const initial = snapshot();
    for (let i = 0; i < 5; i += 1) {
      settings.settingsActions.update({
        cleanup: { promotions: 'archive' },
        highPriorityTopics: ['career'],
      });
      settings.settingsActions.update({
        cleanup: { promotions: 'keep' },
        highPriorityTopics: [],
      });
    }
    expect(snapshot()).toEqual(initial);
  });

  it('keeps mail-level invariants intact under any preference', () => {
    settings.settingsActions.update({
      replyDrafting: 'off',
      cleanup: { promotions: 'spam', newsletters: 'archive' },
      highPriorityTopics: ['career', 'academic', 'personal'],
    });
    for (const row of mail.getMailSnapshot().rows) {
      // The invariant every page's counts rely on, unchanged by settings.
      if (row.completedAt)
        expect(needsAttention(row.attention), row.id).toBe(false);
    }
  });

  it('persists preferences across a reload of the settings store', async () => {
    settings.settingsActions.update({
      replyDrafting: 'off',
      highPriorityTopics: ['career'],
    });
    vi.resetModules();
    const reloaded = (await import('./settingsStore')) as SettingsStore;
    expect(reloaded.getAgentPreferences().replyDrafting).toBe('off');
    expect(reloaded.getAgentPreferences().highPriorityTopics).toEqual(['career']);
  });
});

describe('Beta Features', () => {
  it('starts off, like every other default', () => {
    expect(settings.getAgentPreferences().beta).toBe(false);
  });

  it('is shared preference state — set once, read everywhere, survives a reload', async () => {
    settings.settingsActions.update({ beta: true });
    expect(settings.getAgentPreferences().beta).toBe(true);

    vi.resetModules();
    const reloaded = (await import('./settingsStore')) as SettingsStore;
    expect(reloaded.getAgentPreferences().beta).toBe(true);
  });

  it('is restored to off by Reset to defaults, same as every other field', () => {
    settings.settingsActions.update({ beta: true, replyDrafting: 'off' });
    settings.settingsActions.reset();
    expect(settings.getAgentPreferences().beta).toBe(false);
    expect(settings.getAgentPreferences().replyDrafting).toBe('review');
  });
});

describe('demo data carries the signals the model would produce', () => {
  it('tags every seeded mail with a topic', () => {
    for (const row of mail.getMailSnapshot().rows) {
      expect(row.topic, row.id).toBeTruthy();
    }
  });

  it('classifies only mail that genuinely belongs to a cleanup bucket', () => {
    const classified = mail
      .getMailSnapshot()
      .rows.filter((r) => r.classification);
    expect(classified.length).toBeGreaterThan(0);
    // Most real correspondence is none of promotions/newsletters/marketing/
    // banking, and must stay unlabelled rather than be forced into one.
    expect(classified.length).toBeLessThan(
      mail.getMailSnapshot().rows.length / 2
    );
  });

  it('keeps opportunities out of the cleanup buckets', () => {
    // An opportunity IIL surfaced on purpose is the last thing that should be
    // swept away by a housekeeping rule.
    for (const o of opportunities.items) {
      expect(rowById(o.id).classification, o.id).toBeUndefined();
    }
  });
});
