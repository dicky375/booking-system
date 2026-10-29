import * as dotenv from 'dotenv';
dotenv.config();

import type { Knex } from 'knex';

const baseConfig: Knex.Config = {
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('neon.tech')
      ? { rejectUnauthorized: false }
      : false,
  },
  migrations: {
    directory: './migrations',
    extension: 'ts',
    loadExtensions: ['.ts'],
  },
  seeds: {
    directory: './migrations/seeds',
    extension: 'ts',
    loadExtensions: ['.ts'],
  },
};

const config: { [key: string]: Knex.Config } = {
  development: baseConfig,
  production: baseConfig,
};

export default config;