/**
 * Bounded typed error codes for IIL backend.
 *
 * Rules:
 * 1. Only these codes may appear in persisted fields (sync_runs.error_message,
 *    extraction_runs.error_code, audit_events.details, API responses).
 * 2. Raw provider messages, SQL errors, internal paths, and tokens must NEVER
 *    be stored in user-visible or audit-facing fields.
 * 3. Operational detail is logged server-side with requestId for correlation.
 */

// ─── Bounded error code list ──────────────────────────────────────────────────
export const ErrorCode = {
  // Auth / OAuth
  OAUTH_STATE_EXPIRED: 'OAUTH_STATE_EXPIRED',
  OAUTH_STATE_INVALID: 'OAUTH_STATE_INVALID',
  OAUTH_CALLBACK_FAILED: 'OAUTH_CALLBACK_FAILED',

  // Google token lifecycle
  GOOGLE_ACCOUNT_DISCONNECTED: 'GOOGLE_ACCOUNT_DISCONNECTED',
  GOOGLE_TOKEN_REFRESH_FAILED: 'GOOGLE_TOKEN_REFRESH_FAILED',
  GOOGLE_RATE_LIMITED: 'GOOGLE_RATE_LIMITED',

  // Gmail sync
  GMAIL_HISTORY_CURSOR_INVALID: 'GMAIL_HISTORY_CURSOR_INVALID',
  GMAIL_MESSAGE_FETCH_FAILED: 'GMAIL_MESSAGE_FETCH_FAILED',
  GMAIL_SYNC_FAILED: 'GMAIL_SYNC_FAILED',
  GMAIL_SYNC_ALREADY_RUNNING: 'GMAIL_SYNC_ALREADY_RUNNING',

  // Distributed locks
  LOCK_OWNERSHIP_LOST: 'LOCK_OWNERSHIP_LOST',
  LOCK_ACQUISITION_TIMEOUT: 'LOCK_ACQUISITION_TIMEOUT',

  // AI extraction
  EXTRACTION_PROVIDER_UNAVAILABLE: 'EXTRACTION_PROVIDER_UNAVAILABLE',
  EXTRACTION_OUTPUT_INVALID: 'EXTRACTION_OUTPUT_INVALID',
  EXTRACTION_TIMEOUT: 'EXTRACTION_TIMEOUT',
  EXTRACTION_FAILED: 'EXTRACTION_FAILED',

  // General application
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_CONFLICT: 'AUTH_CONFLICT',
  CSRF_INVALID: 'CSRF_INVALID',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
} as const;

export type ErrorCodeKey = keyof typeof ErrorCode;
export type ErrorCodeValue = (typeof ErrorCode)[ErrorCodeKey];

// ─── AppError class ───────────────────────────────────────────────────────────

export class AppError extends Error {
  public readonly code: ErrorCodeValue;
  public readonly httpStatus: number;
  public readonly isOperational: boolean;

  constructor(
    code: ErrorCodeValue,
    message: string,
    httpStatus: number = 500,
    isOperational: boolean = true
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.isOperational = isOperational;
    // Maintains proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  /** Returns the safe code that may be persisted or sent to clients. */
  public safeCode(): ErrorCodeValue {
    return this.code;
  }
}

// ─── Helper: extract a safe bounded code from any error ──────────────────────

/**
 * Given any caught error, return a bounded ErrorCode safe for persistence.
 * Never returns raw message content.
 */
export function toSafeCode(error: unknown): ErrorCodeValue {
  if (error instanceof AppError) return error.code;
  // Attempt to map well-known provider signals
  if (error instanceof Error) {
    const msg = error.message;
    if (msg.includes('invalid_grant') || msg.includes('Token has been expired')) {
      return ErrorCode.GOOGLE_TOKEN_REFRESH_FAILED;
    }
    if (msg.includes('LOCK_OWNERSHIP_LOST')) return ErrorCode.LOCK_OWNERSHIP_LOST;
    if (msg.includes('LOCK_ACQUISITION_TIMEOUT')) return ErrorCode.LOCK_ACQUISITION_TIMEOUT;
    if (msg.includes('GMAIL_SYNC_ALREADY_RUNNING')) return ErrorCode.GMAIL_SYNC_ALREADY_RUNNING;
  }
  return ErrorCode.INTERNAL_ERROR;
}

/**
 * Returns the HTTP status that maps to a given error code.
 */
export function httpStatusForCode(code: ErrorCodeValue): number {
  switch (code) {
    case ErrorCode.NOT_FOUND:
      return 404;
    case ErrorCode.VALIDATION_ERROR:
    case ErrorCode.OAUTH_STATE_EXPIRED:
    case ErrorCode.OAUTH_STATE_INVALID:
    case ErrorCode.OAUTH_CALLBACK_FAILED:
      return 400;
    case ErrorCode.AUTH_REQUIRED:
      return 401;
    case ErrorCode.CSRF_INVALID:
      return 403;
    case ErrorCode.GMAIL_SYNC_ALREADY_RUNNING:
      return 409;
    case ErrorCode.GOOGLE_RATE_LIMITED:
    case ErrorCode.RATE_LIMITED:
      return 429;
    case ErrorCode.EXTRACTION_PROVIDER_UNAVAILABLE:
      return 503;
    default:
      return 500;
  }
}
