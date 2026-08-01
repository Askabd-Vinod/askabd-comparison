/**
 * AskABD Platform — Service Utilities
 *
 * Reusable service-layer utilities that standardize error handling,
 * logging, and result conversion across all platform services.
 *
 * Designed for extraction to @askabd/shared-service-utils.
 *
 * Replaces:
 * - Manual try/catch with Prisma error codes
 * - Raw Zod safeParse (use validateInput instead)
 * - Silent error swallowing in route handlers
 *
 * Provides:
 * - safeQuery: observable read with fallback (replaces safeRead)
 * - safeWrite: observable write with structured error conversion
 * - withPrismaError: wraps Prisma operations with standard error handling
 */

import type { Result } from '../../services/types.js';
import { handlePrismaError, toApiError } from '../../errors/index.js';

/**
 * Observable read operation with fallback.
 * Unlike the old safeRead, this logs failures for monitoring/alerting.
 *
 * Use for GET endpoints where a fallback is acceptable.
 */
export async function safeQuery<T>(
  operation: () => Promise<T>,
  fallback: T,
  context?: { service?: string; operation?: string; log?: { warn: (...args: any[]) => void } },
): Promise<T> {
  try {
    return await operation();
  } catch (err) {
    if (context?.log) {
      context.log.warn(
        { err: (err as Error).message, service: context.service, operation: context.operation },
        `Query failed, returning fallback`,
      );
    }
    return fallback;
  }
}

/**
 * Wraps a Prisma write operation with standard error handling.
 * Converts Prisma error codes to platform Result format.
 *
 * Use for POST/PUT/DELETE operations.
 */
export async function safeWrite<T>(
  operation: () => Promise<T>,
): Promise<Result<T>> {
  try {
    const value = await operation();
    return { ok: true, value };
  } catch (e: unknown) {
    const appError = handlePrismaError(e);
    return { ok: false, error: toApiError(appError) };
  }
}

/**
 * Wraps a Prisma operation that may throw P2002/P2025/P2003
 * with custom error messages for better UX.
 */
export async function withPrismaError<T>(
  operation: () => Promise<T>,
  errorMap?: Partial<Record<string, { category: string; code: string; message: string; statusCode: number; field?: string }>>,
): Promise<Result<T>> {
  try {
    const value = await operation();
    return { ok: true, value };
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e) {
      const prismaCode = (e as any).code as string;
      const customError = errorMap?.[prismaCode];
      if (customError) {
        return { ok: false, error: customError };
      }
    }
    const appError = handlePrismaError(e);
    return { ok: false, error: toApiError(appError) };
  }
}

/**
 * Sends a Result as HTTP response.
 * Success: 200 (or custom status) with value.
 * Failure: error.statusCode with { error } envelope.
 */
export function sendResult<T>(
  reply: { status: (code: number) => any; send: (data: any) => any },
  result: Result<T>,
  successStatus: number = 200,
): void {
  if (result.ok) {
    reply.status(successStatus).send(result.value);
  } else {
    reply.status(result.error.statusCode ?? 400).send({ error: result.error });
  }
}
