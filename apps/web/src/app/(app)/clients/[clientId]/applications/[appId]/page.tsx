import { CapabilityPlaceholder } from '../../capability-placeholder';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { mockClients } from '../../../../../lib/mock-clients';
import { Breadcrumb } from '../../../../../components/breadcrumb';
import { AIInsightsPanel } from '../../../../../components/ai-insights';
import { MissingInfoPanel } from '../../../../../components/missing-info';
import { statusColor } from '../../../../../components/status-badge';

interface Props { params: Promise<{ clientId: string; appId: string }> }

export default async function ApplicationDetailPage({ params }: Props) {
  const { clientId, appId } = await params;
  const client = mockClients.find(c => c.id === clientId);
  if (!client) return <CapabilityPlaceholder title="Application Detail" description="Application tracking for this client." />;
  const appName = decodeURIComponent(appId);
  const appIdx = client.applications.findIndex(a => a.toLowerCase().replace(/\s+/g, '-') === appName || a === appName);
  if (appIdx === -1) notFound();
  const app = client.applications[appIdx];
  const tech = ['Next.js', 'React', 'Node.js', 'TypeScript', 'PostgreSQL'][appIdx % 5];

  return (
    <div>
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/' },
        { label: 'Clients', href: '/clients' },
        { label: client.name, href: `/clients/${clientId}` },
        { label: 'Applications', href: `/clients/${clientId}/applications` },
        { label: app },
      ]} />

      <div className="flex items-center gap-3 mb-6">
        <span className={`w-3 h-3 rounded-full ${statusColor(client.health)}`} />
        <h1 className="text-xl font-bold">{app}</h1>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold mb-3">Application Overview</h2>
            <div className="grid md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-2">
                <Row label="Business Purpose" value="Core business application for client operations" />
                <Row label="Owner" value={client.primaryContact} />
                <Row label="Architecture" value="Microservices" />
                <Row label="Technology" value={tech} />
                <Row label="Version" value={client.environments.production.version} />
                <Row label="Environment" value="Production" />
              </div>
              <div className="space-y-2">
                <Row label="Status" value={client.health} />
                <Row label="Uptime" value="99.95%" />
                <Row label="Last Deploy" value={fmtDate(client.lastDeployment)} />
                <Row label="Repository" value={`github.com/askabd/${client.id}/${appName}`} />
                <Row label="CI/CD" value="GitHub Actions" />
                <Row label="Monitoring" value="Active" />
              </div>
            </div>
          </section>

          <section className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold mb-3">Dependencies</h2>
            <div className="grid md:grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-[10px] text-gray-500 uppercase mb-2">Services</p>
                {client.services.slice(0, 3).map(s => (
                  <Link key={s.id} href={`/services/${s.id}`} className="flex items-center gap-2 py-1 hover:text-purple-600">
                    <span className={`w-2 h-2 rounded-full ${statusColor(s.status)}`} />{s.name}
                  </Link>
                ))}
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase mb-2">Infrastructure</p>
                <Link href={`/clients/${clientId}/infrastructure`} className="block py-1 hover:text-purple-600">Database (PostgreSQL)</Link>
                <Link href={`/clients/${clientId}/infrastructure`} className="block py-1 hover:text-purple-600">Redis Cache</Link>
                <Link href={`/clients/${clientId}/infrastructure`} className="block py-1 hover:text-purple-600">API Gateway</Link>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold mb-3">Recent Activity</h2>
            <div className="space-y-2 text-xs">
              {client.deployments.slice(0, 3).map(d => (
                <Link key={d.id} href={`/clients/${clientId}/deployments/${d.id}`} className="flex items-center justify-between py-2 px-2 rounded hover:bg-gray-50">
                  <span>Deployed v{d.version} to {d.environment}</span>
                  <span className="text-gray-400">{fmtDate(d.timestamp)}</span>
                </Link>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-xs text-gray-500 uppercase mb-3">Quick Links</h3>
            <div className="space-y-1.5">
              <QuickLink href={`/clients/${clientId}/deployments`} label="Deployments" />
              <QuickLink href={`/clients/${clientId}/monitoring`} label="Monitoring" />
              <QuickLink href={`/clients/${clientId}/incidents`} label="Incidents" />
              <QuickLink href={`/clients/${clientId}/performance`} label="Performance" />
              <QuickLink href={`/clients/${clientId}/usage`} label="Usage" />
              <QuickLink href={`/clients/${clientId}/audit`} label="Audit Log" />
            </div>
          </section>

          <MissingInfoPanel completeness={78} items={[
            { field: 'Architecture Diagram', impact: 'high', reason: 'Required for architecture review' },
            { field: 'API Inventory', impact: 'medium', reason: 'Required for dependency mapping' },
            { field: 'Load Test Results', impact: 'low', reason: 'Required for capacity planning' },
          ]} blocked={['Full Architecture Assessment', 'Capacity Planning']} />

          <AIInsightsPanel insights={[
            { type: 'recommendation', severity: 'medium', title: 'Dependency update available', description: `${tech} has a new major version available. Schedule upgrade window.`, action: 'View Deployments', href: `/clients/${clientId}/deployments` },
            { type: 'prediction', severity: 'low', title: 'Stable performance trajectory', description: 'No degradation patterns detected. Current architecture handles load well.' },
          ]} />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) { return <div className="flex justify-between"><span className="text-gray-500">{label}</span><span className="font-medium text-gray-800">{value}</span></div>; }
function QuickLink({ href, label }: { href: string; label: string }) { return <Link href={href} className="block text-xs text-gray-600 hover:text-purple-600 py-1.5 px-2 rounded hover:bg-purple-50 transition">{label}</Link>; }
function fmtDate(iso: string): string { try { return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } }
