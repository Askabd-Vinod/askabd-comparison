/**
 * AskABD Comparison Platform — Error Framework
 *
 * Bridges @askabd/shared-errors with the platform's external API contract.
 * Supports three audiences: User, Developer, Administrator.
 *
 * Internal: uses AppError subclasses from shared-errors
 * External: converts to the platform's { category, code, message, statusCode } format
 */

import {
  AppError,
  isAppError,
  ValidationError,
  NotFoundError,
  ConflictError,
  AuthenticationError,
  AuthorizationError,
  RateLimitError,
  InfrastructureError,
  toHttpResponse,
} from '@askabd/shared-errors';
import type { Result } from '../services/types.js';

// Re-export for internal use
export {
  AppError,
  isAppError,
  ValidationError,
  NotFoundError,
  ConflictError,
  AuthenticationError,
  AuthorizationError,
  RateLimitError,
  InfrastructureError,
  toHttpResponse,
};

/**
 * Maps an AppError to the platform's external error response format.
 * Preserves backward compatibility with existing API contracts.
 *
 * Three audiences:
 * - User: sees `message` (friendly, actionable)
 * - Developer: sees full error in logs (code, context, stack, correlationId)
 * - Admin: sees error catalog entry with resolution guidance
 */
export function toApiError(error: AppError): { category: string; code: string; field?: string; message: string; statusCode: number } {
  const category = mapCodeToCategory(error.code);
  const field = (error.context as any)?.field ?? (error.context as any)?.fields?.[0]?.path;

  return {
    category,
    code: error.code,
    field: field ?? undefined,
    message: error.message,
    statusCode: error.statusCode,
  };
}

/**
 * Converts an AppError into the platform Result error format.
 */
export function errResult<T>(error: AppError): Result<T> {
  return { ok: false, error: toApiError(error) };
}

/**
 * Handles unknown errors from Prisma or other sources.
 * Converts known Prisma error codes to AppError instances.
 */
export function handlePrismaError(e: unknown): AppError {
  if (isAppError(e)) return e;

  if (e && typeof e === 'object' && 'code' in e) {
    const code = (e as any).code;
    switch (code) {
      case 'P2002': return new ConflictError('Resource already exists', { context: { prismaCode: code } });
      case 'P2003': return new ValidationError('Referenced resource does not exist', { context: { prismaCode: code } });
      case 'P2025': return new NotFoundError('Resource not found', { context: { prismaCode: code } });
      default: return new InfrastructureError('Database operation failed', { context: { prismaCode: code }, cause: e });
    }
  }

  return new InfrastructureError('Unexpected error', { cause: e });
}

function mapCodeToCategory(code: string): string {
  if (code.includes('VALIDATION')) return 'validation';
  if (code.includes('NOT_FOUND')) return 'not_found';
  if (code.includes('CONFLICT')) return 'conflict';
  if (code.includes('AUTHENTICATION')) return 'authentication';
  if (code.includes('AUTHORIZATION')) return 'authorization';
  if (code.includes('RATE_LIMIT')) return 'rate_limited';
  return 'server';
}
