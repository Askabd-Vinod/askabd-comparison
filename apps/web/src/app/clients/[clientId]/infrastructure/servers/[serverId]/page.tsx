import { CapabilityPlaceholder } from '../../../capability-placeholder';
import Link from 'next/link';
import { mockClients } from '../../../../../lib/mock-clients';
import { Breadcrumb } from '../../../../../components/breadcrumb';
import { Legend } from '../../../../../components/legend';
import { AIInsightsPanel } from '../../../../../components/ai-insights';

interface Props { params: Promise<{ clientId: string; serverId: string }> }

export default async function ServerDetailPage({ params }: Props) {
  const { clientId, serverId } = await params;
  const client = mockClients.find(c => c.id === clientId);
  if (!client) return <CapabilityPlaceholder title="[server Id]" description="[server Id] management for this client." />;
  const serverIdx = parseInt(serverId, 10);
  if (isNaN(serverIdx) || serverIdx < 1 || serverIdx > client.infrastructure.servers) notFound();

  const cpu = Math.round(client.monitoring.cpu + (Math.random() - 0.5) * 10);
  const mem = Math.round(client.monitoring.memory + (Math.random() - 0.5) * 10);
  const disk = Math.round(client.monitoring.disk + (Math.random() - 0.5) * 5);

  return (
    <div>
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/' },
        { label: 'Clients', href: '/clients' },
        { label: client.name, href: `/clients/${clientId}` },
        { label: 'Infrastructure', href: `/clients/${clientId}/infrastructure` },
        { label: `Server ${serverId}` },
      ]} />

      <h1 className="text-xl font-bold mb-2">Server {serverId}</h1>
      <p className="text-sm text-gray-500 mb-6">{client.id}-srv-{serverId}.askabd.internal • Ubuntu 22.04 LTS</p>

      <Legend type="cpu" />

      <div className="grid lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Resources */}
          <section className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold mb-4">Resource Utilization</h2>
            <div className="grid md:grid-cols-3 gap-4">
              <ResourceBar label="CPU" value={cpu} unit="%" />
              <ResourceBar label="Memory" value={mem} unit="%" />
              <ResourceBar label="Disk" value={disk} unit="%" />
            </div>
          </section>

          {/* Processes */}
          <section className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold mb-3">Running Processes</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 uppercase">
                  <tr><th className="text-left px-3 py-2">Process</th><th className="text-right px-3 py-2">CPU</th><th className="text-right px-3 py-2">Memory</th><th className="text-left px-3 py-2">Status</th></tr>
                </thead>
                <tbody className="divide-y">
                  <tr className="hover:bg-gray-50"><td className="px-3 py-2">node (api)</td><td className="px-3 py-2 text-right">{Math.round(cpu * 0.4)}%</td><td className="px-3 py-2 text-right">{Math.round(mem * 0.5)}%</td><td className="px-3 py-2 text-green-600">running</td></tr>
                  <tr className="hover:bg-gray-50"><td className="px-3 py-2">postgres</td><td className="px-3 py-2 text-right">{Math.round(cpu * 0.2)}%</td><td className="px-3 py-2 text-right">{Math.round(mem * 0.3)}%</td><td className="px-3 py-2 text-green-600">running</td></tr>
                  <tr className="hover:bg-gray-50"><td className="px-3 py-2">redis-server</td><td className="px-3 py-2 text-right">{Math.round(cpu * 0.05)}%</td><td className="px-3 py-2 text-right">{Math.round(mem * 0.1)}%</td><td className="px-3 py-2 text-green-600">running</td></tr>
                  <tr className="hover:bg-gray-50"><td className="px-3 py-2">nginx</td><td className="px-3 py-2 text-right">{Math.round(cpu * 0.05)}%</td><td className="px-3 py-2 text-right">{Math.round(mem * 0.05)}%</td><td className="px-3 py-2 text-green-600">running</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Network & Security */}
          <section className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold mb-3">Network & Security</h2>
            <div className="grid md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-2">
                <Row label="IP Address" value={`10.0.${serverIdx}.${serverIdx * 10}`} />
                <Row label="DNS" value={`${client.id}-srv-${serverId}.askabd.internal`} />
                <Row label="Region" value="ap-southeast-2" />
                <Row label="Availability Zone" value="az-a" />
              </div>
              <div className="space-y-2">
                <Row label="Firewall" value="Active (12 rules)" />
                <Row label="SSL Certificate" value="Valid (expires 2027-02-15)" />
                <Row label="Last Backup" value={fmtDate(client.lastBackup)} />
                <Row label="Uptime" value="45d 12h 30m" />
              </div>
            </div>
          </section>

          {/* Containers */}
          <section className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold mb-3">Containers ({Math.ceil(client.infrastructure.containers / client.infrastructure.servers)})</h2>
            <div className="space-y-2 text-xs">
              {['api-container', 'worker-container', 'scheduler-container'].map(c => (
                <div key={c} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50">
                  <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500" /><span className="font-medium">{c}</span></div>
                  <span className="text-gray-400">running</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-xs text-gray-500 uppercase mb-3">Server Info</h3>
            <div className="space-y-2 text-xs">
              <Row label="Instance Type" value="c5.xlarge" />
              <Row label="OS" value="Ubuntu 22.04 LTS" />
              <Row label="CPU Cores" value={`${Math.ceil(client.infrastructure.cpuTotal / client.infrastructure.servers)}`} />
              <Row label="Memory" value={`${Math.ceil(client.infrastructure.memoryTotal / client.infrastructure.servers)} GB`} />
              <Row label="Disk" value={`${Math.ceil(client.infrastructure.diskTotal / client.infrastructure.servers)} GB`} />
            </div>
          </section>

          <section className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-xs text-gray-500 uppercase mb-3">Quick Links</h3>
            <div className="space-y-1.5">
              <QuickLink href={`/clients/${clientId}/monitoring`} label="Live Monitoring" />
              <QuickLink href={`/clients/${clientId}/deployments`} label="Deployment History" />
              <QuickLink href={`/clients/${clientId}/alerts`} label="Alerts" />
              <QuickLink href={`/clients/${clientId}/audit`} label="Audit Log" />
              <QuickLink href={`/clients/${clientId}/environments`} label="Environments" />
            </div>
          </section>

          <AIInsightsPanel insights={[
            { type: 'prediction', severity: cpu > 70 ? 'high' : 'low', title: cpu > 70 ? 'CPU capacity concern' : 'Resources healthy', description: cpu > 70 ? `CPU at ${cpu}% — consider scaling or load distribution` : `All metrics within normal bounds. No action required.` },
          ]} />
        </div>
      </div>
    </div>
  );
}

function ResourceBar({ label, value, unit }: { label: string; value: number; unit: string }) {
  const color = value > 80 ? 'bg-red-500' : value > 60 ? 'bg-orange-500' : 'bg-green-500';
  return <div><div className="flex justify-between text-xs mb-1"><span className="text-gray-600">{label}</span><span className="font-medium">{value}{unit}</span></div><div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(value, 100)}%` }} /></div></div>;
}
function Row({ label, value }: { label: string; value: string }) { return <div className="flex justify-between"><span className="text-gray-500">{label}</span><span className="font-medium text-gray-800">{value}</span></div>; }
function QuickLink({ href, label }: { href: string; label: string }) { return <Link href={href} className="block text-xs text-gray-600 hover:text-purple-600 py-1.5 px-2 rounded hover:bg-purple-50 transition">{label}</Link>; }
function fmtDate(iso: string): string { try { return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } }
