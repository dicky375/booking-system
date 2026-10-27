import Fastify, { type FastifyInstance } from 'fastify';
import { registerErrorHandler } from './plugins/errorHandler';
import { availabilityRoutes } from './routes/availability';
import { bookingRoutes } from './routes/bookings';
import { paymentRoutes } from './routes/payments';

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport:
        process.env.NODE_ENV === 'production'
          ? undefined
          : { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss Z' } },
    },

  });

  // Preserve the raw body for webhook signature verification.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req, body, done) => {
      try {
        (req as any).rawBody = body;
        done(null, JSON.parse(body.toString('utf8')));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  registerErrorHandler(app);

  app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));

  app.register(availabilityRoutes);
  app.register(bookingRoutes);
  app.register(paymentRoutes);

  return app;
}