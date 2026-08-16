import { notFound } from 'next/navigation';
import Link from 'next/link';
import { mockClients } from '../../../lib/mock-clients';
import { CapabilityPlaceholder } from '../capability-placeholder';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientReportsPage({ params }: PageProps) {
  const { clientId } = await params;
  const client = mockClients.find(c => c.id === clientId);
  if (!client) return <CapabilityPlaceholder title="Reports" description="Engineering, migration, governance, and operational reports for this client." />;

  const reports = [
    { id: 'health', name: 'Health Report', description: 'Platform health and uptime metrics', icon: '💚' },
    { id: 'availability', name: 'Availability Report', description: 'Service availability and SLA adherence', icon: '📊' },
    { id: 'performance', name: 'Performance Report', description: 'Latency, throughput, resource usage', icon: '⚡' },
    { id: 'incidents', name: 'Incident Report', description: 'Incident history and resolution metrics', icon: '🚨' },
    { id: 'deployments', name: 'Deployment Report', description: 'Deployment frequency and success rate', icon: '🚀' },
    { id: 'security', name: 'Security Report', description: 'Vulnerability scans and compliance', icon: '🔒' },
    { id: 'audit', name: 'Audit Report', description: 'Change log and access audit trail', icon: '📝' },
  ];

  return (
    <div>
      <h2 className="font-semibold text-lg mb-4">Reports</h2>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border p-3 text-center">
          <p className="text-lg font-bold text-green-600">{client.monitoring.availability}%</p>
          <p className="text-[10px] text-gray-500">Availability</p>
        </div>
        <div className="bg-white rounded-xl border p-3 text-center">
          <p className="text-lg font-bold">{client.deployments.length}</p>
          <p className="text-[10px] text-gray-500">Deployments</p>
        </div>
        <div className="bg-white rounded-xl border p-3 text-center">
          <p className="text-lg font-bold text-red-600">{client.incidents.length}</p>
          <p className="text-[10px] text-gray-500">Incidents</p>
        </div>
        <div className="bg-white rounded-xl border p-3 text-center">
          <p className="text-lg font-bold">{client.platformScore}</p>
          <p className="text-[10px] text-gray-500">Score</p>
        </div>
      </div>

      {/* Report Types */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reports.map(report => (
          <Link
            key={report.id}
            href={`/reports/${report.id}`}
            className="bg-white rounded-xl border p-5 hover:shadow-md hover:border-purple-200 transition group"
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xl">{report.icon}</span>
              <h3 className="font-semibold text-sm group-hover:text-purple-700">{report.name}</h3>
            </div>
            <p className="text-xs text-gray-500 mb-3">{report.description}</p>
            <div className="flex gap-2">
              <span className="text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded">PDF</span>
              <span className="text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded">Excel</span>
              <span className="text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded">CSV</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
