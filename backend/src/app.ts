import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import { env } from './config/env.js';
import { checkDatabaseHealth } from './db/index.js';
import { checkRedisHealth } from './redis/index.js';
import { authRouter } from './routes/auth.js';
import { emailsRouter } from './routes/emails.js';
import { threadsRouter } from './routes/threads.js';
import { syncRouter } from './routes/sync.js';
import { preferencesRouter } from './routes/preferences.js';
import { profileRouter } from './routes/profile.js';
import { integrationsRouter } from './routes/integrations.js';
import { validationRouter } from './routes/validation.js';
import { AppError, ErrorCode } from './errors/AppError.js';

export function createApp() {
  const app = express();

  // ─── Security headers ────────────────────────────────────────────────────────
  app.use(helmet());

  // Trust proxy configuration mapping:
  // '0' or 'false' -> false (disabled; ignores X-Forwarded-For headers)
  // '1' or 'true'  -> 1 (trust single-hop proxy)
  // Integer N      -> N (trust N proxy hops)
  let trustProxyVal: boolean | number = false;
  if (env.TRUST_PROXY === '0' || env.TRUST_PROXY === 'false') {
    trustProxyVal = false;
  } else if (env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true') {
    trustProxyVal = 1;
  } else if (!isNaN(Number(env.TRUST_PROXY))) {
    trustProxyVal = Number(env.TRUST_PROXY);
  } else {
    trustProxyVal = env.TRUST_PROXY as any;
  }

  app.set('trust proxy', trustProxyVal);

  // ─── CORS ────────────────────────────────────────────────────────────────────
  const ALLOWED_ORIGINS = new Set([env.FRONTEND_URL]);

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (ALLOWED_ORIGINS.has(origin)) return callback(null, true);
        if (env.NODE_ENV !== 'production' && origin.endsWith('.vercel.app')) {
          return callback(null, true);
        }
        callback(null, false);
      },
      credentials: true,
    })
  );

  // ─── Request ID middleware ────────────────────────────────────────────────────
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = crypto.randomBytes(8).toString('hex');
    (req as any).requestId = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  });

  // ─── Body parsing (bounded) ───────────────────────────────────────────────────
  app.use(cookieParser());
  app.use(express.json({ limit: '512kb' }));
  app.use(express.urlencoded({ extended: true, limit: '512kb' }));

  // ─── Health probes (no auth required) ────────────────────────────────────────
  app.get('/health/live', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'live', timestamp: new Date().toISOString() });
  });

  app.get('/health/ready', async (_req: Request, res: Response) => {
    const dbOk = await checkDatabaseHealth();
    const redisOk = await checkRedisHealth();
    const healthy = dbOk && redisOk;

    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ready' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        database: dbOk ? 'up' : 'down',
        redis: redisOk ? 'up' : 'down',
      },
    });
  });

  // ─── Application routes ───────────────────────────────────────────────────────
  app.use('/auth', authRouter);
  app.use('/emails', emailsRouter);
  app.use('/threads', threadsRouter);
  app.use('/sync', syncRouter);
  app.use('/preferences', preferencesRouter);
  app.use('/profile', profileRouter);
  // Telegram lives under /integrations so a second provider does not reshape
  // the path later. Note /integrations/telegram/webhook is intentionally NOT
  // JWT-authenticated — see routes/integrations.ts.
  app.use('/integrations', integrationsRouter);
  // Internal validation tooling — requires X-Validation-Token header.
  // NOT customer-facing. NOT Phase 5 product APIs.
  app.use('/validation', validationRouter);

  // ─── 404 handler ─────────────────────────────────────────────────────────────
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: ErrorCode.NOT_FOUND, message: 'Endpoint not found' });
  });

  // ─── Global error handler ─────────────────────────────────────────────────────
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const requestId = (req as any).requestId as string | undefined;

    let status = 500;
    let code: string = ErrorCode.INTERNAL_ERROR;
    let message = 'An internal error occurred';

    if (err instanceof AppError) {
      status = err.httpStatus;
      code = err.code;
      message = err.message;
    } else if (err && typeof err === 'object' && 'status' in err && typeof (err as any).status === 'number') {
      status = (err as any).status;
    }

    console.error('[Obligo Error]', {
      requestId,
      method: req.method,
      path: req.path,
      status,
      code,
      error: err instanceof Error ? err.message : String(err),
    });

    const isProduction = env.NODE_ENV === 'production';
    res.status(status).json({
      error: code,
      message: isProduction && !(err instanceof AppError) ? 'An internal error occurred' : message,
      requestId,
    });
  });

  return app;
}

export const app = createApp();
