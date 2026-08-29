import { CapabilityPlaceholder } from '../../capability-placeholder';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { mockClients } from '../../../../../lib/mock-clients';
import { Breadcrumb } from '../../../../../components/breadcrumb';
import { DemoDataBanner } from '../../../../../components/demo-data-banner';
import { statusColor } from '../../../../../components/status-badge';
import { AIInsightsPanel } from '../../../../../components/ai-insights';
import { Legend } from '../../../../../components/legend';
import { EnvironmentName, HealthStatus } from '../../../../../lib/types';

interface Props { params: Promise<{ clientId: string; envName: string }> }

export default async function EnvironmentDetailPage({ params }: Props) {
  const { clientId, envName } = await params;
  const client = mockClients.find(c => c.id === clientId);
  {/* Previously a literal, un-interpolated placeholder string "[env Name]"
      was shown verbatim to real (non-demo) users — found during the
      2026-08-22 global UX audit. */}
  if (!client) return <CapabilityPlaceholder title={`${envName} Environment`} description={`Environment management for ${envName} on this client.`} />;
  if (!['development', 'staging', 'production'].includes(envName)) notFound();
  const env = client.environments[envName as EnvironmentName];

  return (
    <div>
      <DemoDataBanner />
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/' },
        { label: 'Clients', href: '/clients' },
        { label: client.name, href: `/clients/${clientId}` },
        { label: 'Environments', href: `/clients/${clientId}/environments` },
        { label: envName.charAt(0).toUpperCase() + envName.slice(1) },
      ]} />

      <div className="flex items-center gap-3 mb-6">
        <span className={`w-3 h-3 rounded-full ${statusColor(env.status)}`} />
        <h1 className="text-xl font-bold capitalize">{envName} Environment</h1>
        <span className="text-sm text-gray-500">v{env.version} • Build {env.build}</span>
      </div>

      <Legend type="health" />

      <div className="grid lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Status Grid */}
          <section className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold mb-4">Service Status</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatusCard label="API" status={env.api} />
              <StatusCard label="Frontend" status={env.frontend} />
              <StatusCard label="Backend" status={env.backend} />
              <StatusCard label="Database" status={env.database} />
              <StatusCard label="Redis" status={env.redis} />
              <StatusCard label="Storage" status={env.storage} />
              <StatusCard label="Scheduler" status={env.scheduler} />
              <StatusCard label="Workers" status={env.workers > 0 ? 'healthy' : 'offline'} extra={`${env.workers} active`} />
            </div>
          </section>

          {/* Metrics */}
          <section className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold mb-4">Performance</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard label="Latency" value={`${env.latency}ms`} warn={env.latency > 200} />
              <MetricCard label="Availability" value={`${env.availability}%`} warn={env.availability < 99.5} />
              <MetricCard label="Version" value={env.version} />
              <MetricCard label="Release" value={env.release} />
            </div>
          </section>

          {/* Applications in this environment */}
          <section className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold mb-3">Applications</h2>
            <div className="space-y-2">
              {client.applications.map((app, i) => (
                <Link key={i} href={`/clients/${clientId}/applications/${app.toLowerCase().replace(/\s+/g, '-')}`} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${statusColor(env.status)}`} />
                    <span className="font-medium">{app}</span>
                  </div>
                  <span className="text-gray-400">v{env.version}</span>
                </Link>
              ))}
            </div>
          </section>

          {/* Services */}
          <section className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold mb-3">Active Services</h2>
            <div className="space-y-2">
              {client.services.map(svc => (
                <Link key={svc.id} href={`/services/${svc.id}`} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${statusColor(svc.status)}`} />
                    <span className="font-medium">{svc.name}</span>
                  </div>
                  <span className="text-gray-400">v{svc.version}</span>
                </Link>
              ))}
            </div>
          </section>

          {/* Deployments */}
          <section className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold mb-3">Recent Deployments</h2>
            <div className="space-y-2">
              {client.deployments.filter(d => d.environment === envName).map(d => (
                <Link key={d.id} href={`/clients/${clientId}/deployments/${d.id}`} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 text-xs">
                  <span className="font-medium">v{d.version} ({d.buildNumber})</span>
                  <span className="text-gray-400">{fmtDate(d.timestamp)}</span>
                </Link>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-xs text-gray-500 uppercase mb-3">Environment Info</h3>
            <div className="space-y-2 text-xs">
              <Row label="Last Deployment" value={fmtDate(env.lastDeployment)} />
              <Row label="Last Sync" value={fmtDate(env.lastSync)} />
              <Row label="Last Backup" value={fmtDate(env.lastBackup)} />
            </div>
          </section>

          <section className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-xs text-gray-500 uppercase mb-3">Quick Links</h3>
            <div className="space-y-1.5">
              <QuickLink href={`/clients/${clientId}/monitoring`} label="Monitoring" />
              <QuickLink href={`/clients/${clientId}/deployments`} label="All Deployments" />
              <QuickLink href={`/clients/${clientId}/incidents`} label="Incidents" />
              <QuickLink href={`/clients/${clientId}/alerts`} label="Alerts" />
              <QuickLink href={`/clients/${clientId}/infrastructure`} label="Infrastructure" />
              <QuickLink href={`/clients/${clientId}/audit`} label="Audit Log" />
            </div>
          </section>

          <AIInsightsPanel insights={[
            { type: 'prediction', severity: 'low', title: `${envName} environment stable`, description: 'All services healthy. No predicted issues in the next 24 hours.' },
            ...(env.latency > 100 ? [{ type: 'risk' as const, severity: 'medium' as const, title: 'Latency above optimal', description: `Current latency ${env.latency}ms exceeds recommended 100ms threshold.`, action: 'View Performance', href: `/clients/${clientId}/performance` }] : []),
          ]} />
        </div>
      </div>
    </div>
  );
}

function StatusCard({ label, status, extra }: { label: string; status: HealthStatus | string; extra?: string }) {
  const color = typeof status === 'string' && ['healthy','warning','critical','offline'].includes(status) ? statusColor(status as HealthStatus) : 'bg-gray-400';
  return <div className="border rounded-lg p-3 text-center"><span className={`inline-block w-3 h-3 rounded-full ${color} mb-1`} /><p className="text-xs text-gray-600">{label}</p>{extra && <p className="text-[10px] text-gray-400">{extra}</p>}</div>;
}
function MetricCard({ label, value, warn }: { label: string; value: string; warn?: boolean }) { return <div className={`border rounded-lg p-3 text-center ${warn ? 'border-orange-200 bg-orange-50' : ''}`}><p className={`text-sm font-bold ${warn ? 'text-orange-600' : 'text-gray-900'}`}>{value}</p><p className="text-[10px] text-gray-500">{label}</p></div>; }
function Row({ label, value }: { label: string; value: string }) { return <div className="flex justify-between"><span className="text-gray-500">{label}</span><span className="font-medium text-gray-800">{value}</span></div>; }
function QuickLink({ href, label }: { href: string; label: string }) { return <Link href={href} className="block text-xs text-gray-600 hover:text-purple-600 py-1.5 px-2 rounded hover:bg-purple-50 transition">{label}</Link>; }
function fmtDate(iso: string): string { try { return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } }
