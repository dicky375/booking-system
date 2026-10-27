import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  await knex('booking_policies').del();

  await knex('booking_policies').insert([
    {
      resource_type: 'TABLE',
      slot_interval_minutes: 30,
      min_lead_minutes: 0,
      max_advance_days: 60,
      hold_ttl_seconds: 300,
      setup_buffer_minutes: 0,
      teardown_buffer_minutes: 15,
      auto_assign: true,
      requires_payment: false,
      deposit_percent: 0,
      pricing_model: 'NONE',
      guest_count_change_cutoff_hours: 24,
      default_duration_minutes: 90,
    },
    {
      resource_type: 'VIP_ROOM',
      slot_interval_minutes: 60,
      min_lead_minutes: 120,
      max_advance_days: 120,
      hold_ttl_seconds: 1800,
      setup_buffer_minutes: 30,
      teardown_buffer_minutes: 30,
      auto_assign: false,
      requires_payment: true,
      deposit_percent: 50,
      pricing_model: 'FLAT_FEE',
      flat_fee_kobo: 50000000, // ₦500,000 placeholder
      guest_count_change_cutoff_hours: 48,
      default_duration_minutes: 180,
    },
    {
      resource_type: 'GARDEN',
      slot_interval_minutes: 60,
      min_lead_minutes: 4320, // 3 days
      max_advance_days: 365,
      hold_ttl_seconds: 1800,
      setup_buffer_minutes: 120,
      teardown_buffer_minutes: 120,
      auto_assign: false,
      requires_payment: true,
      deposit_percent: 30,
      pricing_model: 'PER_HEAD',
      guest_count_change_cutoff_hours: 72,
      default_duration_minutes: 240,
    },
  ]);
}