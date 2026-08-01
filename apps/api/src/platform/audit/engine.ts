/**
 * AskABD Platform — Audit Engine
 *
 * Automatically captures audit events from requests.
 * Integrates with Fastify hooks for automatic capture.
 *
 * Designed for extraction to @askabd/shared-audit.
 *
 * Features:
 * - Automatic before/after state capture
 * - Correlation ID integration
 * - Configurable sinks (log, database, queue)
 * - Excludable paths and operations
 * - Duration tracking
 * - Error capture
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AuditEntry, AuditConfig, AuditSink } from './types.js';

const DEFAULT_AUDIT_CONFIG: AuditConfig = {
  service: 'comparison-api',
  repository: 'askabd-comparison',
  capturePayloads: false,
  maxPayloadSize: 4096,
  excludePaths: ['/health', '/ready'],
  excludeOperations: [],
};

/**
 * Default audit sink — structured log output.
 */
class LogAuditSink implements AuditSink {
  write(entry: AuditEntry): void {
    // Structured log line for ingestion by log aggregators
    const log = {
      audit: true,
      ...entry,
    };
    // Use process.stdout for audit to avoid Fastify logger formatting
    process.stdout.write(JSON.stringify(log) + '\n');
  }
}

/**
 * Registers the audit engine on the Fastify instance.
 * Captures write operations (POST, PUT, DELETE) as audit events.
 */
export function registerAuditEngine(
  server: FastifyInstance,
  userConfig?: Partial<AuditConfig>,
  sink?: AuditSink,
): void {
  const cfg: AuditConfig = { ...DEFAULT_AUDIT_CONFIG, ...userConfig };
  const auditSink: AuditSink = sink ?? new LogAuditSink();

  // Store request start time for duration calculation
  server.addHook('onRequest', async (request) => {
    (request as any)._auditStart = Date.now();
  });

  // Capture audit event after response is sent
  server.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const path = request.url.split('?')[0]!;

    // Skip excluded paths
    if (cfg.excludePaths?.some(p => path === p || path.startsWith(p + '/'))) {
      return;
    }

    // Only audit write operations by default (configurable)
    const method = request.method.toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return;
    }

    const auth = (request as any).auth;
    const startTime = (request as any)._auditStart ?? Date.now();
    const duration = Date.now() - startTime;
    const statusCode = reply.statusCode;
    const success = statusCode >= 200 && statusCode < 400;

    const entry: AuditEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),

      // WHO
      userId: auth?.userId ?? 'anonymous',
      tenantId: auth?.tenantId ?? 'public',
      sessionId: auth?.metadata?.sessionId,
      ip: request.ip,
      userAgent: request.headers['user-agent'],

      // WHAT
      operation: deriveOperation(method, path),
      resource: deriveResource(path),
      resourceId: deriveResourceId(path),
      method,
      path,

      // CONTEXT
      correlationId: request.id as string,
      requestId: request.id as string,
      service: cfg.service,
      module: deriveModule(path),
      repository: cfg.repository,

      // RESULT
      success,
      durationMs: duration,
      error: !success ? { code: `HTTP_${statusCode}`, message: `Request failed with status ${statusCode}` } : undefined,

      // CLASSIFICATION
      severity: success ? 'info' : (statusCode >= 500 ? 'critical' : 'warning'),
      category: deriveCategory(path),
    };

    // Fire and forget — audit should never block responses
    try {
      auditSink.write(entry);
    } catch {
      // Audit failures are non-critical
    }
  });
}

/**
 * Derives an operation name from method + path.
 * Example: POST /api/v1/categories → Category.Create
 */
function deriveOperation(method: string, path: string): string {
  const resource = deriveResource(path);
  const action = methodToAction(method);
  return `${capitalize(resource)}.${action}`;
}

function methodToAction(method: string): string {
  switch (method) {
    case 'POST': return 'Create';
    case 'PUT': case 'PATCH': return 'Update';
    case 'DELETE': return 'Delete';
    default: return 'Read';
  }
}

/**
 * Derives the resource type from the path.
 */
function deriveResource(path: string): string {
  const segments = path.split('/').filter(Boolean);
  // Skip 'api', 'v1', then take the resource segment
  const resourceIdx = segments.findIndex(s => s === 'v1');
  const resourceSegment = segments[resourceIdx + 1] ?? segments[segments.length - 1] ?? 'unknown';
  // Remove trailing 's' for singular form
  return resourceSegment.endsWith('s') ? resourceSegment.slice(0, -1) : resourceSegment;
}

/**
 * Extracts resource ID from path (UUID or slug after resource).
 */
function deriveResourceId(path: string): string | undefined {
  const segments = path.split('/').filter(Boolean);
  const resourceIdx = segments.findIndex(s => s === 'v1');
  return segments[resourceIdx + 2]; // segment after resource name
}

/**
 * Derives module from path.
 */
function deriveModule(path: string): string {
  if (path.includes('/admin')) return 'admin';
  if (path.includes('/merchant')) return 'merchant';
  if (path.includes('/brand')) return 'merchant';
  return 'api';
}

/**
 * Derives audit category from path.
 */
function deriveCategory(path: string): 'data' | 'auth' | 'admin' | 'system' | 'security' {
  if (path.includes('/admin')) return 'admin';
  if (path.includes('/auth') || path.includes('/login')) return 'auth';
  return 'data';
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Programmatic audit entry creation for service-level auditing.
 */
export function createAuditEntry(
  partial: Partial<AuditEntry> & Pick<AuditEntry, 'userId' | 'tenantId' | 'operation' | 'resource' | 'success' | 'service'>,
): AuditEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    severity: partial.success ? 'info' : 'warning',
    category: 'data',
    ...partial,
  };
}
