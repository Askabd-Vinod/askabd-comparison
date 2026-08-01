/**
 * AskABD Comparison Platform — Result Adapter
 *
 * Bridges @askabd/shared-result (internal) with the platform's external API format.
 * This is the universal programming model for the AskABD Platform.
 *
 * Internal: { _tag: 'Ok', value } | { _tag: 'Err', error }
 * External: { ok: true, value } | { ok: false, error: { category, code, message, statusCode } }
 *
 * Enhanced with:
 * - Correlation ID support
 * - Service/operation metadata
 * - Timestamp tracking
 * - AppError integration
 */

import { ok, err, isOk, isErr, map, flatMap, match } from '@askabd/shared-result';
import type { Result as SharedResult, Ok, Err } from '@askabd/shared-result';
import { toApiError, handlePrismaError } from '../errors/index.js';
import type { AppError } from '../errors/index.js';
import type { Result as PlatformResult } from '../services/types.js';

// Re-export shared-result primitives for internal service use
export { ok, err, isOk, isErr, map, flatMap, match };
export type { SharedResult, Ok, Err };

/**
 * Internal operation context — attached to results for observability.
 * Never exposed to API consumers.
 */
export interface OperationContext {
  readonly service: string;
  readonly operation: string;
  readonly correlationId?: string;
  readonly timestamp: string;
}

/**
 * Creates an operation context for tracking.
 */
export function createContext(service: string, operation: string, correlationId?: string): OperationContext {
  return { service, operation, correlationId, timestamp: new Date().toISOString() };
}

/**
 * Converts a shared Result<T, AppError> to the platform's external Result<T> format.
 * This is the bridge between internal shared-result and external API contract.
 */
export function toExternal<T>(result: SharedResult<T, AppError>): PlatformResult<T> {
  if (isOk(result)) {
    return { ok: true, value: result.value };
  }
  return { ok: false, error: toApiError(result.error) };
}

/**
 * Wraps an async operation that may throw into a shared Result.
 * Catches Prisma errors and unknown errors, converting them to AppError.
 */
export async function tryCatch<T>(
  operation: () => Promise<T>,
  _context?: OperationContext,
): Promise<SharedResult<T, AppError>> {
  try {
    const value = await operation();
    return ok(value);
  } catch (e: unknown) {
    return err(handlePrismaError(e));
  }
}

/**
 * Wraps an async operation and returns the platform Result format directly.
 * Convenience for route handlers that need the external format.
 */
export async function safeOperation<T>(
  operation: () => Promise<T>,
  context?: OperationContext,
): Promise<PlatformResult<T>> {
  const result = await tryCatch(operation, context);
  return toExternal(result);
}
