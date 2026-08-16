import Link from 'next/link';
import { mockClients } from '../lib/mock-clients';
import { Breadcrumb } from '../components/breadcrumb';

export default function IncidentsPage() {
  const allIncidents = mockClients
    .flatMap(c => c.incidents.map(inc => ({ ...inc, clientId: c.id, clientName: c.name })))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const open = allIncidents.filter(i => i.status === 'open' || i.status === 'investigating');
  const resolved = allIncidents.filter(i => i.status === 'resolved' || i.status === 'closed');

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Incidents' }]} />
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Incidents</h1>
      <div className="flex gap-4 mb-6 text-sm">
        <span className="text-red-600 font-medium">{open.length} Open</span>
        <span className="text-green-600 font-medium">{resolved.length} Resolved</span>
        <span className="text-gray-500">{allIncidents.length} Total</span>
      </div>

      <section className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left px-6 py-3">Incident</th>
                <th className="text-left px-4 py-3">Client</th>
                <th className="text-left px-4 py-3">Severity</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Assigned</th>
                <th className="text-left px-4 py-3">Root Cause</th>
                <th className="text-left px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {allIncidents.map(inc => (
                <tr key={inc.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3">
                    <Link href={`/clients/${inc.clientId}?tab=incidents`} className="font-medium hover:text-purple-700">{inc.title}</Link>
                  </td>
                  <td className="px-4 py-3"><Link href={`/clients/${inc.clientId}`} className="text-gray-600 hover:text-purple-700">{inc.clientName}</Link></td>
                  <td className="px-4 py-3"><SeverityBadge severity={inc.severity} /></td>
                  <td className="px-4 py-3"><StatusBadge status={inc.status} /></td>
                  <td className="px-4 py-3 text-xs">{inc.assignedEngineer}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate">{inc.rootCause || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{new Date(inc.createdAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = { critical: 'bg-red-100 text-red-700', major: 'bg-orange-100 text-orange-700', minor: 'bg-yellow-100 text-yellow-700' };
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${colors[severity] || 'bg-gray-100 text-gray-600'}`}>{severity}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = { open: 'bg-red-100 text-red-700', investigating: 'bg-orange-100 text-orange-700', resolved: 'bg-green-100 text-green-700', closed: 'bg-gray-100 text-gray-600' };
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${colors[status] || 'bg-gray-100 text-gray-600'}`}>{status}</span>;
}
