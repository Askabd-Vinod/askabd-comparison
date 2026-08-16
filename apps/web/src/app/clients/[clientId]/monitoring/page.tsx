import { notFound } from 'next/navigation';
import { mockClients } from '../../../lib/mock-clients';
import { statusColor } from '../../../components/status-badge';
import { HealthStatus } from '../../../lib/types';
import { Legend } from '../../../components/legend';
import { CapabilityPlaceholder } from '../capability-placeholder';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientMonitoringPage({ params }: PageProps) {
  const { clientId } = await params;
  const client = mockClients.find(c => c.id === clientId);
  if (!client) return <CapabilityPlaceholder title="Monitoring" description="Infrastructure, application, and service monitoring for this client." />;
  const m = client.monitoring;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-lg">Live Monitoring</h2>
        <div className="flex items-center gap-4">
          <Legend type="health" compact />
          <span className="text-[10px] text-gray-400">Auto-refresh: 30s</span>
        </div>
      </div>

      {/* Status Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatusTile label="Frontend" status={m.frontend} />
        <StatusTile label="Backend" status={m.backend} />
        <StatusTile label="Database" status={m.database} />
        <StatusTile label="API" status={m.api} />
      </div>

      {/* Resource Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
        <Metric label="CPU" value={`${m.cpu}%`} warn={m.cpu > 80} bar={m.cpu} />
        <Metric label="Memory" value={`${m.memory}%`} warn={m.memory > 80} bar={m.memory} />
        <Metric label="Disk" value={`${m.disk}%`} warn={m.disk > 80} bar={m.disk} />
        <Metric label="Latency" value={`${m.latency}ms`} warn={m.latency > 200} />
        <Metric label="Availability" value={`${m.availability}%`} warn={m.availability < 99.5} />
        <Metric label="Error Rate" value={`${m.errorRate}%`} warn={m.errorRate > 1} />
      </div>

      {/* Network & API */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
        <Metric label="API Success" value={`${m.apiSuccess}%`} />
        <Metric label="API Failure" value={`${m.apiFailure}%`} warn={m.apiFailure > 1} />
        <Metric label="Queue" value={String(m.queue)} warn={m.queue > 50} />
        <Metric label="Workers" value={String(m.workers)} />
        <Metric label="Connections" value={String(m.connections)} />
        <Metric label="Bandwidth" value={`${m.bandwidth} MB/s`} />
      </div>

      {/* Additional */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-6">
        <Metric label="Traffic" value={`${(m.traffic / 1000).toFixed(1)}k req/s`} />
        <Metric label="Thread Count" value={String(m.threadCount)} />
        <StatusTile label="Scheduler" status={m.scheduler} />
        <Metric label="Workers Active" value={String(m.workers)} />
      </div>

      {/* Trend Chart Placeholder (visual) */}
      <div className="bg-white rounded-xl border p-5">
        <h3 className="font-semibold mb-4">Resource Trend (Last 24h)</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <TrendBar label="CPU" values={[28, 35, m.cpu, 42, 38, m.cpu - 5, m.cpu + 2, m.cpu]} />
          <TrendBar label="Memory" values={[55, 60, m.memory, 65, m.memory - 3, m.memory, m.memory + 1, m.memory]} />
          <TrendBar label="Latency" values={[30, 35, m.latency * 0.8, m.latency, m.latency * 0.9, m.latency, m.latency * 1.1, m.latency].map(Math.round)} />
        </div>
      </div>
    </div>
  );
}

function StatusTile({ label, status }: { label: string; status: HealthStatus }) {
  return (
    <div className="bg-white rounded-xl border p-4 text-center">
      <span className={`inline-block w-3 h-3 rounded-full ${statusColor(status)} mb-1`} />
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-xs font-medium capitalize mt-0.5">{status}</p>
    </div>
  );
}

function Metric({ label, value, warn, bar }: { label: string; value: string; warn?: boolean; bar?: number }) {
  return (
    <div className={`bg-white rounded-xl border p-4 ${warn ? 'border-orange-200 bg-orange-50' : ''}`}>
      <p className={`text-sm font-bold ${warn ? 'text-orange-600' : 'text-gray-900'}`}>{value}</p>
      <p className="text-[10px] text-gray-500 mb-1">{label}</p>
      {typeof bar === 'number' && (
        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${bar > 80 ? 'bg-red-500' : bar > 60 ? 'bg-orange-500' : 'bg-green-500'}`} style={{ width: `${Math.min(bar, 100)}%` }} />
        </div>
      )}
    </div>
  );
}

function TrendBar({ label, values }: { label: string; values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs font-medium mb-2">{label}</p>
      <div className="flex items-end gap-1 h-12">
        {values.map((v, i) => (
          <div key={i} className="flex-1 bg-purple-400 rounded-t" style={{ height: `${(v / max) * 100}%`, opacity: 0.5 + (i / values.length) * 0.5 }} />
        ))}
      </div>
    </div>
  );
}
