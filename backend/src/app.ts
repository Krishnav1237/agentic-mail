import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { authRouter } from './routes/auth.js';
import { emailsRouter } from './routes/emails.js';
import { tasksRouter } from './routes/tasks.js';
import { preferencesRouter } from './routes/preferences.js';
import { feedbackRouter } from './routes/feedback.js';
import { webhooksRouter } from './routes/webhooks.js';
import { actionsRouter } from './routes/actions.js';
import { agentRouter } from './routes/agent.js';

export const createApp = () => {
  const app = express();

  if (env.nodeEnv === 'production') {
    app.set('trust proxy', 1);
  }

  app.disable('x-powered-by');

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'no-referrer' }
  }));
  app.use(cors({
    origin: env.frontendUrl.split(',').map((value) => value.trim()),
    credentials: true
  }));
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger }));

  app.use(rateLimit({
    windowMs: 60_000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const auth = req.headers.authorization ?? '';
      if (auth.startsWith('Bearer ')) return auth.slice(7, 30);
      return req.ip || 'unknown';
    }
  }));

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.get('/.well-known/security.txt', (_req, res) => {
    res.type('text/plain').send(
      [
        'Contact: mailto:security@student-intel.local',
        'Policy: https://example.com/security',
        'Preferred-Languages: en'
      ].join('\n')
    );
  });

  app.use('/auth', authRouter);
  app.use('/emails', emailsRouter);
  app.use('/tasks', tasksRouter);
  app.use('/preferences', preferencesRouter);
  app.use('/feedback', feedbackRouter);
  app.use('/actions', actionsRouter);
  app.use('/agent', agentRouter);
  app.use('/webhooks', webhooksRouter);

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error(err, 'Unhandled error');
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
};
