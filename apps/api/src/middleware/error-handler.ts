/**
 * AskABD Platform — Global Error Handler
 *
 * Catches all unhandled errors and returns structured responses.
 * Designed for extraction to @askabd/shared-middleware.
 *
 * Features:
 * - Converts AppError instances to structured API responses
 * - Handles Prisma errors (P2002, P2025, etc.)
 * - Handles validation errors (Zod, Fastify schema)
 * - Never leaks stack traces in production
 * - Logs full error context for developers
 * - Correlation ID in error logs
 *
 * Three audiences:
 * - User: Friendly error message with actionable guidance
 * - Developer: Full error details in structured logs
 * - Admin: Error codes for alerting and monitoring dashboards
 */

import { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { isAppError, toApiError, handlePrismaError } from '../errors/index.js';
import { config } from '../config/env.js';

/**
 * Registers the global error handler on the Fastify instance.
 */
export function registerErrorHandler(server: FastifyInstance): void {
  server.setErrorHandler((error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) => {
    // Already an AppError — convert directly
    if (isAppError(error)) {
      const apiError = toApiError(error);
      request.log.warn({ err: error, code: apiError.code }, apiError.message);
      return reply.status(apiError.statusCode).send({ error: apiError });
    }

    // Fastify validation error (schema validation failures)
    if ('validation' in error && Array.isArray((error as any).validation)) {
      const details = (error as any).validation;
      request.log.info({ validation: details }, 'Request validation failed');
      return reply.status(400).send({
        error: {
          category: 'validation',
          code: 'SHARED.VALIDATION_ERROR',
          message: details[0]?.message || 'Request validation failed',
          statusCode: 400,
        },
      });
    }

    // Prisma error (has `.code` like P2002)
    if (error && typeof error === 'object' && 'code' in error && typeof (error as any).code === 'string' && (error as any).code.startsWith('P')) {
      const appError = handlePrismaError(error);
      const apiError = toApiError(appError);
      request.log.warn({ err: error, prismaCode: (error as any).code }, apiError.message);
      return reply.status(apiError.statusCode).send({ error: apiError });
    }

    // Fastify 404 (route not found)
    if ('statusCode' in error && (error as any).statusCode === 404) {
      return reply.status(404).send({
        error: {
          category: 'not_found',
          code: 'SHARED.NOT_FOUND',
          message: 'The requested resource was not found.',
          statusCode: 404,
        },
      });
    }

    // Unknown / unexpected error
    const isProduction = config.NODE_ENV === 'production';
    request.log.error({ err: error, stack: error.stack }, 'Unhandled error');

    return reply.status(500).send({
      error: {
        category: 'server',
        code: 'SHARED.INTERNAL_ERROR',
        message: isProduction
          ? 'An unexpected error occurred. Please try again later.'
          : error.message || 'Internal server error',
        statusCode: 500,
      },
    });
  });

  // Handle 404 for unmatched routes
  server.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(404).send({
      error: {
        category: 'not_found',
        code: 'SHARED.NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found.`,
        statusCode: 404,
      },
    });
  });
}
