import { env } from '../config/env.js';
import { fetchWithTimeout, safeJson } from '../utils/http.js';

export type GraphTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  id_token?: string;
  token_type: string;
};

export type GraphProfile = {
  id: string;
  displayName: string;
  mail?: string;
  userPrincipalName?: string;
};

export type GraphMessage = {
  id: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime?: string;
  importance?: string;
  from?: {
    emailAddress?: {
      address?: string;
      name?: string;
    };
  };
  webLink?: string;
};

const baseAuthUrl = `https://login.microsoftonline.com/${env.msTenantId}/oauth2/v2.0`;

export const getAuthUrl = (state: string) => {
  const params = new URLSearchParams({
    client_id: env.msClientId,
    response_type: 'code',
    redirect_uri: env.msRedirectUri,
    response_mode: 'query',
    scope: env.msScopes,
    state
  });
  return `${baseAuthUrl}/authorize?${params.toString()}`;
};

export const exchangeCodeForToken = async (code: string): Promise<GraphTokenResponse> => {
  const body = new URLSearchParams({
    client_id: env.msClientId,
    client_secret: env.msClientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: env.msRedirectUri,
    scope: env.msScopes
  });

  const response = await fetchWithTimeout(`${baseAuthUrl}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  }, env.aiTimeoutMs);

  return safeJson<GraphTokenResponse>(response);
};

export const refreshAccessToken = async (refreshToken: string): Promise<GraphTokenResponse> => {
  const body = new URLSearchParams({
    client_id: env.msClientId,
    client_secret: env.msClientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: env.msScopes
  });

  const response = await fetchWithTimeout(`${baseAuthUrl}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  }, env.aiTimeoutMs);

  return safeJson<GraphTokenResponse>(response);
};

export const getProfile = async (accessToken: string): Promise<GraphProfile> => {
  const response = await fetchWithTimeout('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` }
  }, env.aiTimeoutMs);
  return safeJson<GraphProfile>(response);
};

export const listMessages = async (accessToken: string, options: {
  top?: number;
  receivedAfter?: string;
  nextLink?: string;
}) => {
  if (options.nextLink) {
    const response = await fetchWithTimeout(options.nextLink, {
      headers: { Authorization: `Bearer ${accessToken}` }
    }, env.aiTimeoutMs);
    return safeJson<any>(response);
  }

  const params = new URLSearchParams({
    $top: String(options.top ?? 25),
    $orderby: 'receivedDateTime DESC',
    $select: 'id,conversationId,subject,bodyPreview,receivedDateTime,importance,from,webLink'
  });
  if (options.receivedAfter) {
    params.set('$filter', `receivedDateTime ge ${options.receivedAfter}`);
  }

  const url = `https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages?${params.toString()}`;
  const response = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  }, env.aiTimeoutMs);
  return safeJson<any>(response);
};

export const getMessage = async (accessToken: string, messageId: string) => {
  const response = await fetchWithTimeout(`https://graph.microsoft.com/v1.0/me/messages/${messageId}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  }, env.aiTimeoutMs);
  return safeJson<any>(response);
};

export const patchMessage = async (accessToken: string, messageId: string, payload: Record<string, unknown>) => {
  const response = await fetchWithTimeout(`https://graph.microsoft.com/v1.0/me/messages/${messageId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  }, env.aiTimeoutMs);

  if (response.status === 204) {
    return {};
  }

  return safeJson<any>(response);
};

export const moveMessage = async (accessToken: string, messageId: string, destinationId: string) => {
  const response = await fetchWithTimeout(`https://graph.microsoft.com/v1.0/me/messages/${messageId}/move`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ destinationId })
  }, env.aiTimeoutMs);
  return safeJson<any>(response);
};

export const listMailFolders = async (accessToken: string) => {
  const response = await fetchWithTimeout('https://graph.microsoft.com/v1.0/me/mailFolders?$select=id,displayName,wellKnownName', {
    headers: { Authorization: `Bearer ${accessToken}` }
  }, env.aiTimeoutMs);
  return safeJson<any>(response);
};

export const createSubscription = async (accessToken: string, payload: {
  resource: string;
  changeType: string;
  notificationUrl: string;
  expirationDateTime: string;
  clientState: string;
}) => {
  const response = await fetchWithTimeout('https://graph.microsoft.com/v1.0/subscriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  }, env.aiTimeoutMs);
  return safeJson<any>(response);
};

export const listEvents = async (accessToken: string, top = 10) => {
  const params = new URLSearchParams({
    $top: String(top),
    $orderby: 'start/dateTime ASC',
    $select: 'id,subject,start'
  });
  const url = `https://graph.microsoft.com/v1.0/me/events?${params.toString()}`;
  const response = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  }, env.aiTimeoutMs);
  return safeJson<any>(response);
};
