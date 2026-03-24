import dotenv from 'dotenv';

dotenv.config();

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

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  port: Number(optional('PORT', '4000')),
  frontendUrl: optional('FRONTEND_URL', 'http://localhost:5173'),
  authCookieName: optional('AUTH_COOKIE_NAME', 'sil_auth'),

  databaseUrl: required('DATABASE_URL'),
  redisUrl: required('REDIS_URL'),

  authJwtSecret: required('AUTH_JWT_SECRET'),
  authJwtIssuer: optional('AUTH_JWT_ISSUER', 'student-intel'),
  authJwtAudience: optional('AUTH_JWT_AUDIENCE', 'student-intel-web'),
  tokenEncKey: required('TOKEN_ENC_KEY'),

  msClientId: required('MS_CLIENT_ID'),
  msClientSecret: required('MS_CLIENT_SECRET'),
  msTenantId: optional('MS_TENANT_ID', 'common'),
  msRedirectUri: required('MS_REDIRECT_URI'),
  msScopes: optional('MS_SCOPES', 'offline_access User.Read Mail.Read Mail.ReadWrite Calendars.ReadWrite'),
  msWebhookNotificationUrl: optional('MS_WEBHOOK_NOTIFICATION_URL', ''),

  googleClientId: optional('GOOGLE_CLIENT_ID', ''),
  googleClientSecret: optional('GOOGLE_CLIENT_SECRET', ''),
  googleRedirectUri: optional('GOOGLE_REDIRECT_URI', ''),
  googleScopes: optional(
    'GOOGLE_SCOPES',
    'openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar'
  ),

  aiProvider: optional('AI_PROVIDER', 'openrouter'),
  aiModel: optional('AI_MODEL', 'google/gemini-1.5-pro-latest'),
  openrouterApiKey: optional('OPENROUTER_API_KEY', ''),
  groqApiKey: optional('GROQ_API_KEY', ''),
  geminiApiKey: optional('GEMINI_API_KEY', ''),
  aiTimeoutMs: Number(optional('AI_TIMEOUT_MS', '20000')),
  aiMaxRetries: Number(optional('AI_MAX_RETRIES', '2')),
  agentLoopMaxMs: Number(optional('AGENT_LOOP_MAX_MS', '8000')),

  syncBatchSize: Number(optional('SYNC_BATCH_SIZE', '50')),
  cacheTtlSeconds: Number(optional('CACHE_TTL_SECONDS', '60'))
};
