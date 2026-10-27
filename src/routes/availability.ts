import type { FastifyInstance } from 'fastify';
import { getAvailability } from '../services/availability';
import { AvailabilityQuery } from '../schemas/booking';

export async function availabilityRoutes(app: FastifyInstance): Promise<void> {
  app.get('/availability', async (request, reply) => {
    const parsed = AvailabilityQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid query parameters.',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const slots = await getAvailability({
      resourceType: parsed.data.resourceType,
      date: parsed.data.date,
      partySize: parsed.data.partySize,
      serviceName: parsed.data.serviceName,
      resourceId: parsed.data.resourceId,
    });

    return reply.send({
      count: slots.length,
      slots: slots.map((s) => ({
        startAt: s.startAt.toISOString(),
        endAt: s.endAt.toISOString(),
        resourceId: s.resourceId,
        resourceName: s.resourceName,
      })),
    });
  });
}