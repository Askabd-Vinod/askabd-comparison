/**
 * AskABD Platform — Authentication Middleware
 *
 * Reusable Fastify preHandler that validates JWT tokens and attaches
 * AuthContext to request. Designed for extraction to @askabd/shared-middleware.
 *
 * Features:
 * - JWT signature verification (EdDSA/RS256)
 * - Configurable public routes (no auth required)
 * - AuthContext attached to request for downstream services
 * - Structured error responses (401/403) using shared-errors
 * - Development mode bypass option
 *
 * Three audiences:
 * - User: "Authentication required. Please sign in."
 * - Developer: Token validation details in logs
 * - Admin: Identity service connectivity in health checks
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as jose from 'jose';
import type { AuthContext } from '../contracts/index.js';
import { config } from '../config/env.js';

/**
 * JWT claims structure matching askabd-identity token format.
 *
 * `roles`/`permissions`/`scope` follow common OIDC/OAuth2 claim conventions
 * (roles as a string array, permissions as a string array, scope as a
 * space-separated string per RFC 6749 §3.3) since they are not yet documented
 * by the real askabd-identity service from this repository's vantage point.
 * See docs/identity-rbac-architecture-audit.md — this is a best-effort,
 * standards-based read of whatever a real token actually contains, not a
 * confirmed integration. If the real service uses different claim names, this
 * will safely read nothing (fails to an unprivileged 'customer' role, never to
 * elevated access) until corrected against real documentation/a real token.
 */
export interface TokenClaims {
  sub: string;    // identity ID
  org?: string;   // organization context
  sid?: string;   // session ID
  jti?: string;   // token ID
  roles?: string[] | string;
  permissions?: string[] | string;
  scope?: string;
  iat: number;
  exp: number;
}

/**
 * Configuration for the auth middleware.
 */
export interface AuthConfig {
  /** Public routes that do not require authentication */
  publicRoutes: string[];
  /** JWT verification key (public key or secret) */
  jwtSecret?: string;
  /** JWKS endpoint URL (alternative to static key) */
  jwksUrl?: string;
  /** Expected JWT issuer */
  issuer?: string;
  /** Expected JWT audience. Only enforced when set — jose skips the audience
   *  check entirely when this is undefined, so leaving it unset changes
   *  nothing until the real value is known (see
   *  docs/identity-production-requirements.md). */
  audience?: string;
  /** Skip auth in development (for testing) */
  devBypass?: boolean;
}

/** Accepts a JWT-standard array claim OR a space-separated string claim (the
 *  `scope` convention) and normalizes both to a string array. Never throws. */
function normalizeClaimList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string' && value.trim().length > 0) return value.trim().split(/\s+/);
  return [];
}

const DEFAULT_PUBLIC_ROUTES = [
  '/health',
  '/ready',
];

/**
 * Registers authentication middleware on all routes.
 * Public routes are excluded from auth checks.
 */
export function registerAuthMiddleware(server: FastifyInstance, authConfig?: Partial<AuthConfig>): void {
  const cfg: AuthConfig = {
    publicRoutes: [...DEFAULT_PUBLIC_ROUTES, ...(authConfig?.publicRoutes ?? [])],
    jwtSecret: authConfig?.jwtSecret ?? process.env.JWT_SECRET,
    jwksUrl: authConfig?.jwksUrl ?? process.env.JWKS_URL,
    issuer: authConfig?.issuer ?? 'askabd-identity',
    audience: authConfig?.audience ?? process.env.JWT_AUDIENCE,
    devBypass: authConfig?.devBypass ?? (config.NODE_ENV !== 'production' && !process.env.JWT_SECRET && !process.env.JWKS_URL),
  };

  server.decorateRequest('auth', null);

  server.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip public routes
    const path = request.url.split('?')[0]!;
    if (cfg.publicRoutes.some(r => path === r || path.startsWith(r + '/'))) {
      return;
    }

    // Development bypass (no key configured)
    if (cfg.devBypass) {
      (request as any).auth = {
        userId: 'dev-user-000',
        tenantId: 'public',
        permissions: [],
      } satisfies AuthContext;
      return;
    }

    // Extract token
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: {
          category: 'authentication',
          code: 'SHARED.AUTHENTICATION_ERROR',
          // `reasonCode` is a stable, safe, non-leaking machine-readable discriminator
          // (never a raw jose error, never a stack trace) so a real frontend login flow
          // can render the exact right message per its own UX copy (e.g. "Please sign in
          // to continue." for not_authenticated vs. "Your session has expired. Please
          // sign in again." for token_expired) without guessing from the human-readable
          // `message` string. Additive only — every existing field is unchanged.
          reasonCode: 'not_authenticated',
          message: 'Authentication required. Please provide a valid token.',
          statusCode: 401,
        },
      });
    }

    const token = authHeader.slice(7);

    // Validate token
    try {
      const claims = await verifyToken(token, cfg);
      // Previously this always set permissions: [] and never read any role/permission
      // claim from the verified token, so every authenticated user resolved to the
      // unprivileged 'customer' role regardless of their real identity (see
      // docs/identity-rbac-architecture-audit.md). Now reads whatever the token
      // actually contains, defaulting to nothing (safe: still 'customer') if absent.
      const roles = normalizeClaimList(claims.roles);
      const directPermissions = normalizeClaimList(claims.permissions ?? claims.scope);
      (request as any).auth = {
        userId: claims.sub,
        tenantId: claims.org ?? 'public',
        permissions: directPermissions,
        metadata: { sessionId: claims.sid, roles },
      } satisfies AuthContext;
    } catch (err) {
      const expired = err instanceof jose.errors.JWTExpired;
      const reason = expired ? 'Token expired' :
                     err instanceof jose.errors.JWSSignatureVerificationFailed ? 'Invalid signature' :
                     'Invalid token';

      // Full reason logged server-side only (never sent to the client) — matches the
      // existing pattern below (denyAccess()'s `detail` field), except this endpoint
      // never exposes `reason` at all, even in non-production, since a 401 body is far
      // more likely to be inspected by an actual attacker probing token validity than a
      // 403 body is.
      request.log.warn({ reason, err: (err as Error).message }, 'Authentication failed');

      return reply.status(401).send({
        error: {
          category: 'authentication',
          code: 'SHARED.AUTHENTICATION_ERROR',
          // Safe, stable discriminator — see the missing-token branch above for why this
          // exists. `token_expired` is the one case with a genuinely different, more
          // actionable user message ("your session expired" vs. "we couldn't verify
          // your session") — signature failures and malformed tokens are intentionally
          // collapsed into the same `invalid_token` code so a client can never learn
          // *why* a forged/tampered token failed.
          reasonCode: expired ? 'token_expired' : 'invalid_token',
          message: expired
            ? 'Your session has expired. Please sign in again.'
            : 'We could not verify your session. Please sign in again.',
          statusCode: 401,
        },
      });
    }
  });
}

async function verifyToken(token: string, cfg: AuthConfig): Promise<TokenClaims> {
  // audience is only enforced when cfg.audience is actually set — jose's
  // JWTVerifyOptions simply skips the `aud` check when the option is undefined, so
  // leaving it unconfigured changes nothing versus before this fix.
  if (cfg.jwksUrl) {
    const jwks = jose.createRemoteJWKSet(new URL(cfg.jwksUrl));
    const { payload } = await jose.jwtVerify(token, jwks, { issuer: cfg.issuer, audience: cfg.audience });
    return payload as unknown as TokenClaims;
  }

  if (cfg.jwtSecret) {
    const key = new TextEncoder().encode(cfg.jwtSecret);
    const { payload } = await jose.jwtVerify(token, key, { issuer: cfg.issuer, audience: cfg.audience });
    return payload as unknown as TokenClaims;
  }

  throw new Error('No JWT verification key configured');
}

/**
 * Helper to get AuthContext from request (typed access).
 */
export function getAuth(request: FastifyRequest): AuthContext | null {
  return (request as any).auth ?? null;
}
