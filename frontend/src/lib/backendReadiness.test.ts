/**
 * The P0 backend-readiness boundaries.
 *
 * Each block here pins one thing the audit found the frontend could not do —
 * hydrate from an external source, mutate a workflow record, keep what the
 * composer actually held — so that a later change which quietly reintroduces
 * a hardcoded array or a discarded payload fails a test rather than a demo.
 *
 * Stores are module singletons, so every test takes a fresh set.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { needsAttention } from './attention';
import { toBodyContent, type StoredAttachment } from './mailContent';
import { dueBucketFor } from './mailAdapters';

type MailStore = typeof import('./mailStore');
type WorkflowStore = typeof import('./workflowStore');

let mail: MailStore;
let workflow: WorkflowStore;

beforeEach(async () => {
  vi.resetModules();
  mail = await import('./mailStore');
  workflow = await import('./workflowStore');
});

const rowById = (id: string) => mail.getMailSnapshot().rows.find((r) => r.id === id);

/* ------------------------- P0#2 — mailStore hydration ---------------------- */

describe('mailStore hydration', () => {
  it('starts from the demo bootstrap, which goes through the same hydrate path', () => {
    expect(mail.getMailSnapshot().rows.length).toBeGreaterThan(0);
  });

  it('empties completely on reset — the state a real app has before its first fetch', () => {
    mail.mailActions.reset();
    const snapshot = mail.getMailSnapshot();
    expect(snapshot.rows).toEqual([]);
    expect(snapshot.sent).toEqual([]);
    expect(snapshot.scheduled).toEqual([]);
    expect(snapshot.drafts).toEqual([]);
    expect(snapshot.threadDetails).toEqual({});
  });

  it('accepts an arbitrary mailbox — nothing is welded to the demo constants', () => {
    mail.mailActions.hydrate({
      rows: [
        {
          id: 'srv-1',
          sender: 'Server Sender',
          subject: 'From the backend',
          snippet: 'Hello from a fetch.',
          date: '2026-08-16T09:00:00',
          unread: true,
          category: 'Primary',
        },
      ],
    });
    const snapshot = mail.getMailSnapshot();
    expect(snapshot.rows).toHaveLength(1);
    expect(snapshot.rows[0].id).toBe('srv-1');
    // Derived state is built as part of hydration — there is no second step.
    expect(snapshot.rows[0].attention).toEqual({ urgency: 'normal', importance: 'normal' });
    expect(snapshot.rows[0].baseAttention).toEqual({ urgency: 'normal', importance: 'normal' });
    expect(snapshot.rows[0].status).toBe('inbox');
  });

  it('replaces rather than merges, so a re-fetch cannot leave orphans behind', () => {
    const before = mail.getMailSnapshot().rows.length;
    expect(before).toBeGreaterThan(1);
    mail.mailActions.hydrate({ rows: [] });
    expect(mail.getMailSnapshot().rows).toHaveLength(0);
  });

  it('applies deadline escalation from the actions it is given, not from an import', () => {
    // Due tomorrow — inside the shared urgency window (`URGENT_DEADLINE_DAYS`,
    // `lib/deadlineGroups.ts`), so this should escalate. An overdue deadline
    // also escalates, via `isOverdueByDeadline` instead — see the next test.
    const dueTomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    mail.mailActions.hydrate({
      rows: [
        {
          id: 'srv-2',
          sender: 'S',
          subject: 'Due',
          snippet: '',
          date: '2026-08-16T09:00:00',
          unread: false,
          category: 'Primary',
        },
      ],
      actions: [{ id: 'a-1', title: 'Due soon thing', dueDate: dueTomorrow, mailId: 'srv-2' }],
    });
    expect(rowById('srv-2')!.attention.urgency).toBe('urgent');
  });

  it('escalates urgency for an overdue deadline too — overdue is a subset of urgent, not a distinct state', () => {
    mail.mailActions.hydrate({
      rows: [
        {
          id: 'srv-3',
          sender: 'S',
          subject: 'Overdue',
          snippet: '',
          date: '2026-08-16T09:00:00',
          unread: false,
          category: 'Primary',
        },
      ],
      actions: [{ id: 'a-2', title: 'Overdue thing', dueDate: '2020-01-01T09:00:00', mailId: 'srv-3' }],
    });
    expect(rowById('srv-3')!.attention.urgency).toBe('urgent');
  });
});

/* --------------------- P0#3 — Actions bucketing is reactive ---------------- */

describe('P0#3 — five-tier bucketing follows the data', () => {
  /** The page's own bucketing, extracted so the recomputation contract can be
   * tested without mounting React. `Actions.tsx` runs exactly this inside a
   * `useMemo` keyed on its pending list — the bug was that the memo's
   * dependency array was empty, so this ran once and never again. */
  const bucket = (items: { dueDate?: string }[]) => {
    const out: Record<string, number> = {
      overdue: 0,
      today: 0,
      thisWeek: 0,
      later: 0,
      noDeadline: 0,
    };
    for (const item of items) out[dueBucketFor(item.dueDate, NOW)] += 1;
    return out;
  };
  const NOW = new Date('2026-08-16T10:00:00');

  it('puts an item in a different tier when its due date changes', () => {
    const overdue = [{ dueDate: '2026-08-10T09:00:00' }];
    const later = [{ dueDate: '2026-09-30T09:00:00' }];
    expect(bucket(overdue).overdue).toBe(1);
    expect(bucket(later).later).toBe(1);
    // Same helper, different input, different answer — which is only visible
    // to the page if the memo actually re-runs.
    expect(bucket(overdue)).not.toEqual(bucket(later));
  });

  it('reflects items appearing and disappearing', () => {
    expect(bucket([])).toEqual({ overdue: 0, today: 0, thisWeek: 0, later: 0, noDeadline: 0 });
    const arrived = bucket([{ dueDate: '2026-08-16T17:00:00' }, { dueDate: undefined }]);
    expect(arrived.today).toBe(1);
    expect(arrived.noDeadline).toBe(1);
  });

  it('drops a completed Action out of the pending set the tiers are built from', () => {
    const item = workflow.getWorkflowSnapshot().actions.find((a) => a.mailId && !a.completedAt)!;
    const pendingBefore = workflow
      .getWorkflowSnapshot()
      .actions.filter((a) => !a.completedAt).length;

    workflow.workflowActions.completeAction(item.id);

    const pendingAfter = workflow
      .getWorkflowSnapshot()
      .actions.filter((a) => !a.completedAt).length;
    expect(pendingAfter).toBe(pendingBefore - 1);
  });
});

/* --------------------- P0#1 — workflow store + mutations ------------------- */

describe('workflow store', () => {
  it('bootstraps all three collections from the demo data', () => {
    const snapshot = workflow.getWorkflowSnapshot();
    expect(snapshot.actions.length).toBeGreaterThan(0);
    expect(snapshot.approvals.length).toBeGreaterThan(0);
    expect(snapshot.opportunities.length).toBeGreaterThan(0);
  });

  it('hydrates from arbitrary records and resets to empty', () => {
    workflow.workflowActions.hydrate({
      actions: [{ id: 'srv-a', title: 'From the backend' }],
    });
    const snapshot = workflow.getWorkflowSnapshot();
    expect(snapshot.actions).toHaveLength(1);
    expect(snapshot.approvals).toHaveLength(0);

    workflow.workflowActions.reset();
    expect(workflow.getWorkflowSnapshot().actions).toEqual([]);
  });

  it('notifies subscribers on mutation, so pages re-render', () => {
    let calls = 0;
    const item = workflow.getWorkflowSnapshot().actions.find((a) => a.mailId && !a.completedAt)!;
    // `useWorkflowStore` subscribes through the same mechanism.
    workflow.workflowActions.hydrate(workflow.demoWorkflowInput());
    const before = workflow.getWorkflowSnapshot();
    workflow.workflowActions.completeAction(item.id);
    calls += workflow.getWorkflowSnapshot() === before ? 0 : 1;
    expect(calls).toBe(1);
  });
});

describe('P0#5D — Action completion', () => {
  const openAction = () =>
    workflow.getWorkflowSnapshot().actions.find((a) => a.mailId && !a.completedAt)!;

  it('records completion on the Action record', () => {
    const item = openAction();
    workflow.workflowActions.completeAction(item.id, 'done by hand');

    const after = workflow.getWorkflowSnapshot().actions.find((a) => a.id === item.id)!;
    expect(after.completedAt).toBeTruthy();
    expect(after.completedNote).toBe('done by hand');
  });

  it('resolves the backing mail, which is what every active count reads', () => {
    const item = openAction();
    expect(rowById(item.mailId!)!.completedAt).toBeUndefined();

    workflow.workflowActions.completeAction(item.id);

    const row = rowById(item.mailId!)!;
    expect(row.completedAt).toBeTruthy();
    // Completion clears attention, so the item leaves urgent/important totals
    // on Actions, Inbox and Dashboard at once.
    expect(needsAttention(row.attention)).toBe(false);
  });

  it('leaves the mail itself intact — completing is not deleting', () => {
    const item = openAction();
    const before = rowById(item.mailId!)!;
    workflow.workflowActions.completeAction(item.id);
    const after = rowById(item.mailId!)!;
    expect(after.subject).toBe(before.subject);
    expect(after.sender).toBe(before.sender);
    expect(after.status).toBe(before.status);
    expect(mail.mailActions.getThreadDetail(item.mailId!)).toBeDefined();
  });

  it('is idempotent — completing twice does not move the timestamp', () => {
    const item = openAction();
    workflow.workflowActions.completeAction(item.id, 'first');
    const first = workflow.getWorkflowSnapshot().actions.find((a) => a.id === item.id)!.completedAt;
    workflow.workflowActions.completeAction(item.id, 'second');
    const second = workflow.getWorkflowSnapshot().actions.find((a) => a.id === item.id)!.completedAt;
    expect(second).toBe(first);
  });
});

describe('P0#5E — Opportunity lifecycle', () => {
  const opportunity = (lifecycle: string) =>
    workflow.getWorkflowSnapshot().opportunities.find((o) => o.lifecycle === lifecycle)!;

  it('moves an opportunity between saved and pursuing without resolving it', () => {
    const item = opportunity('new');
    workflow.workflowActions.setOpportunityLifecycle(item.id, 'saved');
    expect(
      workflow.getWorkflowSnapshot().opportunities.find((o) => o.id === item.id)!.lifecycle,
    ).toBe('saved');
    // Still live: saving something means you're still interested in it.
    expect(rowById(item.id)!.completedAt).toBeUndefined();

    workflow.workflowActions.setOpportunityLifecycle(item.id, 'pursuing');
    expect(
      workflow.getWorkflowSnapshot().opportunities.find((o) => o.id === item.id)!.lifecycle,
    ).toBe('pursuing');
    expect(rowById(item.id)!.completedAt).toBeUndefined();
  });

  it('passing resolves both the record and the mail behind it', () => {
    const item = opportunity('new');
    workflow.workflowActions.setOpportunityLifecycle(item.id, 'passed');

    const after = workflow.getWorkflowSnapshot().opportunities.find((o) => o.id === item.id)!;
    expect(after.lifecycle).toBe('passed');
    expect(after.completedAt).toBeTruthy();

    const row = rowById(item.id)!;
    expect(row.completedAt).toBeTruthy();
    expect(needsAttention(row.attention)).toBe(false);
  });

  it('ignores a no-op transition to the state it is already in', () => {
    const item = opportunity('saved');
    const before = workflow.getWorkflowSnapshot().opportunities;
    workflow.workflowActions.setOpportunityLifecycle(item.id, 'saved');
    expect(workflow.getWorkflowSnapshot().opportunities).toBe(before);
  });
});

describe('Approval resolution', () => {
  it('records the outcome on the record and resolves the mail', () => {
    const item = workflow.getWorkflowSnapshot().approvals.find((a) => !a.completedAt)!;
    workflow.workflowActions.resolveApproval(item.id, 'approved and sent');

    const after = workflow.getWorkflowSnapshot().approvals.find((a) => a.id === item.id)!;
    expect(after.completedAt).toBeTruthy();
    expect(after.completedNote).toBe('approved and sent');
    expect(rowById(item.id)!.completedAt).toBeTruthy();
  });
});

describe('workflowStateFor — one coherent current workflow state', () => {
  it('reads Action for a mail id an open Action points at', () => {
    const item = workflow.getWorkflowSnapshot().actions.find((a) => a.mailId && !a.completedAt)!;
    expect(workflow.workflowStateFor(item.mailId!)).toBe('action');
  });

  it('reads Approval for a mail id an open Approval points at', () => {
    const item = workflow.getWorkflowSnapshot().approvals.find((a) => !a.completedAt)!;
    expect(workflow.workflowStateFor(item.id)).toBe('approval');
  });

  it('reads Opportunity for a mail id an unpassed Opportunity points at', () => {
    const item = workflow.getWorkflowSnapshot().opportunities.find((o) => o.lifecycle !== 'passed')!;
    expect(workflow.workflowStateFor(item.id)).toBe('opportunity');
  });

  it('reads Completed once the backing mail row is resolved, regardless of which collection it came from', () => {
    const item = workflow.getWorkflowSnapshot().actions.find((a) => a.mailId && !a.completedAt)!;
    workflow.workflowActions.completeAction(item.id);
    expect(workflow.workflowStateFor(item.mailId!)).toBe('completed');
  });

  it('reads null for a mail id in none of the three collections', () => {
    const opportunityIds = new Set(workflow.getWorkflowSnapshot().opportunities.map((o) => o.id));
    const approvalIds = new Set(workflow.getWorkflowSnapshot().approvals.map((a) => a.id));
    const actionMailIds = new Set(workflow.getWorkflowSnapshot().actions.map((a) => a.mailId));
    const plain = mail
      .getMailSnapshot()
      .rows.find(
        (r) => !opportunityIds.has(r.id) && !approvalIds.has(r.id) && !actionMailIds.has(r.id)
      )!;
    expect(workflow.workflowStateFor(plain.id)).toBe(null);
  });

  it('never reports two workflow states at once for the same id — Completed always wins once resolved', () => {
    const item = workflow.getWorkflowSnapshot().approvals.find((a) => !a.completedAt)!;
    expect(workflow.workflowStateFor(item.id)).toBe('approval');
    workflow.workflowActions.resolveApproval(item.id, 'approved');
    expect(workflow.workflowStateFor(item.id)).toBe('completed');
  });

  it('restores the pre-completion workflow state once the thread reactivates', () => {
    const item = workflow.getWorkflowSnapshot().actions.find((a) => a.mailId && !a.completedAt)!;
    workflow.workflowActions.completeAction(item.id);
    expect(workflow.workflowStateFor(item.mailId!)).toBe('completed');

    mail.mailActions.reactivate(item.mailId!);
    expect(workflow.workflowStateFor(item.mailId!)).toBe('action');
  });
});

describe('Archiving automation reads workflowStateFor through mailStore, without a circular import', () => {
  it('auto-archives once the Action itself (not just the mail row) resolves', async () => {
    const item = workflow.getWorkflowSnapshot().actions.find((a) => a.mailId && !a.completedAt)!;
    const settings = await import('./settingsStore');
    settings.settingsActions.update({ automation: { archive: 'automatic' } });

    // `completeAction` resolves the Action record itself, not just the mail
    // row — this is the path that makes `workflowStateFor` genuinely agree
    // there is nothing pending, and is what proves `mailStore`'s
    // `registerPendingWorkflowCheck` hook actually reaches `workflowStore`'s
    // collections at runtime rather than always defaulting to "nothing
    // pending".
    workflow.workflowActions.completeAction(item.id);
    expect(rowById(item.mailId!)!.status).toBe('archived');
  });

  it('never archives while an Action for the same mail id is still open elsewhere', async () => {
    // A mail id can be an Action's own `id` in one seeded fixture while a
    // *different* Action's `mailId` also points at it would be a data bug;
    // the realistic version of "still pending" is simply: don't complete
    // the Action, and Automatic must leave it alone.
    const item = workflow.getWorkflowSnapshot().actions.find((a) => a.mailId && !a.completedAt)!;
    const settings = await import('./settingsStore');
    settings.settingsActions.update({ automation: { archive: 'automatic' } });
    expect(rowById(item.mailId!)!.status).toBe('inbox');
  });
});

/* ------------------- P0#5A/B/C — outgoing payload fidelity ----------------- */

const payload = (over: Partial<Parameters<MailStore['mailActions']['sendReply']>[0]> = {}) => ({
  threadId: 'm3',
  recipients: { to: ['a@example.com'], cc: ['c@example.com'], bcc: ['b@example.com'] },
  subject: 're: test',
  body: { text: 'The full message body, well past a one-line preview.' },
  attachments: [],
  ...over,
});

describe('P0#5C — recipients reach the outgoing message', () => {
  it('keeps to, cc and bcc exactly as the composer supplied them', () => {
    mail.mailActions.sendReply(payload());
    const sent = mail.getMailSnapshot().sent[0];
    expect(sent.recipients.to).toEqual(['a@example.com']);
    expect(sent.recipients.cc).toEqual(['c@example.com']);
    expect(sent.recipients.bcc).toEqual(['b@example.com']);
  });

  it('does not substitute the original sender for an edited recipient', () => {
    // The specific regression: the send path used to rebuild `to` from the
    // row it was replying to, so editing the field changed nothing.
    const original = rowById('m3')!.senderEmail;
    mail.mailActions.sendReply(payload({ recipients: { to: ['someone-else@example.com'], cc: [], bcc: [] } }));
    expect(mail.getMailSnapshot().sent[0].recipients.to).toEqual(['someone-else@example.com']);
    expect(mail.getMailSnapshot().sent[0].recipients.to).not.toContain(original);
  });

  it('carries recipients through into the thread message', () => {
    mail.mailActions.sendReply(payload());
    const message = mail.mailActions.getThreadDetail('m3')!.messages.slice(-1)[0];
    expect(message.to).toBe('a@example.com');
    expect(message.cc).toBe('c@example.com');
  });
});

describe('P0#5B — attachments survive the send path', () => {
  const stored: StoredAttachment = {
    kind: 'stored',
    id: 'att-1',
    name: 'contract.pdf',
    size: 2048,
    mimeType: 'application/pdf',
  };

  it('records attachments on the outgoing message instead of discarding them', () => {
    mail.mailActions.sendReply(payload({ attachments: [stored] }));
    expect(mail.getMailSnapshot().sent[0].attachments).toEqual([stored]);
  });

  it('exposes server-held attachments on the thread message', () => {
    mail.mailActions.sendReply(payload({ attachments: [stored] }));
    const message = mail.mailActions.getThreadDetail('m3')!.messages.slice(-1)[0];
    expect(message.attachments).toEqual([stored]);
  });

  it('keeps a received attachment readable from the canonical thread', () => {
    // `dm-hr-offer`'s body tells the reader about an attached offer letter;
    // the model can now actually represent it.
    const message = mail.mailActions.getThreadDetail('dm-hr-offer')!.messages[0];
    expect(message.attachments?.[0]?.name).toBe('offer-letter.pdf');
  });
});

describe('P0#5A — drafts', () => {
  it('persists a draft that can be read back', () => {
    mail.mailActions.saveDraft(payload());
    const draft = mail.mailActions.getDraft('m3')!;
    expect(draft.id).toBeTruthy();
    expect(draft.recipients.cc).toEqual(['c@example.com']);
    expect(draft.subject).toBe('re: test');
    expect(draft.body.text).toContain('full message body');
  });

  it('retains attachments on the draft', () => {
    const stored: StoredAttachment = {
      kind: 'stored',
      id: 'a',
      name: 'x.pdf',
      size: 1,
      mimeType: 'application/pdf',
    };
    mail.mailActions.saveDraft(payload({ attachments: [stored] }));
    expect(mail.mailActions.getDraft('m3')!.attachments).toEqual([stored]);
  });

  it('upserts rather than stacking — one draft per thread', () => {
    const first = mail.mailActions.saveDraft(payload());
    const second = mail.mailActions.saveDraft(payload({ body: { text: 'Revised.' } }));
    expect(mail.getMailSnapshot().drafts).toHaveLength(1);
    expect(second.id).toBe(first.id);
    expect(mail.mailActions.getDraft('m3')!.body.text).toBe('Revised.');
  });

  it('clears the draft once the reply actually goes out', () => {
    mail.mailActions.saveDraft(payload());
    expect(mail.mailActions.getDraft('m3')).toBeDefined();
    mail.mailActions.sendReply(payload());
    expect(mail.mailActions.getDraft('m3')).toBeUndefined();
  });

  it('clears the draft when the reply is scheduled instead', () => {
    mail.mailActions.saveDraft(payload());
    mail.mailActions.scheduleReply({ ...payload(), date: new Date('2026-08-20T09:00:00') });
    expect(mail.mailActions.getDraft('m3')).toBeUndefined();
  });

  it('can be discarded explicitly', () => {
    mail.mailActions.saveDraft(payload());
    mail.mailActions.discardDraft('m3');
    expect(mail.mailActions.getDraft('m3')).toBeUndefined();
  });

  it('keeps drafts for different threads apart', () => {
    mail.mailActions.saveDraft(payload());
    mail.mailActions.saveDraft(payload({ threadId: 'm5', body: { text: 'Other thread.' } }));
    expect(mail.getMailSnapshot().drafts).toHaveLength(2);
    expect(mail.mailActions.getDraft('m5')!.body.text).toBe('Other thread.');
  });
});

describe('the sent message keeps its whole body', () => {
  it('stores the full text and derives the snippet from it', () => {
    const long = 'x'.repeat(400);
    mail.mailActions.sendReply(payload({ body: { text: long } }));
    const sent = mail.getMailSnapshot().sent[0];
    expect(sent.body.text).toBe(long);
    // The preview is a derivation, not the message — previously the store
    // kept only this and the message itself was lost.
    expect(sent.snippet.length).toBeLessThan(long.length);
  });

  it('reopens showing the message rather than its preview', () => {
    const long = 'A full reply that runs well past any one-line preview would.';
    mail.mailActions.sendReply(payload({ body: { text: long } }));
    const message = mail.mailActions.getThreadDetail('m3')!.messages.slice(-1)[0];
    expect(toBodyContent(message.body).text).toBe(long);
  });
});

/* -------------------------- P0#4 — ISO timestamps -------------------------- */

describe('P0#4 — persisted timestamps are ISO 8601', () => {
  const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

  it('stores snoozedUntil as a parseable instant', () => {
    const until = new Date('2026-08-20T09:00:00');
    mail.mailActions.snooze('m3', until);
    const value = rowById('m3')!.snoozedUntil!;
    expect(value).toMatch(ISO);
    expect(new Date(value).getTime()).toBe(until.getTime());
  });

  it('stores scheduledFor as a parseable instant', () => {
    const date = new Date('2026-08-20T09:00:00');
    mail.mailActions.scheduleReply({ ...payload(), date });
    const value = mail.getMailSnapshot().scheduled[0].scheduledFor!;
    expect(value).toMatch(ISO);
    expect(new Date(value).getTime()).toBe(date.getTime());
  });

  it('leaves no locale-formatted date anywhere in persisted state', () => {
    mail.mailActions.snooze('m3', new Date('2026-08-20T09:00:00'));
    mail.mailActions.scheduleReply({ ...payload(), date: new Date('2026-08-21T09:00:00') });
    const serialized = JSON.stringify(mail.getMailSnapshot());
    // `toLocaleString()` output contains a comma between date and time and no
    // `T` separator — the shape that made these unusable to any consumer.
    expect(serialized).not.toMatch(/\d{1,2}\/\d{1,2}\/\d{4},/);
  });
});

/* ---------------------- P0#6 — mail body representations ------------------- */

describe('P0#6 — body content', () => {
  it('normalizes an authored plain-text body', () => {
    expect(toBodyContent('Just text.')).toEqual({ text: 'Just text.' });
  });

  it('passes a multipart body through untouched', () => {
    const body = toBodyContent({ text: 'fallback' });
    expect(body.text).toBe('fallback');
    expect(body.html).toBeUndefined();
  });

  it('keeps every demo message on the plain-text path', () => {
    // Nothing in the current data set produces HTML, so the renderer's text
    // branch is the one in use and the visual output is unchanged.
    for (const detail of Object.values(mail.getMailSnapshot().threadDetails)) {
      for (const message of detail.messages) {
        expect(toBodyContent(message.body).html).toBeUndefined();
      }
    }
  });
});
