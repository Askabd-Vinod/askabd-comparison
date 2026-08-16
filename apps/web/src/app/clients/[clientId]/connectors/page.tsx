import Link from 'next/link';
import { mockClients } from '../../../lib/mock-clients';
import { connectorCatalog, ConnectorStatus } from '../../../lib/connectors';
import { AIInsightsPanel } from '../../../components/ai-insights';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientConnectorsPage({ params }: PageProps) {
  const { clientId } = await params;
  const client = mockClients.find(c => c.id === clientId);
  // Allow both mock clients and real onboarded clients (don't 404 for real clients)

  // Simulate connected connectors based on client data
  const connected = ['github', 'kubernetes', 'prometheus', 'postgresql', 'slack'];
  const totalAvailable = connectorCatalog.reduce((a, c) => a + c.connectors.length, 0);

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Connector Framework</h2>
      <p className="text-xs text-gray-500 mb-6">Secure connections to customer systems for evidence collection and analysis</p>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Stat label="Connected" value={connected.length} color="text-green-600" />
        <Stat label="Available" value={totalAvailable} />
        <Stat label="Categories" value={connectorCatalog.length} />
        <Stat label="Data Coverage" value="68%" color="text-orange-600" />
        <Stat label="Confidence" value="82%" color="text-purple-600" />
      </div>

      {/* Connector Categories */}
      <div className="space-y-4 mb-6">
        {connectorCatalog.map(cat => (
          <section key={cat.category} className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-sm mb-3">{cat.label}</h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2">
              {cat.connectors.map(conn => {
                const isConnected = connected.includes(conn.id);
                return (
                  <div key={conn.id} className={`flex items-center justify-between p-3 rounded-lg border ${isConnected ? 'border-green-200 bg-green-50' : 'border-gray-200'}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{conn.icon}</span>
                      <span className="text-xs font-medium">{conn.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-300'}`} />
                      <span className={`text-[10px] font-medium ${isConnected ? 'text-green-600' : 'text-gray-400'}`}>{isConnected ? 'Connected' : 'Available'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Data Coverage & Confidence */}
      <div className="grid md:grid-cols-2 gap-6">
        <section className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold mb-3">Data Coverage</h3>
          <div className="space-y-2 text-xs">
            <CoverageRow label="Source Code" connected={connected.includes('github')} />
            <CoverageRow label="Infrastructure" connected={connected.includes('kubernetes')} />
            <CoverageRow label="Monitoring" connected={connected.includes('prometheus')} />
            <CoverageRow label="Database" connected={connected.includes('postgresql')} />
            <CoverageRow label="CI/CD" connected={false} />
            <CoverageRow label="Cloud Resources" connected={false} />
            <CoverageRow label="Identity" connected={false} />
            <CoverageRow label="Documentation" connected={false} />
          </div>
          <p className="text-[10px] text-gray-400 mt-3 border-t pt-3">Missing connectors reduce analysis confidence and limit automation capabilities.</p>
        </section>

        <AIInsightsPanel insights={[
          { type: 'recommendation', severity: 'medium', title: 'Connect CI/CD for deployment intelligence', description: 'Without CI/CD connector, deployment history relies on manual data. Connect GitHub Actions or Azure Pipelines for automated evidence.', action: 'View Catalog', href: '/intelligence/catalog/devops-assessment' },
          { type: 'risk', severity: 'low', title: 'Cloud connector missing', description: 'Cloud cost optimization and capacity planning require AWS/Azure/GCP connector. Current analysis limited to infrastructure metrics only.' },
          { type: 'prediction', severity: 'low', title: 'Confidence improvement', description: `Connecting 2 more data sources would increase analysis confidence from 82% to ~91%.` },
        ]} title="Connector Intelligence" />
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return <div className="bg-white rounded-xl border p-3 text-center"><p className={`text-lg font-bold ${color || 'text-gray-900'}`}>{value}</p><p className="text-[10px] text-gray-500 uppercase">{label}</p></div>;
}
function CoverageRow({ label, connected }: { label: string; connected: boolean }) {
  return <div className="flex items-center justify-between py-1"><span className="text-gray-600">{label}</span><span className={`text-[10px] font-medium px-2 py-0.5 rounded ${connected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{connected ? 'Connected' : 'Not Connected'}</span></div>;
}
