import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TYPE booking_status AS ENUM (
      'HELD', 'CONFIRMED', 'FULLY_PAID', 'SEATED',
      'COMPLETED', 'CANCELLED', 'EXPIRED', 'NO_SHOW'
    )
  `);

  await knex.schema.createTable('bookings', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('resource_id').notNullable().references('id').inTable('resources').onDelete('RESTRICT');
    t.specificType('resource_type', 'resource_type').notNullable();
    t.uuid('package_id').nullable().references('id').inTable('packages').onDelete('SET NULL');

    t.integer('guest_count').notNullable();
    t.string('host_name').notNullable();
    t.string('host_phone').notNullable();
    t.string('host_email').notNullable();
    t.string('occasion').nullable();
    t.text('special_requests').notNullable().defaultTo('');
    t.string('manage_code').notNullable().unique();

    t.timestamp('start_at', { useTz: true }).notNullable();
    t.timestamp('end_at', { useTz: true }).notNullable();
    t.timestamp('blocks_from', { useTz: true }).notNullable();
    t.timestamp('blocks_until', { useTz: true }).notNullable();

    t.specificType('status', 'booking_status').notNullable().defaultTo('HELD');
    t.timestamp('hold_expires_at', { useTz: true }).nullable();

    t.bigInteger('price_per_head_kobo').nullable();
    t.bigInteger('total_amount_kobo').notNullable().defaultTo(0);
    t.bigInteger('deposit_amount_kobo').notNullable().defaultTo(0);
    t.bigInteger('amount_paid_kobo').notNullable().defaultTo(0);

    t.timestamps(true, true);

    t.check('end_at > start_at');
    t.check('blocks_from <= start_at');
    t.check('blocks_until >= end_at');
    t.check('guest_count > 0');
    t.check('amount_paid_kobo <= total_amount_kobo');
  });

  await knex.raw(`CREATE INDEX idx_bookings_host_phone ON bookings (host_phone)`);
  await knex.raw(`CREATE INDEX idx_bookings_start_at ON bookings (start_at)`);
  await knex.raw(`CREATE INDEX idx_bookings_resource_type ON bookings (resource_type)`);
  await knex.raw(`
    CREATE INDEX idx_bookings_hold_expiry
      ON bookings (hold_expires_at)
      WHERE status = 'HELD'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('bookings');
  await knex.raw(`DROP TYPE IF EXISTS booking_status`);
}