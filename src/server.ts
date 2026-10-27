import * as dotenv from 'dotenv';
dotenv.config();

import { buildApp } from './app';
import db from './db/knex';

async function main(): Promise<void> {
  const app = buildApp();
  const port = Number(process.env.PORT ?? 3000);

  try {
    await app.listen({ port, host: '0.0.0.0' });
    app.log.info(`listening on http://localhost:${port}`);

    const shutdown = async (signal: string) => {
      app.log.info(`${signal} received, shutting down`);
      await app.close();
      await db.destroy();
      process.exit(0);
    };

    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
  } catch (err) {
    app.log.error(err);
    await db.destroy();
    process.exit(1);
  }
}

void main();