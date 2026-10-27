import knex from 'knex';
import config from '../../knexfile';

const env = process.env.NODE_ENV || 'development';

export const db = knex(config[env]);

export default db;
