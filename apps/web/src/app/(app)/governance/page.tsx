import Link from 'next/link';
import { mockClients } from '../../lib/mock-clients';
import { Breadcrumb } from '../../components/breadcrumb';
import { AIInsightsPanel } from '../../components/ai-insights';
import { KpiCard } from '../../components/kpi-card';
import { DemoDataBanner } from '../../components/demo-data-banner';

export default function GovernancePage() {
  const clients = mockClients;
  const totalAudit = clients.reduce((a, c) => a + c.auditLog.length, 0);
  const totalDeployments = clients.reduce((a, c) => a + c.deployments.length, 0);
  const totalIncidents = clients.reduce((a, c) => a + c.incidents.length, 0);
  const totalAlerts = clients.reduce((a, c) => a + c.alerts.length, 0);

  const recentAudit = clients
    .flatMap(c => c.auditLog.map(a => ({ ...a, clientId: c.id, clientName: c.name })))
    .sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())
    .slice(0, 10);

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Governance' }]} />
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Governance & Audit Center</h1>
      <p className="text-sm text-gray-500 mb-6">Enterprise governance, compliance, security audit, and operational oversight</p>
      <DemoDataBanner />

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-8">
        <KpiCard label="Audit Events" value={totalAudit} href="#audit" description="Total audit trail entries across all clients. Every write operation, deployment, and config change is logged." criteria="Count of all audit log entries across all client records." />
        <KpiCard label="Deployments" value={totalDeployments} href="/deployments" description="Total deployments executed across all clients and environments (dev, staging, production)." criteria="Sum of all deployment records across all clients." />
        <KpiCard label="Incidents" value={totalIncidents} href="/incidents" description="Total incident records (all statuses) for governance tracking and root cause analysis." criteria="Sum of all incident records across all clients (open + resolved + closed)." />
        <KpiCard label="Active Alerts" value={totalAlerts} href="#alerts" description="Total active alerts across all clients. Includes infrastructure, performance, and security alerts." criteria="Count of all alert records across all clients." />
        <KpiCard label="Compliance" value="87%" href="#compliance" color="text-green-600" description="Aggregated compliance score across SOC 2, ISO 27001, GDPR, and internal standards." criteria="Weighted average: SOC 2 (94%), ISO 27001 (91%), GDPR (88%), Internal (82%)." />
        <KpiCard label="Security Score" value="92%" href="#security" color="text-green-600" description="Overall security posture score. All security controls (RBAC, encryption, audit, rate limiting) are active." criteria="All 6 security controls active = base 90%. Bonus for zero security incidents." />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Audit Timeline */}
          <section id="audit" className="bg-white rounded-xl border p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Global Audit Timeline</h2>
              <span className="text-xs text-gray-400">{totalAudit} total events</span>
            </div>
            <div className="space-y-2">
              {recentAudit.map(entry => (
                <Link key={entry.id} href={`/clients/${entry.clientId}/audit/${entry.id}`} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition text-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                    <div>
                      <p className="font-medium text-gray-800">{entry.what}</p>
                      <p className="text-[10px] text-gray-400">{entry.who} • {entry.clientName} • {entry.environment}</p>
                    </div>
                  </div>
                  <span className="text-gray-400 shrink-0">{new Date(entry.when).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                </Link>
              ))}
            </div>
          </section>

          {/* Compliance */}
          <section id="compliance" className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold mb-4">Compliance Status</h2>
            <div className="grid md:grid-cols-2 gap-3">
              {[
                { standard: 'SOC 2 Type II', status: 'compliant', score: 94, lastAudit: '2026-06-15' },
                { standard: 'ISO 27001', status: 'compliant', score: 91, lastAudit: '2026-05-20' },
                { standard: 'GDPR', status: 'compliant', score: 88, lastAudit: '2026-07-01' },
                { standard: 'Internal Standards', status: 'partial', score: 82, lastAudit: '2026-08-01' },
              ].map(c => (
                <div key={c.standard} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{c.standard}</span>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${c.status === 'compliant' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{c.status}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Score: <span className="font-bold text-gray-800">{c.score}%</span></span>
                    <span>Last audit: {c.lastAudit}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Security Audit */}
          <section id="security" className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold mb-4">Security Governance</h2>
            <div className="grid md:grid-cols-3 gap-3 text-xs">
              <div className="border rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-green-600">Active</p>
                <p className="text-gray-500">RBAC</p>
              </div>
              <div className="border rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-green-600">Active</p>
                <p className="text-gray-500">Audit Engine</p>
              </div>
              <div className="border rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-green-600">Active</p>
                <p className="text-gray-500">Rate Limiting</p>
              </div>
              <div className="border rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-green-600">Active</p>
                <p className="text-gray-500">Encryption</p>
              </div>
              <div className="border rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-green-600">Active</p>
                <p className="text-gray-500">Input Validation</p>
              </div>
              <div className="border rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-green-600">Active</p>
                <p className="text-gray-500">Tenant Isolation</p>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <section className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-xs text-gray-500 uppercase mb-3">Governance Modules</h3>
            <div className="space-y-1.5">
              <QuickLink href="#audit" label="Audit Timeline" />
              <QuickLink href="#security" label="Security Audit" />
              <QuickLink href="#compliance" label="Compliance Center" />
              <QuickLink href="/intelligence" label="Enterprise Intelligence" />
              <QuickLink href="/intelligence/debt" label="Technical Debt" />
              <QuickLink href="/reports" label="Governance Reports" />
              <QuickLink href="/platform" label="Platform Health" />
            </div>
          </section>

          <AIInsightsPanel insights={[
            { type: 'recommendation', severity: 'low', title: 'Governance posture strong', description: `All security controls active. ${totalAudit} audit events tracked. SOC 2 compliant.` },
            { type: 'prediction', severity: 'medium', title: 'Internal standards gap', description: 'Internal standards at 82%. Schedule review to bring to 90%+ target.', action: 'View Intelligence', href: '/intelligence' },
            { type: 'risk', severity: 'low', title: 'Audit coverage complete', description: 'All write operations, deployments, and configuration changes are audited across all clients.' },
          ]} title="Governance Intelligence" />

          <section className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-xs text-gray-500 uppercase mb-3">Per-Client Audit</h3>
            <div className="space-y-1.5">
              {clients.slice(0, 5).map(c => (
                <Link key={c.id} href={`/clients/${c.id}/audit`} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-purple-50 transition text-xs">
                  <span className="text-gray-700">{c.name}</span>
                  <span className="text-gray-400">{c.auditLog.length} events</span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) { return <Link href={href} className="block text-xs text-gray-600 hover:text-purple-600 py-1.5 px-2 rounded hover:bg-purple-50 transition">{label}</Link>; }
