/**
 * Email Scoring Service (Shadow Mode)
 *
 * Pre-LLM noise signal scoring. Runs BEFORE extraction to annotate emails
 * with a signal strength estimate.
 *
 * IMPORTANT RULES (enforced in code):
 *   1. Low-signal patterns NEVER automatically discard an email.
 *   2. During validation, every email remains eligible for extraction.
 *   3. Scoring result is persisted for later comparison only.
 *   4. Does not alter the working extraction pipeline's behaviour when mode=off or mode=shadow.
 *   5. EMAIL_SCORING_MODE controls behaviour (off|shadow|active).
 *   6. Normalized score remains null until probability calibration exists.
 *
 * In shadow mode:
 *   - Calculate score, persist to email_filtering_decisions.
 *   - Do not change extraction scheduling.
 *
 * In active mode (NOT enabled in production during this implementation):
 *   - Process high-score emails immediately.
 *   - Deprioritize lower-score emails into delayed/sampled queue.
 *   - NEVER hard-delete or permanently skip.
 *
 * The default is 'off' (production and test) and 'shadow' (development).
 */

import { query } from '../db/index.js';
import { env } from '../config/env.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FilteringDecision {
  rawScore: number;
  normalizedScore: number | null;
  reasons: string[];
  recommendation: 'process' | 'deprioritize';
  modelVersion: string;
}

// ─── Signal patterns ──────────────────────────────────────────────────────────

interface SignalPattern {
  pattern: RegExp;
  delta: number;   // positive = high signal, negative = low signal
  label: string;
}

// High-signal patterns (indicate emails likely to contain obligations or opportunities)
const HIGH_SIGNAL_PATTERNS: SignalPattern[] = [
  { pattern: /\bshortlist(ed)?\b/i, delta: 0.25, label: 'shortlist' },
  { pattern: /\binterview\b/i, delta: 0.25, label: 'interview' },
  { pattern: /\bdeadline\b/i, delta: 0.20, label: 'deadline' },
  { pattern: /\bproposal\b/i, delta: 0.15, label: 'proposal' },
  { pattern: /\binvoice\b/i, delta: 0.20, label: 'invoice' },
  { pattern: /\bapplication\b/i, delta: 0.15, label: 'application' },
  { pattern: /\bplacement\b/i, delta: 0.20, label: 'placement' },
  { pattern: /\brefer(red|ring)?\b/i, delta: 0.10, label: 'referral' },
  { pattern: /\bdue (date|by)\b/i, delta: 0.20, label: 'due_date' },
  { pattern: /\bplease (reply|respond|confirm|send)\b/i, delta: 0.15, label: 'action_request' },
  { pattern: /\breminder\b/i, delta: 0.10, label: 'reminder' },
  { pattern: /\boffer letter\b/i, delta: 0.30, label: 'offer_letter' },
  { pattern: /\bjoin(ing)? us\b/i, delta: 0.15, label: 'joining_request' },
  { pattern: /\bre\s*:\b/i, delta: 0.05, label: 'reply_thread' },
  { pattern: /\bfwd\s*:\b/i, delta: 0.05, label: 'forwarded_thread' },
  { pattern: /\bclient\b/i, delta: 0.10, label: 'client_mention' },
  { pattern: /\bpayment\b/i, delta: 0.15, label: 'payment' },
  { pattern: /\bcontract\b/i, delta: 0.15, label: 'contract' },
  { pattern: /\bscope (of work|change)\b/i, delta: 0.20, label: 'scope_work' },
];

// Low-signal patterns (indicate noise — but NEVER cause automatic discard)
const LOW_SIGNAL_PATTERNS: SignalPattern[] = [
  { pattern: /\bunsubscribe\b/i, delta: -0.20, label: 'unsubscribe_footer' },
  { pattern: /\bview (in|this email) (browser|online)\b/i, delta: -0.15, label: 'view_in_browser' },
  { pattern: /\bpromotional\b/i, delta: -0.15, label: 'promotional' },
  { pattern: /\bnewsletter\b/i, delta: -0.20, label: 'newsletter' },
  { pattern: /\bno-reply\b/i, delta: -0.10, label: 'no_reply_sender' },
  { pattern: /\bnoreply\b/i, delta: -0.10, label: 'noreply_sender' },
  { pattern: /\bthis (is an automated|message was sent automatically)\b/i, delta: -0.15, label: 'automated_message' },
  { pattern: /\bmanage (your )?(preferences|subscriptions)\b/i, delta: -0.15, label: 'manage_subscription' },
  { pattern: /\bexclusive (offer|deal|discount)\b/i, delta: -0.20, label: 'exclusive_offer' },
  { pattern: /\bsale ends\b/i, delta: -0.20, label: 'sale_ends' },
  { pattern: /\bclick here\b/i, delta: -0.10, label: 'click_here' },
  { pattern: /\byou (are|were) selected (for )?(a special|an exclusive)\b/i, delta: -0.25, label: 'selected_marketing' },
];

// ─── Scoring ──────────────────────────────────────────────────────────────────

const MODEL_VERSION = 'rules-v1';
const BASE_SCORE = 0.50;        // neutral starting point
const PROCESS_THRESHOLD = 0.50; // rawScore >= 0.50 -> recommend 'process'

/**
 * Score an email based on subject, body text, and sender.
 * Returns rawScore additively. normalizedScore remains null until calibration exists.
 *
 * Critical: LOW rawScore NEVER means discard.
 * Deprioritize = delayed or sampled queue in active mode, never hard skip.
 */
export function scoreEmail(params: {
  subject: string;
  bodyText: string;
  senderEmail: string;
}): FilteringDecision {
  const { subject, bodyText, senderEmail } = params;

  // Combine for pattern matching. Limit to avoid pathological inputs.
  const combined = `${senderEmail} ${subject} ${bodyText}`.substring(0, 50_000);

  let rawScore = BASE_SCORE;
  const reasons: string[] = [];

  // Apply high-signal patterns
  for (const p of HIGH_SIGNAL_PATTERNS) {
    if (p.pattern.test(combined)) {
      rawScore += p.delta;
      reasons.push(`+high_signal:${p.label}`);
    }
  }

  // Apply low-signal patterns
  for (const p of LOW_SIGNAL_PATTERNS) {
    if (p.pattern.test(combined)) {
      rawScore += p.delta; // delta is negative
      reasons.push(`-low_signal:${p.label}`);
    }
  }

  rawScore = Math.round(rawScore * 1000) / 1000;

  const recommendation: 'process' | 'deprioritize' =
    rawScore >= PROCESS_THRESHOLD ? 'process' : 'deprioritize';

  if (reasons.length === 0) reasons.push('neutral:no_pattern_matched');

  return {
    rawScore,
    normalizedScore: null, // Remains null until probability calibration exists
    reasons,
    recommendation,
    modelVersion: MODEL_VERSION,
  };
}

// ─── Persistence ──────────────────────────────────────────────────────────────

/**
 * Persist the filtering decision for an email.
 * Only called when EMAIL_SCORING_MODE is 'shadow' or 'active'.
 * Does NOT throw on failure — scoring must not block extraction.
 */
export async function persistFilteringDecision(
  emailId: string,
  decision: FilteringDecision
): Promise<void> {
  try {
    await query(
      `INSERT INTO email_filtering_decisions
         (email_id, model_version, raw_score, normalized_score, recommendation, reasons, mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT DO NOTHING`,
      [
        emailId,
        decision.modelVersion,
        decision.rawScore,
        decision.normalizedScore,
        decision.recommendation,
        JSON.stringify(decision.reasons),
        env.EMAIL_SCORING_MODE,
      ]
    );
  } catch (err) {
    // Log but do not propagate — scoring must never block extraction
    console.error('[EmailScoring] Failed to persist filtering decision for email', emailId, ':', err instanceof Error ? err.message : 'unknown');
  }
}

/**
 * Main entry point: score and optionally persist.
 *
 * In 'off' mode: returns scoring result but does NOT persist.
 * In 'shadow' mode: scores and persists, returns result.
 * In 'active' mode: scores, persists, and returns result (caller decides on queue scheduling).
 *
 * In all modes, the extraction pipeline MUST still run for this email.
 */
export async function scoreAndRecord(params: {
  emailId: string;
  subject: string;
  bodyText: string;
  senderEmail: string;
}): Promise<FilteringDecision | null> {
  const mode = env.EMAIL_SCORING_MODE;

  if (mode === 'off') {
    // Do not compute or persist in 'off' mode
    return null;
  }

  const decision = scoreEmail(params);

  // Persist in shadow and active modes
  await persistFilteringDecision(params.emailId, decision);

  return decision;
}
