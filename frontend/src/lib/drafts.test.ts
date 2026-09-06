/**
 * Drafts — the canonical unsent-reply state, and the guarantees the Drafts
 * view is built on.
 *
 * The Drafts page is a pure VIEW: it owns no draft array, no count, and no
 * mutations of its own. Everything it renders is derived from `store.drafts`
 * and the two thread resolvers below, which is exactly what makes "modify a
 * draft anywhere, see it on the Drafts page" true by construction rather than
 * by two surfaces remembering to agree. These tests pin that contract at the
 * store, where it actually lives.
 *
 * The store is a module singleton seeded at import, so each test takes a fresh
 * instance via `vi.resetModules()` — otherwise a draft saved in one case would
 * still be there in the next, and half of these assertions would be about test
 * ordering rather than the store.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Attachment } from './mailContent';

type Store = typeof import('./mailStore');

let store: Store;

beforeEach(async () => {
  vi.resetModules();
  store = await import('./mailStore');
});

const drafts = () => store.getMailSnapshot().drafts;
const draftFor = (threadId: string) => drafts().find((d) => d.threadId === threadId);

/** Re-hydrates with a new draft list and the mailbox otherwise untouched —
 * how a reconciled `POST /drafts` response would land: the drafts change,
 * nothing else does. */
function rehydrateDrafts(next: import('./mailStore').DraftRow[]) {
  const snapshot = store.getMailSnapshot();
  store.mailActions.hydrate({
    rows: snapshot.rows,
    threadDetails: snapshot.threadDetails,
    sent: snapshot.sent,
    scheduled: snapshot.scheduled,
    drafts: next,
  });
}

/** A thread the demo mailbox definitely holds — `m1` carries the seeded sent
 * reply, so it also exercises the "thread already has history" path. */
const THREAD = 'm1';
const OTHER_THREAD = 'm3';

function draftInput(threadId: string, overrides: Partial<Parameters<Store['mailActions']['saveDraft']>[0]> = {}) {
  return {
    threadId,
    recipients: { to: ['dana@example.com'], cc: [], bcc: [] },
    subject: 're: something',
    body: { text: 'Half a thought.' },
    attachments: [] as Attachment[],
    ...overrides,
  };
}

/** A `StoredAttachment` — the only kind a draft can carry that a backend
 * could ever serve back. */
const FILE: Attachment = {
  kind: 'stored',
  id: 'att-1',
  name: 'proposal.pdf',
  size: 184_320,
  mimeType: 'application/pdf',
};

describe('the draft list', () => {
  it('starts empty — no demo drafts anywhere in the bootstrap', () => {
    // The Drafts page must not be furnished with fake content. If the demo
    // ever seeds one, this is the test that says so.
    expect(drafts()).toHaveLength(0);
  });

  it('holds one draft after one save', () => {
    store.mailActions.saveDraft(draftInput(THREAD));
    expect(drafts()).toHaveLength(1);
  });

  it('holds one draft per thread when several threads have one', () => {
    store.mailActions.saveDraft(draftInput(THREAD));
    store.mailActions.saveDraft(draftInput(OTHER_THREAD));
    expect(drafts()).toHaveLength(2);
    expect(drafts().map((d) => d.threadId).sort()).toEqual([THREAD, OTHER_THREAD].sort());
  });

  it('never keeps two records for the same thread — saving again upserts', () => {
    // The invariant the whole feature rests on: reopening a conversation
    // resumes ONE draft. An append here would stack a second copy and leave
    // "which of these is my reply?" unanswerable.
    store.mailActions.saveDraft(draftInput(THREAD, { body: { text: 'First pass.' } }));
    const firstId = draftFor(THREAD)!.id;

    store.mailActions.saveDraft(draftInput(THREAD, { body: { text: 'Second pass.' } }));

    expect(drafts()).toHaveLength(1);
    expect(draftFor(THREAD)!.id).toBe(firstId);
    expect(draftFor(THREAD)!.body.text).toBe('Second pass.');
  });

  it('gives every draft a distinct, client-namespaced id', () => {
    store.mailActions.saveDraft(draftInput(THREAD));
    store.mailActions.saveDraft(draftInput(OTHER_THREAD));
    const ids = drafts().map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    // `local-` marks an id this client issued, which is what a backend
    // response would reconcile against — and what keeps a fresh draft from
    // colliding with a hydrated one and breaking React keys.
    for (const id of ids) expect(store.isProvisionalId(id)).toBe(true);
  });
});

/**
 * The temp-id → server-id seam.
 *
 * Nothing performs this swap yet — there is no backend to swap against. What
 * these pin is the PRECONDITION that makes it a field rewrite rather than a
 * refactor: a draft's `id` is inert, and `threadId` is what the collection is
 * actually keyed by. A future consumer that starts keying off `id` breaks
 * here, at a named invariant, instead of during integration.
 */
describe('a draft id is provisional, and nothing depends on it', () => {
  it('recognises a client id as provisional and a server id as permanent', () => {
    store.mailActions.saveDraft(draftInput(THREAD));
    expect(store.isProvisionalId(draftFor(THREAD)!.id)).toBe(true);
    // What a server would return instead. The client must not assume its own
    // id comes back.
    expect(store.isProvisionalId('drf_9f2c41')).toBe(false);
  });

  it('treats a hydrated server id as already permanent', () => {
    store.mailActions.hydrate({
      rows: [],
      drafts: [
        {
          id: 'drf_9f2c41',
          threadId: 'srv-thread-1',
          recipients: { to: ['a@example.com'], cc: [], bcc: [] },
          subject: 're: served',
          body: { text: 'From the server.' },
          attachments: [],
          updatedAt: '2026-08-15T18:00:00.000Z',
        },
      ],
    });
    expect(store.isProvisionalId(store.mailActions.getDraft('srv-thread-1')!.id)).toBe(false);
  });

  it('keys every lookup on threadId, so replacing the id changes nothing', () => {
    // Simulates the reconcile: the server's id is written over the client's,
    // in place, and every read still resolves.
    store.mailActions.saveDraft(draftInput(THREAD, { attachments: [FILE] }));
    const before = store.mailActions.getDraft(THREAD)!;

    rehydrateDrafts([{ ...before, id: 'drf_server_1' }]);

    const after = store.mailActions.getDraft(THREAD)!;
    expect(after.id).toBe('drf_server_1');
    // Everything the app actually reads a draft by is untouched.
    expect(after.threadId).toBe(before.threadId);
    expect(after.recipients).toEqual(before.recipients);
    expect(after.attachments).toEqual(before.attachments);
    expect(store.getDraftThreadRow(after).id).toBe(THREAD);
    expect(store.getDraftThreadDetail(after)).toBeDefined();
    // And the mutations still find it.
    store.mailActions.discardDraft(THREAD);
    expect(drafts()).toHaveLength(0);
  });

  it('does not let a re-save resurrect the provisional id', () => {
    // The upsert preserves `existing.id` — which is correct, and must keep
    // being correct once that id is the SERVER's. Editing a reconciled draft
    // must not mint a new `local-` one over the top of it.
    store.mailActions.saveDraft(draftInput(THREAD));
    rehydrateDrafts([{ ...store.mailActions.getDraft(THREAD)!, id: 'drf_server_2' }]);

    store.mailActions.saveDraft(draftInput(THREAD, { body: { text: 'Edited after reconcile.' } }));

    const after = store.mailActions.getDraft(THREAD)!;
    expect(after.id).toBe('drf_server_2');
    expect(store.isProvisionalId(after.id)).toBe(false);
    expect(after.body.text).toBe('Edited after reconcile.');
    expect(drafts()).toHaveLength(1);
  });
});

describe('what a draft carries', () => {
  it('keeps recipients — To AND Cc AND Bcc', () => {
    // The bug this whole shape exists to prevent: Cc rendered, editable, and
    // silently dropped the moment it was saved.
    store.mailActions.saveDraft(
      draftInput(THREAD, {
        recipients: { to: ['a@example.com', 'b@example.com'], cc: ['c@example.com'], bcc: ['d@example.com'] },
      }),
    );
    expect(draftFor(THREAD)!.recipients).toEqual({
      to: ['a@example.com', 'b@example.com'],
      cc: ['c@example.com'],
      bcc: ['d@example.com'],
    });
  });

  it('keeps attachments', () => {
    store.mailActions.saveDraft(draftInput(THREAD, { attachments: [FILE] }));
    expect(draftFor(THREAD)!.attachments).toEqual([FILE]);
  });

  it('keeps the whole body, not a preview of it', () => {
    const long = `${'A real paragraph of writing. '.repeat(20)}Sign-off.`;
    store.mailActions.saveDraft(draftInput(THREAD, { body: { text: long } }));
    expect(draftFor(THREAD)!.body.text).toBe(long);
  });

  it('stamps a real ISO timestamp, never a pre-formatted label', () => {
    store.mailActions.saveDraft(draftInput(THREAD));
    const { updatedAt } = draftFor(THREAD)!;
    expect(Number.isNaN(new Date(updatedAt).getTime())).toBe(false);
    expect(updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('moves the timestamp forward when the draft is edited', () => {
    // What the Drafts list sorts on. If an edit didn't advance it, an updated
    // draft would stay stranded wherever it first landed.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-08-16T09:00:00Z'));
      store.mailActions.saveDraft(draftInput(THREAD));
      const first = draftFor(THREAD)!.updatedAt;

      vi.setSystemTime(new Date('2026-08-16T11:30:00Z'));
      store.mailActions.saveDraft(draftInput(THREAD, { body: { text: 'Revised.' } }));

      expect(new Date(draftFor(THREAD)!.updatedAt).getTime()).toBeGreaterThan(
        new Date(first).getTime(),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('orders newest-modified first once sorted the way the view sorts', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-08-16T09:00:00Z'));
      store.mailActions.saveDraft(draftInput(THREAD));
      vi.setSystemTime(new Date('2026-08-16T10:00:00Z'));
      store.mailActions.saveDraft(draftInput(OTHER_THREAD));
      // Editing the OLDER draft has to bring it back to the top.
      vi.setSystemTime(new Date('2026-08-16T12:00:00Z'));
      store.mailActions.saveDraft(draftInput(THREAD, { body: { text: 'Back to this one.' } }));

      const byRecency = [...drafts()].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
      expect(byRecency.map((d) => d.threadId)).toEqual([THREAD, OTHER_THREAD]);
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * The LocalAttachment → StoredAttachment seam.
 *
 * Also unperformed — there is no upload endpoint. What these pin is that the
 * whole path carries the `Attachment` UNION rather than one arm of it, so an
 * upload step is an in-place array rewrite and not a change to any store
 * shape, prop or component.
 */
describe('an attachment can become server-held without a redesign', () => {
  /** What the composer produces from a picked file: bytes in this tab only. */
  const local = (): Attachment => ({
    kind: 'local',
    id: 'report.pdf-2048-1755300000000',
    name: 'report.pdf',
    size: 2048,
    mimeType: 'application/pdf',
    // A real `File` isn't constructible in this environment and isn't what is
    // under test — the union arm is.
    file: { name: 'report.pdf', size: 2048 } as unknown as File,
  });

  it('accepts a local attachment on a draft, unchanged', () => {
    store.mailActions.saveDraft(draftInput(THREAD, { attachments: [local()] }));
    const saved = draftFor(THREAD)!.attachments[0];
    expect(saved.kind).toBe('local');
    expect(saved.name).toBe('report.pdf');
  });

  it('accepts a mixed array — the state a partial upload leaves behind', () => {
    store.mailActions.saveDraft(draftInput(THREAD, { attachments: [local(), FILE] }));
    expect(draftFor(THREAD)!.attachments.map((a) => a.kind)).toEqual(['local', 'stored']);
  });

  it('swaps one for the other in place, with nothing else touched', () => {
    store.mailActions.saveDraft(draftInput(THREAD, { attachments: [local()] }));
    const draft = store.mailActions.getDraft(THREAD)!;

    // Exactly what an upload response would do: same array position, server's
    // id and kind.
    const uploaded: Attachment = { ...FILE, id: 'srv-att-77', name: 'report.pdf', size: 2048 };
    rehydrateDrafts([{ ...draft, attachments: [uploaded] }]);

    const after = store.mailActions.getDraft(THREAD)!;
    expect(after.attachments).toEqual([uploaded]);
    expect(after.body).toEqual(draft.body);
    expect(after.recipients).toEqual(draft.recipients);
  });

  it('keeps a local attachment off the read side, before and after sending', () => {
    // The one place in the app that discriminates on `kind`. A local file's
    // bytes exist in the sending tab alone, so it is not something a reader of
    // this thread could ever open — and must not be listed as though it were.
    store.mailActions.sendReply(draftInput(THREAD, { attachments: [local(), FILE] }));
    const message = store.mailActions.getThreadDetail(THREAD)!.messages.slice(-1)[0];
    expect(message.attachments).toEqual([FILE]);
    // The outgoing record still holds both — nothing was silently dropped from
    // what the user actually attached.
    expect(store.getMailSnapshot().sent[0].attachments.map((a) => a.kind)).toEqual([
      'local',
      'stored',
    ]);
  });

  it('never fabricates a URL for a stored attachment', () => {
    store.mailActions.saveDraft(draftInput(THREAD, { attachments: [FILE] }));
    const saved = draftFor(THREAD)!.attachments[0];
    expect(saved.kind).toBe('stored');
    expect((saved as { url?: string }).url).toBeUndefined();
  });
});

describe('reading a draft back', () => {
  it('resumes exactly what was saved — the composer seeds from this', () => {
    const input = draftInput(THREAD, {
      recipients: { to: ['dana.ruiz@northwind.co'], cc: ['cc@example.com'], bcc: [] },
      subject: 're: Coffee chat scheduling',
      body: { text: 'Tuesday works. Shall we say 10?' },
      attachments: [FILE],
    });
    store.mailActions.saveDraft(input);

    const resumed = store.mailActions.getDraft(THREAD)!;
    expect(resumed.recipients).toEqual(input.recipients);
    expect(resumed.subject).toBe(input.subject);
    expect(resumed.body).toEqual(input.body);
    expect(resumed.attachments).toEqual(input.attachments);
  });

  it('returns nothing for a thread with no draft', () => {
    expect(store.mailActions.getDraft(THREAD)).toBeUndefined();
  });

  it('never returns another thread’s draft', () => {
    store.mailActions.saveDraft(draftInput(OTHER_THREAD, { body: { text: 'Not yours.' } }));
    expect(store.mailActions.getDraft(THREAD)).toBeUndefined();
  });
});

describe('a draft leaves the list when it is spent', () => {
  it('discard removes it', () => {
    store.mailActions.saveDraft(draftInput(THREAD));
    store.mailActions.discardDraft(THREAD);
    expect(drafts()).toHaveLength(0);
    expect(store.mailActions.getDraft(THREAD)).toBeUndefined();
  });

  it('discard removes only that thread’s draft', () => {
    store.mailActions.saveDraft(draftInput(THREAD));
    store.mailActions.saveDraft(draftInput(OTHER_THREAD));
    store.mailActions.discardDraft(THREAD);
    expect(drafts().map((d) => d.threadId)).toEqual([OTHER_THREAD]);
  });

  it('sending consumes it — and the reply appears in Sent', () => {
    store.mailActions.saveDraft(draftInput(THREAD));
    store.mailActions.sendReply(draftInput(THREAD, { body: { text: 'Sending it.' } }));

    expect(drafts()).toHaveLength(0);
    expect(store.getMailSnapshot().sent[0].body.text).toBe('Sending it.');
  });

  it('scheduling consumes it — and the reply appears in Scheduled', () => {
    store.mailActions.saveDraft(draftInput(THREAD));
    const when = new Date('2026-09-01T09:00:00Z');
    store.mailActions.scheduleReply({ ...draftInput(THREAD, { body: { text: 'Later.' } }), date: when });

    expect(drafts()).toHaveLength(0);
    expect(store.getMailSnapshot().scheduled[0].scheduledFor).toBe(when.toISOString());
  });

  it('sending one thread’s reply leaves another thread’s draft alone', () => {
    store.mailActions.saveDraft(draftInput(THREAD));
    store.mailActions.saveDraft(draftInput(OTHER_THREAD));
    store.mailActions.sendReply(draftInput(THREAD));
    expect(drafts().map((d) => d.threadId)).toEqual([OTHER_THREAD]);
  });
});

describe('the thread behind a draft', () => {
  it('resolves a received thread to its own row', () => {
    store.mailActions.saveDraft(draftInput(THREAD));
    const row = store.getDraftThreadRow(draftFor(THREAD)!);
    expect(row.id).toBe(THREAD);
    // Not a fabricated row — the actual mailbox row, so the rail, header and
    // star all read the same record Inbox shows.
    expect(row).toBe(store.getMailSnapshot().rows.find((r) => r.id === THREAD));
  });

  it('serves the real conversation, not just the draft', () => {
    store.mailActions.saveDraft(draftInput(THREAD));
    const detail = store.getDraftThreadDetail(draftFor(THREAD)!);
    expect(detail).toBeDefined();
    expect(detail!.messages.length).toBeGreaterThan(0);
  });

  it('resolves a draft written from Sent through the outgoing record', () => {
    // A reply to a reply: the draft hangs off the Sent row, not a received
    // one. Both resolutions have to work or the draft is unopenable.
    const sentId = store.getMailSnapshot().sent[0].id;
    store.mailActions.saveDraft(draftInput(sentId));

    const row = store.getDraftThreadRow(draftFor(sentId)!);
    expect(row.id).toBe(sentId);
    expect(store.getDraftThreadDetail(draftFor(sentId)!)).toBeDefined();
  });

  it('keeps an orphan draft openable, without inventing a message', () => {
    // Once `GET /drafts` and the mailbox are separately paged, a draft can
    // arrive for a thread this client isn't holding. Losing the user's own
    // writing over that is not an option; fabricating a received message
    // they never got is a worse one.
    store.mailActions.saveDraft(
      draftInput('thread-not-loaded', {
        recipients: { to: ['someone@elsewhere.com'], cc: [], bcc: [] },
        subject: 're: A conversation we do not hold',
      }),
    );
    const orphan = draftFor('thread-not-loaded')!;

    const row = store.getDraftThreadRow(orphan);
    expect(row.id).toBe('thread-not-loaded');
    expect(row.subject).toBe('re: A conversation we do not hold');
    expect(row.snippet).toBe('');

    const detail = store.getDraftThreadDetail(orphan);
    expect(detail!.messages).toEqual([]);
    expect(detail!.insight).toBe('');
  });
});

describe('hydration owns the draft list', () => {
  it('takes drafts from the hydrate payload — the GET /drafts seam', () => {
    store.mailActions.hydrate({
      rows: [],
      drafts: [
        {
          id: 'srv-draft-1',
          threadId: 'srv-thread-1',
          recipients: { to: ['from@server.example'], cc: [], bcc: [] },
          subject: 're: Served by the backend',
          body: { text: 'Written on another device.' },
          attachments: [],
          updatedAt: '2026-08-15T18:00:00.000Z',
        },
      ],
    });

    expect(drafts()).toHaveLength(1);
    expect(store.mailActions.getDraft('srv-thread-1')!.id).toBe('srv-draft-1');
  });

  it('starts with no drafts when the payload has none', () => {
    store.mailActions.hydrate({ rows: [] });
    expect(drafts()).toHaveLength(0);
  });

  it('reset clears them — the pre-fetch state a real app starts in', () => {
    store.mailActions.saveDraft(draftInput(THREAD));
    store.mailActions.reset();
    expect(drafts()).toHaveLength(0);
  });
});

describe('Drafts is a first-class mail view', () => {
  it('is defined in MAIL_VIEWS like every other one — no second nav system', async () => {
    const { MAIL_VIEWS, mailViewById } = await import('./mailViews');
    const drafts = mailViewById('drafts');
    expect(drafts).toBeDefined();
    expect(MAIL_VIEWS).toContain(drafts);
    // Routed by the same `/inbox/:view` pattern every sibling uses, so it
    // needs no route of its own.
    expect(drafts!.path).toBe('/inbox/drafts');
    expect(drafts!.emptyTitle).toBeTruthy();
    expect(drafts!.emptyDescription).toBeTruthy();
  });

  it('is customizable through Quick Access, and not pinned by default', async () => {
    const { ALL_MAIL_VIEW_IDS, DEFAULT_QUICK_ACCESS } = await import('./mailViews');
    // Being in the id list is what makes it draggable in Settings and
    // reachable from the sidebar once pinned; `useQuickAccess` reconciles
    // against exactly this list.
    expect(ALL_MAIL_VIEW_IDS).toContain('drafts');
    // Not forced into the sidebar — same treatment as Snoozed, Scheduled,
    // Archive, Trash and Spam.
    expect(DEFAULT_QUICK_ACCESS).not.toContain('drafts');
  });

  it('is reachable from the same id list a stored Quick Access blob is reconciled against', async () => {
    // `useQuickAccess.sanitize` rebuilds its state against `ALL_MAIL_VIEW_IDS`
    // and appends anything the stored blob is missing to Available — so a
    // returning user whose saved layout predates this view gets Drafts in
    // Available rather than losing it. Membership in that list is the whole
    // precondition; the reconciliation itself needs a DOM and is covered in
    // browser validation.
    const { ALL_MAIL_VIEW_IDS, MAIL_VIEWS } = await import('./mailViews');
    expect(ALL_MAIL_VIEW_IDS).toEqual(MAIL_VIEWS.map((v) => v.id));
    expect(new Set(ALL_MAIL_VIEW_IDS).size).toBe(ALL_MAIL_VIEW_IDS.length);
  });
});

describe('the Drafts view reads canonical state and nothing else', () => {
  it('has no demo draft array of its own to fall back on', async () => {
    // A page-local array is the one thing that would make the count and the
    // rows able to disagree. Asserted structurally: the Drafts view imports
    // its data from the store, so an empty store means an empty page.
    const { getMailSnapshot } = store;
    expect(getMailSnapshot().drafts).toEqual([]);

    const workspaceData = await import('./workspaceData');
    expect(Object.keys(workspaceData).some((k) => /^drafts?$/i.test(k))).toBe(false);
  });

  it('exposes every draft the store holds — the count is the list', () => {
    store.mailActions.saveDraft(draftInput(THREAD));
    store.mailActions.saveDraft(draftInput(OTHER_THREAD));
    // The page renders `drafts.length` beside the heading and maps the same
    // array below it, so these are necessarily the same number.
    expect(drafts().length).toBe(2);
    expect(new Set(drafts().map((d) => d.threadId)).size).toBe(2);
  });

  it('every listed draft resolves to something openable', () => {
    store.mailActions.saveDraft(draftInput(THREAD));
    store.mailActions.saveDraft(draftInput(OTHER_THREAD));
    store.mailActions.saveDraft(draftInput('thread-not-loaded'));
    for (const d of drafts()) {
      expect(store.getDraftThreadRow(d).id, d.threadId).toBe(d.threadId);
    }
  });
});
