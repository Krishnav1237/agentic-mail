/**
 * The Help & Feedback contract — how a user reaches the IIL team, kept
 * distinct from Settings (how IIL behaves) and Profile (who the user is);
 * see Part 3 of the Help & Feedback spec.
 *
 * Pure types + a submission seam, no React/storage. Nothing here persists a
 * submission locally: unlike `agentPreferences.ts`/`telegramIntegration.ts`
 * there is no ongoing state to read back, so a store (with its
 * localStorage/`useSyncExternalStore` machinery) would be the wrong shape —
 * a single async function is the whole surface a form needs.
 */

export type FeedbackCategory = 'help' | 'bug' | 'feedback' | 'feature';

/** Non-sensitive application context auto-attached to bug reports (Part 2 —
 * "the user should not have to manually explain which page they were on if
 * the frontend already knows it"). Deliberately shallow: no stack traces,
 * no request payloads, nothing that could carry mail content or credentials. */
export type FeedbackContext = {
  route: string;
  theme: 'dark' | 'light';
  viewport: string;
  appVersion: string;
};

export type FeedbackSubmission = {
  category: FeedbackCategory;
  message: string;
  /** "What were you doing?" — bug reports only. */
  detail?: string;
  email: string;
  displayName: string;
  context: FeedbackContext;
};

export type FeedbackSubmitResult = { ok: true } | { ok: false; reason: string };

/**
 * THE FUTURE `POST /feedback` SEAM.
 *
 * No backend exists yet, so this only simulates request latency and then
 * resolves successfully — long enough for the form to exercise a real
 * pending state, same contract `changePassword`
 * (`lib/userProfileStore.ts`) and `sendTestNotification`
 * (`lib/telegramIntegrationStore.ts`) already use. Never persists the
 * submission anywhere, and the caller's success copy must say the message
 * was sent to this form, not that the IIL team received and read it, until a
 * real backend can confirm that.
 */
export function submitFeedback(
  _submission: FeedbackSubmission
): Promise<FeedbackSubmitResult> {
  return new Promise((resolve) => {
    setTimeout(() => resolve({ ok: true }), 700);
  });
}
