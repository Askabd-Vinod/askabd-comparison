import Link from 'next/link';
import { Breadcrumb } from '../components/breadcrumb';
import { statusColor } from '../components/status-badge';
import { KpiCard } from '../components/kpi-card';
import { ServiceControlsInline } from '../components/service-controls';
import { OnboardSuccessBanner } from '../components/onboarded-clients';
import { apiSafe } from '../lib/api';
import { formatComputedAt } from '../lib/health-tier';

interface RealClient {
  id: string; name: string; industry: string; health: string;
  sla_status: string; status: string;
  primary_contact: string; onboarded_at: string;
}
interface HealthSummaryRow { clientId: string; overallScore: number | null; computedAt: string | null }

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ health?: string; status?: string; view?: string }> }) {
  const params = await searchParams;
  const healthFilter = params.health;
  const statusFilter = params.status;
  const viewMode = params.view || 'table';

  // Authoritative client data — GET /oc/clients (oc_clients table), not fabricated sample data.
  const { clients: allClients } = await apiSafe<{ clients: RealClient[] }>('/api/v1/oc/clients', { clients: [] });
  // Real, evidence-based per-client health scores — same ClientHealthService the
  // Scorecard page uses, read via one bulk request rather than one per client.
  const { summaries } = await apiSafe<{ summaries: HealthSummaryRow[] }>('/api/v1/oc/clients/health-summary', { summaries: [] });
  const scoreByClient = new Map(summaries.map(s => [s.clientId, s]));
  let clients = allClients;

  if (healthFilter) {
    clients = clients.filter(c => c.health === healthFilter);
  }
  if (statusFilter) {
    switch (statusFilter) {
      case 'active': clients = clients.filter(c => c.health !== 'offline'); break;
      case 'offline': case 'suspended': clients = clients.filter(c => c.health === 'offline'); break;
      case 'sla-compliant': clients = clients.filter(c => c.sla_status === 'compliant'); break;
    }
  }

  const statuses = {
    active: allClients.filter(c => c.health !== 'offline').length,
    offline: allClients.filter(c => c.health === 'offline').length,
    slaCompliant: allClients.filter(c => c.sla_status === 'compliant').length,
  };

  const activeFilter = healthFilter || statusFilter || null;

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Clients' }]} />
      <OnboardSuccessBanner />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Client Directory</h1>
          <p className="text-sm text-gray-500 mt-0.5">{clients.length} of {allClients.length} client{allClients.length !== 1 ? 's' : ''}{activeFilter ? ` — filtered by "${activeFilter}"` : ''} • Enterprise lifecycle management</p>
        </div>
        <div className="flex items-center gap-3">
          {activeFilter && (
            <Link href="/clients" className="text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition border border-red-200">
              ✕ Clear Filter
            </Link>
          )}
          <Link href="/clients/onboard" className="text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg transition">
            + Add Client
          </Link>
        </div>
      </div>

      {/* Status Summary — real values only; lifecycle sub-states (onboarding/suspended/
          transformation) aren't tracked as distinct fields on the client record yet, so
          they're not shown here rather than displaying an always-zero or misleading tile. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <KpiCard label="Active" value={statuses.active} color="text-green-600" href="/clients?status=active" description="Clients whose stored health status is not 'offline'." criteria="oc_clients.health != 'offline'." />
        <KpiCard label="Offline" value={statuses.offline} color="text-gray-500" href="/clients?status=offline" description="Clients whose stored health status is 'offline'." criteria="oc_clients.health = 'offline'." />
        <KpiCard label="SLA Compliant" value={`${statuses.slaCompliant}/${allClients.length}`} color="text-green-600" href="/clients?status=sla-compliant" description="Clients whose stored SLA status is 'compliant'." criteria="oc_clients.sla_status = 'compliant'." />
      </div>

      {/* Client Views */}
      <section className="bg-white rounded-xl border overflow-hidden mb-6">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <div className="flex gap-2">
            <Link href={viewUrl('table', params)} className={`text-[10px] font-medium px-3 py-1 rounded-md transition ${viewMode === 'table' ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:bg-gray-100'}`}>Table</Link>
            <Link href={viewUrl('cards', params)} className={`text-[10px] font-medium px-3 py-1 rounded-md transition ${viewMode === 'cards' ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:bg-gray-100'}`}>Cards</Link>
            <Link href={viewUrl('kanban', params)} className={`text-[10px] font-medium px-3 py-1 rounded-md transition ${viewMode === 'kanban' ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:bg-gray-100'}`}>Kanban</Link>
          </div>
          <span className="text-[10px] text-gray-400">{clients.length} client{clients.length !== 1 ? 's' : ''}{activeFilter ? ` (filtered)` : ''}</span>
        </div>

        {clients.length === 0 && (
          <div className="p-10 text-center text-sm text-gray-400">
            {allClients.length === 0 ? (
              <>No clients registered yet. <Link href="/clients/onboard" className="text-purple-600 hover:text-purple-800 font-medium">Onboard a client →</Link></>
            ) : (
              <>No clients match this filter. <Link href="/clients" className="text-purple-600 hover:text-purple-800 font-medium">Clear filter →</Link></>
            )}
          </div>
        )}

        {/* Table View */}
        {viewMode === 'table' && clients.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="text-left px-5 py-3">Client</th>
                  <th className="text-left px-3 py-3">Health</th>
                  <th className="text-left px-3 py-3">SLA</th>
                  <th className="text-center px-3 py-3">Score</th>
                  <th className="text-left px-3 py-3">Contact</th>
                  <th className="text-left px-3 py-3">Onboarded</th>
                  <th className="text-center px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {clients.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50 transition">
                    <td className="px-5 py-3">
                      <Link href={`/clients/${c.id}`} className="flex items-center gap-3 hover:text-purple-700">
                        <div className="w-8 h-8 gradient-brand rounded-md flex items-center justify-center shrink-0">
                          <span className="text-white text-[10px] font-bold">{c.name.slice(0, 2).toUpperCase()}</span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 text-xs">{c.name}</p>
                          <p className="text-[10px] text-gray-400">{c.industry}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-3 py-3"><span className="flex items-center gap-1.5 text-xs"><span className={`w-2 h-2 rounded-full ${statusColor(c.health as any)}`} />{c.health}</span></td>
                    <td className="px-3 py-3"><span className={`text-[10px] font-medium ${c.sla_status === 'compliant' ? 'text-green-600' : c.sla_status === 'at-risk' ? 'text-orange-600' : 'text-red-600'}`}>{c.sla_status}</span></td>
                    <td className="px-3 py-3 text-center">
                      {scoreByClient.get(c.id)?.overallScore != null ? (
                        <>
                          <span className="text-xs font-bold">{scoreByClient.get(c.id)!.overallScore}</span>
                          <p className="text-[9px] text-gray-400">{formatComputedAt(scoreByClient.get(c.id)!.computedAt)}</p>
                        </>
                      ) : (
                        <span className="text-[9px] text-gray-400">Not yet calculated</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-[10px] text-gray-500 max-w-[140px] truncate">{c.primary_contact || '—'}</td>
                    <td className="px-3 py-3 text-[10px] text-gray-500">{c.onboarded_at ? new Date(c.onboarded_at).toLocaleDateString() : '—'}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <ServiceControlsInline entityId={c.id} entityName={c.name} entityType="client" initialEnabled={c.health !== 'offline'} />
                        <Link href={`/clients/${c.id}/edit`} className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-xs text-gray-400 border border-gray-200 hover:bg-purple-50 hover:text-purple-600 hover:border-purple-300 transition" title={`Edit ${c.name}`}>✎</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Cards View */}
        {viewMode === 'cards' && clients.length > 0 && (
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {clients.map(c => (
              <div key={c.id} className="border border-gray-200 rounded-xl p-4 hover:shadow-lg hover:border-purple-300 hover:-translate-y-0.5 transition-all duration-200 group">
                <Link href={`/clients/${c.id}`} className="block">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 gradient-brand rounded-lg flex items-center justify-center shrink-0">
                      <span className="text-white text-xs font-bold">{c.name.slice(0, 2).toUpperCase()}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-gray-900 group-hover:text-purple-700 transition truncate">{c.name}</p>
                      <p className="text-[10px] text-gray-400">{c.industry}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`w-2.5 h-2.5 rounded-full ${statusColor(c.health as any)}`} />
                    <span className="text-xs capitalize text-gray-600">{c.health}</span>
                    <span className={`text-[10px] font-medium ml-auto ${c.sla_status === 'compliant' ? 'text-green-600' : c.sla_status === 'at-risk' ? 'text-orange-600' : 'text-red-600'}`}>{c.sla_status}</span>
                  </div>
                  <div className="flex items-center justify-between border-t pt-3 text-center">
                    <div>
                      <p className="text-sm font-bold text-gray-900">{scoreByClient.get(c.id)?.overallScore ?? '—'}</p>
                      <p className="text-[9px] text-gray-400 uppercase">{scoreByClient.get(c.id)?.overallScore != null ? 'Score' : 'Not yet calculated'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-500">{c.onboarded_at ? new Date(c.onboarded_at).toLocaleDateString() : '—'}</p>
                      <p className="text-[9px] text-gray-400 uppercase">Onboarded</p>
                    </div>
                  </div>
                </Link>
                <div className="flex items-center justify-end mt-3 pt-3 border-t">
                  <ServiceControlsInline entityId={c.id} entityName={c.name} entityType="client" initialEnabled={c.health !== 'offline'} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Kanban View */}
        {viewMode === 'kanban' && clients.length > 0 && (
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {(['healthy', 'warning', 'critical', 'offline'] as const).map(healthStatus => {
              const columnClients = clients.filter(c => c.health === healthStatus);
              const headerColors: Record<string, string> = { healthy: 'bg-green-500', warning: 'bg-orange-500', critical: 'bg-red-500', offline: 'bg-gray-400' };
              return (
                <div key={healthStatus} className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                  <div className={`${headerColors[healthStatus]} px-4 py-2 flex items-center justify-between`}>
                    <span className="text-xs font-semibold text-white capitalize">{healthStatus}</span>
                    <span className="text-[10px] font-bold text-white/80 bg-white/20 px-1.5 py-0.5 rounded">{columnClients.length}</span>
                  </div>
                  <div className="p-3 space-y-3 min-h-[200px]">
                    {columnClients.length === 0 && (
                      <p className="text-[11px] text-gray-400 text-center py-6">No clients</p>
                    )}
                    {columnClients.map(c => (
                      <Link key={c.id} href={`/clients/${c.id}`} className="block bg-white rounded-lg border border-gray-200 p-3 hover:shadow-md hover:border-purple-300 transition">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-7 h-7 gradient-brand rounded-md flex items-center justify-center shrink-0">
                            <span className="text-white text-[9px] font-bold">{c.name.slice(0, 2).toUpperCase()}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-gray-900 truncate">{c.name}</p>
                            <p className="text-[9px] text-gray-400">{c.industry}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-medium text-gray-600">Score: <span className="font-bold">{scoreByClient.get(c.id)?.overallScore ?? 'N/A'}</span></span>
                          <span className={`font-medium ${c.sla_status === 'compliant' ? 'text-green-600' : c.sla_status === 'at-risk' ? 'text-orange-600' : 'text-red-600'}`}>{c.sla_status}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function viewUrl(view: string, params: { health?: string; status?: string; view?: string }) {
  const query = new URLSearchParams();
  if (params.health) query.set('health', params.health);
  if (params.status) query.set('status', params.status);
  if (view !== 'table') query.set('view', view);
  const qs = query.toString();
  return `/clients${qs ? `?${qs}` : ''}`;
}
