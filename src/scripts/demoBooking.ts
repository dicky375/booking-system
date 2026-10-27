import * as dotenv from 'dotenv';
dotenv.config();
import { createBooking } from '../services/booking';
import { getAvailability } from '../services/availability';
import { SlotTakenError, ValidationError } from '../utils/errors';
import db from '../db/knex';

async function main() {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(20, 0, 0, 0); // 20:00 UTC
  const dateStr = tomorrow.toISOString().slice(0, 10);

  console.log('--- availability for 4 guests, tomorrow ---');
  const slots = await getAvailability({
    resourceType: 'TABLE',
    date: dateStr,
    partySize: 4,
  });
  console.log(`found ${slots.length} slots; first 3:`);
  slots.slice(0, 3).forEach((s) =>
    console.log(`  ${s.startAt.toISOString()} → ${s.endAt.toISOString()} on ${s.resourceName}`),
  );

  if (slots.length === 0) {
    console.log('No slots available — aborting create test.');
    await db.destroy();
    return;
  }

  const target = slots[0];
  console.log('\n--- create booking on slot 1 ---');
  const b1 = await createBooking({
    resourceType: 'TABLE',
    resourceId: target.resourceId,
    guestCount: 4,
    hostName: 'Demo Host',
    hostPhone: '08000000000',
    hostEmail: 'demo@example.com',
    startAt: target.startAt,
    specialRequests: 'Window seat if possible',
  });
  console.log('created:', b1.id, b1.manage_code);

  console.log('\n--- attempt duplicate (must fail) ---');
  try {
    await createBooking({
      resourceType: 'TABLE',
      resourceId: target.resourceId,
      guestCount: 2,
      hostName: 'Conflict Host',
      hostPhone: '08000000001',
      hostEmail: 'conflict@example.com',
      startAt: target.startAt,
    });
    console.log('UNEXPECTED: duplicate succeeded. Constraint is not working.');
  } catch (err) {
    if (err instanceof SlotTakenError) {
      console.log('correctly rejected with SLOT_TAKEN');
    } else {
      console.error('unexpected error:', err);
    }
  }

  console.log('\n--- attempt too-large party (must fail) ---');
  try {
    await createBooking({
      resourceType: 'TABLE',
      resourceId: target.resourceId,
      guestCount: 999,
      hostName: 'Big Party',
      hostPhone: '08000000002',
      hostEmail: 'big@example.com',
      startAt: target.startAt,
    });
    console.log('UNEXPECTED: oversized party succeeded.');
  } catch (err) {
    if (err instanceof ValidationError) {
      console.log('correctly rejected with VALIDATION_ERROR:', err.message);
    } else {
      console.error('unexpected error:', err);
    }
  }

  await db.destroy();
}

main().catch(async (err) => {
  console.error(err);
  await db.destroy();
  process.exit(1);
});