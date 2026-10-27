import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  try {
    await knex.raw(`CREATE EXTENSION IF NOT EXISTS btree_gist`);
  } catch (err: any) {
    throw new Error(
      `Failed to create btree_gist — the migration role likely lacks CREATE on the database.\n` +
      `Run "CREATE EXTENSION btree_gist;" as a superuser once, then re-run this migration.\n` +
      `Original error: ${err.message}`
    );
  }
}

export async function down(): Promise<void> {
  // Intentionally left empty — dropping btree_gist could break other objects.
}