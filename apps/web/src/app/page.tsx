import Link from 'next/link';
import { mockClients } from './lib/mock-clients';
import { Breadcrumb } from './components/breadcrumb';
import { statusColor } from './components/status-badge';
import { apiSafe } from './lib/api';
import { Legend } from './components/legend';
import { AIInsightsPanel } from './components/ai-insights';
import { KpiCard } from './components/kpi-card';
import { ServiceControlsInline } from './components/service-controls';
import { NewClientsCount } from './components/new-clients-counter';
import { OnboardedClientsRows } from './components/onboarded-clients';

export default async function DashboardPage() {
  const clients = mockClients;
  const health = await apiSafe<{ overallStatus: string }>('/platform/health', { overallStatus: 'unknown' });

  const stats = {
    active: clients.length,
    healthy: clients.filter(c => c.health === 'healthy').length,
    warning: clients.filter(c => c.health === 'warning').length,
    critical: clients.filter(c => c.health === 'critical').length,
    offline: clients.filter(c => c.health === 'offline').length,
    availability: +(clients.reduce((a, c) => a + c.monitoring.availability, 0) / clients.length).toFixed(2),
    deployments: clients.reduce((a, c) => a + c.deployments.filter(d => new Date(d.timestamp).toDateString() === new Date().toDateString()).length, 0),
    incidents: clients.reduce((a, c) => a + c.activeIncidents, 0),
    requests: clients.reduce((a, c) => a + c.openServiceRequests, 0),
    slaCompliant: clients.filter(c => c.slaStatus === 'compliant').length,
    platformHealth: health.overallStatus,
    platformScore: Math.round(clients.reduce((a, c) => a + c.platformScore, 0) / clients.length),
  };

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

      {/* KPI Grid */}
      <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-gray-200/60 p-4 mb-8 shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KpiCard href="/clients" label="Active Clients" value={stats.active} description="Total number of clients currently managed on the platform. Includes all health statuses (healthy, warning, critical, offline)." criteria="Count of all registered clients in the system." includeNewClients />
        <KpiCard href="/clients?health=healthy" label="Healthy" value={stats.healthy} color="text-green-600" description="Clients with all services running normally. No open incidents, all environments stable, availability above 99.9%." criteria="Health status = 'healthy'. All monitoring checks passing." includeNewClients />
        <KpiCard href="/clients?health=warning" label="Warning" value={stats.warning} color="text-orange-600" description="Clients experiencing minor degradation. Some services may be slow or availability dipped below threshold." criteria="Health status = 'warning'. Availability between 95%–99.9% OR response time > 500ms." />
        <KpiCard href="/clients?health=critical" label="Critical" value={stats.critical} color="text-red-600" description="Clients with severe service impact. Requires immediate attention — SLA breach risk is high." criteria="Health status = 'critical'. Availability < 95% OR unresolved P1 incident." />
        <KpiCard href="/clients?health=offline" label="Offline" value={stats.offline} color="text-gray-500" description="Clients whose environments are completely unreachable or suspended." criteria="Health status = 'offline'. No heartbeat received in the last 5 minutes." />
        <KpiCard href="/monitoring" label="Availability" value={`${stats.availability}%`} description="Average platform availability across all clients. Calculated from uptime monitoring over the current billing period." criteria={`Formula: Sum of all client availability / ${stats.active} clients. SLA target: 99.9%.`} />
        <KpiCard href="/deployments" label="Today Deploys" value={stats.deployments} description="Number of deployments executed today across all client environments (dev, staging, production)." criteria="Count of deployments where timestamp matches today's date (UTC)." />
        <KpiCard href="/incidents" label="Incidents" value={stats.incidents} color={stats.incidents > 0 ? 'text-red-600' : undefined} description="Total active incidents across all clients. Includes open and investigating statuses." criteria="Count of incidents with status = 'open' OR 'investigating'." />
        <KpiCard href="/clients" label="Requests" value={stats.requests} color={stats.requests > 5 ? 'text-orange-600' : undefined} description="Total open service requests from all clients. Includes feature requests, support tickets, and change requests." criteria="Count of service requests with status ≠ 'closed' across all clients." />
        <KpiCard href="/clients?status=sla-compliant" label="SLA Compliant" value={`${stats.slaCompliant}/${stats.active}`} color="text-green-600" description="Clients meeting their SLA commitments vs total clients. Non-compliant clients risk penalties." criteria="SLA status = 'compliant'. Based on availability, response time, and incident resolution targets." />
        <KpiCard href="/platform" label="Platform Health" value={stats.platformHealth} description="Overall health of the AskABD platform infrastructure. Aggregated from API, database, cache, and worker status." criteria="Derived from /platform/health endpoint. Values: healthy, degraded, critical, unknown." />
        <KpiCard href="/monitoring" label="Platform Score" value={stats.platformScore} description="Weighted composite score (0–100) reflecting overall operational health across all clients." criteria={`Formula: Average of all client platform scores. Weights: Availability 40%, Performance 25%, Security 20%, Compliance 15%.`} />
        </div>
      </div>

      {/* Legend */}
      <div className="mb-6 flex items-center justify-between">
        <Legend type="health" compact />
        <span className="text-[10px] text-gray-400">Last refreshed: just now</span>
      </div>

      {/* AI Insights */}
      <div className="mb-6">
        <AIInsightsPanel insights={[
          ...(stats.critical > 0 ? [{ type: 'issue' as const, severity: 'critical' as const, title: `${stats.critical} client(s) in critical state`, description: 'Immediate attention required. Critical clients are experiencing service degradation.', action: 'View Critical Clients', href: '/clients?health=critical' }] : []),
          ...(stats.incidents > 0 ? [{ type: 'risk' as const, severity: 'high' as const, title: `${stats.incidents} active incident(s) across platform`, description: 'Open incidents require resolution to maintain SLA compliance.', action: 'View Incidents', href: '/incidents' }] : []),
          { type: 'recommendation' as const, severity: 'medium' as const, title: 'Platform availability at ' + stats.availability + '%', description: stats.availability >= 99.9 ? 'Exceeding SLA targets. No action required.' : 'Below 99.9% SLA target. Review affected services.', action: 'View Monitoring', href: '/monitoring' },
          { type: 'prediction' as const, severity: 'low' as const, title: 'Capacity forecast normal', description: 'No resource exhaustion predicted in the next 30 days based on current trends.' },
        ]} title="Platform Intelligence" />
      </div>

      {/* Engineering & Migration Intelligence Summary */}
      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <section className="bg-white rounded-xl border p-5 hover:shadow-sm transition">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚙️</span>
              <h3 className="font-semibold text-sm">Engineering Intelligence</h3>
            </div>
            <Link href="/engineering" className="text-[10px] text-purple-600 font-medium hover:text-purple-800">View Dashboard →</Link>
          </div>
          <div className="grid grid-cols-4 gap-3 text-center">
            <div><p className="text-lg font-bold text-red-600">5</p><p className="text-[9px] text-gray-500">Open Defects</p></div>
            <div><p className="text-lg font-bold text-green-600">96%</p><p className="text-[9px] text-gray-500">Build Health</p></div>
            <div><p className="text-lg font-bold">82%</p><p className="text-[9px] text-gray-500">Code Quality</p></div>
            <div><p className="text-lg font-bold text-purple-600">72%</p><p className="text-[9px] text-gray-500">Confidence</p></div>
          </div>
        </section>
        <section className="bg-white rounded-xl border p-5 hover:shadow-sm transition">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🚀</span>
              <h3 className="font-semibold text-sm">Migration Intelligence</h3>
            </div>
            <Link href="/migrations" className="text-[10px] text-purple-600 font-medium hover:text-purple-800">View Portfolio →</Link>
          </div>
          <div className="grid grid-cols-4 gap-3 text-center">
            <div><p className="text-lg font-bold">3</p><p className="text-[9px] text-gray-500">Programs</p></div>
            <div><p className="text-lg font-bold text-green-600">62%</p><p className="text-[9px] text-gray-500">Readiness</p></div>
            <div><p className="text-lg font-bold text-orange-600">57/100</p><p className="text-[9px] text-gray-500">Risk</p></div>
            <div><p className="text-lg font-bold">22%</p><p className="text-[9px] text-gray-500">Avg Progress</p></div>
          </div>
        </section>
      </div>

      {/* Client Overview Table */}
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b bg-gradient-to-r from-gray-50 to-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-gray-900">Client Overview</h2>
            <NewClientsCount />
          </div>
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
                <th className="text-center px-4 py-3">Incidents</th>
                <th className="text-center px-4 py-3">Requests</th>
                <th className="text-left px-4 py-3">Services</th>
                <th className="text-left px-4 py-3">Environments</th>
                <th className="text-center px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {clients.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-3">
                    <Link href={`/clients/${c.id}`} className="flex items-center gap-3 hover:text-purple-700">
                      <div className="w-8 h-8 gradient-brand rounded-md flex items-center justify-center shrink-0">
                        <span className="text-white text-[10px] font-bold">{c.logo}</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{c.name}</p>
                        <p className="text-[11px] text-gray-400">{c.industry}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center gap-1.5 text-xs`}><span className={`w-2 h-2 rounded-full ${statusColor(c.health)}`} />{c.health}</span></td>
                  <td className="px-4 py-3"><span className={`text-xs font-medium ${c.slaStatus === 'compliant' ? 'text-green-600' : c.slaStatus === 'at-risk' ? 'text-orange-600' : 'text-red-600'}`}>{c.slaStatus}</span></td>
                  <td className="px-4 py-3 text-center font-bold text-sm">{c.platformScore}</td>
                  <td className="px-4 py-3 text-center"><span className={c.activeIncidents > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}>{c.activeIncidents}</span></td>
                  <td className="px-4 py-3 text-center"><span className={c.openServiceRequests > 0 ? 'text-orange-600 font-medium' : 'text-gray-400'}>{c.openServiceRequests}</span></td>
                  <td className="px-4 py-3 text-xs text-gray-500">{c.activeServices.length} active</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      {(['development', 'staging', 'production'] as const).map(e => (
                        <Link key={e} href={`/clients/${c.id}?tab=environments&env=${e}`} className={`w-2.5 h-2.5 rounded-full ${statusColor(c.environments[e].status)}`} title={`${e}: ${c.environments[e].status}`} />
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ServiceControlsInline entityId={c.id} entityName={c.name} entityType="client" initialEnabled={c.health !== 'offline'} />
                      <Link href={`/clients/${c.id}/edit`} className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-xs text-gray-400 border border-gray-200 hover:bg-purple-50 hover:text-purple-600 hover:border-purple-300 transition" title="Edit">✎</Link>
                    </div>
                  </td>
                </tr>
              ))}
              <OnboardedClientsRows />
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
