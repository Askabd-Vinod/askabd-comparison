import Link from 'next/link';
import { Breadcrumb } from '../components/breadcrumb';
import { statusColor } from '../components/status-badge';
import { apiSafe } from '../lib/api';
import { Legend } from '../components/legend';
import { AIInsightsPanel } from '../components/ai-insights';
import { KpiCard } from '../components/kpi-card';
import { formatComputedAt } from '../lib/health-tier';

interface RealClient {
  id: string; name: string; logo: string; industry: string; health: string;
  sla_status: string; status: string; onboarded_at: string;
}
interface HealthSummaryRow { clientId: string; overallScore: number | null; computedAt: string | null }

export default async function DashboardPage() {
  // Authoritative client data — GET /oc/clients (oc_clients table), not fabricated sample data.
  const { clients } = await apiSafe<{ clients: RealClient[] }>('/api/v1/oc/clients', { clients: [] });
  const health = await apiSafe<{ overallStatus: string }>('/platform/health', { overallStatus: 'unknown' });
  // Real, evidence-based per-client health scores (ClientHealthService) — one request
  // for the whole list, reading each client's last-computed snapshot rather than the
  // static oc_clients.platform_score default.
  const { summaries } = await apiSafe<{ summaries: HealthSummaryRow[] }>('/api/v1/oc/clients/health-summary', { summaries: [] });
  const scoreByClient = new Map(summaries.map(s => [s.clientId, s]));

  const stats = {
    active: clients.length,
    healthy: clients.filter(c => c.health === 'healthy').length,
    warning: clients.filter(c => c.health === 'warning').length,
    critical: clients.filter(c => c.health === 'critical').length,
    offline: clients.filter(c => c.health === 'offline').length,
    slaCompliant: clients.filter(c => c.sla_status === 'compliant').length,
    platformHealth: health.overallStatus,
  };

  const scoredClients = summaries.filter(s => s.overallScore !== null);
  const avgHealthScore = scoredClients.length > 0
    ? Math.round(scoredClients.reduce((a, s) => a + (s.overallScore as number), 0) / scoredClients.length)
    : null;

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
      <Breadcrumb items={[{ label: 'Dashboard' }]} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Executive Operations Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">AskABD Enterprise Operations Centre</p>
        </div>
        <p className="text-xs text-gray-500 bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm">
          {new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* KPI Grid — every tile below is either a real database value or explicitly marked unavailable */}
      <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-gray-200/60 p-4 mb-8 shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KpiCard href="/clients" label="Active Clients" value={stats.active} description="Total number of clients currently registered on the platform." criteria="Count of rows in the authoritative client database (GET /oc/clients)." />
        <KpiCard href="/clients?health=healthy" label="Healthy" value={stats.healthy} color="text-green-600" description="Clients whose stored health status is 'healthy'." criteria="oc_clients.health = 'healthy'." />
        <KpiCard href="/clients?health=warning" label="Warning" value={stats.warning} color="text-orange-600" description="Clients whose stored health status is 'warning'." criteria="oc_clients.health = 'warning'." />
        <KpiCard href="/clients?health=critical" label="Critical" value={stats.critical} color="text-red-600" description="Clients whose stored health status is 'critical'." criteria="oc_clients.health = 'critical'." />
        <KpiCard href="/clients?health=offline" label="Offline" value={stats.offline} color="text-gray-500" description="Clients whose stored health status is 'offline'." criteria="oc_clients.health = 'offline'." />
        <KpiCard href="/clients?status=sla-compliant" label="SLA Compliant" value={`${stats.slaCompliant}/${stats.active}`} color="text-green-600" description="Clients whose stored SLA status is 'compliant', vs total." criteria="oc_clients.sla_status = 'compliant'." />
        <KpiCard href="/platform" label="Platform Health" value={stats.platformHealth} description="Overall health of the AskABD platform infrastructure." criteria="Derived from /platform/health endpoint." />
        <KpiCard label="Availability" value="Not yet available" color="text-gray-400" description="Aggregate uptime monitoring across clients is not implemented yet — no authoritative source exists to compute this from." criteria="Requires a real monitoring/uptime integration (not yet built)." />
        <KpiCard label="Today Deploys" value="Not yet available" color="text-gray-400" description="Deployment tracking is not implemented yet." criteria="Requires a deployment-events data source (not yet built)." />
        <KpiCard label="Incidents" value="Not yet available" color="text-gray-400" description="Platform-wide incident aggregation across clients is not implemented yet — see /platform/incidents for platform-level incidents." criteria="Requires cross-client incident aggregation (not yet built)." />
        <KpiCard label="Requests" value="Not yet available" color="text-gray-400" description="Service request tracking is not implemented yet." criteria="Requires a service-request data source (not yet built)." />
        <KpiCard label="Avg Health Score" value={avgHealthScore !== null ? avgHealthScore : 'Not yet calculated'} color={avgHealthScore === null ? 'text-gray-400' : undefined} description={avgHealthScore !== null ? `Average of ${scoredClients.length} client(s) with a computed health score (ClientHealthService). Clients never individually scored yet are excluded from this average, not counted as 0.` : 'No client has had its health score computed yet — visit a client\'s Scorecard to compute one.'} criteria="Mean of oc_client_health_snapshots.overall_score across clients with at least one snapshot." />
        </div>
      </div>

      {/* Legend */}
      <div className="mb-6 flex items-center justify-between">
        <Legend type="health" compact />
        <span className="text-[10px] text-gray-400">Last refreshed: just now</span>
      </div>

      {/* AI Insights — only real, evidence-based insights are shown; no fabricated predictions */}
      {stats.critical > 0 && (
        <div className="mb-6">
          <AIInsightsPanel insights={[
            { type: 'issue' as const, severity: 'critical' as const, title: `${stats.critical} client(s) in critical state`, description: 'Immediate attention required. Critical clients are experiencing service degradation.', action: 'View Critical Clients', href: '/clients?health=critical' },
          ]} title="Platform Intelligence" />
        </div>
      )}

      {/* Engineering & Migration — both now backed by real oc_defects / oc_migration_runs data (see docs/evidence-backed-intelligence-report.md). No summary numbers are duplicated here to avoid a second, possibly-stale calculation of the same figures. */}
      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <Link href="/engineering" className="block bg-white rounded-xl border p-5 hover:shadow-sm hover:border-purple-300 transition">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚙️</span>
            <h2 className="font-semibold text-sm">Engineering Intelligence</h2>
          </div>
          <p className="text-[10px] text-gray-400 mt-2">View Dashboard →</p>
        </Link>
        <Link href="/migrations" className="block bg-white rounded-xl border p-5 hover:shadow-sm hover:border-purple-300 transition">
          <div className="flex items-center gap-2">
            <span className="text-lg">🚀</span>
            <h2 className="font-semibold text-sm">Migration Intelligence</h2>
          </div>
          <p className="text-[10px] text-gray-400 mt-2">View Portfolio →</p>
        </Link>
      </div>

      {/* Client Overview Table — authoritative client records only; columns without a real
          data source (incidents, requests, environments, active services) were removed
          rather than filled with placeholders */}
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b bg-gradient-to-r from-gray-50 to-white flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Client Overview</h2>
          <Link href="/clients" className="text-xs text-purple-600 font-semibold hover:text-purple-800 transition">View All →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left px-6 py-3">Client</th>
                <th className="text-left px-4 py-3">Health</th>
                <th className="text-left px-4 py-3">SLA</th>
                <th className="text-center px-4 py-3">Score</th>
                <th className="text-left px-4 py-3">Onboarded</th>
                <th className="text-center px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {clients.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-400">No clients registered yet. <Link href="/clients/onboard" className="text-purple-600 hover:text-purple-800 font-medium">Onboard a client →</Link></td></tr>
              )}
              {clients.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-3">
                    <Link href={`/clients/${c.id}`} className="flex items-center gap-3 hover:text-purple-700">
                      <div className="w-8 h-8 gradient-brand rounded-md flex items-center justify-center shrink-0">
                        <span className="text-white text-[10px] font-bold">{c.name.slice(0, 2).toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{c.name}</p>
                        <p className="text-[11px] text-gray-400">{c.industry}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 text-xs"><span className={`w-2 h-2 rounded-full ${statusColor(c.health as any)}`} />{c.health}</span></td>
                  <td className="px-4 py-3"><span className={`text-xs font-medium ${c.sla_status === 'compliant' ? 'text-green-600' : c.sla_status === 'at-risk' ? 'text-orange-600' : 'text-red-600'}`}>{c.sla_status}</span></td>
                  <td className="px-4 py-3 text-center">
                    {scoreByClient.get(c.id)?.overallScore != null ? (
                      <>
                        <span className="font-bold text-sm">{scoreByClient.get(c.id)!.overallScore}</span>
                        <p className="text-[9px] text-gray-400">{formatComputedAt(scoreByClient.get(c.id)!.computedAt)}</p>
                      </>
                    ) : (
                      <span className="text-[10px] text-gray-400">Not yet calculated</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{c.onboarded_at ? new Date(c.onboarded_at).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <Link href={`/clients/${c.id}/edit`} className="shrink-0 w-6 h-6 rounded-md inline-flex items-center justify-center text-xs text-gray-400 border border-gray-200 hover:bg-purple-50 hover:text-purple-600 hover:border-purple-300 transition" title="Edit">✎</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
