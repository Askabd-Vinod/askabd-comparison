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
        title: 'AskABD Comparison API',
        description: 'Enterprise Comparison Platform — Product comparison, merchant management, catalog, and search APIs.\n\n' +
          '## Authentication\n' +
          'All API endpoints (except health/ready) require a Bearer JWT token in the `Authorization` header.\n' +
          'In development mode, authentication is bypassed when no `JWT_SECRET` is configured.\n\n' +
          '## Rate Limiting\n' +
          '- Anonymous: 100 requests/minute\n' +
          '- Authenticated: 300 requests/minute\n' +
          '- Compare endpoint: 20 requests/minute\n' +
          '- Admin endpoints: 50 requests/minute\n\n' +
          'Rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`\n\n' +
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
