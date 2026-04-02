import { Resend } from 'resend';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import {
  buildWaitlistConfirmationPayload,
  normalizeWaitlistEmail,
} from './waitlistEmailTemplate.js';

const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;

let hasWarnedMissingResendKey = false;

export const sendWaitlistConfirmationEmail = async (email: string) => {
  if (!resend) {
    if (!hasWarnedMissingResendKey) {
      logger.warn(
        'RESEND_API_KEY is not configured. Replace re_xxxxxxxxx with your real Resend API key before expecting waitlist confirmation emails to send.'
      );
      hasWarnedMissingResendKey = true;
    }

    return { status: 'skipped' as const, reason: 'missing_api_key' as const };
  }

  const payload = buildWaitlistConfirmationPayload(
    env.resendFromEmail,
    normalizeWaitlistEmail(email)
  );
  const result = await resend.emails.send(payload);

  if (result.error) {
    throw new Error(result.error.message || 'Resend email send failed.');
  }

  return {
    status: 'sent' as const,
    id: result.data?.id ?? null,
  };
};
