import { CapabilityPlaceholder } from '../capability-placeholder';
import Link from 'next/link';
import { mockClients } from '../../../../lib/mock-clients';
import { Timeline as TimelineComponent, TimelineEvent } from '../../../../components/timeline';
import { DemoDataBanner } from '../../../../components/demo-data-banner';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientTimelinePage({ params }: PageProps) {
  const { clientId } = await params;
  const client = mockClients.find(c => c.id === clientId);
  if (!client) return <CapabilityPlaceholder title="Timeline" description="Timeline management for this client." />;

  const events: TimelineEvent[] = [
    ...client.deployments.map(d => ({ timestamp: d.timestamp, title: `Deployed v${d.version} to ${d.environment}`, type: 'deployment' as const, description: `By ${d.engineer} • ${d.buildNumber}`, href: `/clients/${clientId}/deployments/${d.id}` })),
    ...client.incidents.map(i => ({ timestamp: i.createdAt, title: i.title, type: 'incident' as const, description: `${i.severity} • ${i.status}`, href: `/clients/${clientId}/incidents/${i.id}` })),
    ...client.alerts.map(a => ({ timestamp: a.timestamp, title: a.title, type: 'alert' as const, description: `${a.severity} • ${a.source}`, href: `/clients/${clientId}/alerts/${a.id}` })),
    ...client.auditLog.map(a => ({ timestamp: a.when, title: a.what, type: 'audit' as const, description: `By ${a.who} • ${a.environment}`, href: `/clients/${clientId}/audit/${a.id}` })),
    { timestamp: client.lastBackup, title: 'Backup completed', type: 'info' as const, description: 'Automated backup' },
    { timestamp: client.lastHeartbeat, title: 'Heartbeat received', type: 'info' as const, description: 'All systems responding' },
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div>
      <DemoDataBanner />
      <h2 className="font-semibold text-lg mb-1">Client Timeline</h2>
      <p className="text-xs text-gray-500 mb-6">Complete chronological history — deployments, incidents, alerts, audit, and operational events</p>

      {/* Event Type Legend */}
      <div className="flex flex-wrap gap-3 mb-6">
        <span className="flex items-center gap-1.5 text-[10px]"><span className="w-2 h-2 rounded-full bg-purple-500" />Deployment</span>
        <span className="flex items-center gap-1.5 text-[10px]"><span className="w-2 h-2 rounded-full bg-red-500" />Incident</span>
        <span className="flex items-center gap-1.5 text-[10px]"><span className="w-2 h-2 rounded-full bg-orange-500" />Alert</span>
        <span className="flex items-center gap-1.5 text-[10px]"><span className="w-2 h-2 rounded-full bg-blue-500" />Audit</span>
        <span className="flex items-center gap-1.5 text-[10px]"><span className="w-2 h-2 rounded-full bg-gray-400" />System</span>
      </div>

      <TimelineComponent events={events} title={`${events.length} events`} />
    </div>
  );
}
