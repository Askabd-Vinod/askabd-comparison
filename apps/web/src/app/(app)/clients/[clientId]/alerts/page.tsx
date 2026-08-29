import { CapabilityPlaceholder } from '../capability-placeholder';
import Link from 'next/link';
import { mockClients } from '../../../../lib/mock-clients';
import { DemoDataBanner } from '../../../../components/demo-data-banner';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientAlertsPage({ params }: PageProps) {
  const { clientId } = await params;
  const client = mockClients.find(c => c.id === clientId);
  if (!client) return <CapabilityPlaceholder title="Alerts" description="Alerts management for this client." />;

  const critical = client.alerts.filter(a => a.severity === 'critical');
  const warning = client.alerts.filter(a => a.severity === 'warning');
  const info = client.alerts.filter(a => a.severity === 'information');
  const active = client.alerts.filter(a => a.status === 'active');
  const acknowledged = client.alerts.filter(a => a.status === 'acknowledged');
  const resolved = client.alerts.filter(a => a.status === 'resolved');

  return (
    <div>
      <DemoDataBanner />
      <div className="flex items-center gap-4 mb-4">
        <h2 className="font-semibold text-lg">Alerts ({client.alerts.length})</h2>
        {critical.length > 0 && <span className="text-xs text-red-600 font-medium">{critical.length} Critical</span>}
        {warning.length > 0 && <span className="text-xs text-orange-600 font-medium">{warning.length} Warning</span>}
        {active.length > 0 && <span className="text-xs text-blue-600 font-medium">{active.length} Active</span>}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Critical" value={critical.length} color="text-red-600" />
        <StatCard label="Warning" value={warning.length} color="text-orange-600" />
        <StatCard label="Information" value={info.length} color="text-blue-600" />
        <StatCard label="Active" value={active.length} color="text-red-600" />
        <StatCard label="Acknowledged" value={acknowledged.length} color="text-orange-600" />
        <StatCard label="Resolved" value={resolved.length} color="text-green-600" />
      </div>

      {client.alerts.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-500 text-sm">
          No active alerts. All systems operating normally.
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="text-left px-5 py-3">Alert</th>
                  <th className="text-left px-4 py-3">Severity</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Source</th>
                  <th className="text-left px-4 py-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {client.alerts.map(alert => (
                  <tr key={alert.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium"><Link href={`/clients/${clientId}/alerts/${alert.id}`} className="text-gray-900 hover:text-purple-700">{alert.title}</Link></td>
                    <td className="px-4 py-3"><SeverityBadge severity={alert.severity} /></td>
                    <td className="px-4 py-3"><AlertStatusBadge status={alert.status} /></td>
                    <td className="px-4 py-3 text-xs text-gray-500">{alert.source}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{new Date(alert.timestamp).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Alert Rules */}
      <section className="bg-white rounded-xl border p-5 mt-6">
        <h3 className="font-semibold mb-3">Alert Rules</h3>
        <div className="space-y-2 text-xs">
          <RuleRow rule="CPU > 80%" threshold="Warning" action="Notify ops@askabd.com" />
          <RuleRow rule="CPU > 95%" threshold="Critical" action="Page hello@askabd.com" />
          <RuleRow rule="Memory > 85%" threshold="Warning" action="Notify ops@askabd.com" />
          <RuleRow rule="Error Rate > 1%" threshold="Warning" action="Notify ops@askabd.com" />
          <RuleRow rule="Error Rate > 5%" threshold="Critical" action="Page hello@askabd.com" />
          <RuleRow rule="Latency > 500ms" threshold="Warning" action="Notify ops@askabd.com" />
          <RuleRow rule="Availability < 99.5%" threshold="Critical" action="Page hello@askabd.com" />
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return <div className="bg-white rounded-xl border p-3 text-center"><p className={`text-lg font-bold ${color}`}>{value}</p><p className="text-[10px] text-gray-500 uppercase">{label}</p></div>;
}
function SeverityBadge({ severity }: { severity: string }) {
  const c: Record<string, string> = { critical: 'bg-red-100 text-red-700', warning: 'bg-orange-100 text-orange-700', information: 'bg-blue-100 text-blue-700' };
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${c[severity] || 'bg-gray-100'}`}>{severity}</span>;
}
function AlertStatusBadge({ status }: { status: string }) {
  const c: Record<string, string> = { active: 'bg-red-100 text-red-700', acknowledged: 'bg-orange-100 text-orange-700', resolved: 'bg-green-100 text-green-700' };
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${c[status] || 'bg-gray-100'}`}>{status}</span>;
}
function RuleRow({ rule, threshold, action }: { rule: string; threshold: string; action: string }) {
  return <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50"><span className="font-mono">{rule}</span><span className={`font-medium ${threshold === 'Critical' ? 'text-red-600' : 'text-orange-600'}`}>{threshold}</span><span className="text-gray-500">{action}</span></div>;
}
