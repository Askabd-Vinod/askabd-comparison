'use client';

export type LegendType = 'health' | 'cpu' | 'memory' | 'latency' | 'severity' | 'deployment';

const LEGENDS: Record<LegendType, { color: string; label: string; range?: string }[]> = {
  health: [
    { color: 'bg-green-500', label: 'Healthy' },
    { color: 'bg-yellow-500', label: 'Warning' },
    { color: 'bg-orange-500', label: 'Degraded' },
    { color: 'bg-red-500', label: 'Critical' },
    { color: 'bg-gray-400', label: 'Offline' },
    { color: 'bg-blue-500', label: 'Maintenance' },
    { color: 'bg-purple-500', label: 'Deploying' },
  ],
  cpu: [
    { color: 'bg-green-500', label: 'Normal', range: '0–60%' },
    { color: 'bg-orange-500', label: 'Elevated', range: '60–80%' },
    { color: 'bg-red-500', label: 'Critical', range: '80%+' },
  ],
  memory: [
    { color: 'bg-green-500', label: 'Normal', range: '0–70%' },
    { color: 'bg-orange-500', label: 'Elevated', range: '70–85%' },
    { color: 'bg-red-500', label: 'Critical', range: '85%+' },
  ],
  latency: [
    { color: 'bg-green-500', label: 'Fast', range: '<100ms' },
    { color: 'bg-orange-500', label: 'Slow', range: '100–500ms' },
    { color: 'bg-red-500', label: 'Critical', range: '>500ms' },
  ],
  severity: [
    { color: 'bg-red-500', label: 'Critical' },
    { color: 'bg-orange-500', label: 'Major' },
    { color: 'bg-yellow-500', label: 'Minor' },
    { color: 'bg-blue-500', label: 'Information' },
  ],
  deployment: [
    { color: 'bg-green-500', label: 'Success' },
    { color: 'bg-red-500', label: 'Failed' },
    { color: 'bg-orange-500', label: 'Rolling Back' },
    { color: 'bg-purple-500', label: 'In Progress' },
  ],
};

export function Legend({ type, compact }: { type: LegendType; compact?: boolean }) {
  const items = LEGENDS[type];
  return (
    <div className={`flex flex-wrap gap-3 ${compact ? 'gap-2' : ''}`} role="list" aria-label={`${type} legend`}>
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-1.5" role="listitem">
          <span className={`w-2 h-2 rounded-full ${item.color}`} />
          <span className="text-[10px] text-gray-600">{item.label}</span>
          {item.range && <span className="text-[9px] text-gray-400">({item.range})</span>}
        </div>
      ))}
    </div>
  );
}
