/**
 * AskABD Platform — OpenAPI Documentation
 *
 * Registers @fastify/swagger and @fastify/swagger-ui on the Fastify instance.
 * Generates OpenAPI 3.1 specification from existing route definitions.
 *
 * Designed for extraction to @askabd/shared-openapi.
 *
 * Features:
 * - OpenAPI 3.1 specification generation
 * - Swagger UI at /docs
 * - JSON spec at /docs/json
 * - API versioning support (v1)
 * - Authentication documentation (Bearer JWT)
 * - Error response schemas
 * - Rate limit documentation
 * - Platform endpoint documentation
 */

import { FastifyInstance } from 'fastify';

/**
 * Registers OpenAPI documentation on the Fastify instance.
 * Must be called BEFORE routes are registered.
 */
export async function registerOpenAPI(server: FastifyInstance): Promise<void> {
  const swagger = await import('@fastify/swagger');
  const swaggerUi = await import('@fastify/swagger-ui');

  await server.register(swagger.default, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'AskABD Enterprise Platform API',
        description: 'Universal Enterprise Problem Discovery, Decision, Transformation & Continuous Improvement Platform.\n\n' +
          '## Core Capabilities\n' +
          '- Client Onboarding & Lifecycle Management\n' +
          '- Discovery, Assessment & Problem Universe\n' +
          '- Gap Analysis, Options & Decision Framework\n' +
          '- Transformation, Migration & Validation\n' +
          '- Continuous Optimization & Benefit Realization\n' +
          '- Multi-Framework Compliance Automation\n' +
          '- Portfolio Intelligence & Engineering Intelligence\n' +
          '- Client Self-Service Portal\n' +
          '- Workflow Automation & Event Engine\n\n' +
          '## Authentication\n' +
          'All API endpoints (except health/ready/docs) require a Bearer JWT token.\n' +
          'In development mode, authentication is bypassed when no `JWT_SECRET` is configured.\n\n' +
          '## Rate Limiting\n' +
          '- Authenticated: 300 requests/minute\n' +
          '- Rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`\n\n' +
          '## Error Responses\n' +
          'All errors return: `{ error: { category, code, message, statusCode, field? } }`\n\n' +
          '## Versioning\n' +
          'API is versioned via URL path prefix: `/api/v1/`',
        version: '1.0.0',
        contact: {
          name: 'AskABD Platform Team',
          url: 'https://askabd.com',
        },
        license: {
          name: 'Proprietary',
        },
      },
      servers: [
        { url: 'http://localhost:4200', description: 'Local Development' },
        { url: 'https://api.askabd.com', description: 'Production' },
      ],
      tags: [
        { name: 'Health', description: 'Service health and readiness probes' },
        { name: 'Platform', description: 'Platform observability endpoints' },
        { name: 'Categories', description: 'Product category management' },
        { name: 'Items', description: 'Product/item management' },
        { name: 'Comparisons', description: 'Saved comparison management' },
        { name: 'Templates', description: 'Comparison template administration' },
        { name: 'Search', description: 'Cross-entity search' },
        { name: 'Brands', description: 'Brand management' },
        { name: 'Merchants', description: 'Merchant registration and management' },
        { name: 'Clients', description: 'Client registration and management' },
        { name: 'Lifecycle', description: 'Client lifecycle state machine' },
        { name: 'Requirements', description: 'Service requirements and readiness' },
        { name: 'Documents', description: 'Document management and versioning' },
        { name: 'Connectors', description: 'Database/service connector validation' },
        { name: 'Discovery', description: 'Infrastructure and schema discovery' },
        { name: 'Assessment', description: 'Risk assessment and scoring' },
        { name: 'Recommendations', description: 'AI-assisted recommendations' },
        { name: 'Problems', description: 'Problem Universe — discovery and classification' },
        { name: 'Gaps', description: 'Gap Analysis — current vs target state' },
        { name: 'Decisions', description: 'Option comparison and decision records' },
        { name: 'Transformations', description: 'Transformation planning and execution' },
        { name: 'Migration', description: 'Migration planning, execution, validation' },
        { name: 'Financial', description: 'Financial impact and ROI analysis' },
        { name: 'Optimization', description: 'Continuous optimization and measurement' },
        { name: 'Portfolio', description: 'Cross-client portfolio intelligence' },
        { name: 'Portal', description: 'Client self-service portal' },
        { name: 'Workflow', description: 'Workflow automation and event engine' },
        { name: 'Scheduler', description: 'Scheduled job management' },
        { name: 'Compliance', description: 'Compliance frameworks and controls' },
        { name: 'Notifications', description: 'Notification delivery and preferences' },
        { name: 'Audit', description: 'Audit trail and evidence' },
        { name: 'Capabilities', description: 'Platform capability registry' },
        { name: 'Services', description: 'Platform service registry' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'JWT token from askabd-identity service',
          },
        },
        schemas: {
          Error: {
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  category: { type: 'string', examples: ['validation', 'not_found', 'conflict', 'authentication', 'authorization', 'rate_limited', 'server'] },
                  code: { type: 'string', examples: ['invalid_input', 'not_found', 'duplicate_slug'] },
                  message: { type: 'string', examples: ['Category not found'] },
                  statusCode: { type: 'integer', examples: [400, 401, 403, 404, 409, 429, 500] },
                  field: { type: 'string', examples: ['slug', 'categoryId'] },
                },
                required: ['category', 'code', 'message', 'statusCode'],
              },
            },
            required: ['error'],
          },
          Category: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              tenantId: { type: 'string' },
              name: { type: 'string' },
              slug: { type: 'string' },
              parentId: { type: 'string', format: 'uuid' },
              icon: { type: 'string' },
              description: { type: 'string' },
              comparisonTemplate: { type: 'array', items: {} },
              sortOrder: { type: 'integer' },
              active: { type: 'boolean' },
              itemCount: { type: 'integer' },
            },
          },
          Item: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              tenantId: { type: 'string' },
              categoryId: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              slug: { type: 'string' },
              brand: { type: 'string' },
              description: { type: 'string' },
              images: { type: 'array', items: { type: 'string' } },
              specifications: { type: 'object' },
              pros: { type: 'array', items: { type: 'string' } },
              cons: { type: 'array', items: { type: 'string' } },
              rating: { type: 'number' },
              reviewCount: { type: 'integer' },
              priceCurrent: { type: 'number' },
              priceOriginal: { type: 'number' },
              priceCurrency: { type: 'string' },
              availability: { type: 'string' },
              status: { type: 'string' },
            },
          },
          Comparison: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              userId: { type: 'string', format: 'uuid' },
              title: { type: 'string' },
              categoryId: { type: 'string', format: 'uuid' },
              itemIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
              notes: { type: 'string' },
              isPublic: { type: 'boolean' },
              shareToken: { type: 'string' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
          HealthResponse: {
            type: 'object',
            properties: {
              status: { type: 'string', examples: ['ok'] },
              service: { type: 'string', examples: ['comparison-api'] },
              version: { type: 'string', examples: ['0.1.0'] },
              uptime: { type: 'number' },
              timestamp: { type: 'string', format: 'date-time' },
            },
          },
          ReadyResponse: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['ready', 'degraded'] },
              database: { type: 'string', enum: ['connected', 'disconnected'] },
            },
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });

  await server.register(swaggerUi.default, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      defaultModelsExpandDepth: 2,
      tryItOutEnabled: true,
    },
    staticCSP: true,
  });
}
