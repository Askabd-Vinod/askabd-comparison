import Link from 'next/link';
import { mockClients } from '../../lib/mock-clients';
import { Breadcrumb } from '../../components/breadcrumb';
import { DemoDataBanner } from '../../components/demo-data-banner';

export default function DeploymentsPage() {
  const allDeployments = mockClients
    .flatMap(c => c.deployments.map(d => ({ ...d, clientId: c.id, clientName: c.name })))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Deployments' }]} />
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Deployments</h1>
      <DemoDataBanner />
      <section className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left px-6 py-3">Client</th>
                <th className="text-left px-4 py-3">Version</th>
                <th className="text-left px-4 py-3">Previous</th>
                <th className="text-left px-4 py-3">Build</th>
                <th className="text-left px-4 py-3">Commit</th>
                <th className="text-left px-4 py-3">Pipeline</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Duration</th>
                <th className="text-left px-4 py-3">Engineer</th>
                <th className="text-left px-4 py-3">Environment</th>
                <th className="text-left px-4 py-3">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {allDeployments.map(d => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3"><Link href={`/clients/${d.clientId}?tab=deployments`} className="font-medium hover:text-purple-700">{d.clientName}</Link></td>
                  <td className="px-4 py-3 font-mono text-xs">{d.version}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{d.previousVersion}</td>
                  <td className="px-4 py-3 font-mono text-xs">{d.buildNumber}</td>
                  <td className="px-4 py-3 font-mono text-xs">{d.gitCommit}</td>
                  <td className="px-4 py-3 text-xs">{d.pipeline}</td>
                  <td className="px-4 py-3"><StatusPill status={d.status} /></td>
                  <td className="px-4 py-3 text-xs">{d.duration}</td>
                  <td className="px-4 py-3 text-xs">{d.engineer}</td>
                  <td className="px-4 py-3 text-xs capitalize">{d.environment}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{new Date(d.timestamp).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    success: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    'rolling-back': 'bg-orange-100 text-orange-700',
    'in-progress': 'bg-blue-100 text-blue-700',
  };
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${colors[status] || 'bg-gray-100 text-gray-600'}`}>{status}</span>;
}
