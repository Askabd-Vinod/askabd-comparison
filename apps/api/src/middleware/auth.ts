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
 */
export interface TokenClaims {
  sub: string;    // identity ID
  org?: string;   // organization context
  sid?: string;   // session ID
  jti?: string;   // token ID
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
  /** Skip auth in development (for testing) */
  devBypass?: boolean;
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
          message: 'Authentication required. Please provide a valid token.',
          statusCode: 401,
        },
      });
    }

    const token = authHeader.slice(7);

    // Validate token
    try {
      const claims = await verifyToken(token, cfg);
      (request as any).auth = {
        userId: claims.sub,
        tenantId: claims.org ?? 'public',
        permissions: [],
        metadata: { sessionId: claims.sid },
      } satisfies AuthContext;
    } catch (err) {
      const reason = err instanceof jose.errors.JWTExpired ? 'Token expired' :
                     err instanceof jose.errors.JWSSignatureVerificationFailed ? 'Invalid signature' :
                     'Invalid token';

      request.log.warn({ reason, err: (err as Error).message }, 'Authentication failed');

      return reply.status(401).send({
        error: {
          category: 'authentication',
          code: 'SHARED.AUTHENTICATION_ERROR',
          message: 'Authentication failed. Please sign in again.',
          statusCode: 401,
        },
      });
    }
  });
}

async function verifyToken(token: string, cfg: AuthConfig): Promise<TokenClaims> {
  if (cfg.jwksUrl) {
    const jwks = jose.createRemoteJWKSet(new URL(cfg.jwksUrl));
    const { payload } = await jose.jwtVerify(token, jwks, { issuer: cfg.issuer });
    return payload as unknown as TokenClaims;
  }

  if (cfg.jwtSecret) {
    const key = new TextEncoder().encode(cfg.jwtSecret);
    const { payload } = await jose.jwtVerify(token, key, { issuer: cfg.issuer });
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
