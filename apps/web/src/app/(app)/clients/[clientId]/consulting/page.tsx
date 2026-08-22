import { CapabilityPlaceholder } from '../capability-placeholder';
import Link from 'next/link';
import { mockClients } from '../../../../lib/mock-clients';
import { AIInsightsPanel } from '../../../../components/ai-insights';
import { MissingInfoPanel } from '../../../../components/missing-info';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientConsultingPage({ params }: PageProps) {
  const { clientId } = await params;
  const client = mockClients.find(c => c.id === clientId);
  if (!client) return <CapabilityPlaceholder title="Consulting" description="Consulting management for this client." />;

  const opportunities = [
    { id: 'opp-1', title: 'Missing Monitoring Coverage', service: 'Monitoring & Observability', priority: 'high', value: 'Proactive issue detection, 60% faster MTTR', effort: '1-2 weeks' },
    { id: 'opp-2', title: 'No Disaster Recovery Plan', service: 'Architecture Review', priority: 'high', value: 'Business continuity assurance, compliance requirement', effort: '2-4 weeks' },
    { id: 'opp-3', title: 'Manual Deployment Process', service: 'DevOps Assessment', priority: 'medium', value: '10x deployment frequency, reduced human error', effort: '2-3 weeks' },
    { id: 'opp-4', title: 'Documentation Gaps', service: 'Knowledge Management', priority: 'medium', value: 'Reduced key-person risk, faster onboarding', effort: 'Ongoing' },
    ...(client.platformScore < 80 ? [{ id: 'opp-5', title: 'Security Posture Below Standard', service: 'Security Assessment', priority: 'critical' as const, value: 'Regulatory compliance, risk reduction', effort: '2-3 weeks' }] : []),
  ];

  const workspace = {
    discoveryComplete: client.platformScore >= 70,
    infoReceived: Math.round(client.platformScore * 0.9),
    openQuestions: client.platformScore < 80 ? 5 : 2,
    assumptions: 3,
    actionItems: client.openServiceRequests + 2,
  };

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Consulting Workspace</h2>
      <p className="text-xs text-gray-500 mb-6">Discovery, opportunities, recommendations, and deliverables for {client.name}</p>

      {/* Workspace Status */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard label="Discovery" value={workspace.discoveryComplete ? 'Complete' : 'In Progress'} color={workspace.discoveryComplete ? 'text-green-600' : 'text-orange-600'} />
        <StatCard label="Info Received" value={`${workspace.infoReceived}%`} color={workspace.infoReceived >= 80 ? 'text-green-600' : 'text-orange-600'} />
        <StatCard label="Open Questions" value={workspace.openQuestions} />
        <StatCard label="Assumptions" value={workspace.assumptions} />
        <StatCard label="Action Items" value={workspace.actionItems} color={workspace.actionItems > 5 ? 'text-orange-600' : undefined} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Consulting Opportunities */}
          <section className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold mb-4">Identified Opportunities</h3>
            <div className="space-y-3">
              {opportunities.map(opp => (
                <div key={opp.id} className="border rounded-lg p-4 hover:border-purple-200 transition">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium">{opp.title}</h4>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${opp.priority === 'critical' ? 'bg-red-100 text-red-700' : opp.priority === 'high' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>{opp.priority}</span>
                  </div>
                  <div className="grid md:grid-cols-3 gap-2 text-xs text-gray-600">
                    <div><span className="text-gray-400">Service: </span><Link href="/intelligence/catalog" className="text-purple-600 hover:text-purple-800">{opp.service}</Link></div>
                    <div><span className="text-gray-400">Value: </span>{opp.value}</div>
                    <div><span className="text-gray-400">Effort: </span>{opp.effort}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Proposal Summary */}
          <section className="bg-white rounded-xl border p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Proposal Summary</h3>
              <Link href={`/intelligence/proposals`} className="text-xs text-purple-600 font-medium hover:text-purple-800">Generate Full Proposal →</Link>
            </div>
            <div className="space-y-3 text-xs">
              <div className="border-l-2 border-purple-500 pl-3">
                <p className="font-medium text-gray-800">Executive Summary</p>
                <p className="text-gray-500 mt-1">{client.name} has {opportunities.length} improvement opportunities identified. Priority areas include {opportunities.filter(o => o.priority === 'high' || o.priority === 'critical').map(o => o.title.toLowerCase()).join(', ')}.</p>
              </div>
              <div className="border-l-2 border-orange-500 pl-3">
                <p className="font-medium text-gray-800">Current State</p>
                <p className="text-gray-500 mt-1">Platform maturity at {client.platformScore}%. {client.activeIncidents > 0 ? `${client.activeIncidents} active incidents requiring attention.` : 'No active incidents.'} SLA status: {client.slaStatus}.</p>
              </div>
              <div className="border-l-2 border-green-500 pl-3">
                <p className="font-medium text-gray-800">Expected Benefits</p>
                {/* Previously showed the same fixed targets (95%+ maturity,
                    99.99% availability, weekly→daily deployments) for every
                    client regardless of their actual current state or
                    opportunities — found during the 2026-08-22 global UX
                    audit. No real per-engagement benefit-target tracking
                    exists yet, so this is now honest about that instead of
                    presenting invented numbers as a real forecast. */}
                <p className="text-gray-500 mt-1">Specific benefit targets depend on which opportunities are scoped into the engagement — see the Maturity Assessment for {client.name}&apos;s current real dimension scores.</p>
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <MissingInfoPanel completeness={workspace.infoReceived} items={[
            ...(workspace.infoReceived < 90 ? [{ field: 'Architecture Documentation', impact: 'high' as const, reason: 'Required for architecture assessment' }] : []),
            ...(workspace.infoReceived < 80 ? [{ field: 'Infrastructure Inventory', impact: 'high' as const, reason: 'Required for monitoring setup' }] : []),
            ...(workspace.infoReceived < 70 ? [{ field: 'Deployment Pipeline', impact: 'medium' as const, reason: 'Required for DevOps assessment' }] : []),
          ]} blocked={workspace.infoReceived < 80 ? ['Complete Architecture Assessment', 'Security Review', 'Capacity Planning'] : []} />

          <AIInsightsPanel insights={[
            { type: 'recommendation', severity: 'high', title: `${opportunities.length} opportunities identified`, description: `Total estimated effort: ${opportunities.length * 2}-${opportunities.length * 4} weeks. High ROI potential.`, action: 'Generate Proposal', href: '/intelligence/proposals' },
            { type: 'prediction', severity: 'medium', title: 'Engagement potential', description: `Based on ${opportunities.filter(o => o.priority === 'high' || o.priority === 'critical').length} high-priority items, immediate engagement recommended.` },
          ]} title="Consulting Intelligence" />

          <section className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-xs text-gray-500 uppercase mb-3">Related</h3>
            <div className="space-y-1.5">
              <QuickLink href={`/clients/${clientId}/maturity`} label="Maturity Assessment" />
              <QuickLink href={`/clients/${clientId}/risks`} label="Risk Register" />
              <QuickLink href={`/clients/${clientId}/roadmap`} label="Transformation Roadmap" />
              <QuickLink href="/intelligence/catalog" label="Service Catalog" />
              <QuickLink href={`/clients/${clientId}/knowledge`} label="Knowledge Base" />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return <div className="bg-white rounded-xl border p-3 text-center"><p className={`text-sm font-bold ${color || 'text-gray-900'}`}>{value}</p><p className="text-[10px] text-gray-500 uppercase">{label}</p></div>;
}
function QuickLink({ href, label }: { href: string; label: string }) { return <Link href={href} className="block text-xs text-gray-600 hover:text-purple-600 py-1.5 px-2 rounded hover:bg-purple-50 transition">{label}</Link>; }
