import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { createHash } from 'crypto';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { getPrimaryFrontendOrigin, isAllowedOrigin } from './config/origins.js';
import { authRouter } from './routes/auth.js';
import { emailsRouter } from './routes/emails.js';
import { tasksRouter } from './routes/tasks.js';
import { preferencesRouter } from './routes/preferences.js';
import { feedbackRouter } from './routes/feedback.js';
import { webhooksRouter } from './routes/webhooks.js';
import { actionsRouter } from './routes/actions.js';
import { agentRouter } from './routes/agent.js';
import { waitlistRouter } from './routes/waitlist.js';
import { adminRouter } from './routes/admin.js';

export const createApp = () => {
  const app = express();
  const primaryFrontendOrigin = getPrimaryFrontendOrigin();

  if (env.nodeEnv === 'production') {
    app.set('trust proxy', 1);
  }

  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          imgSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          upgradeInsecureRequests: [],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: 'no-referrer' },
    })
  );
  app.use(
    cors({
      origin: (origin, callback) => {
        callback(null, isAllowedOrigin(origin));
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger }));

  app.use(
    rateLimit({
      windowMs: 60_000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => {
        const auth = req.headers.authorization ?? '';
        if (auth.startsWith('Bearer ')) {
          return createHash('sha256').update(auth).digest('hex');
        }
        return req.ip || 'unknown';
      },
    })
  );

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.get('/.well-known/security.txt', (_req, res) => {
    const derivedContact =
      env.securityContact ||
      `mailto:security@${new URL(primaryFrontendOrigin).hostname}`;
    const policyUrl =
      env.securityPolicyUrl || `${primaryFrontendOrigin}/security`;
    res
      .type('text/plain')
      .send(
        [
          `Contact: ${derivedContact}`,
          `Policy: ${policyUrl}`,
          `Canonical: ${primaryFrontendOrigin}/.well-known/security.txt`,
          'Preferred-Languages: en',
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
  app.use('/waitlist', waitlistRouter);
  app.use('/admin', adminRouter);

  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      logger.error(err, 'Unhandled error');
      res.status(500).json({ error: 'Internal server error' });
    }
  );

  return app;
};
