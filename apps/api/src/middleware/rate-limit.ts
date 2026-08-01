/**
 * AskABD Platform — Rate Limiting Middleware
 *
 * In-memory token bucket rate limiter for Fastify.
 * Designed for extraction to @askabd/shared-middleware.
 *
 * Features:
 * - Per-IP token bucket with configurable limits
 * - Route-specific overrides (e.g., stricter on /compare)
 * - Auth-aware: authenticated users get higher limits
 * - Standard rate limit headers (X-RateLimit-Limit, Remaining, Reset)
 * - Structured 429 responses using shared-errors RateLimitError format
 * - Automatic bucket cleanup (prevents memory leak)
 *
 * Three audiences:
 * - User: "Too many requests. Please wait before trying again."
 * - Developer: Rate limit headers show remaining quota and reset time
 * - Admin: Configurable per route, per identity, cleanup intervals
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/**
 * Rate limit bucket state for a single key.
 */
interface Bucket {
  tokens: number;
  lastRefill: number;
}

/**
 * Rate limit configuration.
 */
export interface RateLimitConfig {
  /** Maximum requests per window (default: 100) */
  max: number;
  /** Window duration in milliseconds (default: 60000 = 1 minute) */
  windowMs: number;
  /** Higher limit for authenticated users (default: max * 3) */
  authenticatedMax?: number;
  /** Routes to exclude from rate limiting */
  excludeRoutes?: string[];
  /** Route-specific overrides: path prefix → config */
  routeOverrides?: Record<string, { max: number; windowMs: number }>;
  /** Bucket cleanup interval in milliseconds (default: 300000 = 5 min) */
  cleanupIntervalMs?: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  max: 100,
  windowMs: 60_000,
  authenticatedMax: 300,
  excludeRoutes: ['/health', '/ready'],
  routeOverrides: {
    '/api/v1/compare': { max: 20, windowMs: 60_000 },
    '/api/v1/admin': { max: 50, windowMs: 60_000 },
  },
  cleanupIntervalMs: 300_000,
};

/**
 * Registers rate limiting middleware.
 */
export function registerRateLimitMiddleware(
  server: FastifyInstance,
  userConfig?: Partial<RateLimitConfig>,
): void {
  const cfg: RateLimitConfig = { ...DEFAULT_CONFIG, ...userConfig };
  const buckets = new Map<string, Bucket>();

  // Periodic cleanup of stale buckets to prevent memory growth
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    const staleThreshold = cfg.windowMs * 2;
    for (const [key, bucket] of buckets) {
      if (now - bucket.lastRefill > staleThreshold) {
        buckets.delete(key);
      }
    }
  }, cfg.cleanupIntervalMs ?? 300_000);

  // Ensure cleanup stops when server closes
  server.addHook('onClose', () => {
    clearInterval(cleanupInterval);
  });

  server.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const path = request.url.split('?')[0]!;

    // Skip excluded routes
    if (cfg.excludeRoutes?.some(r => path === r || path.startsWith(r + '/'))) {
      return;
    }

    // Determine limit for this request
    const routeLimit = getRouteLimit(path, cfg);
    const isAuthenticated = !!(request as any).auth?.userId && (request as any).auth.userId !== 'dev-user-000';
    const maxTokens = isAuthenticated ? (cfg.authenticatedMax ?? routeLimit.max * 3) : routeLimit.max;
    const windowMs = routeLimit.windowMs;

    // Key: IP + route prefix for route-specific limiting
    const ip = request.ip || 'unknown';
    const routePrefix = getRoutePrefix(path, cfg);
    const key = `${ip}:${routePrefix}`;

    // Get or create bucket
    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket) {
      bucket = { tokens: maxTokens, lastRefill: now };
      buckets.set(key, bucket);
    } else {
      // Refill tokens based on elapsed time
      const elapsed = now - bucket.lastRefill;
      const refillRate = maxTokens / windowMs;
      const tokensToAdd = elapsed * refillRate;
      bucket.tokens = Math.min(maxTokens, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }

    // Consume a token
    if (bucket.tokens < 1) {
      const resetMs = Math.ceil((1 - bucket.tokens) / (maxTokens / windowMs));
      const resetTime = Math.ceil((now + resetMs) / 1000);

      reply.header('X-RateLimit-Limit', maxTokens);
      reply.header('X-RateLimit-Remaining', 0);
      reply.header('X-RateLimit-Reset', resetTime);
      reply.header('Retry-After', Math.ceil(resetMs / 1000));

      return reply.status(429).send({
        error: {
          category: 'rate_limited',
          code: 'SHARED.RATE_LIMIT_ERROR',
          message: 'Too many requests. Please wait before trying again.',
          statusCode: 429,
        },
      });
    }

    bucket.tokens -= 1;

    // Set rate limit headers on all responses
    const resetTime = Math.ceil((now + cfg.windowMs) / 1000);
    reply.header('X-RateLimit-Limit', maxTokens);
    reply.header('X-RateLimit-Remaining', Math.floor(bucket.tokens));
    reply.header('X-RateLimit-Reset', resetTime);
  });
}

/**
 * Finds the effective limit for a given path.
 */
function getRouteLimit(path: string, cfg: RateLimitConfig): { max: number; windowMs: number } {
  if (cfg.routeOverrides) {
    for (const [prefix, override] of Object.entries(cfg.routeOverrides)) {
      if (path.startsWith(prefix)) {
        return override;
      }
    }
  }
  return { max: cfg.max, windowMs: cfg.windowMs };
}

/**
 * Gets a route prefix for bucketing (so /api/v1/admin/* shares one bucket).
 */
function getRoutePrefix(path: string, cfg: RateLimitConfig): string {
  if (cfg.routeOverrides) {
    for (const prefix of Object.keys(cfg.routeOverrides)) {
      if (path.startsWith(prefix)) {
        return prefix;
      }
    }
  }
  return 'global';
}
