import { CapabilityPlaceholder } from '../capability-placeholder';
import Link from 'next/link';
import { mockClients } from '../../../lib/mock-clients';
import { AIInsightsPanel } from '../../../components/ai-insights';
import { SolutionRecommendation, Solution } from '../../../components/solution-recommendation';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientRisksPage({ params }: PageProps) {
  const { clientId } = await params;
  const client = mockClients.find(c => c.id === clientId);
  if (!client) return <CapabilityPlaceholder title="Risks" description="Risks management for this client." />;

  const risks = [
    { id: 'r1', category: 'Technology', title: 'Legacy infrastructure components', likelihood: 'Medium', impact: 'High', severity: client.health === 'critical' ? 'critical' : 'high', owner: 'hello@askabd.com', status: 'open', mitigation: 'Plan migration to containerized architecture', trend: 'stable' },
    { id: 'r2', category: 'Operational', title: 'Single point of failure in database layer', likelihood: 'Low', impact: 'Critical', severity: 'high' as const, owner: 'ops@askabd.com', status: 'mitigating', mitigation: 'Implement database replication and failover', trend: 'improving' },
    { id: 'r3', category: 'Security', title: 'Certificate expiry approaching', likelihood: 'High', impact: 'Medium', severity: 'medium' as const, owner: 'hello@askabd.com', status: 'open', mitigation: 'Implement automated certificate renewal', trend: 'stable' },
    { id: 'r4', category: 'Compliance', title: 'Audit logging gaps identified', likelihood: 'Medium', impact: 'Medium', severity: 'medium' as const, owner: 'ops@askabd.com', status: 'mitigating', mitigation: 'Extend audit coverage to all write operations', trend: 'improving' },
    ...(client.activeIncidents > 0 ? [{ id: 'r5', category: 'Business', title: 'Active incident affecting SLA', likelihood: 'Certain' as const, impact: 'High' as const, severity: 'critical' as const, owner: client.incidents[0]?.assignedEngineer || 'hello@askabd.com', status: 'active', mitigation: 'Incident resolution in progress', trend: 'worsening' as const }] : []),
  ];

  const severityColor: Record<string, string> = { critical: 'bg-red-100 text-red-700', high: 'bg-orange-100 text-orange-700', medium: 'bg-yellow-100 text-yellow-700', low: 'bg-blue-100 text-blue-700' };
  const trendIcon: Record<string, string> = { improving: '↗ Improving', stable: '→ Stable', worsening: '↘ Worsening' };

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Risk Register</h2>
      <p className="text-xs text-gray-500 mb-4">Business, technology, operational, security and compliance risks</p>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Stat label="Total Risks" value={risks.length} />
        <Stat label="Critical" value={risks.filter(r => r.severity === 'critical').length} color="text-red-600" />
        <Stat label="High" value={risks.filter(r => r.severity === 'high').length} color="text-orange-600" />
        <Stat label="Mitigating" value={risks.filter(r => r.status === 'mitigating').length} color="text-blue-600" />
        <Stat label="Open" value={risks.filter(r => r.status === 'open').length} color="text-gray-600" />
      </div>

      {/* Risk Table */}
      <div className="bg-white rounded-xl border overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left px-5 py-3">Risk</th>
                <th className="text-left px-4 py-3">Category</th>
                <th className="text-left px-4 py-3">Likelihood</th>
                <th className="text-left px-4 py-3">Impact</th>
                <th className="text-left px-4 py-3">Severity</th>
                <th className="text-left px-4 py-3">Owner</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Trend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {risks.map(risk => (
                <tr key={risk.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-900 text-xs">{risk.title}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{risk.mitigation}</p>
                  </td>
                  <td className="px-4 py-3 text-xs">{risk.category}</td>
                  <td className="px-4 py-3 text-xs">{risk.likelihood}</td>
                  <td className="px-4 py-3 text-xs">{risk.impact}</td>
                  <td className="px-4 py-3"><span className={`text-[11px] font-medium px-2 py-0.5 rounded ${severityColor[risk.severity]}`}>{risk.severity}</span></td>
                  <td className="px-4 py-3 text-xs">{risk.owner}</td>
                  <td className="px-4 py-3 text-xs capitalize">{risk.status}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{trendIcon[risk.trend]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* AI Insights + Solution */}
      <div className="grid md:grid-cols-2 gap-6">
        <AIInsightsPanel insights={[
          { type: 'risk', severity: risks.some(r => r.severity === 'critical') ? 'critical' : 'high', title: `${risks.length} risks tracked`, description: `${risks.filter(r => r.severity === 'critical').length} critical, ${risks.filter(r => r.severity === 'high').length} high severity. Mitigation plans in progress.` },
          { type: 'recommendation', severity: 'medium', title: 'Priority: Address single point of failure', description: 'Database layer redundancy should be highest priority to prevent data loss risk.', action: 'View Infrastructure', href: `/clients/${clientId}/infrastructure` },
        ]} />

        <SolutionRecommendation solution={{
          immediateFix: 'Enable database read replicas and connection failover',
          permanentFix: 'Implement multi-region active-active database architecture',
          priority: 'high', effort: '2-4 weeks',
          businessImpact: 'Eliminates single point of failure risk for all client data',
          technicalImpact: 'Adds redundancy, improves read performance, enables DR',
          dependencies: ['Infrastructure team', 'DBA support'],
          validationSteps: ['Test failover scenario', 'Verify zero data loss', 'Load test replica performance'],
          rollbackPlan: 'Disable replication and revert to single-node', owner: 'hello@askabd.com', status: 'pending',
        }} title="Top Risk Mitigation" />
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return <div className="bg-white rounded-xl border p-3 text-center"><p className={`text-lg font-bold ${color || 'text-gray-900'}`}>{value}</p><p className="text-[10px] text-gray-500 uppercase">{label}</p></div>;
}
