import { env } from '../config/env.js';
import { assertOk, fetchWithTimeout, safeJson } from '../utils/http.js';

export type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type: string;
  id_token?: string;
};

export type GoogleProfile = {
  sub: string;
  email: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  locale?: string;
};

const googleAuthUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
const googleTokenUrl = 'https://oauth2.googleapis.com/token';
const googleProfileUrl = 'https://openidconnect.googleapis.com/v1/userinfo';

const ensureGoogleConfig = () => {
  if (
    !env.googleClientId ||
    !env.googleClientSecret ||
    !env.googleRedirectUri
  ) {
    throw new Error('Google OAuth is not configured');
  }
};

export const getGoogleAuthUrl = (state: string) => {
  ensureGoogleConfig();
  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: env.googleRedirectUri,
    response_type: 'code',
    scope: env.googleScopes,
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    state,
  });
  return `${googleAuthUrl}?${params.toString()}`;
};

export const exchangeGoogleCode = async (
  code: string
): Promise<GoogleTokenResponse> => {
  ensureGoogleConfig();
  const body = new URLSearchParams({
    client_id: env.googleClientId,
    client_secret: env.googleClientSecret,
    redirect_uri: env.googleRedirectUri,
    grant_type: 'authorization_code',
    code,
  });

  const response = await fetchWithTimeout(
    googleTokenUrl,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    },
    env.aiTimeoutMs
  );

  await assertOk(response, 'Google OAuth token exchange');
  return safeJson<GoogleTokenResponse>(response);
};

export const refreshGoogleAccessToken = async (
  refreshToken: string
): Promise<GoogleTokenResponse> => {
  ensureGoogleConfig();
  const body = new URLSearchParams({
    client_id: env.googleClientId,
    client_secret: env.googleClientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const response = await fetchWithTimeout(
    googleTokenUrl,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    },
    env.aiTimeoutMs
  );

  await assertOk(response, 'Google OAuth token refresh');
  return safeJson<GoogleTokenResponse>(response);
};

export const getGoogleProfile = async (
  accessToken: string
): Promise<GoogleProfile> => {
  const response = await fetchWithTimeout(
    googleProfileUrl,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    env.aiTimeoutMs
  );
  await assertOk(response, 'Google profile fetch');
  return safeJson<GoogleProfile>(response);
};

export const listGmailMessages = async (
  accessToken: string,
  options: {
    maxResults?: number;
    pageToken?: string;
    q?: string;
    includeSpamTrash?: boolean;
  }
) => {
  const params = new URLSearchParams();
  if (options.maxResults) params.set('maxResults', String(options.maxResults));
  if (options.pageToken) params.set('pageToken', options.pageToken);
  if (options.q) params.set('q', options.q);
  if (options.includeSpamTrash) params.set('includeSpamTrash', 'true');

  const response = await fetchWithTimeout(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    env.aiTimeoutMs
  );

  await assertOk(response, 'Gmail list messages');
  return safeJson<any>(response);
};

export const getGmailMessage = async (
  accessToken: string,
  messageId: string
) => {
  const params = new URLSearchParams({ format: 'metadata' });
  params.append('metadataHeaders', 'From');
  params.append('metadataHeaders', 'Subject');
  params.append('metadataHeaders', 'Date');
  params.append('metadataHeaders', 'Message-Id');
  const response = await fetchWithTimeout(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    env.aiTimeoutMs
  );
  await assertOk(response, 'Gmail get message');
  return safeJson<any>(response);
};

const base64UrlEncode = (value: string) =>
  Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const buildRawMessage = (input: {
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string | null;
  references?: string | null;
}) => {
  const headers = [
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
  ];
  if (input.inReplyTo) headers.push(`In-Reply-To: ${input.inReplyTo}`);
  if (input.references) headers.push(`References: ${input.references}`);
  const message = `${headers.join('\r\n')}\r\n\r\n${input.body}`;
  return base64UrlEncode(message);
};

export const createGmailDraft = async (
  accessToken: string,
  input: {
    to: string;
    subject: string;
    body: string;
    threadId?: string | null;
    inReplyTo?: string | null;
    references?: string | null;
  }
) => {
  const raw = buildRawMessage(input);
  const response = await fetchWithTimeout(
    'https://gmail.googleapis.com/gmail/v1/users/me/drafts',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          raw,
          threadId: input.threadId ?? undefined,
        },
      }),
    },
    env.aiTimeoutMs
  );

  await assertOk(response, 'Gmail create draft');
  return safeJson<any>(response);
};

export const sendGmailDraft = async (accessToken: string, draftId: string) => {
  const response = await fetchWithTimeout(
    'https://gmail.googleapis.com/gmail/v1/users/me/drafts/send',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: draftId }),
    },
    env.aiTimeoutMs
  );

  await assertOk(response, 'Gmail send draft');
  return safeJson<any>(response);
};

export const deleteGmailDraft = async (
  accessToken: string,
  draftId: string
) => {
  await fetchWithTimeout(
    `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${draftId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    env.aiTimeoutMs
  ).then((response) => assertOk(response, 'Gmail delete draft'));
};

export const modifyGmailMessage = async (
  accessToken: string,
  messageId: string,
  input: {
    addLabelIds?: string[];
    removeLabelIds?: string[];
  }
) => {
  const response = await fetchWithTimeout(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        addLabelIds: input.addLabelIds ?? [],
        removeLabelIds: input.removeLabelIds ?? [],
      }),
    },
    env.aiTimeoutMs
  );

  await assertOk(response, 'Gmail modify message');
  return safeJson<any>(response);
};

export const archiveGmailMessage = async (
  accessToken: string,
  messageId: string
) => {
  return modifyGmailMessage(accessToken, messageId, {
    removeLabelIds: ['INBOX'],
  });
};

export const trashGmailMessage = async (
  accessToken: string,
  messageId: string
) => {
  const response = await fetchWithTimeout(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/trash`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    env.aiTimeoutMs
  );
  await assertOk(response, 'Gmail trash message');
  return safeJson<any>(response);
};

export const untrashGmailMessage = async (
  accessToken: string,
  messageId: string
) => {
  const response = await fetchWithTimeout(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/untrash`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    env.aiTimeoutMs
  );
  await assertOk(response, 'Gmail untrash message');
  return safeJson<any>(response);
};

export const listGoogleEvents = async (
  accessToken: string,
  maxResults = 10
) => {
  const params = new URLSearchParams({
    maxResults: String(maxResults),
    orderBy: 'startTime',
    singleEvents: 'true',
    timeMin: new Date().toISOString(),
  });
  const response = await fetchWithTimeout(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    env.aiTimeoutMs
  );
  await assertOk(response, 'Google calendar list events');
  return safeJson<any>(response);
};

export const createGoogleCalendarEvent = async (
  accessToken: string,
  input: {
    title: string;
    description?: string;
    start: Date;
    end: Date;
  }
) => {
  const response = await fetchWithTimeout(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: input.title,
        description: input.description ?? '',
        start: { dateTime: input.start.toISOString() },
        end: { dateTime: input.end.toISOString() },
      }),
    },
    env.aiTimeoutMs
  );
  await assertOk(response, 'Google calendar create event');
  return safeJson<any>(response);
};

export const deleteGoogleCalendarEvent = async (
  accessToken: string,
  eventId: string
) => {
  await fetchWithTimeout(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    env.aiTimeoutMs
  ).then((response) => assertOk(response, 'Google calendar delete event'));
};
