import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  await knex('opening_hours').del();

  const rows: any[] = [];
  for (let dow = 0; dow <= 6; dow++) {
    rows.push({
      day_of_week: dow,
      service_name: 'Lunch',
      open_time: '12:00',
      last_seating_time: '14:30',
      close_time: '16:00',
      resource_type: null,
    });
    rows.push({
      day_of_week: dow,
      service_name: 'Dinner',
      open_time: '18:00',
      last_seating_time: '21:30',
      close_time: '23:30',
      resource_type: null,
    });
  }

  await knex('opening_hours').insert(rows);
}