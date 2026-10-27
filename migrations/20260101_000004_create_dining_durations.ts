import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('dining_durations', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.integer('party_size_min').notNullable();
    t.integer('party_size_max').notNullable();
    t.integer('duration_minutes').notNullable();
    t.timestamps(true, true);

    t.check('party_size_min > 0');
    t.check('party_size_max >= party_size_min');
    t.check('duration_minutes > 0');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('dining_durations');
}