/**
 * Validation adapter — bridges @askabd/shared-validation (shared Result)
 * with the comparison platform's internal Result type.
 *
 * Uses shared validate() internally, converts to { ok, value/error } format.
 * API consumers never see the shared Result type directly.
 */

import type { ZodSchema } from 'zod';
import { validate as sharedValidate } from '@askabd/shared-validation';
import { isOk } from '@askabd/shared-result';
import type { Result } from './types.js';

/**
 * Validates input against a Zod schema, returning the platform's Result type.
 *
 * @param schema - Zod schema to validate against
 * @param input - Unknown input to validate
 * @returns Platform Result<T> — { ok: true, value } or { ok: false, error }
 */
export function validateInput<T>(schema: ZodSchema<T>, input: unknown): Result<T> {
  const result = sharedValidate(schema, input);

  if (isOk(result)) {
    return { ok: true, value: result.value };
  }

  // Extract field errors from ValidationError context
  const context = (result.error as any).context as { fields?: Array<{ path: string; expected: string }> } | undefined;
  const firstField = context?.fields?.[0];

  return {
    ok: false,
    error: {
      category: 'validation',
      code: 'invalid_input',
      field: firstField?.path || undefined,
      message: result.error.message,
      statusCode: 400,
    },
  };
}

// Re-export common schemas for convenience
export { UuidSchema, EmailSchema, NonEmptyStringSchema, UrlSchema } from '@askabd/shared-validation';
export { sanitize } from '@askabd/shared-validation';
