import { CapabilityPlaceholder } from '../../capability-placeholder';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { mockClients } from '../../../../../lib/mock-clients';
import { Breadcrumb } from '../../../../../components/breadcrumb';
import { Timeline, TimelineEvent } from '../../../../../components/timeline';
import { AIInsightsPanel } from '../../../../../components/ai-insights';
import { SolutionRecommendation, Solution } from '../../../../../components/solution-recommendation';

interface Props { params: Promise<{ clientId: string; alertId: string }> }

export default async function AlertDetailPage({ params }: Props) {
  const { clientId, alertId } = await params;
  const client = mockClients.find(c => c.id === clientId);
  if (!client) return <CapabilityPlaceholder title="Alert Detail" description="Alert tracking for this client." />;
  const alert = client.alerts.find(a => a.id === alertId);
  if (!alert) notFound();

  const timeline: TimelineEvent[] = [
    { timestamp: alert.timestamp, title: 'Alert triggered', type: 'alert', description: `Source: ${alert.source}` },
    { timestamp: new Date(new Date(alert.timestamp).getTime() + 60000).toISOString(), title: 'Notification sent', type: 'info', description: 'Notified ops@askabd.com' },
    ...(alert.status === 'acknowledged' ? [{ timestamp: new Date(new Date(alert.timestamp).getTime() + 180000).toISOString(), title: 'Alert acknowledged', type: 'info' as const }] : []),
    ...(alert.status === 'resolved' ? [{ timestamp: new Date(new Date(alert.timestamp).getTime() + 600000).toISOString(), title: 'Alert resolved', type: 'change' as const }] : []),
  ];

  const solution: Solution = {
    immediateFix: 'Monitor affected resources and scale if threshold persists for >5 minutes',
    permanentFix: 'Implement auto-scaling rules based on resource utilization patterns',
    priority: alert.severity === 'critical' ? 'critical' : 'high',
    effort: '1-2 hours',
    businessImpact: 'Potential service degradation if not addressed',
    technicalImpact: 'Resource contention may cause latency spikes',
    dependencies: ['Infrastructure team'],
    validationSteps: ['Verify metric returns below threshold', 'Confirm no cascading alerts'],
    rollbackPlan: 'Reduce load via rate limiting if scaling fails',
    owner: 'ops@askabd.com',
    status: alert.status === 'resolved' ? 'completed' : 'in-progress',
  };

  return (
    <div>
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/' },
        { label: 'Clients', href: '/clients' },
        { label: client.name, href: `/clients/${clientId}` },
        { label: 'Alerts', href: `/clients/${clientId}/alerts` },
        { label: alert.title },
      ]} />

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">{alert.title}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${alert.severity === 'critical' ? 'bg-red-100 text-red-700' : alert.severity === 'warning' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>{alert.severity}</span>
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${alert.status === 'active' ? 'bg-red-100 text-red-700' : alert.status === 'acknowledged' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>{alert.status}</span>
            <span className="text-xs text-gray-500">Source: {alert.source}</span>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white rounded-xl border p-5">
            <h2 className="font-semibold mb-3">Alert Details</h2>
            <div className="grid md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-2">
                <Row label="Severity" value={alert.severity} />
                <Row label="Status" value={alert.status} />
                <Row label="Source" value={alert.source} />
                <Row label="Triggered" value={fmtDate(alert.timestamp)} />
                <Row label="Escalation" value={alert.severity === 'critical' ? 'Level 2 — hello@askabd.com' : 'Level 1 — ops@askabd.com'} />
              </div>
              <div className="space-y-2">
                <Row label="Affected Client" value={client.name} />
                <Row label="Affected Systems" value={alert.source === 'monitoring' ? 'Application Layer' : 'Infrastructure'} />
                <Row label="Business Impact" value={alert.severity === 'critical' ? 'High — Service at risk' : 'Medium — Performance degraded'} />
                <Row label="Auto-resolved" value="No" />
                <Row label="Notification" value="Email + Slack" />
              </div>
            </div>
          </section>

          <Timeline events={timeline} title="Alert Timeline" />
          <SolutionRecommendation solution={solution} title="Recommended Response" />
        </div>

        <div className="space-y-6">
          <section className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-xs text-gray-500 uppercase mb-3">Related Entities</h3>
            <div className="space-y-1.5">
              <QuickLink href={`/clients/${clientId}/incidents`} label="Related Incidents" />
              <QuickLink href={`/clients/${clientId}/deployments`} label="Recent Deployments" />
              <QuickLink href={`/clients/${clientId}/monitoring`} label="Monitoring Dashboard" />
              <QuickLink href={`/clients/${clientId}/audit`} label="Audit Trail" />
              <QuickLink href={`/clients/${clientId}/infrastructure`} label="Infrastructure" />
            </div>
          </section>

          <AIInsightsPanel insights={[
            { type: 'issue', severity: alert.severity === 'critical' ? 'critical' : 'high', title: 'Alert pattern detected', description: `This alert correlates with resource pressure from ${alert.source}. Similar pattern seen before deployments.` },
            { type: 'recommendation', severity: 'medium', title: 'Preventive action', description: 'Configure auto-scaling to prevent threshold breaches during peak hours.', action: 'View Settings', href: `/clients/${clientId}/settings` },
          ]} />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) { return <div className="flex justify-between"><span className="text-gray-500">{label}</span><span className="font-medium text-gray-800">{value}</span></div>; }
function QuickLink({ href, label }: { href: string; label: string }) { return <Link href={href} className="block text-xs text-gray-600 hover:text-purple-600 py-1.5 px-2 rounded hover:bg-purple-50 transition">{label}</Link>; }
function fmtDate(iso: string): string { try { return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } }
