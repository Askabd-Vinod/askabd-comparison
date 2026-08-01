/**
 * Re-exports from @askabd/shared-monitoring + Fastify registration.
 * The MetricsCollector and getMetrics are from the shared package.
 * registerMonitoring is a thin Fastify-specific adapter.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
export { MetricsCollector, getMetrics } from '@askabd/shared-monitoring';
export type { MetricsSummary } from '@askabd/shared-monitoring';
import { getMetrics } from '@askabd/shared-monitoring';

export function registerMonitoring(server: FastifyInstance, service: string = 'comparison-api'): void {
  const metrics = getMetrics();
  server.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const duration = reply.elapsedTime ?? 0;
    metrics.record(request.method, reply.statusCode, duration);
  });
  server.get('/metrics', async () => metrics.getSummary(service));
}
