import Link from 'next/link';
import { apiSafe } from '../../../lib/api';
import { computeRealMetrics, type RealDefect } from '../../../lib/real-engineering';
import { KpiCard } from '../../../components/kpi-card';
import { DownloadButton } from '../../../components/download-button';
import { CapabilityPlaceholder } from '../capability-placeholder';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientEngineeringPage({ params }: PageProps) {
  const { clientId } = await params;
  const { client } = await apiSafe<{ client: { id: string; name: string } | null }>(`/api/v1/oc/clients/${clientId}`, { client: null });
  if (!client) return <CapabilityPlaceholder title="Engineering Intelligence" description="Root cause analysis, defect detection, and recommendations for this client." />;

  // Authoritative defect data, scoped to this client — GET /oc/defects?clientId=..., not sample data.
  const { defects: clientDefects } = await apiSafe<{ defects: RealDefect[] }>(`/api/v1/oc/defects?clientId=${clientId}`, { defects: [] });
  const metrics = computeRealMetrics(clientDefects);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-lg">Engineering Intelligence</h2>
          <p className="text-xs text-gray-500">Defects and root cause analysis for {client.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/engineering" className="text-[10px] font-medium text-purple-600 hover:text-purple-800">View Platform →</Link>
          <DownloadButton fileName={`${client.name}_Engineering_Report`} format="pdf" entityId={clientId} entityName="Engineering Report" clientName={client.name} data={{ openDefects: metrics.openDefects, criticalOpen: metrics.criticalOpen, recurringIssues: metrics.recurringIssues }}>
            Report
          </DownloadButton>
        </div>
      </div>

      {/* Client-level KPIs — real counts only; build/deploy/code-quality metrics are not shown
          because there is no CI/CD or static-analysis data source for this platform */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Open Defects" value={metrics.openDefects} color={metrics.openDefects > 0 ? 'text-red-600' : 'text-green-600'} description={`Open engineering defects for ${client.name}.`} criteria="oc_defects rows for this client with status not in (resolved, verified, closed)." />
        <KpiCard label="Critical" value={metrics.criticalOpen} color="text-red-600" description="Critical defects requiring immediate action." criteria="Open defects with severity = 'critical'." />
        <KpiCard label="Recurring" value={metrics.recurringIssues} color={metrics.recurringIssues > 0 ? 'text-orange-600' : undefined} description="Issues that have occurred more than once." criteria="occurrence_count > 1." />
        <KpiCard label="Security" value={metrics.securityOpen} color={metrics.securityOpen > 0 ? 'text-red-600' : 'text-green-600'} description="Open security-category defects." criteria="Open defects with category = 'security'." />
      </div>

      {/* Defects List */}
      {clientDefects.length > 0 ? (
        <section className="bg-white rounded-xl border overflow-hidden">
          <div className="px-5 py-3 border-b flex items-center justify-between">
            <h3 className="font-semibold text-sm">Active Defects</h3>
            <span className="text-[10px] text-gray-400">{clientDefects.length} defects</span>
          </div>
          <div className="divide-y divide-gray-100">
            {clientDefects.map(d => (
              <Link key={d.id} href={`/engineering/${d.id}`} className="block px-5 py-3 hover:bg-gray-50 transition">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`w-2.5 h-2.5 rounded-full ${d.severity === 'critical' ? 'bg-red-500' : d.severity === 'high' ? 'bg-orange-500' : 'bg-yellow-500'}`} />
                    <div>
                      <p className="text-xs font-medium text-gray-900">{d.title}</p>
                      <p className="text-[10px] text-gray-400 capitalize">{d.category.replace('-', ' ')} • {d.status.replace('-', ' ')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-[10px]">
                    {d.occurrence_count > 1 && <span className="bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-medium">RECURRING</span>}
                    <span className={`font-medium px-2 py-0.5 rounded ${d.severity === 'critical' ? 'bg-red-100 text-red-700' : d.severity === 'high' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>{d.severity}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <p className="text-sm font-medium text-green-700">✓ No engineering defects for {client.name}</p>
          <p className="text-[10px] text-green-600 mt-1">No defects have been detected from connector, discovery, migration, lifecycle, or security signals for this client.</p>
        </div>
      )}
    </div>
  );
}
