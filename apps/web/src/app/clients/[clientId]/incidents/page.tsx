import { notFound } from 'next/navigation';
import Link from 'next/link';
import { mockClients } from '../../../lib/mock-clients';
import { CapabilityPlaceholder } from '../capability-placeholder';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientIncidentsPage({ params }: PageProps) {
  const { clientId } = await params;
  const client = mockClients.find(c => c.id === clientId);
  if (!client) return <CapabilityPlaceholder title="Incidents" description="Incident management, root cause analysis, and resolution tracking for this client." />;

  const open = client.incidents.filter(i => i.status === 'open' || i.status === 'investigating');
  const resolved = client.incidents.filter(i => i.status === 'resolved' || i.status === 'closed');

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <h2 className="font-semibold text-lg">Incidents ({client.incidents.length})</h2>
        <span className="text-xs text-red-600 font-medium">{open.length} Open</span>
        <span className="text-xs text-green-600 font-medium">{resolved.length} Resolved</span>
      </div>

      {client.incidents.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-500 text-sm">No incidents recorded.</div>
      ) : (
        <div className="space-y-3">
          {client.incidents.map(inc => (
            <Link key={inc.id} href={`/clients/${clientId}/incidents/${inc.id}`} className="block bg-white rounded-xl border p-5 hover:border-purple-200 hover:shadow-sm transition">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-sm">{inc.title}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <SeverityBadge severity={inc.severity} />
                    <IncStatusBadge status={inc.status} />
                  </div>
                </div>
                <span className="text-xs text-gray-400">{new Date(inc.createdAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="grid md:grid-cols-2 gap-3 text-xs">
                <div className="space-y-1.5">
                  <Row label="Assigned" value={inc.assignedEngineer} />
                  <Row label="Root Cause" value={inc.rootCause || 'Under investigation'} />
                </div>
                <div className="space-y-1.5">
                  <Row label="Resolution" value={inc.resolution || 'Pending'} />
                  <Row label="Resolved At" value={inc.resolvedAt ? new Date(inc.resolvedAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
      <div className="mt-4">
        <Link href="/incidents" className="text-xs text-purple-600 font-medium hover:text-purple-800">View All Platform Incidents →</Link>
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const c: Record<string, string> = { critical: 'bg-red-100 text-red-700', major: 'bg-orange-100 text-orange-700', minor: 'bg-yellow-100 text-yellow-700' };
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${c[severity] || 'bg-gray-100'}`}>{severity}</span>;
}
function IncStatusBadge({ status }: { status: string }) {
  const c: Record<string, string> = { open: 'bg-red-100 text-red-700', investigating: 'bg-orange-100 text-orange-700', resolved: 'bg-green-100 text-green-700', closed: 'bg-gray-100 text-gray-600' };
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${c[status] || 'bg-gray-100'}`}>{status}</span>;
}
function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-gray-400">{label}</span><span className="text-gray-700 font-medium">{value}</span></div>;
}
