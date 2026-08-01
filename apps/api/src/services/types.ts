/**
 * Shared types for all services in the AskABD Comparison Platform.
 */

/** Discriminated union for operation results. */
export type Result<T> = 
  | { ok: true; value: T }
  | { ok: false; error: { category: string; code: string; field?: string; message: string; statusCode?: number } };
