export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number = 400,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** The requested slot overlaps an existing active booking (Postgres 23P01). */
export class SlotTakenError extends AppError {
  constructor(resourceId: string, details?: Record<string, unknown>) {
    super(
      'SLOT_TAKEN',
      'The requested time slot is no longer available for this resource.',
      409,
      { resourceId, ...details },
    );
  }
}

/** Input failed a business rule (capacity, lead time, advance window, etc.). */
export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, 422, details);
  }
}

/** Resource / policy lookup failed, or policy is misconfigured. */
export class PolicyError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('POLICY_ERROR', message, 500, details);
  }
}

/** Generic not-found for resources, packages, etc. */
export class NotFoundError extends AppError {
  constructor(what: string, details?: Record<string, unknown>) {
    super('NOT_FOUND', `${what} not found.`, 404, details);
  }
}

/** Postgres error codes we care about. */
export const PG_EXCLUSION_VIOLATION = '23P01';
export const PG_UNIQUE_VIOLATION = '23505';

export function isPgError(err: unknown): err is { code: string; message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as any).code === 'string'
  );
}