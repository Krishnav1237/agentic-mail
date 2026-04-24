import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { db } from '../config/db.js';
import { logger } from '../config/logger.js';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { asyncRoute } from '../middleware/asyncRoute.js';
import {
  buildWaitlistJoinResponse,
  getWaitlistJoinStatusCode,
} from './waitlistResponse.js';
import { normalizeWaitlistEmail } from '../services/waitlistEmailTemplate.js';
import { sendWaitlistConfirmationEmail } from '../services/waitlistEmail.js';

export const waitlistRouter = Router();

waitlistRouter.use(
  rateLimit({
    windowMs: 60_000,
    max: 10, // Slightly higher for stats
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  })
);

waitlistRouter.get(
  '/stats',
  asyncRoute(async (_req, res) => {
    const result = await db.query(
      'SELECT COUNT(*)::int as total FROM waitlist'
    );
    return res.json({ success: true, total: result.rows[0]?.total ?? 0 });
  })
);

const schema = z.object({ email: z.string().email() });

waitlistRouter.post(
  '/',
  validate(schema),
  asyncRoute(async (req, res) => {
    const { email } = req.body as z.infer<typeof schema>;
    const normalizedEmail = normalizeWaitlistEmail(email);
    const existing = await db.query(
      'SELECT 1 FROM waitlist WHERE lower(email) = lower($1) LIMIT 1',
      [normalizedEmail]
    );

    if ((existing.rowCount ?? 0) > 0) {
      const response = buildWaitlistJoinResponse(false);
      return res
        .status(getWaitlistJoinStatusCode(response.status))
        .json(response);
    }

    const result = await db.query(
      'INSERT INTO waitlist (email) VALUES ($1) ON CONFLICT (email) DO NOTHING RETURNING email',
      [normalizedEmail]
    );
    const response = buildWaitlistJoinResponse((result.rowCount ?? 0) > 0);

    if (response.status === 'created') {
      try {
        await sendWaitlistConfirmationEmail(normalizedEmail);
      } catch (error) {
        logger.error(
          { err: error, email: normalizedEmail },
          'Failed to send waitlist confirmation email'
        );
      }
    }

    return res
      .status(getWaitlistJoinStatusCode(response.status))
      .json(response);
  })
);
