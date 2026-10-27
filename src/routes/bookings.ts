import type { FastifyInstance } from 'fastify';
import {
  cancelBooking,
  createBooking,
  getBookingByManageCode,
} from '../services/booking';
import {
  CancelBookingBody,
  CreateBookingBody,
  ManageCodeParam,
} from '../schemas/booking';
import { withIdempotency } from '../middleware/idempotency';

function fingerprint(body: unknown): string {
  return JSON.stringify(body);
}

export async function bookingRoutes(app: FastifyInstance): Promise<void> {
  // ---------- POST /bookings ----------
  app.post('/bookings', async (request, reply) => {
    const parsed = CreateBookingBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request body.',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const idempotencyKey = request.headers['idempotency-key'] as string | undefined;

    const result = await withIdempotency({
      key: idempotencyKey ?? '',
      endpoint: 'POST /bookings',
      requestFingerprint: fingerprint(parsed.data),
      handler: async () => {
        const booking = await createBooking({
          ...parsed.data,
          startAt: new Date(parsed.data.startAt),
        });
        return { status: 201, body: booking };
      },
    });

    return reply.code(result.status).send(result.body);
  });

  // ---------- GET /bookings/:manageCode ----------
  app.get('/bookings/:manageCode', async (request, reply) => {
    const parsed = ManageCodeParam.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid manage code.',
      });
    }

    const booking = await getBookingByManageCode(parsed.data.manageCode);
    if (!booking) {
      return reply.code(404).send({
        error: 'NOT_FOUND',
        message: 'Booking not found.',
      });
    }

    return reply.send(booking);
  });

  // ---------- POST /bookings/:manageCode/cancel ----------
  app.post('/bookings/:manageCode/cancel', async (request, reply) => {
    const paramsParsed = ManageCodeParam.safeParse(request.params);
    if (!paramsParsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid manage code.',
      });
    }

    const bodyParsed = CancelBookingBody.safeParse(request.body ?? {});
    if (!bodyParsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request body.',
        details: bodyParsed.error.flatten().fieldErrors,
      });
    }

    const booking = await getBookingByManageCode(paramsParsed.data.manageCode);
    if (!booking) {
      return reply.code(404).send({
        error: 'NOT_FOUND',
        message: 'Booking not found.',
      });
    }

    const idempotencyKey = request.headers['idempotency-key'] as string | undefined;

    const result = await withIdempotency({
      key: idempotencyKey ?? '',
      endpoint: 'POST /bookings/:manageCode/cancel',
      requestFingerprint: fingerprint({
        manageCode: paramsParsed.data.manageCode,
        reason: bodyParsed.data.reason,
      }),
      handler: async () => {
        const cancelled = await cancelBooking(booking.id, bodyParsed.data.reason);
        return { status: 200, body: cancelled };
      },
    });

    return reply.code(result.status).send(result.body);
  });
}