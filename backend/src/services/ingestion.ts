import { query, withTransaction } from '../db/index.js';
import { listMessages, type GraphMessage } from './graph.js';
import { listGmailMessages, getGmailMessage } from './gmail.js';
import { env } from '../config/env.js';
import { agentQueue } from '../queues/index.js';
import { getAuthContext } from './tokens.js';
import { consumeUsageMetric, getRemainingQuota } from './billing.js';

const formatGmailAfter = (iso: string) => {
  const date = new Date(iso);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
};

const getHeader = (
  headers: Array<{ name: string; value: string }>,
  key: string
) =>
  headers.find((header) => header.name.toLowerCase() === key.toLowerCase())
    ?.value ?? null;

const parseFromHeader = (value: string | null) => {
  if (!value) return { name: null, email: null };
  const match = value.match(/(.*)<([^>]+)>/);
  if (match) {
    const name = match[1].replace(/\"/g, '').trim();
    return { name: name || null, email: match[2].trim() };
  }
  return { name: null, email: value.trim() };
};

const ingestGraphInbox = async (
  userId: string,
  accessToken: string,
  lastSyncAt: string | null,
  remainingQuota: number | null
) => {
  const receivedAfter = lastSyncAt
    ? new Date(lastSyncAt).toISOString()
    : undefined;
  let nextLink: string | undefined;
  let processed = 0;

  do {
    const page = await listMessages(accessToken, {
      top: env.syncBatchSize,
      receivedAfter,
      nextLink,
    });

    const messages: GraphMessage[] = page?.value ?? [];
    nextLink = page['@odata.nextLink'];

    for (const message of messages) {
      if (remainingQuota !== null && processed >= remainingQuota) {
        nextLink = undefined;
        break;
      }
      const inserted = await withTransaction(async (client) => {
        const insert = await client.query(
          `INSERT INTO emails (user_id, message_id, thread_id, subject, sender_email, sender_name, received_at, body_preview, importance, raw_json)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (user_id, message_id) DO NOTHING
           RETURNING id`,
          [
            userId,
            message.id,
            message.conversationId ?? null,
            message.subject ?? null,
            message.from?.emailAddress?.address ?? null,
            message.from?.emailAddress?.name ?? null,
            message.receivedDateTime ?? null,
            message.bodyPreview ?? null,
            message.importance ?? null,
            message,
          ]
        );
        return insert.rows[0]?.id as string | undefined;
      });

      if (inserted) processed += 1;
    }
  } while (nextLink);

  return processed;
};

const ingestGmailInbox = async (
  userId: string,
  accessToken: string,
  lastSyncAt: string | null,
  remainingQuota: number | null
) => {
  const queryParts = ['in:inbox'];
  if (lastSyncAt) {
    queryParts.push(`after:${formatGmailAfter(lastSyncAt)}`);
  }
  const q = queryParts.join(' ');
  let pageToken: string | undefined;
  let processed = 0;

  do {
    const page = await listGmailMessages(accessToken, {
      maxResults: env.syncBatchSize,
      pageToken,
      q,
    });
    pageToken = page.nextPageToken;
    const messages: Array<{ id: string; threadId: string }> =
      page.messages ?? [];

    for (const message of messages) {
      if (remainingQuota !== null && processed >= remainingQuota) {
        pageToken = undefined;
        break;
      }
      const details = await getGmailMessage(accessToken, message.id);
      const headers = details.payload?.headers ?? [];
      const subject = getHeader(headers, 'Subject');
      const from = getHeader(headers, 'From');
      const { name, email } = parseFromHeader(from);
      const receivedAt = details.internalDate
        ? new Date(Number(details.internalDate)).toISOString()
        : null;
      const importance = (details.labelIds ?? []).some((label: string) =>
        ['IMPORTANT', 'STARRED'].includes(label)
      )
        ? 'high'
        : 'normal';

      const inserted = await withTransaction(async (client) => {
        const insert = await client.query(
          `INSERT INTO emails (user_id, message_id, thread_id, subject, sender_email, sender_name, received_at, body_preview, importance, raw_json)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (user_id, message_id) DO NOTHING
           RETURNING id`,
          [
            userId,
            details.id,
            details.threadId ?? message.threadId ?? null,
            subject,
            email,
            name,
            receivedAt,
            details.snippet ?? null,
            importance,
            details,
          ]
        );
        return insert.rows[0]?.id as string | undefined;
      });

      if (inserted) processed += 1;
    }
  } while (pageToken);

  return processed;
};

export const syncUserInbox = async (userId: string, usageKey?: string) => {
  const remainingQuota = await getRemainingQuota(userId, 'emails_processed');
  if (remainingQuota !== null && remainingQuota <= 0) {
    return { processed: 0, quotaBlocked: true };
  }

  const auth = await getAuthContext(userId);
  const processed =
    auth.provider === 'google'
      ? await ingestGmailInbox(
          userId,
          auth.accessToken,
          auth.lastSyncAt ?? null,
          remainingQuota
        )
      : await ingestGraphInbox(
          userId,
          auth.accessToken,
          auth.lastSyncAt ?? null,
          remainingQuota
        );

  await query(
    'UPDATE users SET last_sync_at = now(), updated_at = now() WHERE id = $1',
    [userId]
  );

  if (processed > 0) {
    await consumeUsageMetric({
      userId,
      metric: 'emails_processed',
      units: processed,
      idempotencyKey: `sync:${usageKey ?? `${Date.now()}`}`,
      source: 'sync_user_inbox',
      metadata: { provider: auth.provider },
      enforce: true,
    });

    await agentQueue.add(
      'run-user',
      { userId },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
    );
  }

  return { processed };
};
