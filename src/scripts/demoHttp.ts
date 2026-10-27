import * as dotenv from 'dotenv';
dotenv.config();

const BASE = process.env.DEMO_BASE_URL ?? 'http://localhost:3000';

async function json(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function main() {
  console.log('1. GET /health');
  let res = await fetch(`${BASE}/health`);
  console.log('  ', res.status, await json(res));

  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 6);
  const dateStr = tomorrow.toISOString().slice(0, 10);

  console.log('\n2. GET /availability (TABLE, 4 guests)');
  res = await fetch(
    `${BASE}/availability?resourceType=TABLE&date=${dateStr}&partySize=4`,
  );
  const availability = (await json(res)) as { slots: any[] };
  console.log('  ', res.status, 'count:', availability.slots?.length);

  if (!availability.slots?.length) {
    console.log('no slots — abort');
    return;
  }

  const slot = availability.slots[0];
  const startAt = new Date(slot.startAt);

  console.log('\n3. POST /bookings (with Idempotency-Key)');
  const idemKey = `demo-http-${Date.now()}`;
  const bookingBody = {
    resourceType: 'TABLE',
    resourceId: slot.resourceId,
    guestCount: 4,
    hostName: 'HTTP Demo',
    hostPhone: '08000000000',
    hostEmail: 'http@example.com',
    startAt: startAt.toISOString(),
  };

  res = await fetch(`${BASE}/bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idemKey,
    },
    body: JSON.stringify(bookingBody),
  });
  const booking = (await json(res)) as any;
  console.log('  ', res.status, 'manage_code:', booking.manage_code);

  console.log('\n4. POST /bookings again with SAME Idempotency-Key (should replay)');
  res = await fetch(`${BASE}/bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idemKey,
    },
    body: JSON.stringify(bookingBody),
  });
  const replay = (await json(res)) as any;
  console.log('  ', res.status, 'same id?', replay.id === booking.id);

  console.log('\n5. GET /bookings/:manageCode');
  res = await fetch(`${BASE}/bookings/${booking.manage_code}`);
  console.log('  ', res.status, await json(res));

  console.log('\n6. POST /payments/initiate (DEPOSIT on a TABLE — should fail, no payment required)');
  res = await fetch(`${BASE}/payments/initiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingId: booking.id, kind: 'DEPOSIT' }),
  });
  console.log('  ', res.status, await json(res));

  console.log('\n7. POST /payments/webhook (mock signature)');
  res = await fetch(`${BASE}/payments/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-paystack-signature': 'mock-signature',
    },
    body: JSON.stringify({
      event: 'charge.success',
      data: { reference: 'does-not-exist' },
    }),
  });
  console.log('  ', res.status, await json(res));

  console.log('\n8. POST /bookings/:manageCode/cancel');
  res = await fetch(`${BASE}/bookings/${booking.manage_code}/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `cancel-${Date.now()}`,
    },
    body: JSON.stringify({ reason: 'HTTP demo cancel' }),
  });
  console.log('  ', res.status, (await json(res)) as any);

  console.log('\n[demo:http] done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});