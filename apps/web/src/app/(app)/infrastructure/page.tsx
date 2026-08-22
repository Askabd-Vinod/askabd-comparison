import Link from 'next/link';
import { mockClients } from '../../lib/mock-clients';
import { Breadcrumb } from '../../components/breadcrumb';
import { KpiCard } from '../../components/kpi-card';
import { DemoDataBanner } from '../../components/demo-data-banner';

export default function InfrastructurePage() {
  const totals = mockClients.reduce((acc, c) => ({
    servers: acc.servers + c.infrastructure.servers,
    containers: acc.containers + c.infrastructure.containers,
    pods: acc.pods + c.infrastructure.pods,
    namespaces: acc.namespaces + c.infrastructure.namespaces,
    ingress: acc.ingress + c.infrastructure.ingress,
    loadBalancers: acc.loadBalancers + c.infrastructure.loadBalancers,
    certificates: acc.certificates + c.infrastructure.certificates,
    domains: acc.domains + c.infrastructure.domains,
    cpuTotal: acc.cpuTotal + c.infrastructure.cpuTotal,
    cpuUsed: acc.cpuUsed + c.infrastructure.cpuUsed,
    memoryTotal: acc.memoryTotal + c.infrastructure.memoryTotal,
    memoryUsed: acc.memoryUsed + c.infrastructure.memoryUsed,
    diskTotal: acc.diskTotal + c.infrastructure.diskTotal,
    diskUsed: acc.diskUsed + c.infrastructure.diskUsed,
  }), { servers: 0, containers: 0, pods: 0, namespaces: 0, ingress: 0, loadBalancers: 0, certificates: 0, domains: 0, cpuTotal: 0, cpuUsed: 0, memoryTotal: 0, memoryUsed: 0, diskTotal: 0, diskUsed: 0 });

  const infraItems = [
    { label: 'Servers', value: totals.servers },
    { label: 'Containers', value: totals.containers },
    { label: 'Pods', value: totals.pods },
    { label: 'Namespaces', value: totals.namespaces },
    { label: 'Ingress', value: totals.ingress },
    { label: 'Load Balancers', value: totals.loadBalancers },
    { label: 'Certificates', value: totals.certificates },
    { label: 'Domains', value: totals.domains },
  ];

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Infrastructure' }]} />
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Infrastructure Overview</h1>
      <DemoDataBanner />

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-8">
        <KpiCard label="Servers" value={totals.servers} description="Total physical/virtual servers provisioned across all clients." criteria="Sum of all client server counts." />
        <KpiCard label="Containers" value={totals.containers} description="Total running containers across all client environments." criteria="Sum of all client container counts." />
        <KpiCard label="Pods" value={totals.pods} description="Total Kubernetes pods running across all client clusters." criteria="Sum of all client pod counts." />
        <KpiCard label="Namespaces" value={totals.namespaces} description="Total Kubernetes namespaces configured across all clusters." criteria="Sum of all client namespace counts." />
        <KpiCard label="Ingress" value={totals.ingress} description="Total ingress controllers/rules managing external traffic." criteria="Sum of all client ingress configurations." />
        <KpiCard label="Load Balancers" value={totals.loadBalancers} description="Total load balancers distributing traffic across services." criteria="Sum of all client load balancer instances." />
        <KpiCard label="Certificates" value={totals.certificates} description="Total SSL/TLS certificates managed across all clients." criteria="Sum of all client certificate counts." />
        <KpiCard label="Domains" value={totals.domains} description="Total custom domains configured across all client applications." criteria="Sum of all client domain registrations." />
      </div>

      {/* Resource Utilization */}
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <ResourceBar label="CPU" used={totals.cpuUsed} total={totals.cpuTotal} unit="cores" />
        <ResourceBar label="Memory" used={totals.memoryUsed} total={totals.memoryTotal} unit="GB" />
        <ResourceBar label="Disk" used={totals.diskUsed} total={totals.diskTotal} unit="GB" />
      </div>

      {/* Per-Client Breakdown */}
      <section className="bg-white rounded-xl border overflow-hidden">
        <div className="px-6 py-4 border-b"><h2 className="font-semibold">Per-Client Infrastructure</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left px-6 py-3">Client</th>
                <th className="text-center px-3 py-3">Servers</th>
                <th className="text-center px-3 py-3">Containers</th>
                <th className="text-center px-3 py-3">Pods</th>
                <th className="text-center px-3 py-3">CPU</th>
                <th className="text-center px-3 py-3">Memory</th>
                <th className="text-center px-3 py-3">Disk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {mockClients.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3"><Link href={`/clients/${c.id}?tab=infrastructure`} className="font-medium hover:text-purple-700">{c.name}</Link></td>
                  <td className="px-3 py-3 text-center">{c.infrastructure.servers}</td>
                  <td className="px-3 py-3 text-center">{c.infrastructure.containers}</td>
                  <td className="px-3 py-3 text-center">{c.infrastructure.pods}</td>
                  <td className="px-3 py-3 text-center">{c.infrastructure.cpuUsed}/{c.infrastructure.cpuTotal}</td>
                  <td className="px-3 py-3 text-center">{c.infrastructure.memoryUsed}/{c.infrastructure.memoryTotal} GB</td>
                  <td className="px-3 py-3 text-center">{c.infrastructure.diskUsed}/{c.infrastructure.diskTotal} GB</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ResourceBar({ label, used, total, unit }: { label: string; used: number; total: number; unit: string }) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  const color = pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-orange-500' : 'bg-green-500';
  return (
    <div className="bg-white rounded-xl border p-5">
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
