import { notFound } from 'next/navigation';
import Link from 'next/link';
import { mockClients } from '../../../lib/mock-clients';
import { statusColor } from '../../../components/status-badge';
import { HealthStatus } from '../../../lib/types';
import { AIInsightsPanel } from '../../../components/ai-insights';
import { MissingInfoPanel } from '../../../components/missing-info';
import { Legend } from '../../../components/legend';
import { KpiCard } from '../../../components/kpi-card';
import { DynamicClientOverview } from './dynamic-overview';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientOverviewPage({ params }: PageProps) {
  const { clientId } = await params;
  const client = mockClients.find(c => c.id === clientId);

  // Dynamic clients (onboarded via wizard, stored in localStorage)
  if (!client) {
    return <DynamicClientOverview />;
  }

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        {/* Executive Summary */}
        <section className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold mb-4">Executive Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard href={`/clients/${clientId}/monitoring`} label="Health Score" value={`${client.platformScore}/100`} description="Composite health score reflecting this client's operational status across all dimensions." criteria="Weighted score: Availability 40%, Performance 25%, Security 20%, Compliance 15%." />
            <KpiCard href={`/clients/${clientId}/applications`} label="Applications" value={client.applications.length} description="Total applications deployed and managed for this client." criteria="Count of registered applications in client portfolio." />
            <KpiCard href={`/clients/${clientId}/infrastructure`} label="Servers" value={client.infrastructure.servers} description="Total servers (physical/virtual) provisioned for this client." criteria="Count of all server instances across all environments." />
            <KpiCard href={`/clients/${clientId}/infrastructure`} label="Databases" value={Math.ceil(client.infrastructure.servers / 3)} description="Total database instances running for this client." criteria="Estimated: servers / 3 (1 DB per 3 servers ratio)." />
            <KpiCard href={`/clients/${clientId}/incidents`} label="Incidents" value={client.activeIncidents} warn={client.activeIncidents > 0} description="Active incidents requiring attention for this client." criteria="Count of incidents with status = 'open' OR 'investigating'." />
            <KpiCard href={`/clients/${clientId}/support`} label="Open Requests" value={client.openServiceRequests} warn={client.openServiceRequests > 5} description="Open service/support requests from this client." criteria="Count of requests with status ≠ 'closed'. Warning: > 5 open requests." />
            <KpiCard href={`/clients/${clientId}/deployments`} label="Last Deploy" value={fmtRel(client.lastDeployment)} description="Time since the last deployment to any environment for this client." criteria="Relative time from most recent deployment timestamp." />
            <KpiCard href={`/clients/${clientId}/performance`} label="Availability" value={`${client.monitoring.availability}%`} description="Current uptime/availability for this client's production environment." criteria="Uptime percentage from monitoring. SLA target: 99.9%." />
          </div>
        </section>

        {/* Environment Summary */}
        <section className="bg-white rounded-xl border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Environment Summary</h2>
            <Link href={`/clients/${clientId}/environments`} className="text-xs text-purple-600 font-medium hover:text-purple-800">View All →</Link>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            {(['development', 'staging', 'production'] as const).map(envKey => {
              const env = client.environments[envKey];
              return (
                <Link key={envKey} href={`/clients/${clientId}/environments?env=${envKey}`} className="border rounded-lg p-3 hover:border-purple-200 hover:shadow-sm transition">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-xs capitalize">{envKey}</h3>
                    <span className={`w-2.5 h-2.5 rounded-full ${statusColor(env.status)}`} />
                  </div>
                  <div className="text-[11px] text-gray-600 space-y-1">
                    <div className="flex justify-between"><span className="text-gray-400">Version</span><span className="font-medium">{env.version}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Availability</span><span className="font-medium">{env.availability}%</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Latency</span><span className="font-medium">{env.latency}ms</span></div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Recent Activity */}
        <section className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold mb-4">Recent Activity</h2>
          <div className="space-y-2">
            {client.auditLog.slice(0, 5).map(e => (
              <Link key={e.id} href={`/clients/${clientId}/audit`} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                  <span className="font-medium text-gray-700">{e.what}</span>
                </div>
                <span className="text-gray-400">{fmtDate(e.when)}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* Right Column */}
      <div className="space-y-6">
        <section className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold text-xs mb-3 text-gray-500 uppercase tracking-wide">Client Information</h2>
          <div className="space-y-3 text-xs">
            <Row label="Industry" value={client.industry} />
            <Row label="Primary Contact" value={client.primaryContact} />
            <Row label="Platform Score" value={String(client.platformScore)} />
            <Row label="SLA Status" value={client.slaStatus} />
            <Row label="Services" value={String(client.activeServices.length)} />
            <Row label="Applications" value={String(client.applications.length)} />
          </div>
        </section>

        <section className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold text-xs mb-3 text-gray-500 uppercase tracking-wide">Quick Actions</h2>
          <div className="space-y-1.5">
            <QuickLink href={`/clients/${clientId}/deployments`} label="View Deployments" />
            <QuickLink href={`/clients/${clientId}/monitoring`} label="View Monitoring" />
            <QuickLink href={`/clients/${clientId}/incidents`} label="View Incidents" />
            <QuickLink href={`/clients/${clientId}/alerts`} label="View Alerts" />
            <QuickLink href={`/clients/${clientId}/audit`} label="View Audit Log" />
            <QuickLink href={`/clients/${clientId}/reports`} label="Generate Report" />
            <QuickLink href={`/clients/${clientId}/settings`} label="Client Settings" />
          </div>
        </section>

        <section className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold text-xs mb-3 text-gray-500 uppercase tracking-wide">Timeline</h2>
          <div className="space-y-2.5">
            <TimelineEntry href={`/clients/${clientId}/deployments`} time={client.lastDeployment} label="Last Deployment" />
            <TimelineEntry href={`/clients/${clientId}/infrastructure`} time={client.lastBackup} label="Last Backup" />
            <TimelineEntry href={`/clients/${clientId}/monitoring`} time={client.lastHeartbeat} label="Last Heartbeat" />
          </div>
        </section>

        <AIInsightsPanel insights={[
          ...(client.activeIncidents > 0 ? [{ type: 'issue' as const, severity: 'critical' as const, title: `${client.activeIncidents} active incident(s)`, description: 'Service disruption detected. Immediate attention required.', action: 'View Incidents', href: `/clients/${clientId}/incidents` }] : []),
          ...(client.monitoring.cpu > 80 ? [{ type: 'risk' as const, severity: 'high' as const, title: 'High CPU utilization', description: `CPU at ${client.monitoring.cpu}%. Consider scaling or load redistribution.`, action: 'View Monitoring', href: `/clients/${clientId}/monitoring` }] : []),
          { type: 'recommendation' as const, severity: client.platformScore >= 90 ? 'low' as const : 'medium' as const, title: `Platform score: ${client.platformScore}/100`, description: client.platformScore >= 90 ? 'Excellent operational health. No immediate actions required.' : 'Below target. Review performance and incident metrics.' },
        ]} title="Client Intelligence" />

        <MissingInfoPanel completeness={client.platformScore >= 90 ? 92 : client.platformScore >= 70 ? 78 : 55} items={[
          ...(client.platformScore < 90 ? [{ field: 'Architecture Diagram', impact: 'high' as const, reason: 'Required for architecture assessment' }] : []),
          ...(client.platformScore < 80 ? [{ field: 'API Inventory', impact: 'medium' as const, reason: 'Required for dependency mapping' }] : []),
          ...(client.platformScore < 70 ? [{ field: 'Monitoring Access', impact: 'high' as const, reason: 'Required for proactive alerting' }, { field: 'Infrastructure Diagram', impact: 'high' as const, reason: 'Required for capacity planning' }] : []),
        ]} blocked={client.platformScore < 80 ? ['Full Architecture Assessment', 'Capacity Planning', 'Security Review'] : []} />
      </div>
    </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-gray-500">{label}</span><span className="font-medium text-gray-800">{value}</span></div>;
}
function QuickLink({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="block text-xs text-gray-600 hover:text-purple-600 py-1.5 px-2 rounded hover:bg-purple-50 transition">{label}</Link>;
}
function TimelineEntry({ href, time, label }: { href: string; time: string; label: string }) {
  return <Link href={href} className="flex items-center gap-2.5 hover:bg-gray-50 rounded p-1 -m-1 transition"><div className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" /><div><p className="text-xs text-gray-700">{label}</p><p className="text-[10px] text-gray-400">{fmtDate(time)}</p></div></Link>;
}
function fmtDate(iso: string): string { try { return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } }
function fmtRel(iso: string): string { const d = Date.now() - new Date(iso).getTime(); const h = Math.floor(d / 3600000); return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`; }
