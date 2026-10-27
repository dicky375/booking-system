import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../utils/errors';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(
    (error: Error, request: FastifyRequest, reply: FastifyReply) => {
      request.log.error({ err: error }, 'request failed');

      if (error instanceof AppError) {
        return reply.code(error.httpStatus).send({
          error: error.code,
          message: error.message,
          details: error.details,
        });
      }

      // Zod / Fastify validation errors
      if ((error as any).validation) {
        return reply.code(400).send({
          error: 'VALIDATION_ERROR',
          message: error.message,
        });
      }

      // Unexpected
      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
      });
    },
  );

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      error: 'NOT_FOUND',
      message: `Route ${request.method} ${request.url} not found.`,
    });
  });
}