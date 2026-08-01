/**
 * AskABD Comparison Platform — Service Utilities Adapter
 *
 * Re-exports from @askabd/shared-service-utils for platform-wide use.
 * Adds Prisma-specific helpers that use the platform's error framework.
 *
 * Consumers import from this module — not directly from the shared package.
 * This allows platform-specific error mapping to be injected transparently.
 */

// Re-export shared package utilities (the source of truth)
export { safeQuery, sendResult } from '@askabd/shared-service-utils';
export type { SafeQueryContext, HttpReply, ServiceResult, ServiceError } from '@askabd/shared-service-utils';

// Platform-specific: Prisma error handling via shared-errors
import { safeWrite as sharedSafeWrite, withErrorMap } from '@askabd/shared-service-utils';
import type { ServiceResult, ServiceError, ErrorMapper } from '@askabd/shared-service-utils';
import { handlePrismaError, toApiError } from '../../errors/index.js';

/**
 * Platform error mapper — converts any thrown error (including Prisma codes)
 * into the AskABD platform error format via shared-errors.
 */
const platformErrorMapper: ErrorMapper = (e: unknown): ServiceError => {
  const appError = handlePrismaError(e);
  const apiError = toApiError(appError);
  return apiError;
};

/**
 * Wraps an async operation with platform Prisma error handling.
 * Uses @askabd/shared-service-utils safeWrite with the platform error mapper.
 */
export async function safeWrite<T>(
  operation: () => Promise<T>,
): Promise<ServiceResult<T>> {
  return sharedSafeWrite(operation, platformErrorMapper);
}

/**
 * Wraps a Prisma operation with code-specific error messages.
 * Falls back to platform error mapper for unknown codes.
 */
export async function withPrismaError<T>(
  operation: () => Promise<T>,
  errorMap?: Partial<Record<string, ServiceError>>,
): Promise<ServiceResult<T>> {
  return withErrorMap(operation, errorMap ?? {}, platformErrorMapper);
}
