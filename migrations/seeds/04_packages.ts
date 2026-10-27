import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  await knex('packages').del();

  await knex('packages').insert([
    {
      resource_type: 'GARDEN',
      name: 'Buffet',
      price_per_head_kobo: 2500000, // ₦25,000
      min_guests: 20,
      is_active: true,
    },
  ]);
}