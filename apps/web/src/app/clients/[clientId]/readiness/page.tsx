import { CapabilityPlaceholder } from '../capability-placeholder';
import Link from 'next/link';
import { mockClients } from '../../../lib/mock-clients';
import { AIInsightsPanel } from '../../../components/ai-insights';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientReadinessPage({ params }: PageProps) {
  const { clientId } = await params;
  const client = mockClients.find(c => c.id === clientId);
  if (!client) return <CapabilityPlaceholder title="Readiness" description="Readiness management for this client." />;

  const score = client.platformScore;
  const dimensions = [
    { name: 'Business Readiness', score: Math.min(100, score + 3), target: 90, href: `/clients/${clientId}/capabilities` },
    { name: 'Technology Readiness', score: score, target: 90, href: `/clients/${clientId}/applications` },
    { name: 'Connector Readiness', score: Math.min(100, score - 15), target: 80, href: `/clients/${clientId}/connectors` },
    { name: 'Security Readiness', score: Math.min(100, score - 2), target: 95, href: `/clients/${clientId}/risks` },
    { name: 'Governance Readiness', score: Math.min(100, score - 5), target: 85, href: `/clients/${clientId}/audit` },
    { name: 'Operations Readiness', score: Math.min(100, score + 5), target: 90, href: `/clients/${clientId}/monitoring` },
    { name: 'Documentation Readiness', score: Math.max(0, score - 20), target: 80, href: `/clients/${clientId}/documents` },
    { name: 'Automation Readiness', score: Math.max(0, score - 25), target: 75, href: `/clients/${clientId}/automation` },
    { name: 'Production Readiness', score: Math.min(100, score + 2), target: 95, href: `/clients/${clientId}/environments` },
    { name: 'AI Readiness', score: Math.max(0, score - 30), target: 70, href: `/clients/${clientId}/maturity` },
  ];

  const overall = Math.round(dimensions.reduce((a, d) => a + d.score, 0) / dimensions.length);

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Readiness Center</h2>
      <p className="text-xs text-gray-500 mb-6">Enterprise readiness across 10 dimensions — current vs target with gap analysis</p>

      {/* Overall */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border p-5 text-center">
          <p className={`text-3xl font-bold ${overall >= 80 ? 'text-green-600' : overall >= 60 ? 'text-orange-600' : 'text-red-600'}`}>{overall}%</p>
          <p className="text-xs text-gray-500 mt-1">Overall Readiness</p>
        </div>
        <div className="bg-white rounded-xl border p-5 text-center">
          <p className="text-3xl font-bold text-purple-600">{dimensions.filter(d => d.score >= d.target).length}/{dimensions.length}</p>
          <p className="text-xs text-gray-500 mt-1">Targets Met</p>
        </div>
        <div className="bg-white rounded-xl border p-5 text-center">
          <p className="text-3xl font-bold text-orange-600">{dimensions.filter(d => d.score < d.target).length}</p>
          <p className="text-xs text-gray-500 mt-1">Gaps Remaining</p>
        </div>
      </div>

      {/* Dimensions */}
      <section className="bg-white rounded-xl border p-5 mb-6">
        <h3 className="font-semibold mb-4">Readiness Dimensions</h3>
        <div className="space-y-3">
          {dimensions.map(dim => {
            const gap = dim.target - dim.score;
            const color = dim.score >= dim.target ? 'bg-green-500' : dim.score >= dim.target - 15 ? 'bg-orange-500' : 'bg-red-500';
            return (
              <Link key={dim.name} href={dim.href} className="flex items-center gap-3 hover:bg-gray-50 p-2 -m-2 rounded-lg transition">
                <span className="text-xs font-medium w-40 text-gray-700">{dim.name}</span>
                <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${color}`} style={{ width: `${dim.score}%` }} />
                </div>
                <span className="text-xs font-bold w-10 text-right">{dim.score}%</span>
                <span className={`text-[10px] font-medium w-16 text-right ${gap > 0 ? 'text-orange-600' : 'text-green-600'}`}>{gap > 0 ? `Gap: ${gap}%` : '✓ Met'}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <AIInsightsPanel insights={[
        ...dimensions.filter(d => d.target - d.score > 15).slice(0, 3).map(d => ({
          type: 'recommendation' as const,
          severity: 'medium' as const,
          title: `${d.name}: ${d.target - d.score}% below target`,
          description: `Current ${d.score}% vs target ${d.target}%. Action plan required.`,
          action: 'View Details',
          href: d.href,
        })),
      ]} title="Readiness Intelligence" />
    </div>
  );
}
