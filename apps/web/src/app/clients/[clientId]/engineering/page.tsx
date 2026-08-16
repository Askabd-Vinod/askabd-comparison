import { notFound } from 'next/navigation';
import Link from 'next/link';
import { mockClients } from '../../../lib/mock-clients';
import { generateMockDefects, generateMockMetrics } from '../../../lib/engineering-intelligence';
import { KpiCard } from '../../../components/kpi-card';
import { DownloadButton } from '../../../components/download-button';
import { CapabilityPlaceholder } from '../capability-placeholder';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientEngineeringPage({ params }: PageProps) {
  const { clientId } = await params;
  const client = mockClients.find(c => c.id === clientId);
  if (!client) return <CapabilityPlaceholder title="Engineering Intelligence" description="Root cause analysis, defect detection, knowledge base, and engineering recommendations for this client." />;

  const allDefects = generateMockDefects();
  const clientDefects = allDefects.filter(d => d.clientId === clientId);
  const metrics = generateMockMetrics();
  const lastSync = new Date().toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-lg">Engineering Intelligence</h2>
          <p className="text-xs text-gray-500">Defects, root cause analysis, and recommendations for {client.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-gray-400">Last sync: {lastSync}</span>
          <Link href="/engineering" className="text-[10px] font-medium text-purple-600 hover:text-purple-800">View Platform →</Link>
          <DownloadButton fileName={`${client.name}_Engineering_Report`} format="pdf" entityId={clientId} entityName="Engineering Report" clientName={client.name} data={{ defects: clientDefects.length, buildHealth: metrics.buildHealth, codeQuality: metrics.codeQuality }}>
            Report
          </DownloadButton>
        </div>
      </div>

      {/* Client-level KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
        <KpiCard label="Defects" value={clientDefects.length} color={clientDefects.length > 0 ? 'text-red-600' : 'text-green-600'} description={`Active engineering defects for ${client.name}.`} criteria="Filtered from platform-wide defect database." />
        <KpiCard label="Critical" value={clientDefects.filter(d => d.severity === 'critical').length} color="text-red-600" description="Critical defects requiring immediate action." criteria="Severity = 'critical'." />
        <KpiCard label="Confidence" value={clientDefects.length > 0 ? `${Math.round(clientDefects.reduce((a, d) => a + d.confidenceScore, 0) / clientDefects.length)}%` : '—'} description="Average RCA confidence for this client." criteria="Mean of all defect confidence scores." />
        <KpiCard label="Build Health" value={`${metrics.buildHealth}%`} color="text-green-600" description="Build success rate for this client." criteria="Client-specific CI/CD metrics." />
        <KpiCard label="Code Quality" value={`${metrics.codeQuality}%`} description="Code quality composite score." criteria="TypeScript + ESLint + patterns." />
        <KpiCard label="Recurring" value={clientDefects.filter(d => d.recurring).length} color="text-orange-600" description="Issues that have occurred more than once." criteria="occurrenceCount > 1." />
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
                    {d.recurring && <span className="bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-medium">RECURRING</span>}
                    {d.confidenceScore > 0 && <span className="text-purple-600 font-bold">{d.confidenceScore}%</span>}
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
          <p className="text-[10px] text-green-600 mt-1">All systems operating normally. Engineering intelligence monitoring active.</p>
        </div>
      )}
    </div>
  );
}
