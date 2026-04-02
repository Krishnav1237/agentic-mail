import dotenv from 'dotenv';

dotenv.config();

type CookieSameSite = 'lax' | 'strict' | 'none';

const required = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env: ${key}`);
  }
  return value;
};

const optional = (key: string, fallback = ''): string => {
  return process.env[key] ?? fallback;
};

const parseCookieSameSite = (value: string): CookieSameSite => {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'lax' ||
    normalized === 'strict' ||
    normalized === 'none'
  ) {
    return normalized;
  }
  throw new Error(
    `Invalid AUTH_COOKIE_SAME_SITE value: ${value}. Expected lax, strict, or none.`
  );
};

const parseBoolean = (value?: string) => {
  if (value === undefined || value === '') return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(
    `Invalid boolean value: ${value}. Expected true, false, or empty.`
  );
};

const nodeEnv = optional('NODE_ENV', 'development');
const authCookieSameSite = parseCookieSameSite(
  optional('AUTH_COOKIE_SAME_SITE', nodeEnv === 'production' ? 'none' : 'lax')
);
const authCookieSecure =
  parseBoolean(process.env.AUTH_COOKIE_SECURE) ??
  (nodeEnv === 'production' || authCookieSameSite === 'none');

if (authCookieSameSite === 'none' && !authCookieSecure) {
  throw new Error(
    'AUTH_COOKIE_SAME_SITE=none requires AUTH_COOKIE_SECURE=true.'
  );
}

export const env = {
  nodeEnv,
  port: Number(optional('PORT', '4000')),
  frontendUrl: optional('FRONTEND_URL', 'http://localhost:5173'),
  authCookieName: optional('AUTH_COOKIE_NAME', 'iil_auth'),
  authCookieSameSite,
  authCookieSecure,
  securityContact: optional('SECURITY_CONTACT', ''),
  securityPolicyUrl: optional('SECURITY_POLICY_URL', ''),

  databaseUrl: required('DATABASE_URL'),
  redisUrl: required('REDIS_URL'),
  queueRedisUrl: optional('QUEUE_REDIS_URL', ''),
  cacheRedisUrl: optional('CACHE_REDIS_URL', ''),

  authJwtSecret: required('AUTH_JWT_SECRET'),
  authJwtIssuer: optional('AUTH_JWT_ISSUER', 'inbox-intel'),
  authJwtAudience: optional('AUTH_JWT_AUDIENCE', 'inbox-intel-web'),
  tokenEncKey: required('TOKEN_ENC_KEY'),

  // TODO: Microsoft OAuth integration — currently optional, will be required
  // when Outlook support is added as a future project update.
  msClientId: optional('MS_CLIENT_ID', ''),
  msClientSecret: optional('MS_CLIENT_SECRET', ''),
  msTenantId: optional('MS_TENANT_ID', 'common'),
  msRedirectUri: optional(
    'MS_REDIRECT_URI',
    'http://localhost:4000/auth/microsoft/callback'
  ),
  msScopes: optional(
    'MS_SCOPES',
    'offline_access User.Read Mail.Read Mail.ReadWrite Calendars.ReadWrite'
  ),
  msWebhookNotificationUrl: optional('MS_WEBHOOK_NOTIFICATION_URL', ''),

  googleClientId: optional('GOOGLE_CLIENT_ID', ''),
  googleClientSecret: optional('GOOGLE_CLIENT_SECRET', ''),
  googleRedirectUri: optional('GOOGLE_REDIRECT_URI', ''),
  googleScopes: optional(
    'GOOGLE_SCOPES',
    'openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar'
  ),

  resendApiKey: optional('RESEND_API_KEY', ''),
  resendFromEmail: optional('RESEND_FROM_EMAIL', 'onboarding@resend.dev'),

  aiProvider: optional('AI_PROVIDER', 'openrouter'),
  aiModel: optional('AI_MODEL', 'google/gemini-1.5-pro-latest'),
  openrouterApiKey: optional('OPENROUTER_API_KEY', ''),
  groqApiKey: optional('GROQ_API_KEY', ''),
  geminiApiKey: optional('GEMINI_API_KEY', ''),
  aiTimeoutMs: Number(optional('AI_TIMEOUT_MS', '20000')),
  aiMaxRetries: Number(optional('AI_MAX_RETRIES', '2')),
  agentLoopMaxMs: Number(optional('AGENT_LOOP_MAX_MS', '8000')),

  syncBatchSize: Number(optional('SYNC_BATCH_SIZE', '50')),
  cacheTtlSeconds: Number(optional('CACHE_TTL_SECONDS', '60')),
};
