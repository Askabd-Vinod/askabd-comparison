import { CapabilityPlaceholder } from '../capability-placeholder';
import Link from 'next/link';
import { mockClients } from '../../../lib/mock-clients';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientSupportPage({ params }: PageProps) {
  const { clientId } = await params;
  const client = mockClients.find(c => c.id === clientId);
  if (!client) return <CapabilityPlaceholder title="Support" description="Support management for this client." />;

  const tickets = [
    { id: 'TKT-001', title: 'SSL certificate renewal', engineer: 'hello@askabd.com', created: '2026-08-01T10:00:00Z', closed: '2026-08-01T11:30:00Z', sla: 'Met', resolution: 'Certificate renewed via automated pipeline', status: 'closed' },
    { id: 'TKT-002', title: 'Database performance tuning', engineer: 'ops@askabd.com', created: '2026-07-28T14:00:00Z', closed: '2026-07-29T09:00:00Z', sla: 'Met', resolution: 'Added indexes and optimized slow queries', status: 'closed' },
    { id: 'TKT-003', title: 'API rate limit adjustment', engineer: 'hello@askabd.com', created: '2026-07-25T08:00:00Z', closed: '2026-07-25T10:00:00Z', sla: 'Met', resolution: 'Increased rate limit from 1000 to 5000 req/min', status: 'closed' },
    ...(client.openServiceRequests > 0 ? [
      { id: 'TKT-004', title: 'New environment provisioning request', engineer: 'ops@askabd.com', created: '2026-08-02T09:00:00Z', closed: '', sla: 'In Progress', resolution: '', status: 'open' },
      { id: 'TKT-005', title: 'Integration webhook configuration', engineer: 'hello@askabd.com', created: '2026-08-03T07:00:00Z', closed: '', sla: 'In Progress', resolution: '', status: 'open' },
    ] : []),
  ];

  const open = tickets.filter(t => t.status === 'open');
  const closed = tickets.filter(t => t.status === 'closed');

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <h2 className="font-semibold text-lg">Support History</h2>
        <span className="text-xs text-orange-600 font-medium">{open.length} Open</span>
        <span className="text-xs text-green-600 font-medium">{closed.length} Closed</span>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left px-5 py-3">Ticket</th>
                <th className="text-left px-4 py-3">Subject</th>
                <th className="text-left px-4 py-3">Engineer</th>
                <th className="text-left px-4 py-3">Created</th>
                <th className="text-left px-4 py-3">Closed</th>
                <th className="text-left px-4 py-3">SLA</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Resolution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tickets.map(t => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-mono text-xs font-medium">{t.id}</td>
                  <td className="px-4 py-3 text-xs font-medium">{t.title}</td>
                  <td className="px-4 py-3 text-xs">{t.engineer}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(t.created)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{t.closed ? fmtDate(t.closed) : '—'}</td>
                  <td className="px-4 py-3"><span className={`text-[11px] font-medium px-2 py-0.5 rounded ${t.sla === 'Met' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{t.sla}</span></td>
                  <td className="px-4 py-3"><span className={`text-[11px] font-medium px-2 py-0.5 rounded ${t.status === 'open' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>{t.status}</span></td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate">{t.resolution || 'In progress'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function fmtDate(iso: string): string { try { return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } }
