import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // NOTE: Only safe on a fresh/empty table. Adding this to a live table
  // takes an ACCESS EXCLUSIVE lock for the full GiST index build and fails
  // if existing rows already overlap. Audit + clean data first.
  await knex.raw(`
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_no_overlap
      EXCLUDE USING gist (
        resource_id WITH =,
        tstzrange(blocks_from, blocks_until, '[)') WITH &&
      ) WHERE (status IN ('HELD', 'CONFIRMED', 'FULLY_PAID', 'SEATED'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE bookings
      DROP CONSTRAINT IF EXISTS bookings_no_overlap
  `);
}