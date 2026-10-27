import * as dotenv from 'dotenv';
dotenv.config();
import type { Knex } from 'knex';

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
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
  },
};

export default config;