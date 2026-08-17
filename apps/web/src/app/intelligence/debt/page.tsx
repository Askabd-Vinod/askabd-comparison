import Link from 'next/link';
import { mockClients } from '../../lib/mock-clients';
import { Breadcrumb } from '../../components/breadcrumb';
import { AIInsightsPanel } from '../../components/ai-insights';

export default function TechnicalDebtPage() {
  const clients = mockClients;
  const debtItems = [
    { category: 'Legacy Systems', count: clients.filter(c => c.platformScore < 70).length * 2, severity: 'high', impact: 'Maintenance cost, security risk, scalability limitations' },
    { category: 'Outdated Frameworks', count: clients.length, severity: 'medium', impact: 'Missing security patches, reduced developer productivity' },
    { category: 'Manual Processes', count: Math.ceil(clients.length * 0.6), severity: 'medium', impact: 'Error-prone operations, slow delivery, scalability constraints' },
    { category: 'Architecture Violations', count: clients.filter(c => c.platformScore < 80).length, severity: 'high', impact: 'Increased coupling, deployment risk, testing complexity' },
    { category: 'Security Debt', count: clients.filter(c => c.health === 'critical' || c.health === 'warning').length, severity: 'critical', impact: 'Compliance risk, data breach potential, audit failures' },
    { category: 'Testing Debt', count: Math.ceil(clients.length * 0.4), severity: 'medium', impact: 'Regression risk, slow releases, low confidence' },
    { category: 'Documentation Debt', count: Math.ceil(clients.length * 0.7), severity: 'low', impact: 'Knowledge loss, slow onboarding, key-person risk' },
    { category: 'Infrastructure Debt', count: clients.filter(c => c.platformScore < 85).length, severity: 'medium', impact: 'Scalability limits, single points of failure, cost inefficiency' },
  ];

  const totalItems = debtItems.reduce((a, d) => a + d.count, 0);
  const severityColor: Record<string, string> = { critical: 'bg-red-100 text-red-700', high: 'bg-orange-100 text-orange-700', medium: 'bg-yellow-100 text-yellow-700', low: 'bg-blue-100 text-blue-700' };

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Intelligence', href: '/intelligence' }, { label: 'Technical Debt' }]} />
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Technical Debt Register</h1>
      <p className="text-sm text-gray-500 mb-6">{totalItems} debt items tracked across {clients.length} clients</p>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border p-3 text-center"><p className="text-xl font-bold text-red-600">{debtItems.filter(d => d.severity === 'critical').reduce((a, d) => a + d.count, 0)}</p><p className="text-[10px] text-gray-500">Critical</p></div>
        <div className="bg-white rounded-xl border p-3 text-center"><p className="text-xl font-bold text-orange-600">{debtItems.filter(d => d.severity === 'high').reduce((a, d) => a + d.count, 0)}</p><p className="text-[10px] text-gray-500">High</p></div>
        <div className="bg-white rounded-xl border p-3 text-center"><p className="text-xl font-bold text-yellow-600">{debtItems.filter(d => d.severity === 'medium').reduce((a, d) => a + d.count, 0)}</p><p className="text-[10px] text-gray-500">Medium</p></div>
        <div className="bg-white rounded-xl border p-3 text-center"><p className="text-xl font-bold text-blue-600">{debtItems.filter(d => d.severity === 'low').reduce((a, d) => a + d.count, 0)}</p><p className="text-[10px] text-gray-500">Low</p></div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr><th className="text-left px-5 py-3">Category</th><th className="text-center px-4 py-3">Items</th><th className="text-left px-4 py-3">Severity</th><th className="text-left px-4 py-3">Business Impact</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {debtItems.map((item, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium">{item.category}</td>
                    <td className="px-4 py-3 text-center font-bold">{item.count}</td>
                    <td className="px-4 py-3"><span className={`text-[11px] font-medium px-2 py-0.5 rounded ${severityColor[item.severity]}`}>{item.severity}</span></td>
                    <td className="px-4 py-3 text-xs text-gray-500">{item.impact}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>

        <AIInsightsPanel insights={[
          { type: 'risk', severity: 'high', title: 'Security debt requires immediate attention', description: `${debtItems[4].count} client(s) have unresolved security debt. Compliance risk increasing.`, action: 'View Risks', href: '/intelligence#risks' },
          { type: 'recommendation', severity: 'medium', title: 'Quick win: Automate manual processes', description: `${debtItems[2].count} clients have manual processes that can be automated with CI/CD pipelines.`, action: 'View Catalog', href: '/intelligence/catalog/devops-assessment' },
          { type: 'prediction', severity: 'low', title: 'Debt reduction forecast', description: 'Current roadmap execution projects 40% debt reduction within 6 months.' },
        ]} title="Debt Intelligence" />
      </div>
    </div>
  );
}
