import * as dotenv from 'dotenv';
dotenv.config();

import db from '../db/knex';
import { createBooking } from '../services/booking';
import { releaseExpiredHolds } from '../services/holdSweeper';
import { getAvailability } from '../services/availability';

async function main() {
  const when = new Date();
  when.setUTCDate(when.getUTCDate() + 4);
  when.setUTCHours(21, 0, 0, 0);
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
  console.log('--- create VIP hold (requires_payment=true, 30min TTL) ---');
  const held = await createBooking({
    resourceType: 'VIP_ROOM',
    resourceId: slot.resourceId,
    guestCount: 4,
    hostName: 'Hold Demo',
    hostPhone: '08000000000',
    hostEmail: 'hold@example.com',
    startAt: slot.startAt,
  });
  console.log('created:', held.manage_code, '| hold_expires_at:', held.hold_expires_at);

  console.log('\n--- try to double-book while hold is live (must fail) ---');
  try {
    await createBooking({
      resourceType: 'VIP_ROOM',
      resourceId: slot.resourceId,
      guestCount: 2,
      hostName: 'Impatient',
      hostPhone: '08000000001',
      hostEmail: 'impatient@example.com',
      startAt: slot.startAt,
    });
    console.log('UNEXPECTED: double-book succeeded.');
  } catch (err: any) {
    console.log('correctly rejected:', err.code ?? err.message);
  }

  console.log('\n--- fast-forward: force hold_expires_at into the past ---');
  await db('bookings')
    .where({ id: held.id })
    .update({ hold_expires_at: new Date(Date.now() - 60_000) });

  console.log('\n--- run sweeper ---');
  const result = await releaseExpiredHolds();
  console.log('swept:', result.count, 'booking(s)');

  console.log('\n--- retry the double-book (must now succeed) ---');
  const rebound = await createBooking({
    resourceType: 'VIP_ROOM',
    resourceId: slot.resourceId,
    guestCount: 2,
    hostName: 'Impatient',
    hostPhone: '08000000001',
    hostEmail: 'impatient@example.com',
    startAt: slot.startAt,
  });
  console.log('created:', rebound.manage_code, '| status:', rebound.status);

  await db.destroy();
}

main().catch(async (err) => {
  console.error(err);
  await db.destroy();
  process.exit(1);
});
