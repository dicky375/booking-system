import db from '../db/knex';
import {
  IdempotencyRecord,
  IdempotencyOptions,
} from '../types/idempotency';
import { AppError } from '../utils/errors';

const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

export interface IdempotencyContext {
  key: string;
  endpoint: string;
  requestFingerprint?: string | null;
  handler: () => Promise<{ status: number; body: unknown }>;
  options?: IdempotencyOptions;
}

export interface IdempotencyResult {
  status: number;
  body: unknown;
  replayed: boolean;
}

export async function withIdempotency(
  ctx: IdempotencyContext,
): Promise<IdempotencyResult> {
  const { key, endpoint, requestFingerprint, handler, options = {} } = ctx;

  if (!key) {
    const result = await handler();
    return { ...result, replayed: false };
  }

  const ttl = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const expiresAt = new Date(Date.now() + ttl * 1000);

  let claimed = false;
  try {
    await db('idempotency_keys').insert({
      key,
      endpoint,
      request_fingerprint: requestFingerprint ?? null,
      response_body: null,
      response_status: null,
      state: 'IN_FLIGHT',
      expires_at: expiresAt,
    });
    claimed = true;
  } catch (err: any) {
    if (err?.code !== '23505') throw err;
  }

  if (!claimed) {
    const existing = await db<IdempotencyRecord>('idempotency_keys')
      .where({ key, endpoint })
      .first();

    if (!existing) {
      return withIdempotency(ctx);
    }

    if (
      requestFingerprint &&
      existing.request_fingerprint &&
      existing.request_fingerprint !== requestFingerprint
    ) {
      throw new AppError(
        'IDEMPOTENCY_KEY_REUSED',
        'The same idempotency key was used with a different request body.',
        422,
        { key, endpoint },
      );
    }

    if (existing.state === 'COMPLETED') {
      options.onReplay?.(key, existing.response_status ?? 200);
      return {
        status: existing.response_status ?? 200,
        body: existing.response_body,
        replayed: true,
      };
    }

    if (existing.state === 'FAILED') {
      const result = await runHandler(ctx, expiresAt);
      return { ...result, replayed: false };
    }

    options.onConflict?.(key);
    throw new AppError(
      'IDEMPOTENCY_IN_FLIGHT',
      'A request with this idempotency key is already in progress.',
      409,
      { key, endpoint },
    );
  }

  return runHandler(ctx, expiresAt);
}

async function runHandler(
  ctx: IdempotencyContext,
  expiresAt: Date,
): Promise<IdempotencyResult> {
  const { key, endpoint, handler } = ctx;

  try {
    const result = await handler();

    await db('idempotency_keys')
      .where({ key, endpoint })
      .update({
        state: 'COMPLETED',
        response_status: result.status,
        response_body: result.body as any,
        expires_at: expiresAt,
      });

    return { ...result, replayed: false };
  } catch (err: any) {
    await db('idempotency_keys')
      .where({ key, endpoint })
      .update({
        state: 'FAILED',
        response_status: err?.httpStatus ?? 500,
        response_body: {
          error: err?.code ?? 'INTERNAL_ERROR',
          message: err?.message ?? 'Unknown error',
        } as any,
        expires_at: expiresAt,
      });

    throw err;
  }
}

export async function sweepExpiredIdempotencyKeys(
  now: Date = new Date(),
): Promise<number> {
  const deleted = await db('idempotency_keys')
    .where('expires_at', '<=', now)
    .del();
  return deleted;
}
