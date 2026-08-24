/**
 * RISK-009 platform-wide fix (docs/security-risk-register.md) — a single,
 * shared hook that closes the entire "req.body is undefined on a genuinely
 * empty POST" class in one place, rather than touching the 100+ individual
 * `const body = req.body as {...}` call sites across the route files (mostly
 * `operations-center-routes.ts`) that this session's own mechanical audit
 * found and explicitly disclosed as too large a blast radius to touch
 * per-route. This is exactly the "suggested fix" that disclosure named.
 *
 * Fastify leaves `request.body` as `undefined` — not `{}` — when a POST/PUT/
 * PATCH request has no body at all (no `Content-Type`, zero-length payload).
 * A route reading `(req.body as any).someField` directly then throws a real
 * unhandled `TypeError: Cannot read properties of undefined`, surfacing as
 * an unstructured 500 instead of a clean, safe 4xx — reachable only by a
 * hand-crafted request with no body (every real UI caller always sends a
 * real JSON body, even if `{}`), so this is a robustness/DoS-adjacent
 * hardening fix, not a data-leak or authorization concern.
 *
 * Registered as a `preHandler` (after auth/RBAC/tenant-access, before route
 * handlers) so it runs for exactly the requests that will actually reach a
 * route body-reading `req.body as {...}` cast, and does nothing to responses
 * already rejected upstream by auth/authorization. Scoped to POST/PUT/PATCH
 * only (the methods this codebase's own route handlers read `req.body` for)
 * and only when `request.body` is genuinely `undefined` — never overwrites a
 * real parsed body, including multipart bodies (which this hook is a no-op
 * for, since @fastify/multipart's own parser handles those, not this one).
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

export function registerBodyNormalization(server: FastifyInstance): void {
  server.addHook('preHandler', async (request: FastifyRequest, _reply: FastifyReply) => {
    if (BODY_METHODS.has(request.method) && request.body === undefined) {
      (request as any).body = {};
    }
  });
}
