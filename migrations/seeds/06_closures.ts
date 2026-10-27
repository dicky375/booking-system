import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  await knex('closures').del();

  await knex('closures').insert([
    { date: '2026-12-25', reason: 'Christmas Day', resource_type: null },
    { date: '2026-01-01', reason: 'New Year’s Day', resource_type: null },
  ]);
}