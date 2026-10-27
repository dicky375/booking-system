import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  await knex('dining_durations').del();

  await knex('dining_durations').insert([
    { party_size_min: 1, party_size_max: 2, duration_minutes: 60 },
    { party_size_min: 3, party_size_max: 4, duration_minutes: 90 },
    { party_size_min: 5, party_size_max: 6, duration_minutes: 105 },
    { party_size_min: 7, party_size_max: 8, duration_minutes: 120 },
    { party_size_min: 9, party_size_max: 12, duration_minutes: 150 },
  ]);
}