/**
 * AskABD Platform — Monitoring Framework
 *
 * In-process metrics collection for observability.
 * Designed for extraction to @askabd/shared-monitoring.
 *
 * Collects:
 * - Response times (p50, p95, p99)
 * - Request counts by status, method, path
 * - Authentication/authorization failures
 * - Rate limit hits
 * - Validation errors
 * - Database errors and slow queries
 * - Memory and event loop utilization
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MetricsSummary {
  readonly timestamp: string;
  readonly service: string;
  readonly uptime: number;
  readonly requests: RequestMetrics;
  readonly latency: LatencyMetrics;
  readonly errors: ErrorMetrics;
  readonly resources: ResourceMetrics;
}

export interface RequestMetrics {
  readonly total: number;
  readonly success: number;
  readonly clientErrors: number;
  readonly serverErrors: number;
  readonly byMethod: Record<string, number>;
  readonly byStatus: Record<string, number>;
}

export interface LatencyMetrics {
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly avg: number;
  readonly max: number;
}

export interface ErrorMetrics {
  readonly authFailures: number;
  readonly authzDenials: number;
  readonly rateLimitHits: number;
  readonly validationErrors: number;
  readonly databaseErrors: number;
  readonly unhandledErrors: number;
}

export interface ResourceMetrics {
  readonly heapUsedMB: number;
  readonly heapTotalMB: number;
  readonly rssMB: number;
  readonly externalMB: number;
}

// ─── Metrics Collector ────────────────────────────────────────────────────────

class MetricsCollector {
  private responseTimes: number[] = [];
  private requestCount = 0;
  private successCount = 0;
  private clientErrorCount = 0;
  private serverErrorCount = 0;
  private methodCounts: Record<string, number> = {};
  private statusCounts: Record<string, number> = {};
  private authFailures = 0;
  private authzDenials = 0;
  private rateLimitHits = 0;
  private validationErrors = 0;
  private databaseErrors = 0;
  private unhandledErrors = 0;
  private readonly maxSamples = 10000;

  record(method: string, statusCode: number, durationMs: number): void {
    this.requestCount++;
    this.methodCounts[method] = (this.methodCounts[method] ?? 0) + 1;
    this.statusCounts[String(statusCode)] = (this.statusCounts[String(statusCode)] ?? 0) + 1;

    if (statusCode >= 200 && statusCode < 400) this.successCount++;
    else if (statusCode >= 400 && statusCode < 500) this.clientErrorCount++;
    else if (statusCode >= 500) this.serverErrorCount++;

    // Track specific error types
    if (statusCode === 401) this.authFailures++;
    if (statusCode === 403) this.authzDenials++;
    if (statusCode === 429) this.rateLimitHits++;

    // Store response time (ring buffer)
    if (this.responseTimes.length >= this.maxSamples) {
      this.responseTimes.shift();
    }
    this.responseTimes.push(durationMs);
  }

  recordValidationError(): void { this.validationErrors++; }
  recordDatabaseError(): void { this.databaseErrors++; }
  recordUnhandledError(): void { this.unhandledErrors++; }

  getSummary(service: string): MetricsSummary {
    const sorted = [...this.responseTimes].sort((a, b) => a - b);
    const mem = process.memoryUsage();

    return {
      timestamp: new Date().toISOString(),
      service,
      uptime: process.uptime(),
      requests: {
        total: this.requestCount,
        success: this.successCount,
        clientErrors: this.clientErrorCount,
        serverErrors: this.serverErrorCount,
        byMethod: { ...this.methodCounts },
        byStatus: { ...this.statusCounts },
      },
      latency: {
        p50: percentile(sorted, 0.5),
        p95: percentile(sorted, 0.95),
        p99: percentile(sorted, 0.99),
        avg: sorted.length > 0 ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : 0,
        max: sorted.length > 0 ? sorted[sorted.length - 1]! : 0,
      },
      errors: {
        authFailures: this.authFailures,
        authzDenials: this.authzDenials,
        rateLimitHits: this.rateLimitHits,
        validationErrors: this.validationErrors,
        databaseErrors: this.databaseErrors,
        unhandledErrors: this.unhandledErrors,
      },
      resources: {
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
        rssMB: Math.round(mem.rss / 1024 / 1024),
        externalMB: Math.round(mem.external / 1024 / 1024),
      },
    };
  }

  reset(): void {
    this.responseTimes = [];
    this.requestCount = 0;
    this.successCount = 0;
    this.clientErrorCount = 0;
    this.serverErrorCount = 0;
    this.methodCounts = {};
    this.statusCounts = {};
    this.authFailures = 0;
    this.authzDenials = 0;
    this.rateLimitHits = 0;
    this.validationErrors = 0;
    this.databaseErrors = 0;
    this.unhandledErrors = 0;
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(sorted.length * p) - 1;
  return sorted[Math.max(0, idx)]!;
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let metricsInstance: MetricsCollector | null = null;

export function getMetrics(): MetricsCollector {
  if (!metricsInstance) {
    metricsInstance = new MetricsCollector();
  }
  return metricsInstance;
}

// ─── Fastify Integration ──────────────────────────────────────────────────────

/**
 * Registers monitoring hooks on the Fastify instance.
 * Automatically records response times and error counts.
 */
export function registerMonitoring(
  server: FastifyInstance,
  service: string = 'comparison-api',
): void {
  const metrics = getMetrics();

  // Record response timing
  server.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const duration = reply.elapsedTime ?? 0;
    metrics.record(request.method, reply.statusCode, duration);
  });

  // Expose metrics endpoint
  server.get('/metrics', async () => {
    return metrics.getSummary(service);
  });
}
