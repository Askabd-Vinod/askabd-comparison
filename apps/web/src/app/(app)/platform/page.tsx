'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';
const VERSION = '0.4.0';
const BUILD = process.env.NEXT_PUBLIC_BUILD_NUMBER || 'local';

function getEnvironment(): 'development' | 'staging' | 'production' {
  if (API.includes('staging')) return 'staging';
  if (API.includes('api.askabd.com') || API.includes('production')) return 'production';
  return 'development';
}

const ENV = getEnvironment();
const ENV_COLORS: Record<string, string> = { development: '#22c55e', staging: '#f59e0b', production: '#ef4444' };
const ENV_LABELS: Record<string, string> = { development: 'DEVELOPMENT', staging: 'STAGING', production: 'PRODUCTION' };

type Status = 'healthy' | 'degraded' | 'warning' | 'unhealthy' | 'unknown' | 'refreshing';
const STATUS_STYLES: Record<string, { bg: string; border: string; text: string; icon: string; label: string }> = {
  healthy: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', icon: '🟢', label: 'HEALTHY' },
  degraded: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800', icon: '🟡', label: 'DEGRADED' },
  warning: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800', icon: '🟡', label: 'WARNING' },
  unhealthy: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', icon: '🔴', label: 'UNHEALTHY' },
  unknown: { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-600', icon: '⚪', label: 'UNKNOWN' },
  refreshing: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: '⟳', label: 'REFRESHING' },
};
function getStyle(s: string) { return STATUS_STYLES[s] || STATUS_STYLES.unknown; }

export default function PlatformPage() {
  const [health, setHealth] = useState<any>(null);
  const [startup, setStartup] = useState<any>(null);
  const [services, setServices] = useState<any>(null);
  const [registry, setRegistry] = useState<any>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedAction, setExpandedAction] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [hRes, sRes, svRes, rgRes] = await Promise.all([
        fetch(`${API}/platform/health`).catch(() => null),
        fetch(`${API}/platform/startup`).catch(() => null),
        fetch(`${API}/platform/services/health`).catch(() => null),
        fetch(`${API}/platform/services/registry/summary`).catch(() => null),
      ]);
      // Batch all state updates together — prevents status flicker between old and new
      const newHealth = hRes?.ok ? await hRes.json() : null;
      const newStartup = sRes?.ok ? await sRes.json() : null;
      const newServices = svRes?.ok ? await svRes.json() : null;
      const newRegistry = rgRes?.ok ? await rgRes.json() : null;
      if (newHealth) setHealth(newHealth);
      if (newStartup) setStartup(newStartup);
      if (newServices) setServices(newServices);
      if (newRegistry) setRegistry(newRegistry);
      setLastUpdated(new Date());
    } catch {} finally { setRefreshing(false); setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { refresh(); const id = setInterval(refresh, 10000); return () => clearInterval(id); }, [refresh]);

  const ago = () => { const s = Math.round((Date.now() - lastUpdated.getTime()) / 1000); return s < 5 ? 'just now' : `${s}s ago`; };
  const readiness = startup?.readiness || {};

  // Determine runtime vs readiness status separately
  const runtimeHealthy = services?.overall === 'HEALTHY';
  const runtimeStatus: Status = runtimeHealthy ? 'healthy' : (services?.unhealthy?.length > 0 ? 'unhealthy' : 'unknown');
  const readinessScore = readiness.overall || 0;
  const readinessStatus: Status = readinessScore >= 100 ? 'healthy' : readinessScore >= 80 ? 'warning' : 'degraded';

  // Overall: In DEV, if all runtime services are healthy, platform is healthy regardless of production-only readiness
  const overallStatus: Status = runtimeStatus === 'unhealthy' ? 'unhealthy'
    : (ENV === 'development' && runtimeStatus === 'healthy') ? 'healthy'
    : (readinessStatus === 'healthy' && runtimeStatus === 'healthy') ? 'healthy' : 'degraded';
  const overallStyle = getStyle(overallStatus);

  // Action items — ONLY show items that actually need attention in the CURRENT environment
  const actions: { text: string; why: string; impact: string; resolution: string; required: boolean; severity: string }[] = [];
  if (services?.unhealthy?.length > 0) {
    services.unhealthy.forEach((s: any) => actions.push({
      text: `${s.name} is ${s.status}`,
      why: s.error || 'Service not responding',
      impact: 'Dependent capabilities may be unavailable',
      resolution: 'Check service process and dependencies, then click Refresh',
      required: true, severity: 'critical'
    }));
  }
  // Only show readiness warnings for STAGING/PRODUCTION — not DEV
  if (ENV !== 'development') {
    if (readiness.security < 100) actions.push({
      text: `Security readiness: ${readiness.security}%`,
      why: 'Production authentication/JWT configuration incomplete',
      impact: 'Production deployment cannot be considered secure',
      resolution: 'Configure JWT_SECRET, enable production authentication, run security validation',
      required: true, severity: 'critical'
    });
  }
  // Health dimension issues — only show truly broken things (not optional/unconfigured in DEV)
  (health?.dimensions || []).forEach((d: any) => {
    if (d.status !== 'healthy' && d.name !== 'Security Health') {
      const checks = d.checks || [];
      const failed = checks.filter((c: any) => c.status !== 'healthy');
      // In DEV, infrastructure items like Redis are optional — skip them
      if (ENV === 'development') {
        const criticalFailed = failed.filter((f: any) => !f.message?.toLowerCase().includes('not configured') && !f.message?.toLowerCase().includes('optional'));
        if (criticalFailed.length === 0) return; // All failures are "not configured" optional items in DEV
      }
      const reason = failed.length > 0 ? failed.map((f: any) => f.message).join('; ') : `${d.name} score: ${d.score}/100`;
      actions.push({
        text: `${d.name}: ${d.status}`,
        why: reason,
        impact: ENV === 'development' ? 'Optional in DEV — required for staging/production' : 'May affect platform operations',
        resolution: ENV === 'development' ? 'Not required for DEV. Configure before deploying to staging/production.' : 'Resolve the failing checks listed above',
        required: ENV !== 'development', severity: ENV === 'development' ? 'info' : 'warning'
      });
    }
  });

  if (loading) return <div className="max-w-[1600px] mx-auto px-4 py-6"><p className="text-gray-500 animate-pulse">Loading platform status...</p></div>;

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6">
      {/* Environment Banner */}
      <div className="mb-5 flex items-center justify-between bg-gray-900 rounded-xl px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full animate-pulse" style={{ background: ENV_COLORS[ENV] }} />
          <span className="font-bold text-white text-sm">{ENV_LABELS[ENV]}</span>
          <span className="text-gray-400 text-xs">v{VERSION}</span>
          <span className="text-gray-500 text-xs">Build: {BUILD}</span>
          <span className="text-gray-600 text-xs">Runtime: Active</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span>Updated: {ago()}</span>
          <button onClick={refresh} disabled={refreshing} className={`px-3 py-1 rounded text-gray-300 transition ${refreshing ? 'bg-blue-700 animate-pulse' : 'bg-gray-700 hover:bg-gray-600'}`}>
            {refreshing ? '⟳ Checking...' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* Platform Status — Clearly Separated Runtime vs Readiness */}
      <div className={`mb-5 rounded-xl border p-5 ${overallStyle.bg} ${overallStyle.border}`}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">{overallStyle.icon}</span>
              <h2 className={`font-bold text-lg ${overallStyle.text}`}>Platform {overallStyle.label}</h2>
            </div>
            {/* Explain the status */}
            <div className="text-sm text-gray-700 space-y-1 mt-2">
              <div className="flex items-center gap-2">
                <span>{getStyle(runtimeStatus).icon}</span>
                <span><strong>Runtime:</strong> {services?.healthy || 0}/{services?.total || 0} services healthy</span>
              </div>
              <div className="flex items-center gap-2">
                <span>{getStyle(readinessStatus).icon}</span>
                <span><strong>Readiness:</strong> {readinessScore}%</span>
                {readinessScore < 100 && <span className="text-xs text-gray-500">({actions.length} item{actions.length !== 1 ? 's' : ''} require attention)</span>}
              </div>
            </div>
            {/* Why is it this status? */}
            {overallStatus !== 'healthy' && (
              <div className="mt-3 pt-2 border-t border-gray-200/60 text-xs text-gray-600">
                <strong>Why {overallStyle.label}?</strong>{' '}
                {runtimeStatus !== 'healthy' ? 'One or more runtime services are not responding. ' : ''}
                {readinessScore < 100 ? `Readiness score is ${readinessScore}% — some platform checks are incomplete.` : ''}
                {runtimeStatus === 'healthy' && readinessScore < 100 && ' All runtime services are healthy — the platform is marked degraded due to incomplete readiness checks only.'}
              </div>
            )}
          </div>
          <Link href="/platform/services" className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap">View Services →</Link>
        </div>
      </div>

      {/* Action Required — Inline Resolution */}
      {actions.filter(a => a.required).length > 0 ? (
        <div className="mb-5 bg-white rounded-xl border p-5">
          <h3 className="font-semibold mb-3 text-sm flex items-center gap-2">⚡ Action Required <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">{actions.filter(a => a.required).length}</span></h3>
          <div className="space-y-2">
            {actions.filter(a => a.required).map((a, i) => (
              <div key={i} className="p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition cursor-pointer" onClick={() => setExpandedAction(expandedAction === i ? null : i)}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 rounded-full ${a.severity === 'critical' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                  <span className="text-sm font-medium">{a.text}</span>
                  <span className="ml-auto text-xs text-gray-400">{expandedAction === i ? '▲' : '▼'}</span>
                </div>
                {expandedAction === i && (
                  <div className="ml-4 mt-2 space-y-1 text-xs border-t pt-2">
                    <div><span className="font-medium text-gray-600">Why:</span> <span className="text-gray-700">{a.why}</span></div>
                    <div><span className="font-medium text-gray-600">Impact:</span> <span className="text-gray-700">{a.impact}</span></div>
                    <div><span className="font-medium text-gray-600">How to resolve:</span> <span className="text-blue-700">{a.resolution}</span></div>
                    <div className="pt-1"><button onClick={(e) => { e.stopPropagation(); refresh(); }} className="text-xs bg-blue-50 text-blue-700 px-3 py-1 rounded border border-blue-200 hover:bg-blue-100">Verify Again ↻</button></div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mb-5 bg-green-50 rounded-xl border border-green-200 px-5 py-3 flex items-center gap-2">
          <span>✓</span>
          <span className="text-sm text-green-800">
            {ENV === 'development'
              ? 'All DEV services healthy. No action required for local development.'
              : 'No immediate action required. All runtime services healthy, readiness complete.'}
          </span>
        </div>
      )}

      {/* Info-only items (not required in current environment) */}
      {actions.filter(a => !a.required).length > 0 && (
        <div className="mb-5 bg-gray-50 rounded-xl border border-gray-200 p-4">
          <h4 className="text-xs font-medium text-gray-500 mb-2">ℹ️ Not required in {ENV_LABELS[ENV]} — needed for staging/production</h4>
          {actions.filter(a => !a.required).map((a, i) => (
            <div key={i} className="text-xs text-gray-500 py-1 flex items-center gap-2">
              <span className="text-gray-300">○</span> {a.text} — <span className="italic">{a.resolution}</span>
            </div>
          ))}
        </div>
      )}

      {/* Readiness Scores — Clickable, with why explanation */}
      <div className="mb-5 bg-white rounded-xl border p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">Readiness Scores</h3>
          <Link href="/platform/production-readiness" className="text-xs text-blue-600 hover:underline">View Details →</Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {Object.entries(readiness).map(([key, val]) => {
            const v = val as number;
            const color = v >= 100 ? 'text-green-600' : v >= 80 ? 'text-yellow-600' : 'text-red-600';
            return (
              <div key={key} className="text-center p-3 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer" title={v < 100 ? `${key} is ${v}% — click View Details for remediation` : `${key} fully ready`}>
                <p className={`text-xl font-bold ${color}`}>{v}%</p>
                <p className="text-[10px] text-gray-500 capitalize">{key}</p>
                {v < 100 && <p className="text-[9px] text-amber-600 mt-0.5">Why?</p>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Navigation */}
      <div className="mb-5 flex gap-2 flex-wrap">
        <Link href="/platform/services" className="inline-flex items-center gap-1.5 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 text-xs font-medium px-3 py-2 rounded-lg transition">🏥 Service Health</Link>
        <Link href="/platform/capabilities" className="inline-flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-medium px-3 py-2 rounded-lg transition">🧩 Capabilities</Link>
        <Link href="/platform/portfolio" className="inline-flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-medium px-3 py-2 rounded-lg transition">📊 Portfolio</Link>
        <Link href="/platform/workflows" className="inline-flex items-center gap-1.5 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 text-xs font-medium px-3 py-2 rounded-lg transition">⚡ Workflows</Link>
        <Link href="/platform/services/registry" className="inline-flex items-center gap-1.5 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 text-cyan-700 text-xs font-medium px-3 py-2 rounded-lg transition">🔧 Service Registry</Link>
        <Link href="/platform/commercial" className="inline-flex items-center gap-1.5 bg-violet-50 hover:bg-violet-100 border border-violet-200 text-violet-700 text-xs font-medium px-3 py-2 rounded-lg transition">💼 Commercial</Link>
        <Link href="/platform/defects" className="inline-flex items-center gap-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-xs font-medium px-3 py-2 rounded-lg transition">🐛 Defects</Link>
        <Link href="/platform/incidents" className="inline-flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 text-xs font-medium px-3 py-2 rounded-lg transition">🚨 Incidents</Link>
        <Link href="/platform/integrations/jira" className="inline-flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-medium px-3 py-2 rounded-lg transition">🔗 Jira</Link>
        <Link href="/platform/production-readiness" className="inline-flex items-center gap-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-xs font-medium px-3 py-2 rounded-lg transition">🚀 Production Readiness</Link>
      </div>

      {/* Service Health — Detailed */}
      <div className="mb-5 bg-white rounded-xl border p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">Service Health</h3>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>Auto-refresh: 10s</span>
            <Link href="/platform/services" className="text-blue-600 hover:underline">Full Details →</Link>
          </div>
        </div>
        <div className="grid gap-2">
          {services?.overall === 'HEALTHY' && !services?.unhealthy?.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {['AskABD API', 'PostgreSQL', 'AskABD Web', 'Mailpit SMTP', 'Mailpit UI'].map(name => (
                <div key={name} className="flex items-center gap-2 p-2 rounded-lg bg-green-50 border border-green-100">
                  <span className="text-green-500 text-xs">●</span>
                  <span className="text-sm font-medium text-green-900">{name}</span>
                  <span className="ml-auto text-xs text-green-600">RUNNING</span>
                </div>
              ))}
            </div>
          ) : services?.unhealthy?.length > 0 ? (
            <div className="space-y-2">
              {services.unhealthy.map((s: any) => (
                <div key={s.id} className="p-3 rounded-lg bg-red-50 border border-red-200">
                  <div className="flex items-center gap-2"><span className="text-red-500">●</span><span className="text-sm font-semibold text-red-900">{s.name}</span><span className="ml-auto text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">{s.status}</span></div>
                  {s.error && <div className="mt-1 ml-4 text-xs text-red-700"><strong>Why:</strong> {s.error}</div>}
                  <div className="mt-1 ml-4 text-xs text-red-600"><strong>Impact:</strong> Dependent capabilities may be unavailable</div>
                  <div className="mt-1 ml-4"><Link href="/platform/services" className="text-xs text-blue-700 hover:underline">View & Resolve →</Link></div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Checking services...</p>
          )}
        </div>
      </div>

      {/* Health Dimensions — With "Why?" explanation */}
      {health?.dimensions?.length > 0 && (
        <div className="mb-5 bg-white rounded-xl border p-5">
          <h3 className="font-semibold text-sm mb-3">Health Dimensions</h3>
          <div className="space-y-2">
            {health.dimensions.map((dim: any) => {
              const style = getStyle(dim.status);
              const checks = dim.checks || [];
              const passed = checks.filter((c: any) => c.status === 'healthy').length;
              const failed = checks.filter((c: any) => c.status !== 'healthy');
              return (
                <div key={dim.name} className={`p-3 rounded-lg border ${style.bg} ${style.border}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span>{style.icon}</span>
                      <span className="font-medium text-sm">{dim.name}</span>
                      <span className={`text-xs ${style.text}`}>{dim.status.toUpperCase()}</span>
                    </div>
                    <span className="text-xs text-gray-500">{dim.score}/100</span>
                  </div>
                  {dim.status !== 'healthy' && failed.length > 0 && (
                    <div className="mt-2 ml-6 text-xs space-y-0.5">
                      <div className="font-medium text-gray-600">Why not 100%?</div>
                      {failed.map((f: any, i: number) => <div key={i} className="text-red-700">✗ {f.name}: {f.message}</div>)}
                      {passed > 0 && <div className="text-green-700">✓ {passed} check{passed > 1 ? 's' : ''} passed</div>}
                    </div>
                  )}
                  {dim.status === 'healthy' && (
                    <div className="mt-1 ml-6 text-xs text-green-700">All {checks.length} required checks passed.</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Capability Registry */}
      {registry && (
        <div className="mb-5 bg-white rounded-xl border p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Capability Registry</h3>
            <Link href="/platform/services/registry" className="text-xs text-blue-600 hover:underline">View All →</Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
            <div><p className="text-xl font-bold">{registry.total}</p><p className="text-[10px] text-gray-500">Total</p></div>
            <div><p className="text-xl font-bold text-green-600">{registry.operational}</p><p className="text-[10px] text-gray-500">Operational</p></div>
            <div><p className="text-xl font-bold text-purple-600">{registry.foundation || 0}</p><p className="text-[10px] text-gray-500">Foundation</p></div>
            <div><p className="text-xl font-bold text-gray-500">{registry.planned || 0}</p><p className="text-[10px] text-gray-500">Planned</p></div>
            <div><p className="text-xl font-bold text-gray-400">{registry.concept || 0}</p><p className="text-[10px] text-gray-500">Concept</p></div>
          </div>
        </div>
      )}

      {/* Dependencies */}
      <div className="mb-5 bg-white rounded-xl border p-5">
        <h3 className="font-semibold text-sm mb-3">Platform Dependencies</h3>
        <div className="text-xs text-gray-600 font-mono space-y-1">
          <div className="flex items-center gap-1"><span className="text-green-500">●</span> AskABD Web → AskABD API</div>
          <div className="flex items-center gap-1 ml-6"><span className="text-green-500">●</span> → PostgreSQL <span className="text-gray-400 font-sans">(persistence, lifecycle, audit)</span></div>
          <div className="flex items-center gap-1 ml-6"><span className="text-green-500">●</span> → Mailpit/SMTP <span className="text-gray-400 font-sans">(email, OTP)</span></div>
          <div className="flex items-center gap-1 ml-6"><span className="text-gray-400">●</span> → File Storage <span className="text-gray-400 font-sans">(documents)</span></div>
          <div className="flex items-center gap-1 ml-6"><span className="text-green-500">●</span> → Scheduler <span className="text-gray-400 font-sans">(background jobs)</span></div>
        </div>
        <div className="mt-3 text-[10px] text-gray-400">If PostgreSQL fails: API, lifecycle, requirements, discovery, assessment, migration all become unavailable.</div>
      </div>

      {/* Startup Validation */}
      {startup?.results?.length > 0 && (
        <div className="mb-5 bg-white rounded-xl border p-5">
          <h3 className="font-semibold text-sm mb-3">Startup Validation <span className="text-xs text-gray-400 font-normal">({startup.summary?.passed}/{startup.summary?.total} passed)</span></h3>
          <div className="grid md:grid-cols-2 gap-1">
            {startup.results.map((r: any) => (
              <div key={r.name} className="flex items-start gap-1.5 py-1 text-xs">
                <span>{r.status === 'pass' ? '🟢' : r.status === 'warn' ? '🟡' : r.status === 'skip' ? '⚪' : '🔴'}</span>
                <div>
                  <span className="font-medium">{r.name}</span>
                  <span className="text-gray-500 ml-1">{r.message}</span>
                  {r.fix && r.status !== 'pass' && <p className="text-orange-600 mt-0.5"><strong>Fix:</strong> {r.fix}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Environment Comparison */}
      <div className="mb-5 bg-white rounded-xl border p-5">
        <h3 className="font-semibold text-sm mb-3">Environment Status</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-gray-500 border-b"><th className="py-2 text-left font-medium">Area</th><th className="py-2 text-center font-medium">DEV</th><th className="py-2 text-center font-medium">STAGING</th><th className="py-2 text-center font-medium">PRODUCTION</th></tr></thead>
            <tbody>
              <tr className="border-b"><td className="py-2">Runtime</td><td className="py-2 text-center">{ENV === 'development' ? '🟢 Active' : '⚪'}</td><td className="py-2 text-center text-gray-400">Not deployed</td><td className="py-2 text-center text-gray-400">Not deployed</td></tr>
              <tr className="border-b"><td className="py-2">API</td><td className="py-2 text-center">{runtimeStatus === 'healthy' ? '🟢 Healthy' : '🔴 Unhealthy'}</td><td className="py-2 text-center text-gray-400">—</td><td className="py-2 text-center text-gray-400">—</td></tr>
              <tr className="border-b"><td className="py-2">Database</td><td className="py-2 text-center">🟢 Connected</td><td className="py-2 text-center text-gray-400">—</td><td className="py-2 text-center text-gray-400">—</td></tr>
              <tr className="border-b"><td className="py-2">Security</td><td className="py-2 text-center">{readiness.security || 0}%</td><td className="py-2 text-center text-gray-400">—</td><td className="py-2 text-center text-gray-400">—</td></tr>
              <tr><td className="py-2">Deployment</td><td className="py-2 text-center">Local</td><td className="py-2 text-center text-gray-400">AWS (pending)</td><td className="py-2 text-center text-gray-400">AWS (pending)</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-gray-400 pt-4 border-t">
        AskABD Enterprise Platform • {ENV_LABELS[ENV]} • v{VERSION} • API: {API.replace('http://', '')} • Last check: {ago()}
      </div>
    </div>
  );
}
