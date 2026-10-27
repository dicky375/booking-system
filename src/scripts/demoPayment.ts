import * as dotenv from 'dotenv';
dotenv.config();

import db from '../db/knex';
import { createBooking, getBookingByManageCode } from '../services/booking';
import {
  computeAmountsForBooking,
  initiatePayment,
  verifyPayment,
} from '../services/payments';
import { getAvailability } from '../services/availability';
import { isMockMode } from '../services/paystack';

async function main() {
  console.log(`PAYSTACK MODE: ${isMockMode ? 'MOCK' : 'REAL'}\n`);

  // Use a VIP room — it has requires_payment=true and a FLAT_FEE.
  const when = new Date();
  when.setUTCDate(when.getUTCDate() + 5);
  when.setUTCHours(19, 0, 0, 0);
  const dateStr = when.toISOString().slice(0, 10);

  const slots = await getAvailability({
    resourceType: 'VIP_ROOM',
    date: dateStr,
    partySize: 4,
  });

  if (slots.length === 0) {
    console.log('no VIP slots available — aborting');
    await db.destroy();
    return;
  }

  const slot = slots[0];

  console.log('--- create VIP booking (requires_payment=true) ---');
  const booking = await createBooking({
    resourceType: 'VIP_ROOM',
    resourceId: slot.resourceId,
    guestCount: 4,
    hostName: 'Payment Demo',
    hostPhone: '08000000000',
    hostEmail: 'pay@example.com',
    startAt: slot.startAt,
  });
  console.log('booking:', booking.manage_code, '| status:', booking.status);
  console.log('hold_expires_at:', booking.hold_expires_at);

  console.log('\n--- compute amounts (FLAT_FEE 50000000 kobo, 50% deposit) ---');
  const amounts = await computeAmountsForBooking(booking.id);
  console.log('total:', amounts.totalAmountKobo, 'kobo');
  console.log('deposit:', amounts.depositAmountKobo, 'kobo');
  console.log('balance:', amounts.balanceKobo, 'kobo');

  console.log('\n--- initiate DEPOSIT payment ---');
  const init = await initiatePayment({
    bookingId: booking.id,
    kind: 'DEPOSIT',
  });
  console.log('paymentId:', init.paymentId);
  console.log('amount:', init.amountKobo, 'kobo');
  console.log('reference:', init.reference);
  console.log('authorizationUrl:', init.authorizationUrl);

  console.log('\n--- verify (mock mode returns success) ---');
  console.log('  [about to call verifyPayment]');
  try {
    const verified = await verifyPayment(init.reference);
    console.log('  [verifyPayment returned]', verified);
    console.log('payment status:', verified.status);
    console.log('booking status:', verified.bookingStatus);
  } catch (err) {
    console.error('  [verifyPayment threw]', err);
    throw err;
  }

  console.log('\n--- confirm booking reflects payment ---');
  const refreshed = await getBookingByManageCode(booking.manage_code);
  console.log('status:', refreshed?.status);
  console.log('amount_paid_kobo:', refreshed?.amount_paid_kobo);

  console.log('\n--- initiate BALANCE payment (only valid on CONFIRMED) ---');
  const init2 = await initiatePayment({
    bookingId: booking.id,
    kind: 'BALANCE',
  });
  console.log('reference:', init2.reference, '| amount:', init2.amountKobo);

  const verified2 = await verifyPayment(init2.reference);
  console.log('payment status:', verified2.status);
  console.log('booking status:', verified2.bookingStatus);

  console.log('\n--- final state ---');
  const final = await getBookingByManageCode(booking.manage_code);
  console.log('status:', final?.status);
  console.log('total:', final?.total_amount_kobo);
  console.log('amount_paid:', final?.amount_paid_kobo);

  await db.destroy();
}

main()
  .then(() => console.log('\n[demo:payment] main() completed cleanly'))
  .catch(async (err) => {
    console.error('[demo:payment] main() rejected:', err);
    await db.destroy();
    process.exit(1);
  });