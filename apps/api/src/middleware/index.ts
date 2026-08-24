/**
 * AskABD Platform — Middleware Layer
 *
 * Re-exports all middleware for clean imports.
 * Registration order in server.ts matters:
 * 1. Auth (first - identifies the user)
 * 2. Rate limit (second - uses auth context for limits)
 * 3. Error handler (last - catches all unhandled errors)
 */

export { registerAuthMiddleware, getAuth } from './auth.js';
export type { AuthConfig, TokenClaims } from './auth.js';

export { registerRateLimitMiddleware } from './rate-limit.js';
export type { RateLimitConfig } from './rate-limit.js';

export { registerErrorHandler } from './error-handler.js';

export { registerRawBodyCapture, getRawBody } from './raw-body.js';

export { registerBodyNormalization } from './body-normalization.js';
