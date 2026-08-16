import { CapabilityPlaceholder } from '../capability-placeholder';
import Link from 'next/link';
import { mockClients } from '../../../lib/mock-clients';
import { AIInsightsPanel } from '../../../components/ai-insights';
import { MissingInfoPanel } from '../../../components/missing-info';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientMaturityPage({ params }: PageProps) {
  const { clientId } = await params;
  const client = mockClients.find(c => c.id === clientId);
  if (!client) return <CapabilityPlaceholder title="Maturity" description="Maturity management for this client." />;

  const score = client.platformScore;
  const dimensions = [
    { name: 'Architecture', current: Math.min(100, score + 5), target: 95, weight: 0.15 },
    { name: 'DevOps', current: Math.min(100, score - 3), target: 90, weight: 0.12 },
    { name: 'Security', current: Math.min(100, score + 2), target: 95, weight: 0.15 },
    { name: 'Operations', current: score, target: 90, weight: 0.12 },
    { name: 'Governance', current: Math.min(100, score - 5), target: 85, weight: 0.08 },
    { name: 'Monitoring', current: Math.min(100, score + 8), target: 95, weight: 0.10 },
    { name: 'Documentation', current: Math.max(0, score - 15), target: 80, weight: 0.05 },
    { name: 'Testing', current: Math.min(100, score - 8), target: 90, weight: 0.08 },
    { name: 'Automation', current: Math.min(100, score - 10), target: 85, weight: 0.07 },
    { name: 'Cloud', current: Math.min(100, score + 3), target: 90, weight: 0.05 },
    { name: 'AI Readiness', current: Math.max(0, score - 25), target: 70, weight: 0.03 },
  ];

  const overallCurrent = Math.round(dimensions.reduce((a, d) => a + d.current * d.weight, 0) / dimensions.reduce((a, d) => a + d.weight, 0));
  const overallTarget = Math.round(dimensions.reduce((a, d) => a + d.target * d.weight, 0) / dimensions.reduce((a, d) => a + d.weight, 0));

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Enterprise Maturity Assessment</h2>
      <p className="text-xs text-gray-500 mb-6">Comprehensive evaluation across {dimensions.length} dimensions</p>

      {/* Overall Score */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border p-5 text-center">
          <p className="text-3xl font-bold gradient-text">{overallCurrent}%</p>
          <p className="text-xs text-gray-500 mt-1">Current Maturity</p>
        </div>
        <div className="bg-white rounded-xl border p-5 text-center">
          <p className="text-3xl font-bold text-purple-600">{overallTarget}%</p>
          <p className="text-xs text-gray-500 mt-1">Target Maturity</p>
        </div>
        <div className="bg-white rounded-xl border p-5 text-center">
          <p className="text-3xl font-bold text-orange-600">{overallTarget - overallCurrent}%</p>
          <p className="text-xs text-gray-500 mt-1">Gap to Close</p>
        </div>
      </div>

      {/* Dimension Breakdown */}
      <section className="bg-white rounded-xl border p-5 mb-6">
        <h3 className="font-semibold mb-4">Dimension Scores</h3>
        <div className="space-y-3">
          {dimensions.map(dim => {
            const gap = dim.target - dim.current;
            const color = dim.current >= dim.target ? 'bg-green-500' : dim.current >= dim.target - 15 ? 'bg-orange-500' : 'bg-red-500';
            return (
              <div key={dim.name} className="flex items-center gap-4">
                <span className="text-xs font-medium w-28 text-gray-700">{dim.name}</span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden relative">
                  <div className={`h-full rounded-full ${color}`} style={{ width: `${dim.current}%` }} />
                  <div className="absolute top-0 h-full w-px bg-purple-600" style={{ left: `${dim.target}%` }} title={`Target: ${dim.target}%`} />
                </div>
                <span className="text-xs font-bold w-10 text-right">{dim.current}%</span>
                <span className="text-[10px] text-gray-400 w-16 text-right">Target: {dim.target}%</span>
                <span className={`text-[10px] font-medium w-12 text-right ${gap > 0 ? 'text-orange-600' : 'text-green-600'}`}>{gap > 0 ? `-${gap}%` : '✓ Met'}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Readiness Scores */}
      <section className="bg-white rounded-xl border p-5 mb-6">
        <h3 className="font-semibold mb-4">Enterprise Readiness</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ReadinessCard label="Architecture" score={dimensions[0].current} />
          <ReadinessCard label="Operations" score={dimensions[3].current} />
          <ReadinessCard label="Security" score={dimensions[2].current} />
          <ReadinessCard label="Transformation" score={overallCurrent} />
        </div>
      </section>

      {/* Recommendations & Gaps */}
      <div className="grid md:grid-cols-2 gap-6">
        <AIInsightsPanel insights={[
          ...dimensions.filter(d => d.current < d.target - 10).map(d => ({
            type: 'recommendation' as const,
            severity: (d.target - d.current > 20 ? 'high' : 'medium') as 'high' | 'medium',
            title: `${d.name}: ${d.target - d.current}% below target`,
            description: `Current ${d.current}% vs target ${d.target}%. Improvement plan required.`,
            action: 'View Roadmap',
            href: `/clients/${clientId}/roadmap`,
          })),
        ].slice(0, 4)} title="Improvement Priorities" />

        <MissingInfoPanel completeness={score >= 90 ? 92 : score >= 70 ? 75 : 55} items={[
          ...(score < 90 ? [{ field: 'Architecture Documentation', impact: 'high' as const, reason: 'Required for architecture maturity scoring' }] : []),
          ...(score < 80 ? [{ field: 'Test Coverage Reports', impact: 'medium' as const, reason: 'Required for testing maturity calculation' }] : []),
          ...(score < 70 ? [{ field: 'Security Scan Results', impact: 'high' as const, reason: 'Required for security maturity evaluation' }] : []),
        ]} blocked={score < 80 ? ['Complete Architecture Assessment', 'Security Maturity Evaluation'] : []} />
      </div>
    </div>
  );
}

function ReadinessCard({ label, score }: { label: string; score: number }) {
  const color = score >= 80 ? 'text-green-600' : score >= 60 ? 'text-orange-600' : 'text-red-600';
  return <div className="border rounded-lg p-3 text-center"><p className={`text-xl font-bold ${color}`}>{score}%</p><p className="text-[10px] text-gray-500">{label}</p></div>;
}
