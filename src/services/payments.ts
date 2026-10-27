import type { Knex } from 'knex';
import db from '../db/knex';
import {
  confirmBooking,
  getBookingByManageCode,
  markFullyPaid,
} from './booking';
import {
  initializeTransaction,
  verifyTransaction,
} from './paystack';
import {
  BookingAmounts,
  InitializeResult,
  Payment,
  PaymentKind,
  VerifyResult,
} from '../types/payment';
import { Booking, BookingPolicy } from '../types/booking';
import {
  AppError,
  NotFoundError,
  PG_UNIQUE_VIOLATION,
  isPgError,
  ValidationError,
} from '../utils/errors';

// ============================================================================
// Amount computation
// ============================================================================

export async function computeAmountsForBooking(
  bookingId: string,
  trxOrDb: Knex | Knex.Transaction = db,
): Promise<BookingAmounts> {
  const booking = await trxOrDb<Booking>('bookings').where({ id: bookingId }).first();
  if (!booking) throw new NotFoundError('Booking');

  const policy = await trxOrDb<BookingPolicy>('booking_policies')
    .where({ resource_type: booking.resource_type })
    .first();
  if (!policy) throw new AppError('POLICY_ERROR', 'Missing booking policy', 500);

  let total = 0;

  switch (policy.pricing_model) {
    case 'NONE':
      total = 0;
      break;

    case 'PER_HEAD': {
      if (!booking.price_per_head_kobo) {
        if (!booking.package_id) {
          throw new ValidationError(
            'PER_HEAD pricing requires either a price snapshot or a package.',
          );
        }
        const pkg = await trxOrDb('packages')
          .where({ id: booking.package_id })
          .first<{ price_per_head_kobo: string }>();
        if (!pkg) throw new ValidationError('Package not found.');
        total = Number(pkg.price_per_head_kobo) * booking.guest_count;
      } else {
        total = Number(booking.price_per_head_kobo) * booking.guest_count;
      }
      break;
    }

    case 'FLAT_FEE': {
      if (!policy.flat_fee_kobo) {
        throw new AppError('POLICY_ERROR', 'FLAT_FEE policy has no flat_fee_kobo', 500);
      }
      total = Number(policy.flat_fee_kobo);
      break;
    }

    case 'MIN_SPEND': {
      const perHead = booking.price_per_head_kobo
        ? Number(booking.price_per_head_kobo) * booking.guest_count
        : 0;
      const min = policy.min_spend_kobo ? Number(policy.min_spend_kobo) : 0;
      total = Math.max(perHead, min);
      break;
    }
  }

  const deposit = Math.round((total * policy.deposit_percent) / 100);
  const balance = total - deposit;

  return {
    totalAmountKobo: total,
    depositAmountKobo: deposit,
    balanceKobo: balance,
  };
}

export async function snapshotAmounts(bookingId: string): Promise<Booking> {
  const amounts = await computeAmountsForBooking(bookingId);

  const [updated] = await db('bookings')
    .where({ id: bookingId })
    .update({
      total_amount_kobo: amounts.totalAmountKobo,
      deposit_amount_kobo: amounts.depositAmountKobo,
      updated_at: new Date(),
    })
    .returning('*');

  return updated as Booking;
}

// ============================================================================
// Initiate
// ============================================================================

export interface InitiatePaymentOptions {
  bookingId: string;
  kind: PaymentKind;
  callbackUrl?: string;
}

export interface InitiatePaymentResult extends InitializeResult {
  paymentId: string;
  amountKobo: number;
}

export async function initiatePayment(
  opts: InitiatePaymentOptions,
): Promise<InitiatePaymentResult> {
  return db.transaction(async (trx: Knex.Transaction): Promise<InitiatePaymentResult> => {
    const booking = await trx('bookings')
      .where({ id: opts.bookingId })
      .first<Booking>();

    if (!booking) throw new NotFoundError('Booking');

    if (!['HELD', 'CONFIRMED'].includes(booking.status)) {
      throw new ValidationError(
        `Cannot initiate payment for a booking in status ${booking.status}.`,
      );
    }

    const existing = await trx('payments')
      .where({
        booking_id: opts.bookingId,
        kind: opts.kind,
        status: 'PENDING',
      })
      .first<Payment>();

    const amounts = await computeAmountsForBooking(opts.bookingId, trx);

    const amountKobo =
      opts.kind === 'DEPOSIT' ? amounts.depositAmountKobo : amounts.balanceKobo;

    if (amountKobo <= 0) {
      throw new ValidationError(
        `Nothing to charge: ${opts.kind} amount is ${amountKobo} kobo.`,
      );
    }

    let reference: string;
    let paymentId: string;

    if (existing) {
      reference = existing.provider_reference;
      paymentId = existing.id;

      if (Number(existing.amount_kobo) !== amountKobo) {
        await trx('payments')
          .where({ id: existing.id })
          .update({ amount_kobo: amountKobo, updated_at: new Date() });
      }
    } else {
      reference = generateReference(opts.bookingId, opts.kind);

      const [row] = await trx('payments')
        .insert({
          booking_id: opts.bookingId,
          provider: 'paystack',
          provider_reference: reference,
          kind: opts.kind,
          amount_kobo: amountKobo,
          status: 'PENDING',
          raw_payload: null,
        })
        .returning('*');

      paymentId = row.id;
    }

    const init = await initializeTransaction({
      email: booking.host_email,
      amountKobo,
      reference,
      callbackUrl: opts.callbackUrl,
      metadata: {
        booking_id: opts.bookingId,
        manage_code: booking.manage_code,
        kind: opts.kind,
      },
    });

    return {
      authorizationUrl: init.authorizationUrl,
      reference: init.reference,
      accessCode: init.accessCode,
      paymentId,
      amountKobo,
    };
  });
}

// ============================================================================
// Verify
// ============================================================================

export interface VerifyPaymentResult extends VerifyResult {
  paymentId: string;
  bookingId: string;
  bookingStatus: string;
}

export async function verifyPayment(
  reference: string,
): Promise<VerifyPaymentResult> {
  return db.transaction(async (trx: Knex.Transaction): Promise<VerifyPaymentResult> => {
    const payment = await trx('payments')
      .where({ provider_reference: reference })
      .first<Payment>();

    if (!payment) throw new NotFoundError('Payment');

    if (payment.status === 'SUCCESS') {
      const booking = await trx('bookings')
        .where({ id: payment.booking_id })
        .first<Booking>();

      return {
        status: 'success',
        amountKobo: Number(payment.amount_kobo),
        reference,
        raw: payment.raw_payload,
        paymentId: payment.id,
        bookingId: payment.booking_id,
        bookingStatus: booking?.status ?? 'UNKNOWN',
      };
    }

    const result = await verifyTransaction(reference);

    const newStatus: Payment['status'] =
      result.status === 'success'
        ? 'SUCCESS'
        : result.status === 'failed'
          ? 'FAILED'
          : 'PENDING';

    await trx('payments')
      .where({ id: payment.id })
      .update({
        status: newStatus,
        raw_payload: result.raw as any,
        updated_at: new Date(),
      });

    if (newStatus === 'SUCCESS') {
      const booking = await trx('bookings')
        .where({ id: payment.booking_id })
        .first<Booking>();

      if (!booking) throw new NotFoundError('Booking');

      // Snapshot total/deposit onto the booking row *before* incrementing
      // amount_paid_kobo — otherwise the `amount_paid_kobo <= total_amount_kobo`
      // CHECK will reject the update (total is still 0 on a fresh booking).
      const amounts = await computeAmountsForBooking(payment.booking_id, trx);
      await trx('bookings')
        .where({ id: payment.booking_id })
        .update({
          total_amount_kobo: amounts.totalAmountKobo,
          deposit_amount_kobo: amounts.depositAmountKobo,
          updated_at: new Date(),
        });

      if (payment.kind === 'DEPOSIT' && booking.status === 'HELD') {
        await confirmBooking(payment.booking_id, trx);
        await trx('bookings')
          .where({ id: payment.booking_id })
          .update({
            amount_paid_kobo: trx.raw('amount_paid_kobo + ?', [
              Number(payment.amount_kobo),
            ]),
          });
      } else if (payment.kind === 'BALANCE' && booking.status === 'CONFIRMED') {
        await markFullyPaid(payment.booking_id, trx);
        await trx('bookings')
          .where({ id: payment.booking_id })
          .update({
            amount_paid_kobo: trx.raw('amount_paid_kobo + ?', [
              Number(payment.amount_kobo),
            ]),
          });
      }
    }

    const finalBooking = await trx('bookings')
      .where({ id: payment.booking_id })
      .first<Booking>();

    const verifiedStatus: VerifyResult['status'] =
      result.status === 'success'
        ? 'success'
        : result.status === 'failed'
          ? 'failed'
          : 'pending';

    return {
      status: verifiedStatus,
      amountKobo: Number(payment.amount_kobo),
      reference,
      raw: result.raw,
      paymentId: payment.id,
      bookingId: payment.booking_id,
      bookingStatus: finalBooking?.status ?? 'UNKNOWN',
    };
  });
}

// ============================================================================
// Helpers
// ============================================================================

function generateReference(bookingId: string, kind: PaymentKind): string {
  const short = bookingId.slice(0, 8);
  const ts = Date.now().toString(36);
  return `bk_${short}_${kind.toLowerCase()}_${ts}`;
}