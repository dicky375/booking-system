
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('opening_hours', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.integer('day_of_week').notNullable(); // 0=Sunday .. 6=Saturday
    t.string('service_name').notNullable();
    t.time('open_time').notNullable();
    t.time('last_seating_time').notNullable();
    t.time('close_time').notNullable();
    t.specificType('resource_type', 'resource_type').nullable();
    t.timestamps(true, true);

    t.check('day_of_week BETWEEN 0 AND 6');
    t.check('last_seating_time <= close_time');
  });

  await knex.schema.createTable('closures', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.date('date').notNullable();
    t.string('reason').notNullable();
    t.specificType('resource_type', 'resource_type').nullable(); // null = all types
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('closures');
  await knex.schema.dropTableIfExists('opening_hours');
}