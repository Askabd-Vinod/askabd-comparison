import { apiSafe } from '../lib/api';
import { getEnvConfig } from '../lib/env';

interface HealthReport { overallStatus: string; overallScore: number; dimensions: { name: string; status: string; score: number; details: string; checks: { name: string; status: string; message: string }[] }[]; }
interface StartupReport { overallStatus: string; results: { name: string; status: string; message: string; fix?: string }[]; summary: { total: number; passed: number; failed: number; warnings: number }; readiness: { platform: number; security: number; database: number; infrastructure: number; deployment: number; api: number; overall: number }; }
interface Metrics { timestamp: string; service: string; uptime: number; requests: { total: number; success: number; clientErrors: number; serverErrors: number }; latency: { p50: number; p95: number; p99: number }; errors: { authFailures: number; rateLimitHits: number; validationErrors: number; databaseErrors: number }; resources: { heapUsedMB: number; heapTotalMB: number; rssMB: number }; }
interface Flags { [key: string]: boolean; }

export default async function PlatformPage() {
  const env = getEnvConfig();
  const [health, startup, metrics, flags, swagger] = await Promise.all([
    apiSafe<HealthReport>('/platform/health', { overallStatus: 'unknown', overallScore: 0, dimensions: [] }),
    apiSafe<StartupReport>('/platform/startup', { overallStatus: 'unknown', results: [], summary: { total: 0, passed: 0, failed: 0, warnings: 0 }, readiness: { platform: 0, security: 0, database: 0, infrastructure: 0, deployment: 0, api: 0, overall: 0 } }),
    apiSafe<Metrics>('/metrics', { timestamp: '', service: '', uptime: 0, requests: { total: 0, success: 0, clientErrors: 0, serverErrors: 0 }, latency: { p50: 0, p95: 0, p99: 0 }, errors: { authFailures: 0, rateLimitHits: 0, validationErrors: 0, databaseErrors: 0 }, resources: { heapUsedMB: 0, heapTotalMB: 0, rssMB: 0 } }),
    apiSafe<Flags>('/platform/flags', {}),
    apiSafe<{ openapi: string; info: { title: string; version: string }; paths: Record<string, unknown> }>('/docs/json', { openapi: '', info: { title: '', version: '' }, paths: {} }),
  ]);

  const statusIcon = (s: string) => s === 'healthy' || s === 'ready' || s === 'pass' ? '🟢' : s === 'degraded' || s === 'warn' ? '🟡' : s === 'unknown' || s === 'skip' ? '⚪' : '🔴';

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Platform Manager</h1>
          <p className="text-gray-500 mt-1">AskABD Comparison Platform — Operational Dashboard</p>
        </div>
        <div className="text-right">
          <p className="text-4xl font-bold gradient-text">{startup.readiness?.overall ?? 0}%</p>
          <p className="text-sm text-gray-500">Overall Readiness</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MiniCard label="Environment" value={env.environment.toUpperCase()} icon="🌐" />
        <MiniCard label="Platform" value={health.overallStatus} icon={statusIcon(health.overallStatus)} />
        <MiniCard label="Version" value={`v${env.version}`} icon="📦" />
        <MiniCard label="API Paths" value={String(Object.keys(swagger.paths || {}).length)} icon="🔗" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MiniCard label="Uptime" value={`${Math.round(metrics.uptime)}s`} icon="⏱️" />
        <MiniCard label="Requests" value={String(metrics.requests.total)} icon="📊" />
        <MiniCard label="API URL" value={env.apiUrl.replace('http://', '')} icon="🔌" />
        <MiniCard label="Build" value={env.buildNumber} icon="🏗️" />
      </div>

      {/* Readiness Scores */}
      <section className="bg-white rounded-xl border p-6 mb-6">
        <h2 className="font-semibold text-lg mb-4">Enterprise Readiness Scores</h2>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
          {startup.readiness && Object.entries(startup.readiness).map(([key, val]) => (
            <div key={key} className="text-center">
              <p className="text-2xl font-bold">{val}%</p>
              <p className="text-xs text-gray-500 capitalize">{key}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Health Dimensions */}
      <section className="bg-white rounded-xl border p-6 mb-6">
        <h2 className="font-semibold text-lg mb-4">Health Dimensions</h2>
        <div className="space-y-3">
          {health.dimensions.map(dim => (
            <div key={dim.name} className="flex items-center justify-between py-2 border-b last:border-0">
              <div className="flex items-center gap-3">
                <span>{statusIcon(dim.status)}</span>
                <span className="font-medium">{dim.name}</span>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span>{dim.score}/100</span>
                <span>{dim.details}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Startup Checks */}
      <section className="bg-white rounded-xl border p-6 mb-6">
        <h2 className="font-semibold text-lg mb-4">Startup Validation ({startup.summary.passed}/{startup.summary.total} passed)</h2>
        <div className="grid md:grid-cols-2 gap-2">
          {startup.results.map(r => (
            <div key={r.name} className="flex items-start gap-2 py-1 text-sm">
              <span>{statusIcon(r.status)}</span>
              <div>
                <span className="font-medium">{r.name}</span>
                <span className="text-gray-500 ml-2">{r.message}</span>
                {r.fix && r.status !== 'pass' && <p className="text-xs text-orange-600 mt-0.5">Fix: {r.fix}</p>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Metrics */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <section className="bg-white rounded-xl border p-6">
          <h2 className="font-semibold text-lg mb-4">Latency</h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div><p className="text-2xl font-bold">{Math.round(metrics.latency.p50)}ms</p><p className="text-xs text-gray-500">p50</p></div>
            <div><p className="text-2xl font-bold">{Math.round(metrics.latency.p95)}ms</p><p className="text-xs text-gray-500">p95</p></div>
            <div><p className="text-2xl font-bold">{Math.round(metrics.latency.p99)}ms</p><p className="text-xs text-gray-500">p99</p></div>
          </div>
        </section>
        <section className="bg-white rounded-xl border p-6">
          <h2 className="font-semibold text-lg mb-4">Resources</h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div><p className="text-2xl font-bold">{metrics.resources.heapUsedMB}MB</p><p className="text-xs text-gray-500">Heap Used</p></div>
            <div><p className="text-2xl font-bold">{metrics.resources.heapTotalMB}MB</p><p className="text-xs text-gray-500">Heap Total</p></div>
            <div><p className="text-2xl font-bold">{metrics.resources.rssMB}MB</p><p className="text-xs text-gray-500">RSS</p></div>
          </div>
        </section>
      </div>

      {/* Feature Flags */}
      <section className="bg-white rounded-xl border p-6">
        <h2 className="font-semibold text-lg mb-4">Feature Flags</h2>
        <div className="grid md:grid-cols-2 gap-2">
          {Object.entries(flags).map(([key, enabled]) => (
            <div key={key} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50">
              <span className="text-sm font-medium">{key}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{enabled ? 'ON' : 'OFF'}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function MiniCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="bg-white rounded-xl border p-4 flex items-center gap-3">
      <span className="text-2xl">{icon}</span>
      <div><p className="text-sm text-gray-500">{label}</p><p className="font-bold">{value}</p></div>
    </div>
  );
}
