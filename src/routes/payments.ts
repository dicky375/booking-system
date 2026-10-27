import type { FastifyInstance } from 'fastify';
import { initiatePayment, verifyPayment } from '../services/payments';
import { verifyWebhookSignature } from '../services/paystack';
import { InitiatePaymentBody } from '../schemas/booking';
import { withIdempotency } from '../middleware/idempotency';

export async function paymentRoutes(app: FastifyInstance): Promise<void> {
  // ---------- POST /payments/initiate ----------
  app.post('/payments/initiate', async (request, reply) => {
    const parsed = InitiatePaymentBody.safeParse(request.body);
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
      endpoint: 'POST /payments/initiate',
      requestFingerprint: JSON.stringify(parsed.data),
      handler: async () => {
        const init = await initiatePayment({
          bookingId: parsed.data.bookingId,
          kind: parsed.data.kind,
          callbackUrl: parsed.data.callbackUrl,
        });
        return { status: 200, body: init };
      },
    });

    return reply.code(result.status).send(result.body);
  });

  // ---------- POST /payments/webhook ----------
  app.post('/payments/webhook', async (request, reply) => {
    const signature = request.headers['x-paystack-signature'] as string | undefined;
    const rawBody = (request as any).rawBody as Buffer | undefined;

    if (!rawBody) {
      return reply.code(400).send({
        error: 'MISSING_RAW_BODY',
        message: 'Raw body not available for signature verification.',
      });
    }

    if (!verifyWebhookSignature(rawBody, signature)) {
      request.log.warn('invalid Paystack webhook signature');
      return reply.code(401).send({
        error: 'INVALID_SIGNATURE',
        message: 'Webhook signature verification failed.',
      });
    }

    const payload = request.body as {
      event?: string;
      data?: { reference?: string };
    };

    const reference = payload.data?.reference;
    if (!reference) {
      return reply.code(400).send({
        error: 'MISSING_REFERENCE',
        message: 'Webhook payload has no data.reference.',
      });
    }

    // Idempotent — Paystack retries webhooks for up to 72 hours [citation:9].
    // Key is derived from the reference so a retry of the same event is a no-op.
    const result = await withIdempotency({
      key: `webhook:${reference}`,
      endpoint: 'POST /payments/webhook',
      handler: async () => {
        const verified = await verifyPayment(reference);
        return {
          status: 200,
          body: {
            received: true,
            reference,
            bookingStatus: verified.bookingStatus,
          },
        };
      },
    });

    return reply.code(result.status).send(result.body);
  });
}