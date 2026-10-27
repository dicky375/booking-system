import * as dotenv from 'dotenv';
dotenv.config();

import db from '../db/knex';
import {
  cancelBooking,
  completeBooking,
  confirmBooking,
  createBooking,
  getBookingByManageCode,
  markFullyPaid,
  seatBooking,
  InvalidTransitionError,
} from '../services/booking';
import { getAvailability } from '../services/availability';

async function main() {
  const when = new Date();
  when.setUTCDate(when.getUTCDate() + 3);
  when.setUTCHours(20, 0, 0, 0);
  const dateStr = when.toISOString().slice(0, 10);

  const slots = await getAvailability({
    resourceType: 'TABLE',
    date: dateStr,
    partySize: 4,
    now: new Date(),
  });

  if (slots.length === 0) {
    console.log('no slots available — aborting');
    await db.destroy();
    return;
  }

  const slot = slots.find((s) => s.startAt.getUTCHours() >= 20) ?? slots[0];

  console.log('--- create HELD booking ---');
  let b = await createBooking({
    resourceType: 'TABLE',
    resourceId: slot.resourceId,
    guestCount: 4,
    hostName: 'Lifecycle Demo',
    hostPhone: '08000000000',
    hostEmail: 'lifecycle@example.com',
    startAt: slot.startAt,
  });
  console.log('status:', b.status);

  console.log('\n--- confirm ---');
  b = await confirmBooking(b.id);
  console.log('status:', b.status, '| hold_expires_at:', b.hold_expires_at);

  console.log('\n--- mark fully paid ---');
  b = await markFullyPaid(b.id);
  console.log('status:', b.status);

  console.log('\n--- seat ---');
  b = await seatBooking(b.id);
  console.log('status:', b.status);

  console.log('\n--- complete ---');
  b = await completeBooking(b.id);
  console.log('status:', b.status);

  console.log('\n--- attempt illegal: COMPLETED → CONFIRMED (must fail) ---');
  try {
    await confirmBooking(b.id);
    console.log('UNEXPECTED: illegal transition succeeded.');
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      console.log('correctly rejected:', err.message);
    } else {
      console.error('unexpected error:', err);
    }
  }

  console.log('\n--- lookup by manage_code ---');
  const found = await getBookingByManageCode(b.manage_code);
  console.log('found:', found?.id, found?.resource_name);

  console.log('\n--- cancel a fresh booking ---');
  const b2 = await createBooking({
    resourceType: 'TABLE',
    resourceId: slot.resourceId,
    guestCount: 2,
    hostName: 'Cancel Demo',
    hostPhone: '08000000009',
    hostEmail: 'cancel@example.com',
    startAt: slot.startAt,
  });
  const b2c = await cancelBooking(b2.id, 'Guest changed plans');
  console.log('status:', b2c.status);
  console.log('special_requests:', JSON.stringify(b2c.special_requests));

  await db.destroy();
}

main().catch(async (err) => {
  console.error(err);
  await db.destroy();
  process.exit(1);
});
