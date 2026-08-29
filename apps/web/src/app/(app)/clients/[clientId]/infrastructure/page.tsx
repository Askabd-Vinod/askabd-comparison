import Link from 'next/link';
import { mockClients } from '../../../../lib/mock-clients';
import { CapabilityPlaceholder } from '../capability-placeholder';
import { DemoDataBanner } from '../../../../components/demo-data-banner';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientInfrastructurePage({ params }: PageProps) {
  const { clientId } = await params;
  const client = mockClients.find(c => c.id === clientId);
  if (!client) return <CapabilityPlaceholder title="Infrastructure" description="Server, container, network, and cloud resource management for this client." />;
  const infra = client.infrastructure;

  const items = [
    { label: 'Servers', value: infra.servers },
    { label: 'Containers', value: infra.containers },
    { label: 'Pods', value: infra.pods },
    { label: 'Namespaces', value: infra.namespaces },
    { label: 'Ingress', value: infra.ingress },
    { label: 'Load Balancers', value: infra.loadBalancers },
    { label: 'Certificates', value: infra.certificates },
    { label: 'Domains', value: infra.domains },
  ];

  return (
    <div>
      <DemoDataBanner />
      <h2 className="font-semibold text-lg mb-4">Infrastructure</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
        {items.map(item => (
          <div key={item.label} className="bg-white rounded-xl border p-3 text-center">
            <p className="text-lg font-bold text-gray-900">{item.value}</p>
            <p className="text-[10px] text-gray-500 uppercase">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <ResourceCard label="CPU" used={infra.cpuUsed} total={infra.cpuTotal} unit="cores" />
        <ResourceCard label="Memory" used={infra.memoryUsed} total={infra.memoryTotal} unit="GB" />
        <ResourceCard label="Disk" used={infra.diskUsed} total={infra.diskTotal} unit="GB" />
      </div>

      <div className="bg-white rounded-xl border p-5 mb-6">
        <h3 className="font-semibold mb-3">Servers ({infra.servers})</h3>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2">
          {Array.from({ length: Math.min(infra.servers, 12) }, (_, i) => (
            <Link key={i} href={`/clients/${clientId}/infrastructure/servers/${i + 1}`} className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-purple-50 hover:text-purple-700 text-xs transition">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="font-medium">{client.id}-srv-{i + 1}</span>
              <span className="text-gray-400 ml-auto">Active</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border p-5">
        <h3 className="font-semibold mb-3">Network & Security</h3>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <Row label="DNS Records" value={String(infra.domains * 4)} />
            <Row label="SSL Certificates" value={String(infra.certificates)} />
            <Row label="Firewall Rules" value={String(infra.namespaces * 8)} />
            <Row label="VPCs" value={String(infra.namespaces)} />
          </div>
          <div className="space-y-2">
            <Row label="Storage Volumes" value={String(infra.pods * 2)} />
            <Row label="Docker Images" value={String(infra.containers)} />
            <Row label="Kubernetes Nodes" value={String(infra.servers)} />
            <Row label="Network Policies" value={String(infra.namespaces * 3)} />
          </div>
        </div>
        <div className="mt-4">
          <Link href={`/clients/${clientId}/monitoring`} className="text-xs text-purple-600 font-medium hover:text-purple-800">View Live Monitoring →</Link>
        </div>
      </div>
    </div>
  );
}

function ResourceCard({ label, used, total, unit }: { label: string; used: number; total: number; unit: string }) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  const color = pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-orange-500' : 'bg-green-500';
  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-gray-500">{used}/{total} {unit} ({pct}%)</span>
      </div>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-xs"><span className="text-gray-500">{label}</span><span className="font-medium">{value}</span></div>;
}
