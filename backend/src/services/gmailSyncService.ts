import { google } from 'googleapis';
import { query } from '../db/index.js';
import { createOAuth2Client, refreshUserGoogleToken } from './googleAuth.js';
import { redisCache } from '../redis/index.js';
import { renewLock } from '../utils/redisLua.js';
import { env } from '../config/env.js';
import { AppError, ErrorCode } from '../errors/AppError.js';

export interface AttachmentMeta {
  attachmentId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

const MIME_MAX_DEPTH = 8;
const MIME_MAX_PARTS = 50;
const BODY_MAX_DECODED_CHARS = 50_000;

export const extractAttachmentMetadata = (
  part: any,
  depth: number = 0,
  partCount: { n: number } = { n: 0 }
): AttachmentMeta[] => {
  const attachments: AttachmentMeta[] = [];
  if (!part || depth > MIME_MAX_DEPTH || partCount.n > MIME_MAX_PARTS) return attachments;
  partCount.n++;

  if (part.filename && part.body?.attachmentId) {
    const rawFilename: string = String(part.filename).replace(/[/\\]/g, '_').substring(0, 255);
    attachments.push({
      attachmentId: String(part.body.attachmentId).substring(0, 200),
      filename: rawFilename,
      mimeType: String(part.mimeType || 'application/octet-stream').substring(0, 100),
      sizeBytes: typeof part.body.size === 'number' ? part.body.size : 0,
    });
  }

  if (Array.isArray(part.parts)) {
    for (const subPart of part.parts) {
      if (partCount.n > MIME_MAX_PARTS) break;
      attachments.push(...extractAttachmentMetadata(subPart, depth + 1, partCount));
    }
  }

  return attachments;
};

export const extractBodyText = (
  part: any,
  depth: number = 0,
  partCount: { n: number } = { n: 0 }
): string => {
  if (!part || depth > MIME_MAX_DEPTH || partCount.n > MIME_MAX_PARTS) return '';
  partCount.n++;

  if (part.mimeType === 'text/plain' && part.body?.data) {
    try {
      const decoded = Buffer.from(part.body.data, 'base64').toString('utf8');
      return decoded.substring(0, BODY_MAX_DECODED_CHARS);
    } catch {
      return '';
    }
  }

  if (Array.isArray(part.parts)) {
    for (const subPart of part.parts) {
      if (partCount.n > MIME_MAX_PARTS) break;
      const text = extractBodyText(subPart, depth + 1, partCount);
      if (text) return text;
    }
  }

  if (part.mimeType === 'text/html' && part.body?.data) {
    try {
      const raw = Buffer.from(part.body.data, 'base64').toString('utf8');
      const cleaned = raw
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return cleaned.substring(0, BODY_MAX_DECODED_CHARS);
    } catch {
      return '';
    }
  }

  return '';
};

export const parseHeader = (headers: any[], name: string): string => {
  if (!Array.isArray(headers)) return '';
  const match = headers.find(
    (h) => h?.name && String(h.name).toLowerCase() === name.toLowerCase()
  );
  return match?.value ? String(match.value) : '';
};

export class GmailSyncService {
  private static async getGmailClient(userId: string) {
    const accessToken = await refreshUserGoogleToken(userId);
    const client = createOAuth2Client();
    client.setCredentials({ access_token: accessToken });
    return google.gmail({ version: 'v1', auth: client });
  }

  public static isInvalidHistoryCursorError(error: any): boolean {
    const is404or400 = error?.code === 404 || error?.code === 400;
    if (!is404or400) return false;

    const msg = (error?.message || '').toLowerCase();
    const errors: any[] = Array.isArray(error?.errors) ? error.errors : [];

    const hasHistoryMention =
      msg.includes('historyid') ||
      msg.includes('invalid_history_id') ||
      msg.includes('starthistoryid') ||
      msg.includes('invalid history id');

    const hasHistoryError = errors.some(
      (e: any) =>
        e?.reason === 'invalidArgument' &&
        ((e?.message || '').toLowerCase().includes('historyid') ||
          (e?.message || '').toLowerCase().includes('history id'))
    );

    return hasHistoryMention || hasHistoryError;
  }

  public static async performSync(
    userId: string,
    syncRunId: string,
    lockKey: string,
    lockToken: string,
    injectedGmailClient?: any
  ): Promise<void> {
    const checkAndRenewLock = async () => {
      const renewed = await renewLock(redisCache, lockKey, lockToken, 90_000);
      if (!renewed) {
        throw new AppError(ErrorCode.LOCK_OWNERSHIP_LOST, 'Sync lock ownership lost — aborting', 500);
      }
    };

    try {
      const stateRes = await query(
        `SELECT history_id FROM provider_sync_states WHERE user_id = $1 AND provider = 'google'`,
        [userId]
      );
      const historyId: string | null = stateRes.rows[0]?.history_id || null;

      if (!historyId) {
        await this.performInitialSync(userId, syncRunId, checkAndRenewLock, injectedGmailClient);
      } else {
        try {
          await this.performIncrementalSync(userId, historyId, syncRunId, checkAndRenewLock, injectedGmailClient);
        } catch (error: any) {
          if (this.isInvalidHistoryCursorError(error)) {
            console.warn(
              `[Gmail Sync] Confirmed invalid history cursor for user ${userId}. Failing over to reconciliation.`
            );
            await this.performReconciliationSync(userId, syncRunId, checkAndRenewLock, injectedGmailClient);
          } else {
            throw error;
          }
        }
      }
    } catch (error: any) {
      const safeCode = error instanceof AppError ? error.code : ErrorCode.GMAIL_SYNC_FAILED;

      await query(
        `UPDATE sync_runs SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2`,
        [safeCode, syncRunId]
      );
      await query(
        `UPDATE provider_sync_states SET sync_status = 'error', error_message = $1, updated_at = NOW()
         WHERE user_id = $2 AND provider = 'google'`,
        [safeCode, userId]
      );
      throw error;
    }
  }

  public static async performInitialSync(
    userId: string,
    syncRunId: string,
    checkAndRenewLock: () => Promise<void>,
    injectedGmailClient?: any
  ): Promise<void> {
    const gmail = injectedGmailClient || (await this.getGmailClient(userId));

    await query(
      `UPDATE sync_runs SET sync_type = 'initial', status = 'running', started_at = NOW() WHERE id = $1`,
      [syncRunId]
    );

    let createdCount = 0;
    let updatedCount = 0;
    let failedCount = 0;
    let threadsCount = 0;
    let isTruncated = false;
    let pageToken: string | undefined;

    const profile = await gmail.users.getProfile({ userId: 'me' });
    const latestHistoryId: string | null = profile.data.historyId ? String(profile.data.historyId) : null;

    const MAX_MESSAGES = env.INITIAL_SYNC_MAX_MESSAGES;

    while (createdCount + updatedCount < MAX_MESSAGES) {
      await checkAndRenewLock();

      const listRes = await gmail.users.messages.list({
        userId: 'me',
        maxResults: 100,
        pageToken,
      });

      const messages = listRes.data.messages || [];
      if (messages.length === 0) break;

      for (const msgRef of messages) {
        if (createdCount + updatedCount >= MAX_MESSAGES) {
          isTruncated = true;
          break;
        }
        if (!msgRef.id) continue;

        try {
          const res = await this.ingestSingleMessage(gmail, userId, msgRef.id);
          if (res.created) createdCount++;
          else updatedCount++;
          if (res.threadCreated) threadsCount++;
        } catch (err: unknown) {
          console.error(`[Gmail Sync] Failed to ingest message (user: ${userId})`);
          failedCount++;
        }
      }

      pageToken = listRes.data.nextPageToken || undefined;
      if (!pageToken) break;
    }

    if (createdCount + updatedCount >= MAX_MESSAGES) {
      isTruncated = true;
    }

    // Persist metrics BEFORE advancing history cursor
    await query(
      `UPDATE sync_runs
       SET status = 'completed', history_id_end = $1, messages_processed = $2,
           created_count = $3, updated_count = $4, failed_count = $5,
           threads_processed = $6, is_truncated = $7, completed_at = NOW()
       WHERE id = $8`,
      [
        latestHistoryId,
        createdCount + updatedCount,
        createdCount,
        updatedCount,
        failedCount,
        threadsCount,
        isTruncated,
        syncRunId,
      ]
    );

    // Advance cursor ONLY after DB metrics are committed
    await query(
      `UPDATE provider_sync_states
       SET history_id = $1, last_synced_at = NOW(), sync_status = 'idle', error_message = NULL, updated_at = NOW()
       WHERE user_id = $2 AND provider = 'google'`,
      [latestHistoryId, userId]
    );
  }

  public static async performIncrementalSync(
    userId: string,
    startHistoryId: string,
    syncRunId: string,
    checkAndRenewLock: () => Promise<void>,
    injectedGmailClient?: any
  ): Promise<void> {
    const gmail = injectedGmailClient || (await this.getGmailClient(userId));

    await query(
      `UPDATE sync_runs SET sync_type = 'incremental', status = 'running', history_id_start = $1, started_at = NOW()
       WHERE id = $2`,
      [startHistoryId, syncRunId]
    );

    let createdCount = 0;
    let updatedCount = 0;
    let deletedCount = 0;
    let failedCount = 0;
    let threadsCount = 0;

    let pageToken: string | undefined;
    let nextHistoryId: string = startHistoryId;

    do {
      await checkAndRenewLock();

      const historyRes = await gmail.users.history.list({
        userId: 'me',
        startHistoryId,
        pageToken,
      });

      if (historyRes.data.historyId) {
        nextHistoryId = String(historyRes.data.historyId);
      }

      const histories = historyRes.data.history || [];

      const addedIds = new Set<string>();
      const deletedIds = new Set<string>();
      const labelChangeIds = new Set<string>();

      for (const h of histories) {
        for (const added of h.messagesAdded || []) {
          if (added.message?.id) addedIds.add(added.message.id);
        }
        for (const deleted of h.messagesDeleted || []) {
          if (deleted.message?.id) deletedIds.add(deleted.message.id);
        }
        for (const la of h.labelsAdded || []) {
          if (la.message?.id) labelChangeIds.add(la.message.id);
        }
        for (const lr of h.labelsRemoved || []) {
          if (lr.message?.id) labelChangeIds.add(lr.message.id);
        }
      }

      for (const msgId of addedIds) {
        try {
          const res = await this.ingestSingleMessage(gmail, userId, msgId);
          if (res.created) createdCount++;
          else updatedCount++;
          if (res.threadCreated) threadsCount++;
        } catch {
          failedCount++;
        }
      }

      for (const msgId of deletedIds) {
        if (addedIds.has(msgId)) continue;
        try {
          const delRes = await query(
            `UPDATE emails SET is_deleted = TRUE, status = 'deleted'
             WHERE user_id = $1 AND google_message_id = $2 AND is_deleted = FALSE`,
            [userId, msgId]
          );
          if ((delRes.rowCount ?? 0) > 0) deletedCount++;
        } catch {
          failedCount++;
        }
      }

      for (const msgId of labelChangeIds) {
        if (deletedIds.has(msgId)) continue;
        try {
          const msgData = await gmail.users.messages.get({
            userId: 'me',
            id: msgId,
            format: 'minimal',
          });
          const labels = msgData.data.labelIds || [];
          await query(
            `UPDATE emails SET labels = $1, updated_at = NOW()
             WHERE user_id = $2 AND google_message_id = $3`,
            [labels, userId, msgId]
          );
          updatedCount++;
        } catch {
          failedCount++;
        }
      }

      pageToken = historyRes.data.nextPageToken || undefined;
    } while (pageToken);

    await query(
      `UPDATE sync_runs
       SET status = 'completed', history_id_end = $1, messages_processed = $2,
           created_count = $3, updated_count = $4, deleted_count = $5,
           failed_count = $6, threads_processed = $7, completed_at = NOW()
       WHERE id = $8`,
      [
        nextHistoryId,
        createdCount + updatedCount + deletedCount,
        createdCount,
        updatedCount,
        deletedCount,
        failedCount,
        threadsCount,
        syncRunId,
      ]
    );

    await query(
      `UPDATE provider_sync_states
       SET history_id = $1, last_synced_at = NOW(), sync_status = 'idle', error_message = NULL, updated_at = NOW()
       WHERE user_id = $2 AND provider = 'google'`,
      [nextHistoryId, userId]
    );
  }

  public static async performReconciliationSync(
    userId: string,
    syncRunId: string,
    checkAndRenewLock: () => Promise<void>,
    injectedGmailClient?: any
  ): Promise<void> {
    await query(
      `UPDATE provider_sync_states SET history_id = NULL WHERE user_id = $1 AND provider = 'google'`,
      [userId]
    );
    await query(
      `UPDATE sync_runs SET sync_type = 'reconciliation' WHERE id = $1`,
      [syncRunId]
    );
    await this.performInitialSync(userId, syncRunId, checkAndRenewLock, injectedGmailClient);
  }

  private static async ingestSingleMessage(
    gmail: any,
    userId: string,
    googleMessageId: string
  ): Promise<{ created: boolean; threadCreated: boolean }> {
    const msgRes = await gmail.users.messages.get({
      userId: 'me',
      id: googleMessageId,
      format: 'full',
    });

    const msg = msgRes.data;
    if (!msg) throw new AppError(ErrorCode.GMAIL_MESSAGE_FETCH_FAILED, `Empty message response for ${googleMessageId}`, 502);

    const payload = msg.payload || {};
    const headers: any[] = payload.headers || [];

    const fromRaw = parseHeader(headers, 'From');
    const subject = parseHeader(headers, 'Subject') || '(No Subject)';
    const dateRaw = parseHeader(headers, 'Date');

    let receivedAt: Date;
    try {
      const parsed = dateRaw ? new Date(dateRaw) : null;
      receivedAt = parsed && !isNaN(parsed.getTime()) ? parsed : new Date();
    } catch {
      receivedAt = new Date();
    }

    const senderMatch = fromRaw.match(/<([^>]+)>/);
    const senderEmail = senderMatch
      ? senderMatch[1].substring(0, 254)
      : fromRaw.trim().substring(0, 254);
    const senderName = senderMatch
      ? fromRaw.replace(/<[^>]+>/, '').trim().substring(0, 200)
      : senderEmail;

    const bodyText = extractBodyText(payload);
    const attachmentMeta = extractAttachmentMetadata(payload);
    const labels: string[] = Array.isArray(msg.labelIds) ? msg.labelIds : [];

    let threadDbId: string | null = null;
    let threadCreated = false;

    if (msg.threadId) {
      const threadRes = await query(
        `INSERT INTO email_threads (user_id, google_thread_id, snippet, history_id, last_message_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, google_thread_id) DO UPDATE SET
           snippet        = EXCLUDED.snippet,
           history_id     = EXCLUDED.history_id,
           message_count  = email_threads.message_count + 1,
           last_message_at = GREATEST(email_threads.last_message_at, EXCLUDED.last_message_at),
           updated_at     = NOW()
         RETURNING id, (xmax = 0) AS inserted`,
        [
          userId,
          String(msg.threadId).substring(0, 200),
          String(msg.snippet || '').substring(0, 500),
          msg.historyId ? String(msg.historyId) : null,
          receivedAt,
        ]
      );
      threadDbId = threadRes.rows[0]?.id || null;
      threadCreated = Boolean(threadRes.rows[0]?.inserted);
    }

    const emailRes = await query(
      `INSERT INTO emails (
         user_id, google_message_id, google_thread_id, thread_id,
         sender_email, sender_name, subject, body_text, received_at,
         labels, attachment_metadata, ingestion_status, ai_processing_status, processed_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'ingested', 'unprocessed', NOW())
       ON CONFLICT (user_id, google_message_id) DO UPDATE SET
         labels              = EXCLUDED.labels,
         attachment_metadata = EXCLUDED.attachment_metadata,
         ingestion_status    = 'ingested'
       RETURNING (xmax = 0) AS created`,
      [
        userId,
        String(msg.id).substring(0, 200),
        msg.threadId ? String(msg.threadId).substring(0, 200) : null,
        threadDbId,
        senderEmail,
        senderName,
        subject.substring(0, 998),
        bodyText,
        receivedAt,
        labels,
        JSON.stringify(attachmentMeta),
      ]
    );

    return {
      created: Boolean(emailRes.rows[0]?.created),
      threadCreated,
    };
  }
}
