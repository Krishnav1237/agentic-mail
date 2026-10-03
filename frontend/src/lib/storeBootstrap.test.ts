/**
 * `buildInboxHydrationInput` — the merge a real `GET /threads` hydration
 * does before calling `mailActions.hydrate()` — pinned in isolation from
 * the network.
 *
 * The scenario this exists to catch: a row the user has already starred or
 * filed to Archive/Trash/Spam/Snoozed, whose ORIGINAL SOURCE was an
 * approval/demoMail/opportunity record, must survive a real hydration —
 * both as a row (already covered implicitly by the dedup logic) AND as a
 * `ThreadDetail` you can still open. `buildThreadDetails` only ever derives
 * detail entries from `approvals`/`demoMail`/`opportunities` — never from
 * `rows` — and the dedup fix deliberately excludes a preserved row's
 * source from those three arrays (so it doesn't appear twice). Without
 * also carrying the detail forward, that exclusion silently drops it: the
 * row still lists correctly, but opening it shows an empty thread. Nothing
 * in `mailStore.test.ts` or `settingsIntegration.test.ts` exercises
 * "preserve, then rehydrate, then open" — this file does.
 *
 * `mailStore` is a module singleton seeded at import time, so each test
 * takes a fresh instance via `vi.resetModules()` + dynamic import, same as
 * `mailStore.test.ts`. `storeBootstrap` is imported the same way so it
 * resolves against that same fresh `mailStore` instance rather than a
 * stale cached one.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThreadSummary } from './apiClient';

type MailStore = typeof import('./mailStore');
type StoreBootstrap = typeof import('./storeBootstrap');

let mail: MailStore;
let bootstrap: StoreBootstrap;

beforeEach(async () => {
  vi.resetModules();
  mail = await import('./mailStore');
  bootstrap = await import('./storeBootstrap');
});

/** A row the real backend has never heard of — any id outside the demo
 * namespace is fine, and this deliberately uses one far from every demo
 * id (`m*`, `ap*`, `dm-*`, `op-*`) so collision is not the thing under
 * test. */
function fakeThreadRow(id: string): ThreadSummary {
  return {
    id,
    google_thread_id: `g-${id}`,
    message_count: 1,
    last_message_at: '2026-09-01T00:00:00.000Z',
    email_id: `email-${id}`,
    subject: 'A real backend thread',
    sender_email: 'someone@example.com',
    sender_name: 'Someone',
    snippet: 'Hello from the real backend.',
    received_at: '2026-09-01T00:00:00.000Z',
    classification: null,
    ai_score: null,
    status: 'unread',
  };
}

/** One id from each of the three sources `buildThreadDetails` derives
 * entries from — an approval, a demoMail item, and an opportunity. Each
 * ships with its own non-empty `ThreadDetail` in the demo fixtures, which
 * is exactly what a broken merge would silently lose. */
const SOURCED_IDS = {
  approval: 'ap1',
  demoMail: 'dm-hr-offer',
  opportunity: 'op-elev',
} as const;

describe('buildInboxHydrationInput', () => {
  it.each(Object.entries(SOURCED_IDS))(
    'keeps a starred %s row openable after a real hydration',
    (_kind, id) => {
      mail.mailActions.toggleStar(id);
      const before = mail.mailActions.getThreadDetail(id);
      expect(before?.messages.length, id).toBeGreaterThan(0);

      const previous = mail.getMailSnapshot();
      const input = bootstrap.buildInboxHydrationInput(
        [fakeThreadRow('real-thread-1')],
        previous
      );
      mail.mailActions.hydrate(input);

      const { rows } = mail.getMailSnapshot();
      const matches = rows.filter((r) => r.id === id);
      expect(matches, id).toHaveLength(1);
      expect(matches[0].starred, id).toBe(true);

      const after = mail.mailActions.getThreadDetail(id);
      expect(after, id).toBeDefined();
      expect(after?.messages, id).toEqual(before?.messages);
    }
  );

  it.each(Object.entries(SOURCED_IDS))(
    'keeps an archived %s row openable after a real hydration',
    (_kind, id) => {
      mail.mailActions.archive(id);
      const before = mail.mailActions.getThreadDetail(id);
      expect(before?.messages.length, id).toBeGreaterThan(0);

      const previous = mail.getMailSnapshot();
      const input = bootstrap.buildInboxHydrationInput(
        [fakeThreadRow('real-thread-2')],
        previous
      );
      mail.mailActions.hydrate(input);

      const { rows } = mail.getMailSnapshot();
      const matches = rows.filter((r) => r.id === id);
      expect(matches, id).toHaveLength(1);
      expect(matches[0].status, id).toBe('archived');

      const after = mail.mailActions.getThreadDetail(id);
      expect(after, id).toBeDefined();
      expect(after?.messages, id).toEqual(before?.messages);
    }
  );

  it('still re-derives an untouched sourced row fresh, not from a stale preserved copy', () => {
    // `ap2` is never starred/archived/snoozed in this test — it must come
    // through the normal `approvals` adapter path, unaffected by the
    // dedup/preserve logic exercised above.
    const id = 'ap2';
    const previous = mail.getMailSnapshot();
    const input = bootstrap.buildInboxHydrationInput(
      [fakeThreadRow('real-thread-3')],
      previous
    );
    mail.mailActions.hydrate(input);

    const { rows } = mail.getMailSnapshot();
    const matches = rows.filter((r) => r.id === id);
    expect(matches).toHaveLength(1);
    expect(matches[0].status).toBe('inbox');
    expect(mail.mailActions.getThreadDetail(id)).toBeDefined();
  });

  it('lands the real thread itself in the inbox, carrying its backend email id', () => {
    const previous = mail.getMailSnapshot();
    const input = bootstrap.buildInboxHydrationInput(
      [fakeThreadRow('real-thread-4')],
      previous
    );
    mail.mailActions.hydrate(input);

    const row = mail
      .getMailSnapshot()
      .rows.find((r) => r.id === 'real-thread-4');
    expect(row).toBeDefined();
    expect(row?.status).toBe('inbox');
    expect(row?.latestEmailId).toBe('email-real-thread-4');
  });
});
