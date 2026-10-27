import type { Knex } from 'knex';
import db from '../db/knex';
import {
  Booking,
  BookingPolicy,
  BookingStatus,
  CreateBookingInput,
  Resource,
  ResourceType,
} from '../types/booking';
import { addMinutes, subMinutes } from '../utils/time';
import {
  AppError,
  isPgError,
  NotFoundError,
  PG_EXCLUSION_VIOLATION,
  PG_UNIQUE_VIOLATION,
  PolicyError,
  SlotTakenError,
  ValidationError,
} from '../utils/errors';
import { generateManageCode } from '../utils/manageCode';

// ============================================================================
// Create booking
// ============================================================================

export async function createBooking(input: CreateBookingInput): Promise<Booking> {
  return db.transaction(async (trx: Knex.Transaction) => {
    const resource = await resolveResource(trx, input);

    const policy = await trx<BookingPolicy>('booking_policies')
      .where({ resource_type: input.resourceType })
      .first();
    if (!policy) throw new PolicyError(`No booking_policies row for ${input.resourceType}`);

    validateAgainstPolicy(input, resource, policy);

    const durationMinutes = input.durationMinutes
      ?? (await resolveDuration(trx, input.resourceType, input.guestCount, policy));

    const endAt = addMinutes(input.startAt, durationMinutes);
    const blocksFrom = subMinutes(input.startAt, policy.setup_buffer_minutes);
    const blocksUntil = addMinutes(endAt, policy.teardown_buffer_minutes);

    const holdExpiresAt = policy.requires_payment
      ? addSeconds(new Date(), policy.hold_ttl_seconds)
      : null;

    const manageCode = await uniqueManageCode(trx);

    const insertPayload = {
      resource_id: resource.id,
      resource_type: input.resourceType,
      package_id: input.packageId ?? null,
      guest_count: input.guestCount,
      host_name: input.hostName,
      host_phone: input.hostPhone,
      host_email: input.hostEmail,
      occasion: input.occasion ?? null,
      special_requests: input.specialRequests ?? '',
      manage_code: manageCode,
      start_at: input.startAt,
      end_at: endAt,
      blocks_from: blocksFrom,
      blocks_until: blocksUntil,
      status: 'HELD' as const,
      hold_expires_at: holdExpiresAt,
      price_per_head_kobo: null,
      total_amount_kobo: 0,
      deposit_amount_kobo: 0,
      amount_paid_kobo: 0,
    };

    try {
      const [row] = await trx('bookings').insert(insertPayload).returning('*');
      return row as Booking;
    } catch (err) {
      if (isPgError(err) && err.code === PG_EXCLUSION_VIOLATION) {
        throw new SlotTakenError(resource.id, {
          startAt: input.startAt.toISOString(),
          endAt: endAt.toISOString(),
        });
      }
      if (isPgError(err) && err.code === PG_UNIQUE_VIOLATION) {
        throw new SlotTakenError(resource.id, { reason: 'manage_code_collision' });
      }
      throw err;
    }
  });
}

// ============================================================================
// Lookup
// ============================================================================

export async function getBookingByManageCode(
  manageCode: string,
): Promise<(Booking & { resource_name: string }) | null> {
  const row = await db('bookings as b')
    .leftJoin('resources as r', 'r.id', 'b.resource_id')
    .where('b.manage_code', manageCode)
    .first<Booking & { resource_name: string }>(
      'b.*',
      'r.name as resource_name',
    );
  return row ?? null;
}

// ============================================================================
// Status transitions
// ============================================================================

const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  HELD: [],
  CONFIRMED: ['HELD'],
  FULLY_PAID: ['CONFIRMED'],
  SEATED: ["HELD",'CONFIRMED', 'FULLY_PAID'],
  COMPLETED: ['SEATED'],
  CANCELLED: ['HELD', 'CONFIRMED', 'FULLY_PAID'],
  EXPIRED: ['HELD'],
  NO_SHOW: ['CONFIRMED', 'FULLY_PAID'],
};

export class InvalidTransitionError extends AppError {
  constructor(from: BookingStatus, to: BookingStatus) {
    super(
      'INVALID_TRANSITION',
      `Cannot transition booking from ${from} to ${to}.`,
      409,
      { from, to },
    );
  }
}

interface TransitionOptions {
  force?: boolean;
  patch?: Partial<Booking>;
}

export async function transitionBooking(
  bookingId: string,
  to: BookingStatus,
  options: TransitionOptions = {},
  externalTrx?: Knex.Transaction,
): Promise<Booking> {
  const run = async (trx: Knex.Transaction): Promise<Booking> => {
    const current = await trx('bookings')
      .where({ id: bookingId })
      .forUpdate()
      .first<Booking>();

    if (!current) throw new NotFoundError('Booking');

    if (!options.force) {
      const allowed = TRANSITIONS[to];
      if (!allowed.includes(current.status)) {
        throw new InvalidTransitionError(current.status, to);
      }
    }

    const patch: Record<string, unknown> = {
      status: to,
      updated_at: new Date(),
      ...(options.patch ?? {}),
    };

    if (current.status === 'HELD' && to !== 'HELD') {
      patch.hold_expires_at = null;
    }

    const [updated] = await trx('bookings')
      .where({ id: bookingId })
      .update(patch)
      .returning('*');

    return updated as Booking;
  };

  if (externalTrx) return run(externalTrx);
  return db.transaction(run);
}

// ---------- Convenience wrappers ----------

export async function confirmBooking(
  bookingId: string,
  trx?: Knex.Transaction,
): Promise<Booking> {
  return transitionBooking(bookingId, 'CONFIRMED', {}, trx);
}

export async function markFullyPaid(
  bookingId: string,
  trx?: Knex.Transaction,
): Promise<Booking> {
  return transitionBooking(bookingId, 'FULLY_PAID', {}, trx);
}

export async function seatBooking(
  bookingId: string,
  trx?: Knex.Transaction,
): Promise<Booking> {
  return transitionBooking(bookingId, 'SEATED', {}, trx);
}

export async function completeBooking(
  bookingId: string,
  trx?: Knex.Transaction,
): Promise<Booking> {
  return transitionBooking(bookingId, 'COMPLETED', {}, trx);
}

export async function markNoShow(
  bookingId: string,
  trx?: Knex.Transaction,
): Promise<Booking> {
  return transitionBooking(bookingId, 'NO_SHOW', {}, trx);
}

export async function cancelBooking(
  bookingId: string,
  reason?: string,
  trx?: Knex.Transaction,
): Promise<Booking> {
  const patch: Partial<Booking> = {};
  if (reason) {
    patch.special_requests = await appendCancellationNote(bookingId, reason, trx);
  }
  return transitionBooking(bookingId, 'CANCELLED', { patch }, trx);
}

// ============================================================================
// Internals
// ============================================================================

async function resolveResource(
  trx: Knex.Transaction,
  input: CreateBookingInput,
): Promise<Resource> {
  if (input.resourceId) {
    const r = await trx('resources')
      .where({ id: input.resourceId, is_active: true })
      .first<Resource>();
    if (!r) throw new NotFoundError('Resource');
    if (r.type !== input.resourceType) {
      throw new ValidationError(
        `Resource ${r.name} is type ${r.type}, not ${input.resourceType}`,
      );
    }
    return r;
  }

  const rows = (await trx('resources')
    .where({ type: input.resourceType, is_active: true })
    .andWhere('min_capacity', '<=', input.guestCount)
    .andWhere('max_capacity', '>=', input.guestCount)
    .orderBy('display_order', 'asc')) as Resource[];

  if (rows.length === 0) {
    throw new ValidationError(
      `No active ${input.resourceType} can seat ${input.guestCount} guests.`,
    );
  }

  return rows[0];
}

function validateAgainstPolicy(
  input: CreateBookingInput,
  resource: Resource,
  policy: BookingPolicy,
) {
  if (input.guestCount <= 0) {
    throw new ValidationError('guestCount must be positive.');
  }
  if (
    input.guestCount < resource.min_capacity ||
    input.guestCount > resource.max_capacity
  ) {
    throw new ValidationError(
      `Guest count ${input.guestCount} is outside ${resource.name}'s capacity ` +
        `(${resource.min_capacity}–${resource.max_capacity}).`,
    );
  }

  const now = new Date();
  const earliest = addMinutes(now, policy.min_lead_minutes);
  const latest = new Date(now.getTime() + policy.max_advance_days * 86_400_000);

  if (input.startAt.getTime() < earliest.getTime()) {
    throw new ValidationError(
      `Bookings for ${input.resourceType} require at least ${policy.min_lead_minutes} minutes lead time.`,
    );
  }
  if (input.startAt.getTime() > latest.getTime()) {
    throw new ValidationError(
      `Bookings for ${input.resourceType} can only be made ${policy.max_advance_days} days in advance.`,
    );
  }
}

async function resolveDuration(
  trx: Knex.Transaction,
  resourceType: ResourceType,
  partySize: number,
  policy: BookingPolicy,
): Promise<number> {
  if (resourceType !== 'TABLE') return policy.default_duration_minutes;

  const row = await trx('dining_durations')
    .where('party_size_min', '<=', partySize)
    .andWhere('party_size_max', '>=', partySize)
    .first<{ duration_minutes: number }>();

  return row?.duration_minutes ?? policy.default_duration_minutes;
}

async function uniqueManageCode(trx: Knex.Transaction): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateManageCode();
    const exists = await trx('bookings').where({ manage_code: code }).first('id');
    if (!exists) return code;
  }
  throw new PolicyError('Could not generate a unique manage_code after 5 attempts.');
}

async function appendCancellationNote(
  bookingId: string,
  reason: string,
  trx?: Knex.Transaction,
): Promise<string> {
  const handle = trx ?? db;
  const row = await handle('bookings')
    .where({ id: bookingId })
    .first<{ special_requests: string }>('special_requests');
  const existing = row?.special_requests?.trim() ?? '';
  const note = `[CANCELLED ${new Date().toISOString()}] ${reason}`;
  return existing ? `${existing}\n${note}` : note;
}

function addSeconds(d: Date, seconds: number): Date {
  return new Date(d.getTime() + seconds * 1000);
}