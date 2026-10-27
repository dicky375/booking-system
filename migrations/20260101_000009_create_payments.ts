import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`CREATE TYPE payment_kind AS ENUM ('DEPOSIT', 'BALANCE')`);
  await knex.raw(`CREATE TYPE payment_status AS ENUM ('PENDING', 'SUCCESS', 'FAILED')`);

  await knex.schema.createTable('payments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('booking_id').notNullable().references('id').inTable('bookings').onDelete('CASCADE');
    t.string('provider').notNullable().defaultTo('paystack');
    t.string('provider_reference').notNullable().unique();
    t.specificType('kind', 'payment_kind').notNullable();
    t.bigInteger('amount_kobo').notNullable();
    t.specificType('status', 'payment_status').notNullable().defaultTo('PENDING');
    t.jsonb('raw_payload').nullable();
    t.timestamps(true, true);

    t.check('amount_kobo > 0');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('payments');
  await knex.raw(`DROP TYPE IF EXISTS payment_status`);
  await knex.raw(`DROP TYPE IF EXISTS payment_kind`);
}