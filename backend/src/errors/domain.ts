export class DomainError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(input: {
    message: string;
    status: number;
    code: string;
    details?: Record<string, unknown>;
  }) {
    super(input.message);
    this.name = this.constructor.name;
    this.status = input.status;
    this.code = input.code;
    this.details = input.details;
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({ message, status: 400, code: 'validation_error', details });
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({ message, status: 404, code: 'not_found', details });
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, code = 'conflict', details?: Record<string, unknown>) {
    super({ message, status: 409, code, details });
  }
}

export class QuotaExceededError extends DomainError {
  constructor(input: {
    metric: string;
    used: number;
    limit: number;
    message?: string;
    code?: string;
  }) {
    super({
      message: input.message ?? 'Quota exhausted for current billing window',
      status: 402,
      code: input.code ?? 'quota_exhausted',
      details: {
        metric: input.metric,
        used: input.used,
        limit: input.limit,
        upgradeRequired: true,
      },
    });
  }
}

export const isDomainError = (error: unknown): error is DomainError =>
  error instanceof DomainError;
