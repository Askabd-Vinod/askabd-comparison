import { CapabilityPlaceholder } from '../capability-placeholder';
import Link from 'next/link';
import { mockClients } from '../../../lib/mock-clients';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientTestingPage({ params }: PageProps) {
  const { clientId } = await params;
  const client = mockClients.find(c => c.id === clientId);
  if (!client) return <CapabilityPlaceholder title="Testing" description="Testing management for this client." />;

  const testSuites = [
    { id: 'ts-1', name: 'Smoke Tests', cases: 12, passed: 12, failed: 0, blocked: 0, lastRun: '2026-08-03T08:00:00Z', tester: 'ops@askabd.com' },
    { id: 'ts-2', name: 'Deployment Validation', cases: 8, passed: 7, failed: 1, blocked: 0, lastRun: '2026-08-02T14:00:00Z', tester: 'hello@askabd.com' },
    { id: 'ts-3', name: 'Integration Tests', cases: 15, passed: 13, failed: 1, blocked: 1, lastRun: '2026-08-01T10:00:00Z', tester: 'ops@askabd.com' },
    { id: 'ts-4', name: 'Security Validation', cases: 10, passed: 9, failed: 0, blocked: 1, lastRun: '2026-07-28T16:00:00Z', tester: 'hello@askabd.com' },
    { id: 'ts-5', name: 'Performance Tests', cases: 6, passed: 5, failed: 1, blocked: 0, lastRun: '2026-07-25T09:00:00Z', tester: 'ops@askabd.com' },
  ];

  const totalCases = testSuites.reduce((a, s) => a + s.cases, 0);
  const totalPassed = testSuites.reduce((a, s) => a + s.passed, 0);
  const totalFailed = testSuites.reduce((a, s) => a + s.failed, 0);
  const passRate = Math.round((totalPassed / totalCases) * 100);

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Manual Test Center</h2>
      <p className="text-xs text-gray-500 mb-6">Test suites, validation, regression, and evidence capture</p>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Stat label="Test Suites" value={testSuites.length} />
        <Stat label="Total Cases" value={totalCases} />
        <Stat label="Passed" value={totalPassed} color="text-green-600" />
        <Stat label="Failed" value={totalFailed} color={totalFailed > 0 ? 'text-red-600' : undefined} />
        <Stat label="Pass Rate" value={`${passRate}%`} color={passRate >= 90 ? 'text-green-600' : 'text-orange-600'} />
      </div>

      {/* Test Suites */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="text-left px-5 py-3">Suite</th>
              <th className="text-center px-3 py-3">Cases</th>
              <th className="text-center px-3 py-3">Passed</th>
              <th className="text-center px-3 py-3">Failed</th>
              <th className="text-center px-3 py-3">Blocked</th>
              <th className="text-left px-4 py-3">Rate</th>
              <th className="text-left px-4 py-3">Tester</th>
              <th className="text-left px-4 py-3">Last Run</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {testSuites.map(suite => {
              const rate = Math.round((suite.passed / suite.cases) * 100);
              return (
                <tr key={suite.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-xs">{suite.name}</td>
                  <td className="px-3 py-3 text-center text-xs">{suite.cases}</td>
                  <td className="px-3 py-3 text-center text-xs text-green-600 font-medium">{suite.passed}</td>
                  <td className="px-3 py-3 text-center text-xs"><span className={suite.failed > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}>{suite.failed}</span></td>
                  <td className="px-3 py-3 text-center text-xs"><span className={suite.blocked > 0 ? 'text-orange-600 font-medium' : 'text-gray-400'}>{suite.blocked}</span></td>
                  <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${rate >= 90 ? 'bg-green-500' : 'bg-orange-500'}`} style={{ width: `${rate}%` }} /></div><span className="text-[10px] font-medium">{rate}%</span></div></td>
                  <td className="px-4 py-3 text-xs text-gray-500">{suite.tester}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{new Date(suite.lastRun).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Linked */}
      <div className="mt-6 flex gap-3">
        <Link href={`/clients/${clientId}/deployments`} className="text-xs text-purple-600 font-medium hover:text-purple-800">View Deployments →</Link>
        <Link href={`/clients/${clientId}/incidents`} className="text-xs text-purple-600 font-medium hover:text-purple-800">View Defects →</Link>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return <div className="bg-white rounded-xl border p-3 text-center"><p className={`text-lg font-bold ${color || 'text-gray-900'}`}>{value}</p><p className="text-[10px] text-gray-500 uppercase">{label}</p></div>;
}
