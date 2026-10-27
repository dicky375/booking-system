import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  await knex('resources').del();

  const tables = [
    { name: 'T1', min: 1, max: 2, area: 'Main' },
    { name: 'T2', min: 1, max: 2, area: 'Main' },
    { name: 'T3', min: 2, max: 4, area: 'Main' },
    { name: 'T4', min: 2, max: 4, area: 'Main' },
    { name: 'T5', min: 2, max: 4, area: 'Terrace' },
    { name: 'T6', min: 2, max: 4, area: 'Terrace' },
    { name: 'T7', min: 4, max: 6, area: 'Terrace' },
    { name: 'T8', min: 4, max: 6, area: 'Garden View' },
    { name: 'T9', min: 4, max: 6, area: 'Garden View' },
    { name: 'T10', min: 6, max: 8, area: 'Garden View' },
    { name: 'T11', min: 6, max: 8, area: 'Private' },
    { name: 'T12', min: 8, max: 12, area: 'Private' },
  ];

  const rows = [
    ...tables.map((r, i) => ({
      type: 'TABLE',
      name: r.name,
      min_capacity: r.min,
      max_capacity: r.max,
      area: r.area,
      is_active: true,
      display_order: i + 1,
    })),
    { type: 'VIP_ROOM', name: 'VIP 1', min_capacity: 1, max_capacity: 6, area: 'VIP Wing', is_active: true, display_order: 100 },
    { type: 'VIP_ROOM', name: 'VIP 2', min_capacity: 1, max_capacity: 10, area: 'VIP Wing', is_active: true, display_order: 101 },
    { type: 'VIP_ROOM', name: 'VIP 3', min_capacity: 1, max_capacity: 16, area: 'VIP Wing', is_active: true, display_order: 102 },
    { type: 'GARDEN', name: 'Garden', min_capacity: 1, max_capacity: 150, area: 'Outdoor', is_active: true, display_order: 200 },
  ];

  await knex('resources').insert(rows);
}