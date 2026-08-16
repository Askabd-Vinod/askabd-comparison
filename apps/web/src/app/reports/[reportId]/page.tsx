import { notFound } from 'next/navigation';
import { Breadcrumb } from '../../components/breadcrumb';
import { mockClients } from '../../lib/mock-clients';

const reportMeta: Record<string, { name: string; description: string }> = {
  availability: { name: 'Availability Report', description: 'Platform uptime and availability metrics' },
  performance: { name: 'Performance Report', description: 'Latency, throughput, and resource utilization' },
  usage: { name: 'Usage Report', description: 'API calls, bandwidth, and storage consumption' },
  growth: { name: 'Growth Report', description: 'Client onboarding and growth trends' },
  deployments: { name: 'Deployment Report', description: 'Deployment frequency and success rate' },
  incidents: { name: 'Incident Report', description: 'Incident count and resolution metrics' },
  sla: { name: 'SLA Compliance Report', description: 'Service level adherence across clients' },
};

interface PageProps { params: Promise<{ reportId: string }> }

export default async function ReportDetailPage({ params }: PageProps) {
  const { reportId } = await params;
  const meta = reportMeta[reportId];
  if (!meta) notFound();

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/' },
        { label: 'Reports', href: '/reports' },
        { label: meta.name },
      ]} />
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{meta.name}</h1>
      <p className="text-sm text-gray-500 mb-8">{meta.description}</p>

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold">Client Breakdown</h2>
          <div className="flex gap-2">
            <button className="text-xs bg-purple-50 text-purple-600 px-3 py-1.5 rounded font-medium hover:bg-purple-100">Export PDF</button>
            <button className="text-xs bg-purple-50 text-purple-600 px-3 py-1.5 rounded font-medium hover:bg-purple-100">Export CSV</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left px-6 py-3">Client</th>
                <th className="text-center px-4 py-3">Score</th>
                <th className="text-center px-4 py-3">Availability</th>
                <th className="text-center px-4 py-3">Deployments</th>
                <th className="text-center px-4 py-3">Incidents</th>
                <th className="text-center px-4 py-3">SLA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {mockClients.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-center font-bold">{c.platformScore}</td>
                  <td className="px-4 py-3 text-center">{c.monitoring.availability}%</td>
                  <td className="px-4 py-3 text-center">{c.deployments.length}</td>
                  <td className="px-4 py-3 text-center">{c.incidents.length}</td>
                  <td className="px-4 py-3 text-center capitalize">{c.slaStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
