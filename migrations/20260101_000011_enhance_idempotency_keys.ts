import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Drop the old PK on `key` — we want a composite PK.
  await knex.raw(`ALTER TABLE idempotency_keys DROP CONSTRAINT IF EXISTS idempotency_keys_pkey`);

  await knex.schema.alterTable('idempotency_keys', (t) => {
    // New columns
    t.string('request_fingerprint').nullable();
    t.string('state').notNullable().defaultTo('IN_FLIGHT');

    // Composite primary key
    t.primary(['key', 'endpoint']);

    // State check
    t.check(
      "state IN ('IN_FLIGHT', 'COMPLETED', 'FAILED')",
      [],
      'idempotency_state_check',
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE idempotency_keys DROP CONSTRAINT IF EXISTS idempotency_keys_pkey
  `);
  await knex.schema.alterTable('idempotency_keys', (t) => {
    t.dropColumn('state');
    t.dropColumn('request_fingerprint');
  });
  await knex.raw(`
    ALTER TABLE idempotency_keys ADD CONSTRAINT idempotency_keys_pkey PRIMARY KEY (key)
  `);
}