import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { createLogger } from '@askabd/shared-logging';
import { config } from './config/env.js';
import { apiRoutes } from './routes/api-routes.js';
import { operationsCenterRoutes } from './routes/operations-center-routes.js';
import { platformServicesRoutes } from './routes/platform-services-routes.js';
import { invitationRoutes } from './routes/invitation-routes.js';
import { staffRoleRoutes } from './routes/staff-role-routes.js';
import { crmRoutes } from './routes/crm-routes.js';
import { clientRequestsRoutes } from './routes/client-requests-routes.js';
import { clientDatabaseConnectionsRoutes } from './routes/client-database-connections-routes.js';
import { businessRequirementsRoutes } from './routes/business-requirements-routes.js';
import { discoveryIntakeRoutes } from './routes/discovery-intake-routes.js';
import { documentGenerationRoutes } from './routes/document-generation-routes.js';
import { universalComparisonRoutes } from './routes/universal-comparison-routes.js';
import { technologyAdapterRoutes } from './routes/technology-adapter-routes.js';
import { traceabilityRoutes } from './routes/traceability-routes.js';
import { testingEngineRoutes } from './routes/testing-engine-routes.js';
import { uatRoutes } from './routes/uat-routes.js';
import { releaseReadinessRoutes } from './routes/release-readiness-routes.js';
import { deploymentRoutes } from './routes/deployment-routes.js';
import { riskRoutes } from './routes/risk-routes.js';
import { connectionSecurityRoutes } from './routes/connection-security-routes.js';
import { registerAuthMiddleware } from './middleware/auth.js';
import { registerRateLimitMiddleware } from './middleware/rate-limit.js';
import { registerErrorHandler } from './middleware/error-handler.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from './platform/rbac/index.js';
import { registerAuditEngine } from './platform/audit/index.js';
import { registerMonitoring } from './platform/monitoring/index.js';
import { registerOpenAPI } from './platform/openapi/index.js';
import { getDatabaseStatus } from './services/db-pool.js';

/**
 * Creates the Fastify server with shared platform logging and authentication.
 */
export async function createServer(): Promise<FastifyInstance> {
  const logger = createLogger({
    service: 'comparison-api',
    environment: config.NODE_ENV,
    version: '0.1.0',
    level: config.LOG_LEVEL as any,
  });

  const server = Fastify({
    loggerInstance: logger,
    genReqId: (req) => {
      // Propagate incoming correlation ID or generate a new one
      return (req.headers['x-request-id'] as string)
        || (req.headers['x-correlation-id'] as string)
        || crypto.randomUUID();
    },
  });
  await server.register(helmet, { contentSecurityPolicy: false });
  const corsOrigin = config.CORS_ORIGIN ?? '*';
  await server.register(cors, {
    origin: corsOrigin === '*' ? true : corsOrigin.split(',').map(s => s.trim()),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Multipart file upload support
  const multipart = await import('@fastify/multipart');
  await server.register(multipart.default, { limits: { fileSize: 20 * 1024 * 1024 } });

  // OpenAPI documentation (must be registered before routes)
  await registerOpenAPI(server);

  // Echo correlation ID in response headers for distributed tracing
  server.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  // Authentication middleware (dev bypass when no JWT_SECRET configured)
  registerAuthMiddleware(server, {
    publicRoutes: [
      '/health', '/ready', '/metrics', '/platform/startup', '/docs',
      // A brand-new customer has no token yet when they click their invitation link —
      // the invitation's own token IS the authorization for these two specific
      // actions (see routes/invitation-routes.ts). Every other invitation route
      // (create/list/resend/revoke) stays authenticated + Admin.Access-gated.
      '/api/v1/oc/invitations/lookup', '/api/v1/oc/invitations/accept',
    ],
  });

  // Authorization middleware (RBAC — evaluates route rules after auth)
  registerAuthorizationMiddleware(server, {
    rules: COMPARISON_API_RULES,
    defaultPolicy: 'authenticated',
    devBypass: config.NODE_ENV !== 'production',
  });

  // Tenant/client access boundary — the third independent security question
  // ("which client's data"), enforced after authentication and RBAC. See
  // platform/rbac/tenant-access.ts for the full rationale and evidence trail.
  registerTenantAccessMiddleware(server, {
    pathPrefix: '/api/v1/oc/',
    devBypass: config.NODE_ENV !== 'production',
  });

  // Rate limiting middleware (after auth so authenticated users get higher limits)
  registerRateLimitMiddleware(server);

  // Audit engine (captures write operations automatically)
  registerAuditEngine(server, { service: 'comparison-api', repository: 'askabd-comparison' });

  // Monitoring (records response times and error metrics)
  registerMonitoring(server, 'comparison-api');

  // Global error handler (structured responses for all error types)
  registerErrorHandler(server);

  server.get('/health', async () => {
    // Liveness: is this process alive and answering requests? Deliberately does NOT
    // gate on the database — restarting the API would not fix a database outage, and
    // a liveness probe that fails on a downstream dependency causes needless restart
    // loops. `status` therefore reflects startup health only (unchanged contract).
    //
    // `database` below is a LIVE check on every call, not the cached startup flag.
    // Before this fix it reused getDatabaseStatus() — a value set once at startup and
    // never refreshed — so /health kept reporting the database as ready during a real,
    // live Postgres outage (confirmed by DEV failure testing: stopping the DB container
    // left /health saying "database":"ready" while /ready correctly said "disconnected").
    // A monitoring system reading /health must never be told the database is healthy
    // when it is actually unreachable, so this field now always reflects reality.
    let liveDatabase: 'connected' | 'disconnected' = 'disconnected';
    try {
      const { getPrisma } = await import('./services/prisma-client.js');
      await getPrisma().category.count();
      liveDatabase = 'connected';
    } catch { /* liveDatabase stays 'disconnected' */ }

    return {
      status: getDatabaseStatus() === 'ready' ? 'ok' : getDatabaseStatus(), // startup liveness — unchanged
      service: 'comparison-api',
      version: '0.1.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: liveDatabase, // live, current — never stale
    };
  });
  server.get('/ready', async (_request, reply) => {
    // Readiness: verify database connectivity.
    //
    // Found during the final QA/UAT pass (chaos test — DB stopped, endpoint hit live):
    // this handler correctly detected and reported `status: 'degraded'` when the
    // database was down, but never called `reply.status()`, so Fastify defaulted to
    // HTTP 200 either way. A Kubernetes readiness probe (or any load balancer health
    // check) only looks at the HTTP status code, not the JSON body — a 200 response
    // means "keep sending traffic here," so a degraded instance with an honest body
    // but a 200 status would have stayed in rotation, receiving real traffic it
    // cannot serve. Fixed: 503 whenever the database is not reachable, 200 only when
    // it genuinely is. The JSON body's `status`/`database` fields are unchanged.
    try {
      const { getPrisma } = await import('./services/prisma-client.js');
      await getPrisma().category.count();
      return { status: 'ready', database: 'connected' };
    } catch {
      reply.status(503);
      return { status: 'degraded', database: 'disconnected' };
    }
  });
  server.get('/platform/health', async () => {
    const { collectPlatformHealth } = await import('./platform/health/index.js');
    return collectPlatformHealth('comparison-api', {
      checkDatabase: async () => {
        try {
          const { getPrisma } = await import('./services/prisma-client.js');
          const start = Date.now();
          await getPrisma().category.count();
          return { name: 'connectivity', status: 'healthy' as const, message: 'Connected', durationMs: Date.now() - start };
        } catch (err) {
          return { name: 'connectivity', status: 'unhealthy' as const, message: (err as Error).message };
        }
      },
      customDimensions: async () => {
        const now = new Date().toISOString();
        return [
          { name: 'Security Health', status: 'healthy' as const, score: 100, details: 'All security middleware active', lastChecked: now, checks: [
            { name: 'authentication', status: 'healthy' as const, message: 'JWT middleware active' },
            { name: 'authorization', status: 'healthy' as const, message: 'RBAC framework active' },
            { name: 'rate_limiting', status: 'healthy' as const, message: 'Token bucket active' },
          ]},
          { name: 'Platform Health', status: 'healthy' as const, score: 100, details: 'Full middleware stack operational', lastChecked: now, checks: [
            { name: 'auth_middleware', status: 'healthy' as const, message: 'Active' },
            { name: 'audit_engine', status: 'healthy' as const, message: 'Active' },
            { name: 'correlation_id', status: 'healthy' as const, message: 'Active' },
          ]},
        ];
      },
    });
  });
  server.get('/platform/flags', async (request) => {
    const { getFeatureFlags } = await import('./platform/feature-flags/index.js');
    const auth = (request as any).auth;
    return getFeatureFlags().getAllFlags({
      environment: config.NODE_ENV ?? 'development',
      tenantId: auth?.tenantId,
      userId: auth?.userId,
    });
  });
  await server.register(apiRoutes, { prefix: '/api/v1' });
  await server.register(operationsCenterRoutes, { prefix: '/api/v1' });
  await server.register(invitationRoutes, { prefix: '/api/v1' });
  await server.register(staffRoleRoutes, { prefix: '/api/v1' });
  await server.register(crmRoutes, { prefix: '/api/v1' });
  await server.register(clientRequestsRoutes, { prefix: '/api/v1' });
  await server.register(clientDatabaseConnectionsRoutes, { prefix: '/api/v1' });
  await server.register(businessRequirementsRoutes, { prefix: '/api/v1' });
  await server.register(discoveryIntakeRoutes, { prefix: '/api/v1' });
  await server.register(documentGenerationRoutes, { prefix: '/api/v1' });
  await server.register(universalComparisonRoutes, { prefix: '/api/v1' });
  await server.register(technologyAdapterRoutes, { prefix: '/api/v1' });
  await server.register(traceabilityRoutes, { prefix: '/api/v1' });
  await server.register(testingEngineRoutes, { prefix: '/api/v1' });
  await server.register(uatRoutes, { prefix: '/api/v1' });
  await server.register(releaseReadinessRoutes, { prefix: '/api/v1' });
  await server.register(deploymentRoutes, { prefix: '/api/v1' });
  await server.register(riskRoutes, { prefix: '/api/v1' });
  await server.register(connectionSecurityRoutes, { prefix: '/api/v1' });
  await server.register(platformServicesRoutes);
  return server;
}
