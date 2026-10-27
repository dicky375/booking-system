import * as dotenv from 'dotenv';
dotenv.config();

import db from '../db/knex';
import { withIdempotency, sweepExpiredIdempotencyKeys } from '../middleware/idempotency';
import { AppError } from '../utils/errors';

async function main() {
  const endpoint = '/demo/bookings';
  const key = `demo-key-${Date.now()}`;

  console.log('--- 1. first call (handler should run) ---');
  let handlerRan = 0;
  const first = await withIdempotency({
    key,
    endpoint,
    requestFingerprint: 'body-hash-1',
    handler: async () => {
      handlerRan++;
      return { status: 201, body: { id: 'abc', created: true } };
    },
  });
  console.log('result:', first, '| handlerRan:', handlerRan);

  console.log('\n--- 2. retry with same key (handler should NOT run) ---');
  const second = await withIdempotency({
    key,
    endpoint,
    requestFingerprint: 'body-hash-1',
    handler: async () => {
      handlerRan++;
      return { status: 201, body: { id: 'DIFFERENT', created: true } };
    },
  });
  console.log('result:', second, '| handlerRan:', handlerRan);

  console.log('\n--- 3. fingerprint mismatch (should throw 422) ---');
  try {
    await withIdempotency({
      key,
      endpoint,
      requestFingerprint: 'body-hash-DIFFERENT',
      handler: async () => ({ status: 200, body: {} }),
    });
    console.log('UNEXPECTED: fingerprint mismatch succeeded.');
  } catch (err) {
    if (err instanceof AppError) {
      console.log('correctly rejected:', err.code, err.httpStatus);
    } else {
      console.error('unexpected error:', err);
    }
  }

  console.log('\n--- 4. concurrent duplicate (should throw 409) ---');
  const ckey = `demo-concurrent-${Date.now()}`;
  const slowPromise = withIdempotency({
    key: ckey,
    endpoint,
    handler: async () => {
      await new Promise((r) => setTimeout(r, 500));
      return { status: 200, body: { slow: true } };
    },
  });

  await new Promise((r) => setTimeout(r, 50));

  try {
    await withIdempotency({
      key: ckey,
      endpoint,
      handler: async () => ({ status: 200, body: { shouldnothappen: true } }),
    });
    console.log('UNEXPECTED: concurrent duplicate succeeded.');
  } catch (err) {
    if (err instanceof AppError) {
      console.log('correctly rejected:', err.code, err.httpStatus);
    } else {
      console.error('unexpected error:', err);
    }
  }

  const slowResult = await slowPromise;
  console.log('slow handler result:', slowResult);

  console.log('\n--- 5. failure is retryable ---');
  const fkey = `demo-fail-${Date.now()}`;
  try {
    await withIdempotency({
      key: fkey,
      endpoint,
      handler: async () => {
        throw new AppError('TEMPORARY_BLIP', 'Pretend failure', 500);
      },
    });
  } catch {
    console.log('first attempt failed as expected');
  }
  const retry = await withIdempotency({
    key: fkey,
    endpoint,
    handler: async () => ({ status: 200, body: { recovered: true } }),
  });
  console.log('retry result:', retry);

  console.log('\n--- 6. sweep expired keys ---');
  await db('idempotency_keys').insert({
    key: `expired-${Date.now()}`,
    endpoint: '/sweep-test',
    response_body: null,
    response_status: null,
    state: 'COMPLETED',
    expires_at: new Date(Date.now() - 1000),
  });
  const swept = await sweepExpiredIdempotencyKeys();
  console.log('swept:', swept, 'row(s)');

  await db.destroy();
}

main()
  .then(() => console.log('\n[demo:idempotency] done'))
  .catch(async (err) => {
    console.error('[demo:idempotency] rejected:', err);
    await db.destroy();
    process.exit(1);
  });
