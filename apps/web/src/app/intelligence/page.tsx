import Link from 'next/link';
import { mockClients } from '../lib/mock-clients';
import { Breadcrumb } from '../components/breadcrumb';
import { statusColor } from '../components/status-badge';
import { AIInsightsPanel } from '../components/ai-insights';
import { KpiCard } from '../components/kpi-card';

export default function IntelligencePage() {
  const clients = mockClients;
  const totalRisks = clients.reduce((a, c) => a + c.activeIncidents + (c.health === 'critical' ? 3 : c.health === 'warning' ? 1 : 0), 0);
  const avgMaturity = Math.round(clients.reduce((a, c) => a + c.platformScore, 0) / clients.length);
  const techDebt = clients.filter(c => c.platformScore < 80).length;

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Intelligence' }]} />
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Enterprise Intelligence</h1>
      <p className="text-sm text-gray-500 mb-6">Risks, maturity, transformation readiness, and business capabilities</p>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-8">
        <KpiCard href="/intelligence#risks" label="Active Risks" value={totalRisks} color={totalRisks > 5 ? 'text-red-600' : 'text-orange-600'} description="Combined risk score across all clients. Includes open incidents and health-based risk factors." criteria="Formula: Active incidents + (3 per critical client) + (1 per warning client)." />
        <KpiCard href="/intelligence#maturity" label="Avg Maturity" value={`${avgMaturity}%`} description="Average platform maturity score across all clients. Reflects operational readiness and best-practice adoption." criteria="Formula: Average of all client platform scores. Target: ≥ 80%." />
        <KpiCard href="/intelligence#debt" label="Tech Debt Clients" value={techDebt} color={techDebt > 0 ? 'text-orange-600' : undefined} description="Clients with platform score below 80%, indicating accumulated technical debt requiring remediation." criteria="Count of clients where platformScore < 80." />
        <KpiCard href="/intelligence#compliance" label="Compliance Score" value="87%" color="text-green-600" description="Weighted compliance score across SOC 2, ISO 27001, GDPR, and internal standards." criteria="Weighted average of all compliance framework scores." />
        <KpiCard href="/intelligence#transformation" label="Transformation" value="Active" color="text-purple-600" description="Current status of the enterprise transformation program. Tracks assessment, architecture, implementation, and optimization phases." criteria="Status derived from phase progress: Active when any phase is in-progress." />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Risk Overview */}
          <section id="risks" className="bg-white rounded-xl border p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Risk Register</h2>
              <span className="text-xs text-gray-400">{totalRisks} active risks</span>
            </div>
            <div className="space-y-2">
              {clients.filter(c => c.health !== 'healthy').map(c => (
                <Link key={c.id} href={`/clients/${c.id}/risks`} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition">
                  <div className="flex items-center gap-3">
                    <span className={`w-2.5 h-2.5 rounded-full ${statusColor(c.health)}`} />
                    <div>
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="text-[11px] text-gray-400">{c.health === 'critical' ? 'Critical risk — immediate action required' : c.health === 'warning' ? 'Elevated risk — monitoring closely' : 'Offline — recovery needed'}</p>
                    </div>
                  </div>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${c.health === 'critical' ? 'bg-red-100 text-red-700' : c.health === 'warning' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>{c.health}</span>
                </Link>
              ))}
              {clients.filter(c => c.health !== 'healthy').length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No active risks. All clients healthy.</p>
              )}
            </div>
          </section>

          {/* Maturity Assessment */}
          <section id="maturity" className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold mb-4">Enterprise Maturity</h2>
            <div className="space-y-3">
              {clients.map(c => (
                <Link key={c.id} href={`/clients/${c.id}/maturity`} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 gradient-brand rounded-md flex items-center justify-center"><span className="text-white text-[9px] font-bold">{c.logo}</span></div>
                    <div><p className="text-sm font-medium">{c.name}</p><p className="text-[11px] text-gray-400">{c.industry}</p></div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${c.platformScore >= 80 ? 'bg-green-500' : c.platformScore >= 60 ? 'bg-orange-500' : 'bg-red-500'}`} style={{ width: `${c.platformScore}%` }} /></div>
                    <span className="text-xs font-bold w-8 text-right">{c.platformScore}%</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* Transformation Roadmap */}
          <section id="transformation" className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold mb-4">Transformation Progress</h2>
            <div className="grid md:grid-cols-2 gap-3">
              {[
                { phase: 'Assessment', status: 'completed', progress: 100 },
                { phase: 'Architecture', status: 'in-progress', progress: 72 },
                { phase: 'Implementation', status: 'in-progress', progress: 45 },
                { phase: 'Optimization', status: 'planned', progress: 10 },
              ].map(p => (
                <div key={p.phase} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{p.phase}</span>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${p.status === 'completed' ? 'bg-green-100 text-green-700' : p.status === 'in-progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>{p.status}</span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full bg-purple-500" style={{ width: `${p.progress}%` }} /></div>
                  <p className="text-[10px] text-gray-400 mt-1">{p.progress}% complete</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <section className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-xs text-gray-500 uppercase mb-3">Intelligence Modules</h3>
            <div className="space-y-1.5">
              <QuickLink href="/intelligence#risks" label="Risk Register" />
              <QuickLink href="/intelligence#maturity" label="Maturity Assessment" />
              <QuickLink href="/intelligence#debt" label="Technical Debt" />
              <QuickLink href="/intelligence#compliance" label="Compliance Center" />
              <QuickLink href="/intelligence#transformation" label="Transformation Roadmap" />
              <QuickLink href="/reports" label="Executive Reports" />
            </div>
          </section>

          <AIInsightsPanel insights={[
            { type: 'risk', severity: 'high', title: `${techDebt} client(s) below maturity target`, description: 'Clients with platform score below 80% require improvement plans.', action: 'View Details', href: '/clients?health=critical' },
            { type: 'recommendation', severity: 'medium', title: 'Transformation on track', description: `Average maturity ${avgMaturity}% across portfolio. Architecture phase at 72%.` },
            { type: 'prediction', severity: 'low', title: 'Projected Q4 improvement', description: 'Based on current trajectory, portfolio maturity expected to reach 90% by Q4.' },
          ]} title="Enterprise Intelligence" />
        </div>
      </div>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) { return <Link href={href} className="block text-xs text-gray-600 hover:text-purple-600 py-1.5 px-2 rounded hover:bg-purple-50 transition">{label}</Link>; }
