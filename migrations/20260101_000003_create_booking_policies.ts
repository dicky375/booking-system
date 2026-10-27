import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TYPE pricing_model AS ENUM ('NONE', 'PER_HEAD', 'FLAT_FEE', 'MIN_SPEND')
  `);

  await knex.schema.createTable('booking_policies', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.specificType('resource_type', 'resource_type').notNullable().unique();
    t.integer('slot_interval_minutes').notNullable().defaultTo(30);
    t.integer('min_lead_minutes').notNullable().defaultTo(0);
    t.integer('max_advance_days').notNullable().defaultTo(90);
    t.integer('hold_ttl_seconds').notNullable().defaultTo(300);
    t.integer('setup_buffer_minutes').notNullable().defaultTo(0);
    t.integer('teardown_buffer_minutes').notNullable().defaultTo(0);
    t.boolean('auto_assign').notNullable().defaultTo(false);
    t.boolean('requires_payment').notNullable().defaultTo(false);
    t.integer('deposit_percent').notNullable().defaultTo(0);
    t.specificType('pricing_model', 'pricing_model').notNullable().defaultTo('NONE');
    t.bigInteger('flat_fee_kobo').nullable();
    t.bigInteger('min_spend_kobo').nullable();
    t.integer('guest_count_change_cutoff_hours').notNullable().defaultTo(24);
    t.integer('default_duration_minutes').notNullable().defaultTo(120);
    t.timestamps(true, true);

    t.check('deposit_percent BETWEEN 0 AND 100');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('booking_policies');
  await knex.raw(`DROP TYPE IF EXISTS pricing_model`);
}