import { CapabilityPlaceholder } from '../capability-placeholder';
import Link from 'next/link';
import { mockClients } from '../../../../lib/mock-clients';
import { statusColor } from '../../../../components/status-badge';
import { HealthStatus } from '../../../../lib/types';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientEnvironmentsPage({ params }: PageProps) {
  const { clientId } = await params;
  const client = mockClients.find(c => c.id === clientId);
  if (!client) return <CapabilityPlaceholder title="Environments" description="Environments management for this client." />;

  return (
    <div>
      <h2 className="font-semibold text-lg mb-4">Environments</h2>
      <div className="grid md:grid-cols-3 gap-4">
        {(['development', 'staging', 'production'] as const).map(envKey => {
          const env = client.environments[envKey];
          return (
            <Link key={envKey} href={`/clients/${clientId}/environments/${envKey}`} className="bg-white rounded-xl border p-5 hover:border-purple-200 hover:shadow-sm transition block">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold capitalize">{envKey}</h3>
                <span className={`w-3 h-3 rounded-full ${statusColor(env.status)}`} />
              </div>
              <div className="space-y-2 text-xs">
                <EnvRow label="Status" value={env.status} isStatus status={env.status} />
                <EnvRow label="Version" value={env.version} />
                <EnvRow label="Build" value={env.build} />
                <EnvRow label="Release" value={env.release} />
                <EnvRow label="Deployment" value={fmtDate(env.deployment)} />
                <div className="border-t pt-2 mt-2" />
                <EnvRow label="API" value={env.api} isStatus status={env.api} />
                <EnvRow label="Frontend" value={env.frontend} isStatus status={env.frontend} />
                <EnvRow label="Backend" value={env.backend} isStatus status={env.backend} />
                <EnvRow label="Database" value={env.database} isStatus status={env.database} />
                <EnvRow label="Redis" value={env.redis} isStatus status={env.redis} />
                <EnvRow label="Storage" value={env.storage} isStatus status={env.storage} />
                <EnvRow label="Scheduler" value={env.scheduler} isStatus status={env.scheduler} />
                <EnvRow label="Workers" value={String(env.workers)} />
                <div className="border-t pt-2 mt-2" />
                <EnvRow label="Health" value={env.health} isStatus status={env.health} />
                <EnvRow label="Latency" value={`${env.latency}ms`} />
                <EnvRow label="Availability" value={`${env.availability}%`} />
                <EnvRow label="Last Sync" value={fmtDate(env.lastSync)} />
                <EnvRow label="Last Deploy" value={fmtDate(env.lastDeployment)} />
                <EnvRow label="Last Backup" value={fmtDate(env.lastBackup)} />
              </div>
              <div className="mt-4 flex gap-2">
                <Link href={`/clients/${clientId}/deployments`} className="text-[10px] bg-purple-50 text-purple-600 px-2 py-1 rounded font-medium hover:bg-purple-100">Deploys</Link>
                <Link href={`/clients/${clientId}/monitoring`} className="text-[10px] bg-purple-50 text-purple-600 px-2 py-1 rounded font-medium hover:bg-purple-100">Monitor</Link>
                <Link href={`/clients/${clientId}/alerts`} className="text-[10px] bg-purple-50 text-purple-600 px-2 py-1 rounded font-medium hover:bg-purple-100">Alerts</Link>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function EnvRow({ label, value, isStatus, status }: { label: string; value: string; isStatus?: boolean; status?: HealthStatus }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-400">{label}</span>
      {isStatus && status ? (
        <span className="flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${statusColor(status)}`} /><span className="font-medium text-gray-700 capitalize">{value}</span></span>
      ) : (
        <span className="font-medium text-gray-700">{value}</span>
      )}
    </div>
  );
}
function fmtDate(iso: string): string { try { return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } }
