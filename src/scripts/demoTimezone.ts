import * as dotenv from 'dotenv';
dotenv.config();

import db from '../db/knex';
import { getAvailability } from '../services/availability';
import {
  combineVenueDateAndTime,
  formatVenueTime,
  venueDayOfWeek,
  venueTimezone,
} from '../utils/time';

async function main() {
  const tz = venueTimezone();
  console.log(`VENUE_TZ = ${tz}\n`);

  console.log('--- 1. combineVenueDateAndTime conversions ---');
  const dinnerLagos = combineVenueDateAndTime('2026-10-23', '20:00', 'Africa/Lagos');
  const dinnerNY = combineVenueDateAndTime('2026-10-23', '20:00', 'America/New_York');
  const dinnerLondon = combineVenueDateAndTime('2026-10-23', '20:00', 'Europe/London');

  console.log(`  20:00 Africa/Lagos     → ${dinnerLagos.toISOString()} (expected 19:00Z)`);
  console.log(`  20:00 America/New_York → ${dinnerNY.toISOString()} (expected 00:00Z next day)`);
  console.log(`  20:00 Europe/London    → ${dinnerLondon.toISOString()} (expected 19:00Z, BST)`);

  console.log('\n--- 2. venue day-of-week ---');
  console.log(`  2026-10-23 (Friday) → ${venueDayOfWeek('2026-10-23', 'Africa/Lagos')} (expected 5)`);
  console.log(`  2026-10-26 (Monday) → ${venueDayOfWeek('2026-10-26', 'Africa/Lagos')} (expected 1)`);

  console.log('\n--- 3. availability slots land on venue-local hours ---');
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 7);
  const dateStr = tomorrow.toISOString().slice(0, 10);

  const slots = await getAvailability({
    resourceType: 'TABLE',
    date: dateStr,
    partySize: 4,
  });

  if (slots.length === 0) {
    console.log('  no slots returned — aborting');
    await db.destroy();
    return;
  }

  console.log(`  date: ${dateStr}, ${slots.length} slot(s)`);
  console.log('  first 6 slots:');
  for (const s of slots.slice(0, 6)) {
    console.log(
      `    ${s.startAt.toISOString()}  (venue time: ${formatVenueTime(s.startAt, tz)} on ${s.resourceName})`,
    );
  }

  console.log('\n--- 4. same data, different tz → different instants ---');
  const slotsLagos = await getAvailability({
    resourceType: 'TABLE',
    date: dateStr,
    partySize: 4,
  });

  const original = process.env.VENUE_TZ;
  process.env.VENUE_TZ = 'Europe/London';
  const slotsLondon = await getAvailability({
    resourceType: 'TABLE',
    date: dateStr,
    partySize: 4,
  });
  process.env.VENUE_TZ = original;

  if (slotsLagos.length > 0 && slotsLondon.length > 0) {
    console.log(`  first slot in ${original ?? 'UTC'}: ${slotsLagos[0].startAt.toISOString()}`);
    console.log(`  first slot in Europe/London: ${slotsLondon[0].startAt.toISOString()}`);
    const diffHours =
      (slotsLondon[0].startAt.getTime() - slotsLagos[0].startAt.getTime()) / 3_600_000;
    console.log(`  offset: ${diffHours} hour(s)`);
  }

  console.log('\n--- 5. opening_hours round-trip through venue tz ---');
  const dow = venueDayOfWeek(dateStr, tz);
  const hours = await db('opening_hours')
    .where({ day_of_week: dow })
    .select('service_name', 'open_time', 'last_seating_time', 'close_time');

  for (const h of hours) {
    const open = combineVenueDateAndTime(dateStr, h.open_time, tz);
    console.log(
      `  ${h.service_name}: ${h.open_time} venue → ${formatVenueTime(open, tz)} venue / ${open.toISOString()} UTC`,
    );
  }

  await db.destroy();
}

main()
  .then(() => console.log('\n[demo:timezone] done'))
  .catch(async (err) => {
    console.error('[demo:timezone] rejected:', err);
    await db.destroy();
    process.exit(1);
  });
