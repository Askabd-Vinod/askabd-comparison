import { CapabilityPlaceholder } from '../capability-placeholder';
import Link from 'next/link';
import { mockClients } from '../../../lib/mock-clients';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientPerformancePage({ params }: PageProps) {
  const { clientId } = await params;
  const client = mockClients.find(c => c.id === clientId);
  if (!client) return <CapabilityPlaceholder title="Performance" description="Performance management for this client." />;
  const m = client.monitoring;

  return (
    <div>
      <h2 className="font-semibold text-lg mb-4">Performance</h2>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <MetricCard label="Avg Latency" value={`${m.latency}ms`} warn={m.latency > 200} />
        <MetricCard label="Availability" value={`${m.availability}%`} warn={m.availability < 99.5} />
        <MetricCard label="Error Rate" value={`${m.errorRate}%`} warn={m.errorRate > 1} />
        <MetricCard label="API Success" value={`${m.apiSuccess}%`} />
      </div>

      {/* CPU Chart */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <TrendChart label="CPU Utilization" current={m.cpu} unit="%" data={generateTrend(m.cpu, 8)} warn={m.cpu > 80} />
        <TrendChart label="Memory Utilization" current={m.memory} unit="%" data={generateTrend(m.memory, 8)} warn={m.memory > 80} />
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <TrendChart label="Response Latency" current={m.latency} unit="ms" data={generateTrend(m.latency, 8)} warn={m.latency > 200} />
        <TrendChart label="Database Latency" current={Math.round(m.latency * 0.6)} unit="ms" data={generateTrend(Math.round(m.latency * 0.6), 8)} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <TrendChart label="API Response Time" current={Math.round(m.latency * 0.8)} unit="ms" data={generateTrend(Math.round(m.latency * 0.8), 8)} />
        <TrendChart label="Throughput" current={Math.round(m.traffic / 60)} unit="req/s" data={generateTrend(Math.round(m.traffic / 60), 8)} />
      </div>

      {/* Forecast */}
      <section className="bg-white rounded-xl border p-5 mt-6">
        <h3 className="font-semibold mb-3">Forecast (Next 30 Days)</h3>
        <div className="grid md:grid-cols-3 gap-4 text-xs">
          <ForecastCard label="CPU" current={m.cpu} predicted={Math.min(100, m.cpu + 5)} trend="up" />
          <ForecastCard label="Memory" current={m.memory} predicted={Math.min(100, m.memory + 3)} trend="up" />
          <ForecastCard label="Disk" current={m.disk} predicted={Math.min(100, m.disk + 2)} trend="stable" />
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return <div className={`bg-white rounded-xl border p-4 text-center ${warn ? 'border-orange-200 bg-orange-50' : ''}`}><p className={`text-lg font-bold ${warn ? 'text-orange-600' : 'text-gray-900'}`}>{value}</p><p className="text-[10px] text-gray-500">{label}</p></div>;
}

function TrendChart({ label, current, unit, data, warn }: { label: string; current: number; unit: string; data: number[]; warn?: boolean }) {
  const max = Math.max(...data, 1);
  return (
    <div className={`bg-white rounded-xl border p-5 ${warn ? 'border-orange-200' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium">{label}</span>
        <span className={`text-sm font-bold ${warn ? 'text-orange-600' : 'text-gray-900'}`}>{current}{unit}</span>
      </div>
      <div className="flex items-end gap-1 h-16">
        {data.map((v, i) => (
          <div key={i} className={`flex-1 rounded-t ${warn ? 'bg-orange-400' : 'bg-purple-400'}`} style={{ height: `${Math.max((v / max) * 100, 4)}%`, opacity: 0.4 + (i / data.length) * 0.6 }} />
        ))}
      </div>
      <div className="flex justify-between mt-1 text-[9px] text-gray-400">
        <span>-8h</span><span>-4h</span><span>Now</span>
      </div>
    </div>
  );
}

function ForecastCard({ label, current, predicted, trend }: { label: string; current: number; predicted: number; trend: string }) {
  const diff = predicted - current;
  return (
    <div className="border rounded-lg p-3">
      <p className="font-medium mb-1">{label}</p>
      <div className="flex items-center justify-between">
        <span className="text-gray-500">Current: {current}%</span>
        <span className={diff > 3 ? 'text-orange-600 font-medium' : 'text-gray-700'}>{predicted}% {trend === 'up' ? '↑' : '→'}</span>
      </div>
    </div>
  );
}

function generateTrend(base: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => Math.max(0, base + Math.round((Math.random() - 0.5) * base * 0.3)));
}
