import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TYPE resource_type AS ENUM ('TABLE', 'VIP_ROOM', 'GARDEN')
  `);

  await knex.schema.createTable('resources', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.specificType('type', 'resource_type').notNullable();
    t.string('name').notNullable();
    t.integer('min_capacity').notNullable();
    t.integer('max_capacity').notNullable();
    t.string('area').nullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.integer('display_order').notNullable().defaultTo(0);
    t.timestamps(true, true);

    t.check('min_capacity > 0');
    t.check('max_capacity >= min_capacity');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('resources');
  await knex.raw(`DROP TYPE IF EXISTS resource_type`);
}