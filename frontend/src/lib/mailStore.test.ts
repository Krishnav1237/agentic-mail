/**
 * The canonical mail store's invariants (`lib/mailStore.ts`).
 *
 * This store is the reason "the same mail means the same thing on every
 * page" is structurally true rather than a convention six renderers each
 * have to remember. The tests below assert the properties every page then
 * depends on — one row per record, attention resolved exactly once,
 * completion clearing both axes — rather than the shape of any one page's
 * output.
 *
 * The store is a module singleton seeded at import time, so each test takes a
 * FRESH instance via `vi.resetModules()` + dynamic import. Without that,
 * mutations would leak forward and the suite would depend on its own
 * ordering.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { needsAttention, summarizeAttention } from './attention';
import {
  actions,
  approvals,
  demoMail,
  inbox,
  opportunities,
} from './workspaceData';
import { toBodyContent } from './mailContent';

type Store = typeof import('./mailStore');

let store: Store;

beforeEach(async () => {
  vi.resetModules();
  store = await import('./mailStore');
});

/** `Array.prototype.at` is ES2022; this project targets ES2020, and a test
 * convenience is not a reason to move a production compile target. */
const last = <T>(items: T[]): T => items[items.length - 1];

/** Every record the store is seeded from, as one flat id list. */
const seededIds = [
  ...inbox.rows.map((r) => r.id),
  ...approvals.items.map((a) => a.id),
  ...Object.values(demoMail).map((m) => m.id),
  ...opportunities.items.map((o) => o.id),
];

describe('seed', () => {
  it('holds exactly one row per seeded record, with no duplicate ids', () => {
    const { rows } = store.getMailSnapshot();
    expect(rows).toHaveLength(seededIds.length);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    expect([...rows.map((r) => r.id)].sort()).toEqual([...seededIds].sort());
  });

  it('resolves attention on every row — no consumer ever sees undefined', () => {
    for (const row of store.getMailSnapshot().rows) {
      expect(row.attention, row.id).toBeDefined();
      expect(['urgent', 'normal']).toContain(row.attention.urgency);
      expect(['important', 'normal']).toContain(row.attention.importance);
    }
  });

  it('gives every row a status and a date, so Inbox can sort and file it', () => {
    for (const row of store.getMailSnapshot().rows) {
      expect(row.status, row.id).toBe('inbox');
      expect(Number.isNaN(new Date(row.date).getTime()), row.id).toBe(false);
    }
  });
});

describe('completion is the one signal every page reads', () => {
  it('leaves no completed row carrying attention', () => {
    // This is what makes "completed items are excluded from active counts"
    // true by construction rather than by each page remembering to filter.
    const completed = store.getMailSnapshot().rows.filter((r) => r.completedAt);
    expect(completed.length).toBeGreaterThan(0);
    for (const row of completed) {
      expect(needsAttention(row.attention), row.id).toBe(false);
    }
  });

  it('keeps "needs attention" a strict subset of the unresolved rows', () => {
    // Dashboard states these as two numbers that partition the mailbox:
    // `handled` and everything else. A row that was both completed AND
    // flagged would appear on both sides of that split.
    for (const row of store.getMailSnapshot().rows) {
      if (needsAttention(row.attention))
        expect(row.completedAt, row.id).toBeUndefined();
    }
  });

  it('partitions the mailbox into handled and surfaced', () => {
    const { rows } = store.getMailSnapshot();
    const handled = rows.filter((r) => r.completedAt);
    const surfaced = rows.length - handled.length;
    expect(surfaced + handled.length).toBe(rows.length);
    expect(surfaced).toBeGreaterThan(0);
  });

  it('clears BOTH axes and records the note when an item is completed', () => {
    const target = store
      .getMailSnapshot()
      .rows.find((r) => !r.completedAt && needsAttention(r.attention));
    expect(target).toBeDefined();

    store.mailActions.complete(target!.id, 'approved and sent');

    const after = store
      .getMailSnapshot()
      .rows.find((r) => r.id === target!.id)!;
    expect(after.completedAt).toBeTruthy();
    expect(after.completedNote).toBe('approved and sent');
    expect(after.attention).toEqual({
      urgency: 'normal',
      importance: 'normal',
    });
  });

  it('drops a completed item out of the active counts every header uses', () => {
    const active = () =>
      summarizeAttention(store.getMailSnapshot().rows, {
        isCompleted: (r) => Boolean(r.completedAt),
        attentionOf: (r) => r.attention,
      });

    const before = active();
    const urgent = store
      .getMailSnapshot()
      .rows.find((r) => !r.completedAt && r.attention.urgency === 'urgent')!;

    store.mailActions.complete(urgent.id);

    const after = active();
    expect(after.activeCount).toBe(before.activeCount - 1);
    expect(after.urgentCount).toBe(before.urgentCount - 1);
  });
});

describe('cross-page integrity', () => {
  const idsOf = (records: { id?: string; mailId?: string }[]) =>
    records
      .map((r) => r.mailId ?? r.id)
      .filter((id): id is string => Boolean(id));

  it.each([
    ['approvals', approvals.items.map((a) => a.id)],
    ['opportunities', opportunities.items.map((o) => o.id)],
    ['actions', idsOf(actions.items)],
    ['completed actions', idsOf(actions.completed)],
  ])('every %s record resolves to exactly one store row', (_label, ids) => {
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const matches = store.getMailSnapshot().rows.filter((r) => r.id === id);
      expect(matches, id).toHaveLength(1);
    }
  });

  it('serves one thread detail per id, shared by whichever page opened it', () => {
    for (const id of seededIds) {
      const detail = store.mailActions.getThreadDetail(id);
      if (!detail) continue; // a plain email with no thread/insight/draft
      expect(detail.messages.length, id).toBeGreaterThan(0);
      expect(typeof detail.insight, id).toBe('string');
      expect(typeof detail.draftPreview, id).toBe('string');
    }
  });

  it('never puts IIL-authored text into a message body', () => {
    // The insight and the drafted reply each have their own field; the
    // message body is only ever what the sender wrote.
    for (const o of opportunities.items) {
      const detail = store.mailActions.getThreadDetail(o.id)!;
      // A completed (passed) opportunity is IIL-ineligible (see
      // `isIILEligible`) — its insight is withheld, same as any other
      // finished thread's, rather than still showing IIL's take on an
      // opportunity nobody is pursuing any more.
      expect(detail.insight).toBe(o.completedAt ? '' : o.why);
      expect(toBodyContent(detail.messages[0].body).text).not.toContain(o.why);
    }
  });
});

describe('overdue is urgent at the card level, same as any other urgent mail', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps an authored-urgent approval urgent (and important) once its respondBy has passed', async () => {
    // `ap1` is seeded `attention: { urgency: 'urgent', importance: 'important' }`
    // with `respondBy: '2026-08-15T17:00:00'` — authored urgent for reasons
    // that have nothing to do with the deadline itself ("the recruiter is
    // waiting on this today"). Overdue is a subset of urgent (see
    // `attention.ts`'s module doc), so once the deadline passes the row stays
    // urgent either way — via the authored value AND via `isOverdueByDeadline`
    // escalation in `refreshDerivedState`, `mailStore.ts`. The store hydrates
    // at import time, so the clock has to be faked BEFORE the fresh module
    // import runs.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T09:00:00'));
    vi.resetModules();
    store = await import('./mailStore');
    const row = store.getMailSnapshot().rows.find((r) => r.id === 'ap1')!;
    expect(row.deadlineIso).toBe('2026-08-15T17:00:00');
    expect(row.attention.urgency).toBe('urgent');
    expect(row.attention.importance).toBe('important');
  });
});

describe('reactivate — a completed thread leaving its terminal state', () => {
  it('is a no-op on a thread that was never completed', () => {
    const before = store.getMailSnapshot();
    store.mailActions.reactivate('ap1');
    expect(store.getMailSnapshot()).toBe(before);
  });

  it('clears completedAt/completedNote and restores attention derived from the preserved baseAttention', () => {
    const target = store
      .getMailSnapshot()
      .rows.find((r) => !r.completedAt && needsAttention(r.attention))!;
    const originalAttention = target.attention;

    store.mailActions.complete(target.id, 'done for now');
    const completed = store
      .getMailSnapshot()
      .rows.find((r) => r.id === target.id)!;
    expect(completed.completedAt).toBeTruthy();
    expect(needsAttention(completed.attention)).toBe(false);

    store.mailActions.reactivate(target.id);
    const reactivated = store
      .getMailSnapshot()
      .rows.find((r) => r.id === target.id)!;
    expect(reactivated.completedAt).toBeUndefined();
    expect(reactivated.completedNote).toBeUndefined();
    expect(reactivated.attention).toEqual(originalAttention);
  });

  it('makes a completed thread IIL-ineligible, and restores eligibility on reactivate', () => {
    const withInsight = approvals.items.find((a) => !a.completedAt)!;
    const original = store.mailActions.getThreadDetail(withInsight.id)!;
    expect(original.insight.length).toBeGreaterThan(0);

    store.mailActions.complete(withInsight.id, 'resolved');
    const whileCompleted = store.mailActions.getThreadDetail(withInsight.id)!;
    expect(whileCompleted.insight).toBe('');
    expect(whileCompleted.draftPreview).toBe('');

    store.mailActions.reactivate(withInsight.id);
    const afterReactivate = store.mailActions.getThreadDetail(withInsight.id)!;
    expect(afterReactivate.insight).toBe(original.insight);
  });

  it('sendReply on an already-completed thread reactivates it before merging the reply', () => {
    const target = approvals.items.find((a) => !a.completedAt)!;
    store.mailActions.complete(target.id, 'resolved');
    expect(
      store.getMailSnapshot().rows.find((r) => r.id === target.id)!.completedAt,
    ).toBeTruthy();

    store.mailActions.sendReply({
      threadId: target.id,
      recipients: { to: ['someone@example.com'], cc: [], bcc: [] },
      subject: `re: ${target.subject}`,
      body: { text: 'Following up on this.' },
      attachments: [],
    });

    const after = store.getMailSnapshot().rows.find((r) => r.id === target.id)!;
    // Reactivated (no longer completed) — but a reply you just sent is also
    // its own reason to stay quiet (`repliedAt`), which is the correct,
    // unrelated fact this assertion is careful not to conflate with "still
    // completed".
    expect(after.completedAt).toBeUndefined();
    expect(after.repliedAt).toBeTruthy();
  });
});

describe('opportunity previews', () => {
  it('never restate the opportunity title', () => {
    // The row shows sender, then title, then this preview. A preview derived
    // from the title printed the same words twice, side by side.
    for (const o of opportunities.items) {
      const row = store.getMailSnapshot().rows.find((r) => r.id === o.id)!;
      expect(row.subject).toBe(o.title);
      expect(row.snippet, o.id).not.toContain(o.title);
      expect(row.snippet.trim().length, o.id).toBeGreaterThan(0);
    }
  });

  it('gives every opportunity a distinct preview', () => {
    const snippets = opportunities.items.map(
      (o) => store.getMailSnapshot().rows.find((r) => r.id === o.id)!.snippet
    );
    expect(new Set(snippets).size).toBe(snippets.length);
  });

  it('previews the same text the opened mail shows in full', () => {
    for (const o of opportunities.items) {
      const row = store.getMailSnapshot().rows.find((r) => r.id === o.id)!;
      const body = toBodyContent(
        store.mailActions.getThreadDetail(o.id)!.messages[0].body
      );
      expect(body.text.startsWith(row.snippet), o.id).toBe(true);
    }
  });
});

describe('read / star / status mutations', () => {
  it('toggles star without touching attention or read state', () => {
    const before = store.getMailSnapshot().rows[0];
    store.mailActions.toggleStar(before.id);

    const after = store.getMailSnapshot().rows.find((r) => r.id === before.id)!;
    expect(after.starred).toBe(!before.starred);
    expect(after.attention).toEqual(before.attention);
    expect(after.unread).toBe(before.unread);
  });

  it('marks read and unread as an independent dimension from attention', () => {
    const target = store.getMailSnapshot().rows.find((r) => r.unread)!;
    const attention = target.attention;

    store.mailActions.markRead(target.id);
    expect(
      store.getMailSnapshot().rows.find((r) => r.id === target.id)!.unread
    ).toBe(false);

    store.mailActions.markUnread(target.id);
    const after = store.getMailSnapshot().rows.find((r) => r.id === target.id)!;
    expect(after.unread).toBe(true);
    expect(after.attention).toEqual(attention);
  });

  it.each([
    ['archive', 'archived'],
    ['trash', 'trash'],
    ['markSpam', 'spam'],
  ] as const)('%s moves the row out of the inbox slice', (action, status) => {
    const id = store.getMailSnapshot().rows[0].id;
    store.mailActions[action](id);
    expect(store.getMailSnapshot().rows.find((r) => r.id === id)!.status).toBe(
      status
    );

    store.mailActions.restoreToInbox(id);
    expect(store.getMailSnapshot().rows.find((r) => r.id === id)!.status).toBe(
      'inbox'
    );
  });

  it('lets a completed thread be archived, trashed, starred and marked unread without reactivating its workflow', () => {
    // "Completed" describes workflow state; archive/trash/star/read are an
    // independent dimension (`StoredMailRow`'s own doc comment) — none of
    // them should be able to flip `completedAt` back off. Only a genuine
    // reply does that (see `mailActions.reactivate`, exercised in the
    // `reactivate` describe block above).
    const target = store
      .getMailSnapshot()
      .rows.find((r) => !r.completedAt)!;
    store.mailActions.complete(target.id, 'resolved');
    const completedAt = store
      .getMailSnapshot()
      .rows.find((r) => r.id === target.id)!.completedAt;
    expect(completedAt).toBeTruthy();

    store.mailActions.archive(target.id);
    store.mailActions.toggleStar(target.id);
    store.mailActions.markUnread(target.id);

    const after = store.getMailSnapshot().rows.find((r) => r.id === target.id)!;
    expect(after.completedAt).toBe(completedAt);
    expect(after.status).toBe('archived');
    expect(after.starred).toBe(true);
    expect(after.unread).toBe(true);

    store.mailActions.trash(target.id);
    const trashed = store.getMailSnapshot().rows.find((r) => r.id === target.id)!;
    expect(trashed.completedAt).toBe(completedAt);
    expect(trashed.status).toBe('trash');
  });

  it('records a snooze wake time and clears it on restore', () => {
    const id = store.getMailSnapshot().rows[0].id;
    store.mailActions.snooze(id, new Date('2026-08-20T09:00:00'));

    const snoozed = store.getMailSnapshot().rows.find((r) => r.id === id)!;
    expect(snoozed.status).toBe('snoozed');
    expect(snoozed.snoozedUntil).toBeTruthy();

    // `restoreToInbox` is the one path back to Inbox from every parked/snoozed
    // view — Snoozed included (`MailThreadView`'s `isSnoozed` footer calls
    // this, not a separate wake mutation; a dedicated `wake()` used to exist
    // here as an exact duplicate of this same body and was removed).
    store.mailActions.restoreToInbox(id);
    const woken = store.getMailSnapshot().rows.find((r) => r.id === id)!;
    expect(woken.status).toBe('inbox');
    expect(woken.snoozedUntil).toBeUndefined();
  });

  it('ignores a mutation aimed at an id that does not exist', () => {
    const before = store.getMailSnapshot().rows;
    store.mailActions.toggleStar('no-such-id');
    store.mailActions.markRead('no-such-id');
    expect(store.getMailSnapshot().rows).toHaveLength(before.length);
  });
});

describe('replying folds into the one shared thread', () => {
  /** `m1` is seeded with an already-sent reply (`sent-1`), so the merge path
   * is exercised from the very first render rather than only after a user
   * sends something. */
  it('applies the seeded Sent reply to its thread at seed time', () => {
    const { sent, threadDetails } = store.getMailSnapshot();
    expect(sent).toHaveLength(1);
    expect(sent[0].threadId).toBe('m1');

    const row = store.getMailSnapshot().rows.find((r) => r.id === 'm1')!;
    expect(row.snippet.startsWith('Me: ')).toBe(true);
    expect(row.date).toBe(sent[0].date);
    // An answered thread needs nothing further from you, however it started.
    expect(needsAttention(row.attention)).toBe(false);
    // Both AI fields describe work that is now done.
    expect(threadDetails.m1.insight).toBe('');
    expect(threadDetails.m1.draftPreview).toBe('');
    expect(last(threadDetails.m1.messages).id).toBe(sent[0].id);
  });

  it('appends a new reply to the thread and quiets the row', () => {
    const target = store
      .getMailSnapshot()
      .rows.find((r) => r.id !== 'm1' && needsAttention(r.attention))!;
    const before =
      store.mailActions.getThreadDetail(target.id)?.messages.length ?? 1;

    store.mailActions.sendReply({
      threadId: target.id,
      recipients: { to: ['someone@example.com'], cc: [], bcc: [] },
      subject: `re: ${target.subject}`,
      body: { text: 'Sounds good, thanks.' },
      attachments: [],
    });

    const detail = store.mailActions.getThreadDetail(target.id)!;
    expect(detail.messages).toHaveLength(before + 1);
    expect(toBodyContent(last(detail.messages).body).text).toBe(
      'Sounds good, thanks.'
    );
    expect(detail.insight).toBe('');
    expect(detail.draftPreview).toBe('');

    const row = store.getMailSnapshot().rows.find((r) => r.id === target.id)!;
    expect(row.snippet).toBe('Me: Sounds good, thanks.');
    expect(needsAttention(row.attention)).toBe(false);
    expect(store.getMailSnapshot().sent[0].threadId).toBe(target.id);
  });

  it('does NOT fold a scheduled reply into the thread until it actually sends', () => {
    const target = store.getMailSnapshot().rows.find((r) => r.id === 'm3')!;
    const before = store.mailActions.getThreadDetail(target.id)!;
    const beforeCount = before.messages.length;
    const beforeInsight = before.insight;

    store.mailActions.scheduleReply({
      threadId: target.id,
      recipients: { to: ['someone@example.com'], cc: [], bcc: [] },
      subject: `re: ${target.subject}`,
      body: { text: 'Will confirm next week.' },
      attachments: [],
      date: new Date('2026-08-20T09:00:00'),
    });

    // Nothing has gone out, so nothing about the thread has changed —
    // including the insight, which still describes a live situation.
    const after = store.mailActions.getThreadDetail(target.id)!;
    expect(after.messages).toHaveLength(beforeCount);
    expect(after.insight).toBe(beforeInsight);
    expect(store.getMailSnapshot().scheduled).toHaveLength(1);
    expect(store.getMailSnapshot().sent).toHaveLength(1); // just the seeded one

    // ...but the scheduled row previews it appended, without mutating anything.
    const preview = store.getOutgoingThreadDetail(
      store.getMailSnapshot().scheduled[0]
    )!;
    expect(preview.messages).toHaveLength(beforeCount + 1);
    expect(store.mailActions.getThreadDetail(target.id)!.messages).toHaveLength(
      beforeCount
    );
  });

  it('merges a scheduled reply once it is sent early', () => {
    store.mailActions.scheduleReply({
      threadId: 'm3',
      recipients: { to: ['someone@example.com'], cc: [], bcc: [] },
      subject: 're: Scholarship portal now open',
      body: { text: 'Will confirm next week.' },
      attachments: [],
      date: new Date('2026-08-20T09:00:00'),
    });
    const scheduledId = store.getMailSnapshot().scheduled[0].id;
    const before = store.mailActions.getThreadDetail('m3')!.messages.length;

    store.mailActions.sendScheduledNow(scheduledId);

    expect(store.getMailSnapshot().scheduled).toHaveLength(0);
    expect(store.getMailSnapshot().sent[0].scheduledFor).toBeUndefined();
    expect(store.mailActions.getThreadDetail('m3')!.messages).toHaveLength(
      before + 1
    );
  });

  it('cancels a scheduled reply without touching the thread', () => {
    store.mailActions.scheduleReply({
      threadId: 'm3',
      recipients: { to: ['someone@example.com'], cc: [], bcc: [] },
      subject: 're: test',
      body: { text: 'Never mind.' },
      attachments: [],
      date: new Date('2026-08-20T09:00:00'),
    });
    const before = store.mailActions.getThreadDetail('m3')!.messages.length;

    store.mailActions.cancelScheduled(store.getMailSnapshot().scheduled[0].id);

    expect(store.getMailSnapshot().scheduled).toHaveLength(0);
    expect(store.mailActions.getThreadDetail('m3')!.messages).toHaveLength(
      before
    );
  });

  it('does not double-apply the same reply', () => {
    const detail = () =>
      store.mailActions.getThreadDetail('m1')!.messages.length;
    const before = detail();
    // Re-sending the seeded reply verbatim is a no-op: it is already on file.
    store.mailActions.sendScheduledNow('sent-1');
    expect(detail()).toBe(before);
  });
});

describe('receiveReply — an inbound message arriving on a thread', () => {
  it('restores Inbox visibility for an archived thread', () => {
    const id = store.getMailSnapshot().rows[0].id;
    store.mailActions.archive(id);
    expect(store.getMailSnapshot().rows.find((r) => r.id === id)!.status).toBe(
      'archived'
    );

    store.mailActions.receiveReply({ threadId: id, body: 'still there?' });
    const after = store.getMailSnapshot().rows.find((r) => r.id === id)!;
    expect(after.status).toBe('inbox');
  });

  it('restores Inbox visibility and clears the wake time for a snoozed thread', () => {
    const id = store.getMailSnapshot().rows[0].id;
    store.mailActions.snooze(id, new Date('2026-09-01T09:00:00'));

    store.mailActions.receiveReply({ threadId: id, body: 'any update?' });
    const after = store.getMailSnapshot().rows.find((r) => r.id === id)!;
    expect(after.status).toBe('inbox');
    expect(after.snoozedUntil).toBeUndefined();
  });

  it('reactivates a completed thread rather than leaving it done', () => {
    const target = store.getMailSnapshot().rows.find((r) => !r.completedAt)!;
    store.mailActions.complete(target.id, 'resolved');
    expect(
      store.getMailSnapshot().rows.find((r) => r.id === target.id)!.completedAt
    ).toBeTruthy();

    store.mailActions.receiveReply({ threadId: target.id, body: 'reopening this' });
    const after = store.getMailSnapshot().rows.find((r) => r.id === target.id)!;
    expect(after.completedAt).toBeUndefined();
  });

  it('does not invent a reactivation policy for Trash or Spam — leaves status as-is', () => {
    const trashId = store.getMailSnapshot().rows[0].id;
    store.mailActions.trash(trashId);
    store.mailActions.receiveReply({ threadId: trashId, body: 'hello?' });
    expect(store.getMailSnapshot().rows.find((r) => r.id === trashId)!.status).toBe(
      'trash'
    );

    const spamId = store.getMailSnapshot().rows[1].id;
    store.mailActions.markSpam(spamId);
    store.mailActions.receiveReply({ threadId: spamId, body: 'hello?' });
    expect(store.getMailSnapshot().rows.find((r) => r.id === spamId)!.status).toBe(
      'spam'
    );
  });

  it('appends the message to the thread without duplicating the row or any existing message', () => {
    const id = store.getMailSnapshot().rows[0].id;
    const rowCountBefore = store.getMailSnapshot().rows.length;
    const messagesBefore = store.mailActions.getThreadDetail(id)?.messages.length ?? 1;

    store.mailActions.receiveReply({ threadId: id, body: 'one more thing' });

    expect(store.getMailSnapshot().rows).toHaveLength(rowCountBefore);
    expect(store.mailActions.getThreadDetail(id)!.messages).toHaveLength(
      messagesBefore + 1
    );
  });

  it('marks the thread unread and clears repliedAt — we are no longer the last to have spoken', () => {
    const id = store.getMailSnapshot().rows[0].id;
    store.mailActions.markRead(id);
    store.mailActions.receiveReply({ threadId: id, body: 'new info' });
    const after = store.getMailSnapshot().rows.find((r) => r.id === id)!;
    expect(after.unread).toBe(true);
    expect(after.repliedAt).toBeUndefined();
  });

  it('is a no-op on an id that does not exist', () => {
    const before = store.getMailSnapshot().rows;
    store.mailActions.receiveReply({ threadId: 'no-such-id', body: 'x' });
    expect(store.getMailSnapshot().rows).toEqual(before);
  });
});

describe('purgeExpired — the 30-day Trash/Spam retention model', () => {
  const rowWith = (patch: Partial<import('./mailStore').StoredMailRow>) =>
    ({
      id: 'x',
      sender: 'Someone',
      subject: 'Subject',
      snippet: '',
      date: '2026-01-01T00:00:00Z',
      unread: false,
      category: 'Primary',
      starred: false,
      status: 'inbox',
      attention: { urgency: 'normal', importance: 'normal' },
      baseAttention: { urgency: 'normal', importance: 'normal' },
      ...patch,
    }) as import('./mailStore').StoredMailRow;

  it('keeps a trashed row inside the 30-day window', () => {
    const now = new Date('2026-01-20T00:00:00Z');
    const trashedAt = '2026-01-01T00:00:00Z'; // 19 days before `now`
    const rows = [rowWith({ id: 'a', status: 'trash', trashedAt })];
    expect(store.purgeExpired(rows, now).map((r) => r.id)).toEqual(['a']);
  });

  it('drops a trashed row once 30 days have elapsed', () => {
    const now = new Date('2026-02-05T00:00:00Z');
    const trashedAt = '2026-01-01T00:00:00Z'; // 35 days before `now`
    const rows = [rowWith({ id: 'a', status: 'trash', trashedAt })];
    expect(store.purgeExpired(rows, now)).toEqual([]);
  });

  it('applies the identical 30-day rule to Spam', () => {
    const now = new Date('2026-02-05T00:00:00Z');
    const spamAt = '2026-01-01T00:00:00Z';
    const rows = [rowWith({ id: 'a', status: 'spam', spamAt })];
    expect(store.purgeExpired(rows, now)).toEqual([]);
  });

  it('never purges a row that is not in Trash or Spam, however old its stamp', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const rows = [
      rowWith({ id: 'a', status: 'archived', trashedAt: '2020-01-01T00:00:00Z' }),
      rowWith({ id: 'b', status: 'inbox' }),
    ];
    expect(store.purgeExpired(rows, now).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('leaves a Trash/Spam row with no timestamp alone rather than guessing', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const rows = [rowWith({ id: 'a', status: 'trash' })];
    expect(store.purgeExpired(rows, now)).toHaveLength(1);
  });
});

describe('Trash/Spam retention timestamps', () => {
  it('stamps trashedAt on trash and clears it on restore', () => {
    const id = store.getMailSnapshot().rows[0].id;
    store.mailActions.trash(id);
    const row = store.getMailSnapshot().rows.find((r) => r.id === id)!;
    expect(row.trashedAt).toBeTruthy();

    store.mailActions.restoreToInbox(id);
    expect(
      store.getMailSnapshot().rows.find((r) => r.id === id)!.trashedAt
    ).toBeUndefined();
  });

  it('stamps spamAt on markSpam and clears it on restore', () => {
    const id = store.getMailSnapshot().rows[0].id;
    store.mailActions.markSpam(id);
    const row = store.getMailSnapshot().rows.find((r) => r.id === id)!;
    expect(row.spamAt).toBeTruthy();

    store.mailActions.restoreToInbox(id);
    expect(
      store.getMailSnapshot().rows.find((r) => r.id === id)!.spamAt
    ).toBeUndefined();
  });
});
