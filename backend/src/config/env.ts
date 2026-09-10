import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Validate a base64-encoded key decodes to exactly `bytes` bytes. */
const base64Bytes = (bytes: number) =>
  z.string().refine(
    (v) => {
      try {
        return Buffer.from(v, 'base64').length === bytes;
      } catch {
        return false;
      }
    },
    { message: `Must be a base64 string encoding exactly ${bytes} bytes` }
  );

// ─── Schema ───────────────────────────────────────────────────────────────────
const envSchema = z.object({
  PORT: z
    .string()
    .default('4000')
    .transform((v) => parseInt(v, 10))
    .refine((n) => n > 0 && n < 65536, 'PORT must be 1–65535'),

  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  FRONTEND_URL: z.string().url('FRONTEND_URL must be a valid URL').default('http://localhost:5173'),

  // Defaults to what docker-compose.yml publishes, so a fresh clone works with
  // `docker compose up` and no .env at all. Must stay in sync with both
  // docker-compose.yml and .env.example — the same database described in three
  // places.
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .default('postgres://postgres:postgres@localhost:5434/inbox_intel'),

  REDIS_URL: z
    .string()
    .min(1, 'REDIS_URL is required')
    .default('redis://localhost:6379'),

  // Configurable trust proxy setting. Default is '0' (disabled) in dev/test.
  // In production, TRUST_PROXY must be explicitly set to '1' (or topology setting).
  TRUST_PROXY: z.string().default('0'),

  // JWT secret must be at least 32 characters to have meaningful HMAC strength
  AUTH_JWT_SECRET: z
    .string()
    .min(32, 'AUTH_JWT_SECRET must be at least 32 characters')
    .default('development-jwt-secret-min-32-chars-long-key'),

  AUTH_JWT_ISSUER: z.string().default('obligo-api'),
  AUTH_JWT_AUDIENCE: z.string().default('obligo-app'),

  // Must decode to exactly 32 bytes (AES-256 requires 256-bit key)
  TOKEN_ENC_KEY: base64Bytes(32).default('MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE='),

  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_REDIRECT_URI: z
    .string()
    .url('GOOGLE_REDIRECT_URI must be a valid URL')
    .default('http://localhost:4000/auth/google/callback'),

  // AI provider config
  AI_PROVIDER: z.enum(['gemini', 'openrouter', 'groq', 'disabled']).default('gemini'),
  AI_MODEL: z.string().min(1).default('gemini-flash-latest'),
  GEMINI_API_KEY: z.string().optional().default(''),
  OPENROUTER_API_KEY: z.string().optional().default(''),
  GROQ_API_KEY: z.string().optional().default(''),

  // Controls whether deterministic fallback may run when no AI key is present.
  AI_FALLBACK_ENABLED: z
    .string()
    .optional()
    .default('false')
    .transform((v) => v === 'true'),

  // Maximum email body characters sent to the AI model
  AI_MAX_INPUT_CHARS: z
    .string()
    .optional()
    .default('6000')
    .transform((v) => parseInt(v, 10))
    .refine((n) => n > 0 && n <= 50000, 'AI_MAX_INPUT_CHARS must be 1–50000'),

  // Maximum messages fetched during initial Gmail sync
  INITIAL_SYNC_MAX_MESSAGES: z
    .string()
    .optional()
    .default('500')
    .transform((v) => parseInt(v, 10))
    .refine((n) => n > 0 && n <= 5000, 'INITIAL_SYNC_MAX_MESSAGES must be 1–5000'),

  // AI request timeout in milliseconds
  AI_REQUEST_TIMEOUT_MS: z
    .string()
    .optional()
    .default('30000')
    .transform((v) => parseInt(v, 10))
    .refine((n) => n >= 1000 && n <= 120000, 'AI_REQUEST_TIMEOUT_MS must be 1000–120000'),

  // ─── Telegram integration ────────────────────────────────────────────────
  // All three are optional-with-empty-default so a dev environment without a
  // bot still boots. When unset, /integrations/telegram's connect and test
  // routes return TELEGRAM_NOT_CONFIGURED rather than failing obscurely, and
  // GET/PUT (preferences only) keep working — see routes/integrations.ts.
  // NEVER log TELEGRAM_BOT_TOKEN or TELEGRAM_WEBHOOK_SECRET.
  TELEGRAM_BOT_TOKEN: z.string().optional().default(''),

  // The bot's @username, without the leading '@'. Used only to build the
  // t.me deep link handed to the client by POST /integrations/telegram/connect.
  TELEGRAM_BOT_USERNAME: z.string().optional().default(''),

  // Shared secret Telegram echoes back in X-Telegram-Bot-Api-Secret-Token on
  // every webhook delivery. This is the webhook's ONLY authentication — it has
  // no JWT session — so it must be long enough to be unguessable when set.
  TELEGRAM_WEBHOOK_SECRET: z
    .string()
    .optional()
    .default('')
    .refine(
      (v) => v === '' || v.length >= 32,
      'TELEGRAM_WEBHOOK_SECRET must be at least 32 characters when set'
    ),

  // ─── Validation infrastructure ───────────────────────────────────────────
  // Pre-shared secret for internal validation API endpoints.
  // Must be at least 32 characters. Disabled (empty) by default.
  // NEVER log this value. NEVER expose it in API responses.
  // Store only in environment configuration.
  VALIDATION_TOKEN: z
    .string()
    .optional()
    .default(''),

  // Controls email noise scoring behaviour.
  // off    — scoring disabled entirely (default in production and test)
  // shadow — score is computed and stored but does not affect extraction pipeline
  // active — scoring affects queue priority (NOT enabled in production during this task)
  EMAIL_SCORING_MODE: z
    .enum(['off', 'shadow', 'active'])
    .default('off'),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('[Obligo] Environment configuration error:');
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  const parsed = result.data;

  // Production-only hard requirements
  if (parsed.NODE_ENV === 'production') {
    const failures: string[] = [];
    if (parsed.EMAIL_SCORING_MODE === 'active') {
      failures.push('EMAIL_SCORING_MODE=active is rejected in production before real extraction quality measurements exist');
    }
    if (!parsed.GOOGLE_CLIENT_ID) failures.push('GOOGLE_CLIENT_ID required in production');
    if (!parsed.GOOGLE_CLIENT_SECRET) failures.push('GOOGLE_CLIENT_SECRET required in production');
    if (parsed.AUTH_JWT_SECRET === 'development-jwt-secret-min-32-chars-long-key') {
      failures.push('AUTH_JWT_SECRET must not use the development default in production');
    }
    if (parsed.TOKEN_ENC_KEY === 'MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=') {
      failures.push('TOKEN_ENC_KEY must not use the development default in production');
    }
    if (parsed.TRUST_PROXY === '0') {
      failures.push('TRUST_PROXY must be explicitly configured in production (e.g. TRUST_PROXY=1 for single-hop proxy topology)');
    }
    // A configured bot with an unauthenticated webhook is worse than no bot:
    // the webhook is the one route with no JWT session, so the secret is its
    // only gate. Either run the integration properly or leave it off.
    if (parsed.TELEGRAM_BOT_TOKEN && !parsed.TELEGRAM_WEBHOOK_SECRET) {
      failures.push('TELEGRAM_WEBHOOK_SECRET is required in production whenever TELEGRAM_BOT_TOKEN is set');
    }
    if (parsed.TELEGRAM_BOT_TOKEN && !parsed.TELEGRAM_BOT_USERNAME) {
      failures.push('TELEGRAM_BOT_USERNAME is required in production whenever TELEGRAM_BOT_TOKEN is set');
    }
    if (failures.length > 0) {
      console.error('[Obligo] Production environment check failed:');
      failures.forEach((f) => console.error(`  ${f}`));
      process.exit(1);
    }
  }

  return parsed;
}

export const env: Env = parseEnv();
