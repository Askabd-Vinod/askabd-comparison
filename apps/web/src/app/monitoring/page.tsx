import Link from 'next/link';
import { mockClients } from '../lib/mock-clients';
import { Breadcrumb } from '../components/breadcrumb';
import { apiSafe } from '../lib/api';
import { KpiCard } from '../components/kpi-card';

export default async function MonitoringPage() {
  const metrics = await apiSafe<{ uptime: number; requests: { total: number; success: number; clientErrors: number; serverErrors: number }; latency: { p50: number; p95: number; p99: number }; resources: { heapUsedMB: number; heapTotalMB: number; rssMB: number } }>('/metrics', { uptime: 0, requests: { total: 0, success: 0, clientErrors: 0, serverErrors: 0 }, latency: { p50: 0, p95: 0, p99: 0 }, resources: { heapUsedMB: 0, heapTotalMB: 0, rssMB: 0 } });

  const avgCpu = Math.round(mockClients.reduce((a, c) => a + c.monitoring.cpu, 0) / mockClients.length);
  const avgMem = Math.round(mockClients.reduce((a, c) => a + c.monitoring.memory, 0) / mockClients.length);
  const avgDisk = Math.round(mockClients.reduce((a, c) => a + c.monitoring.disk, 0) / mockClients.length);
  const avgLatency = Math.round(mockClients.reduce((a, c) => a + c.monitoring.latency, 0) / mockClients.length);
  const avgAvail = +(mockClients.reduce((a, c) => a + c.monitoring.availability, 0) / mockClients.length).toFixed(2);
  const avgError = +(mockClients.reduce((a, c) => a + c.monitoring.errorRate, 0) / mockClients.length).toFixed(2);
  const totalWorkers = mockClients.reduce((a, c) => a + c.monitoring.workers, 0);
  const totalConns = mockClients.reduce((a, c) => a + c.monitoring.connections, 0);
  const totalTraffic = mockClients.reduce((a, c) => a + c.monitoring.traffic, 0);
  const totalThreads = mockClients.reduce((a, c) => a + c.monitoring.threadCount, 0);

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 animate-in">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Monitoring' }]} />
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Live Monitoring</h1>

      {/* Aggregate Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-8">
        <KpiCard label="CPU" value={`${avgCpu}%`} warn={avgCpu > 70} description="Average CPU utilization across all client environments." criteria="Average of all client CPU usage. Warning threshold: > 70%." />
        <KpiCard label="Memory" value={`${avgMem}%`} warn={avgMem > 70} description="Average memory utilization across all client environments." criteria="Average of all client memory usage. Warning threshold: > 70%." />
        <KpiCard label="Disk" value={`${avgDisk}%`} warn={avgDisk > 70} description="Average disk utilization across all client environments." criteria="Average of all client disk usage. Warning threshold: > 70%." />
        <KpiCard label="Latency" value={`${avgLatency}ms`} warn={avgLatency > 150} description="Average API response latency across all clients." criteria="Average of all client latency measurements. Warning threshold: > 150ms." />
        <KpiCard label="Availability" value={`${avgAvail}%`} warn={avgAvail < 99.5} description="Average platform availability across all clients." criteria="Average uptime percentage. Warning threshold: < 99.5%. SLA target: 99.9%." />
        <KpiCard label="Error Rate" value={`${avgError}%`} warn={avgError > 1} description="Average error rate across all client API endpoints." criteria="Average of all client error rates. Warning threshold: > 1%." />
        <KpiCard label="API Success" value={`${metrics.requests.success}`} description="Total successful API requests handled by the platform." criteria="Count of HTTP 2xx responses from the platform API." />
        <KpiCard label="API Failure" value={`${metrics.requests.serverErrors}`} warn={metrics.requests.serverErrors > 0} description="Total server-side errors (5xx) from the platform API." criteria="Count of HTTP 5xx responses. Any value > 0 triggers warning." />
        <KpiCard label="Queue" value={`${mockClients.reduce((a, c) => a + c.monitoring.queue, 0)}`} description="Total messages waiting in processing queues across all clients." criteria="Sum of all client queue depths." />
        <KpiCard label="Workers" value={`${totalWorkers}`} description="Total active background workers processing jobs across all clients." criteria="Sum of all active workers across all client environments." />
        <KpiCard label="Connections" value={`${totalConns}`} description="Total active database and service connections across all clients." criteria="Sum of all open connections (DB + Redis + external services)." />
        <KpiCard label="Traffic" value={`${(totalTraffic / 1000).toFixed(1)}k`} description="Total request traffic volume across all clients (requests per minute)." criteria="Sum of all client traffic, displayed in thousands." />
        <KpiCard label="Bandwidth" value={`${mockClients.reduce((a, c) => a + c.monitoring.bandwidth, 0)} MB/s`} description="Total network bandwidth consumption across all clients." criteria="Sum of all client bandwidth usage in MB/s." />
        <KpiCard label="Thread Count" value={`${totalThreads}`} description="Total active threads across all application servers." criteria="Sum of all client thread counts." />
        <KpiCard label="Uptime" value={`${Math.round(metrics.uptime / 3600)}h`} description="Platform API server uptime since last restart." criteria="Uptime in hours from /metrics endpoint." />
        <KpiCard label="p99 Latency" value={`${Math.round(metrics.latency.p99)}ms`} warn={metrics.latency.p99 > 500} description="99th percentile latency — the slowest 1% of requests take at least this long." criteria="p99 from platform metrics. Warning threshold: > 500ms." />
      </div>

      {/* Per-Client Monitoring */}
      <section className="bg-white rounded-xl border overflow-hidden">
        <div className="px-6 py-4 border-b"><h2 className="font-semibold">Per-Client Metrics</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left px-6 py-3">Client</th>
                <th className="text-center px-3 py-3">CPU</th>
                <th className="text-center px-3 py-3">Memory</th>
                <th className="text-center px-3 py-3">Disk</th>
                <th className="text-center px-3 py-3">Latency</th>
                <th className="text-center px-3 py-3">Errors</th>
                <th className="text-center px-3 py-3">Queue</th>
                <th className="text-center px-3 py-3">Workers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {mockClients.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3"><Link href={`/clients/${c.id}?tab=monitoring`} className="font-medium hover:text-purple-700">{c.name}</Link></td>
                  <td className={`px-3 py-3 text-center ${c.monitoring.cpu > 80 ? 'text-red-600 font-medium' : ''}`}>{c.monitoring.cpu}%</td>
                  <td className={`px-3 py-3 text-center ${c.monitoring.memory > 80 ? 'text-red-600 font-medium' : ''}`}>{c.monitoring.memory}%</td>
                  <td className={`px-3 py-3 text-center ${c.monitoring.disk > 80 ? 'text-orange-600 font-medium' : ''}`}>{c.monitoring.disk}%</td>
                  <td className={`px-3 py-3 text-center ${c.monitoring.latency > 200 ? 'text-red-600 font-medium' : ''}`}>{c.monitoring.latency}ms</td>
                  <td className={`px-3 py-3 text-center ${c.monitoring.errorRate > 1 ? 'text-red-600 font-medium' : ''}`}>{c.monitoring.errorRate}%</td>
                  <td className={`px-3 py-3 text-center ${c.monitoring.queue > 50 ? 'text-orange-600 font-medium' : ''}`}>{c.monitoring.queue}</td>
                  <td className="px-3 py-3 text-center">{c.monitoring.workers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

