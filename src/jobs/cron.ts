import cron from 'node-cron';
import { releaseExpiredHolds } from '../services/holdSweeper';
import db from '../db/knex';

let isRunning = false;

async function tick(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  try {
    const { count, expired } = await releaseExpiredHolds();
    if (count > 0) {
      console.log(
        `[sweeper] released ${count} hold(s):`,
        expired.map((b) => b.manage_code).join(', '),
      );
    }
  } catch (err) {
    console.error('[sweeper] error:', err);
  } finally {
    isRunning = false;
  }
}

function start(): void {
  const task = cron.schedule('* * * * *', tick, { timezone: 'UTC' });
  console.log('[sweeper] running every minute');

  const shutdown = async (signal: string) => {
    console.log(`[sweeper] ${signal} received, stopping…`);
    task.stop();
    await db.destroy();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

if (require.main === module) {
  start();
}

export { start };
