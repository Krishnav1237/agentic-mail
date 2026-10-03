/**
 * `mailActions.sendReply`'s real-backend branch (`lib/mailStore.ts`).
 *
 * Two things pinned here, both about the gap between "what the composer
 * had open" and "what `POST /emails/:id/send` actually carries" — that
 * route takes exactly one `to` address, no Cc/Bcc, no attachments:
 *
 *   1. The real network call itself only ever sends `to[0]`/subject/
 *      bodyText — extra recipients, Cc, Bcc and attachments never reach
 *      the backend.
 *   2. The LOCAL "Sent" record built afterward must match that, not the
 *      full composed message — showing Cc/Bcc/attachments as delivered
 *      when they weren't is exactly the kind of claim this app's data
 *      model exists to avoid elsewhere (see `mailStore.ts`'s own module
 *      doc on `attention`/`baseAttention` for the same principle applied
 *      to a different field).
 *
 * The demo/local-only path (no backend, or a thread with no
 * `latestEmailId`) is a control case: it must keep showing the full
 * composed message, unaffected by any of this.
 *
 * `./apiClient` is mocked the same way `settingsIntegration.test.ts` mocks
 * it — `mailStore` and `settingsStore` both import from it, and the real
 * module would try to reach an actual backend.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThreadSummary } from './apiClient';

const api = vi.hoisted(() => ({
  sendCalls: [] as Array<{ emailId: string; body: unknown }>,
  shouldFail: false,
}));

vi.mock('./apiClient', () => {
  class ApiError extends Error {
    code: string;
    httpStatus: number;
    constructor(code: string, message: string, httpStatus: number) {
      super(message);
      this.name = 'ApiError';
      this.code = code;
      this.httpStatus = httpStatus;
    }
  }
  return {
    ApiError,
    isBackendEnabled: () => true,
    sendEmail: async (emailId: string, body: unknown) => {
      api.sendCalls.push({ emailId, body });
      if (api.shouldFail) {
        throw new ApiError('SEND_FAILED', 'the backend rejected this send.', 502);
      }
      return { approvalId: 'approval-1', alreadySent: false };
    },
    // `settingsStore` imports these at module scope (it's pulled in
    // transitively via `mailStore`'s own import of `getAgentPreferences`);
    // never exercised by anything in this file.
    savePreferences: async (preferences: unknown) => preferences,
    createWriteQueue: () => ({
      push: () => {},
      flush: async () => {},
      cancel: () => {},
    }),
  };
});

type MailStore = typeof import('./mailStore');
let mail: MailStore;

beforeEach(async () => {
  api.sendCalls.length = 0;
  api.shouldFail = false;
  vi.stubGlobal('window', {
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  });
  vi.resetModules();
  mail = await import('./mailStore');
});

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

const fullInput = (threadId: string) => ({
  threadId,
  recipients: {
    to: ['primary@example.com', 'extra@example.com'],
    cc: ['cc@example.com'],
    bcc: ['bcc@example.com'],
  },
  subject: 're: A real backend thread',
  body: { text: 'Thanks — sounds good.' },
  attachments: [
    {
      kind: 'stored' as const,
      id: 'att-1',
      name: 'notes.pdf',
      size: 1024,
      mimeType: 'application/pdf',
    },
  ],
});

describe('sendReply — real backend thread', () => {
  const THREAD_ID = 'real-thread-1';

  beforeEach(() => {
    mail.mailActions.hydrate({ rows: [mail.threadToMailRow(fakeThreadRow(THREAD_ID))] });
  });

  it('sends only to[0]/subject/bodyText over the wire', async () => {
    await mail.mailActions.sendReply(fullInput(THREAD_ID));
    expect(api.sendCalls).toHaveLength(1);
    expect(api.sendCalls[0].emailId).toBe(`email-${THREAD_ID}`);
    expect(api.sendCalls[0].body).toEqual({
      to: 'primary@example.com',
      subject: 're: A real backend thread',
      bodyText: 'Thanks — sounds good.',
    });
  });

  it('records the local Sent row as only what was actually delivered', async () => {
    await mail.mailActions.sendReply(fullInput(THREAD_ID));
    const [sent] = mail.getMailSnapshot().sent;
    expect(sent.recipients).toEqual({
      to: ['primary@example.com'],
      cc: [],
      bcc: [],
    });
    expect(sent.attachments).toEqual([]);
    // The body itself WAS fully sent (`bodyText` carries it) — only the
    // recipients/attachments the route has no field for are trimmed.
    expect(sent.body).toEqual({ text: 'Thanks — sounds good.' });
  });

  it('never adds a local Sent row when the real send fails', async () => {
    api.shouldFail = true;
    await expect(mail.mailActions.sendReply(fullInput(THREAD_ID))).rejects.toThrow();
    expect(mail.getMailSnapshot().sent).toHaveLength(0);
  });
});

describe('sendReply — local-only thread (no latestEmailId)', () => {
  const THREAD_ID = 'demo-thread-1';

  beforeEach(() => {
    mail.mailActions.hydrate({
      rows: [
        {
          id: THREAD_ID,
          sender: 'Demo Sender',
          subject: 'A demo thread',
          snippet: 'hi',
          date: '2026-09-01T00:00:00.000Z',
          unread: true,
          category: 'Primary',
        },
      ],
    });
  });

  it('never calls the real backend', async () => {
    await mail.mailActions.sendReply(fullInput(THREAD_ID));
    expect(api.sendCalls).toHaveLength(0);
  });

  it('keeps the full composed message — Cc, Bcc and attachments included', async () => {
    await mail.mailActions.sendReply(fullInput(THREAD_ID));
    const [sent] = mail.getMailSnapshot().sent;
    expect(sent.recipients).toEqual({
      to: ['primary@example.com', 'extra@example.com'],
      cc: ['cc@example.com'],
      bcc: ['bcc@example.com'],
    });
    expect(sent.attachments).toHaveLength(1);
  });
});
