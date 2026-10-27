import type { Knex } from 'knex';
import db from '../db/knex';
import { Booking } from '../types/booking';

const BATCH_SIZE = 100;

export interface SweepResult {
  expired: Booking[];
  count: number;
}

export async function releaseExpiredHolds(
  now: Date = new Date(),
): Promise<SweepResult> {
  return db.transaction(async (trx: Knex.Transaction) => {
    const candidates = await trx('bookings')
      .where({ status: 'HELD' })
      .andWhere('hold_expires_at', '<=', now)
      .orderBy('hold_expires_at', 'asc')
      .limit(BATCH_SIZE)
      .forUpdate()
      .skipLocked()
      .select('id');

    if (candidates.length === 0) {
      return { expired: [], count: 0 };
    }

    const ids = candidates.map((c: { id: string }) => c.id);

    const expired = await trx('bookings')
      .whereIn('id', ids)
      .update({
        status: 'EXPIRED',
        hold_expires_at: null,
        updated_at: now,
      })
      .returning('*');

    return { expired: expired as Booking[], count: expired.length };
  });
}
