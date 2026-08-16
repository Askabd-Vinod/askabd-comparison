import { CapabilityPlaceholder } from '../capability-placeholder';
import Link from 'next/link';
import { mockClients } from '../../../lib/mock-clients';
import { AIInsightsPanel } from '../../../components/ai-insights';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientRoadmapPage({ params }: PageProps) {
  const { clientId } = await params;
  const client = mockClients.find(c => c.id === clientId);
  if (!client) return <CapabilityPlaceholder title="Roadmap" description="Roadmap management for this client." />;

  const phases = [
    {
      name: 'Quick Wins', timeframe: '1-2 weeks', status: 'in-progress' as const,
      items: [
        { title: 'Enable automated monitoring alerts', priority: 'high', effort: '2 days', status: 'completed' },
        { title: 'Implement connection pool monitoring', priority: 'high', effort: '1 day', status: 'completed' },
        { title: 'Configure auto-scaling thresholds', priority: 'medium', effort: '3 days', status: 'in-progress' },
      ],
    },
    {
      name: '30-Day Plan', timeframe: '1 month', status: 'in-progress' as const,
      items: [
        { title: 'Implement CI/CD pipeline', priority: 'high', effort: '2 weeks', status: 'in-progress' },
        { title: 'Add database replication', priority: 'high', effort: '1 week', status: 'planned' },
        { title: 'Complete security audit remediation', priority: 'high', effort: '2 weeks', status: 'planned' },
      ],
    },
    {
      name: '90-Day Plan', timeframe: '3 months', status: 'planned' as const,
      items: [
        { title: 'Containerize all services', priority: 'medium', effort: '4 weeks', status: 'planned' },
        { title: 'Implement blue-green deployments', priority: 'medium', effort: '2 weeks', status: 'planned' },
        { title: 'Complete compliance certification', priority: 'high', effort: '6 weeks', status: 'planned' },
        { title: 'Implement disaster recovery', priority: 'high', effort: '3 weeks', status: 'planned' },
      ],
    },
    {
      name: '6-Month Plan', timeframe: '6 months', status: 'planned' as const,
      items: [
        { title: 'Migrate to microservices architecture', priority: 'medium', effort: '8 weeks', status: 'planned' },
        { title: 'Implement event-driven architecture', priority: 'low', effort: '6 weeks', status: 'planned' },
        { title: 'Complete cloud-native transformation', priority: 'medium', effort: '10 weeks', status: 'planned' },
      ],
    },
    {
      name: '12-Month Plan', timeframe: '12 months', status: 'planned' as const,
      items: [
        { title: 'Achieve target maturity score (95%+)', priority: 'high', effort: 'Ongoing', status: 'planned' },
        { title: 'Full AI/ML integration', priority: 'low', effort: '12 weeks', status: 'planned' },
        { title: 'Zero-trust security model', priority: 'medium', effort: '8 weeks', status: 'planned' },
      ],
    },
  ];

  const totalItems = phases.reduce((a, p) => a + p.items.length, 0);
  const completedItems = phases.reduce((a, p) => a + p.items.filter(i => i.status === 'completed').length, 0);
  const progress = Math.round((completedItems / totalItems) * 100);

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Digital Transformation Roadmap</h2>
      <p className="text-xs text-gray-500 mb-6">From current state to enterprise-grade operations</p>

      {/* Progress */}
      <div className="grid md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border p-4 text-center"><p className="text-2xl font-bold text-purple-600">{progress}%</p><p className="text-[10px] text-gray-500">Overall Progress</p></div>
        <div className="bg-white rounded-xl border p-4 text-center"><p className="text-2xl font-bold text-green-600">{completedItems}</p><p className="text-[10px] text-gray-500">Completed</p></div>
        <div className="bg-white rounded-xl border p-4 text-center"><p className="text-2xl font-bold text-blue-600">{phases.reduce((a, p) => a + p.items.filter(i => i.status === 'in-progress').length, 0)}</p><p className="text-[10px] text-gray-500">In Progress</p></div>
        <div className="bg-white rounded-xl border p-4 text-center"><p className="text-2xl font-bold text-gray-600">{phases.reduce((a, p) => a + p.items.filter(i => i.status === 'planned').length, 0)}</p><p className="text-[10px] text-gray-500">Planned</p></div>
      </div>

      {/* Phases */}
      <div className="space-y-4 mb-6">
        {phases.map(phase => (
          <section key={phase.name} className="bg-white rounded-xl border p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold text-sm">{phase.name}</h3>
                <span className="text-[10px] text-gray-400">{phase.timeframe}</span>
              </div>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${phase.status === 'in-progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>{phase.status}</span>
            </div>
            <div className="space-y-2">
              {phase.items.map((item, i) => (
                <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${item.status === 'completed' ? 'bg-green-500' : item.status === 'in-progress' ? 'bg-blue-500' : 'bg-gray-300'}`} />
                    <span className={item.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-700'}>{item.title}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-gray-400">
                    <span className={`font-medium ${item.priority === 'high' ? 'text-red-500' : item.priority === 'medium' ? 'text-orange-500' : 'text-gray-400'}`}>{item.priority}</span>
                    <span>{item.effort}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Expected Outcomes */}
      <div className="grid md:grid-cols-2 gap-6">
        <section className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold mb-3">Expected Outcomes</h3>
          <div className="space-y-2 text-xs">
            <OutcomeRow label="Platform Score" from={`${client.platformScore}%`} to="95%+" />
            <OutcomeRow label="Availability" from={`${client.monitoring.availability}%`} to="99.99%" />
            <OutcomeRow label="Deploy Frequency" from="Weekly" to="Daily" />
            <OutcomeRow label="MTTR" from="4 hours" to="30 minutes" />
            <OutcomeRow label="Security Score" from="75%" to="95%" />
          </div>
        </section>

        <AIInsightsPanel insights={[
          { type: 'prediction', severity: 'low', title: 'On track for Q4 targets', description: `${progress}% complete. Current velocity suggests 90-day milestones achievable.` },
          { type: 'recommendation', severity: 'medium', title: 'Focus: CI/CD pipeline', description: 'Highest ROI item currently in progress. Will accelerate all subsequent phases.', action: 'View Deployments', href: `/clients/${clientId}/deployments` },
        ]} />
      </div>
    </div>
  );
}

function OutcomeRow({ label, from, to }: { label: string; from: string; to: string }) {
  return <div className="flex items-center justify-between"><span className="text-gray-600">{label}</span><span className="text-gray-400">{from} → <span className="font-medium text-purple-600">{to}</span></span></div>;
}
