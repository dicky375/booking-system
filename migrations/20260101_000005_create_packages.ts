import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('packages', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.specificType('resource_type', 'resource_type').notNullable();
    t.string('name').notNullable();
    t.bigInteger('price_per_head_kobo').notNullable();
    t.integer('min_guests').notNullable().defaultTo(1);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);

    t.check('price_per_head_kobo >= 0');
    t.check('min_guests > 0');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('packages');
}