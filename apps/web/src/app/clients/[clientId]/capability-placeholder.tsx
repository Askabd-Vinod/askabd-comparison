'use client';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect } from 'react';

const capabilityContent: Record<string, { icon: string; metrics: { label: string; value: string; status: string }[]; actions: { label: string; href: string }[] }> = {
  Infrastructure: {
    icon: '🖥️',
    metrics: [
      { label: 'Servers', value: '3 Active', status: 'green' },
      { label: 'Containers', value: '8 Running', status: 'green' },
      { label: 'Networks', value: '2 Configured', status: 'green' },
      { label: 'Storage', value: '45% Used', status: 'green' },
      { label: 'CPU Avg', value: '32%', status: 'green' },
      { label: 'Memory Avg', value: '58%', status: 'green' },
    ],
    actions: [
      { label: 'View server inventory', href: '__environments__' },
      { label: 'Check container health', href: '__deployments__' },
      { label: 'Review network topology', href: '__connectors__' },
      { label: 'Monitor resource usage', href: '__monitoring__' },
    ],
  },
  Monitoring: {
    icon: '📊',
    metrics: [
      { label: 'API Health', value: 'Healthy', status: 'green' },
      { label: 'Database', value: 'Connected', status: 'green' },
      { label: 'Response Time', value: '<100ms', status: 'green' },
      { label: 'Uptime', value: '99.9%', status: 'green' },
      { label: 'Error Rate', value: '0.01%', status: 'green' },
      { label: 'Active Connections', value: '12', status: 'green' },
    ],
    actions: [
      { label: 'View infrastructure metrics', href: '__infrastructure__' },
      { label: 'View incident & alert management', href: '__incidents__' },
      { label: 'View deployment status', href: '__deployments__' },
      { label: 'Review audit trail', href: '__audit__' },
    ],
  },
  Incidents: {
    icon: '🚨',
    metrics: [
      { label: 'Open Incidents', value: '0', status: 'green' },
      { label: 'Resolved (30d)', value: '3', status: 'green' },
      { label: 'MTTR', value: '23 min', status: 'green' },
      { label: 'SLA Compliance', value: '100%', status: 'green' },
    ],
    actions: [
      { label: 'Create incident report', href: '__incidents__' },
      { label: 'View incident timeline', href: '__incidents__' },
      { label: 'Configure escalation rules', href: '__incidents__' },
      { label: 'Review post-mortems', href: '__incidents__' },
    ],
  },
  Services: {
    icon: '⚙️',
    metrics: [
      { label: 'Active Services', value: '6', status: 'green' },
      { label: 'Service Health', value: 'All Healthy', status: 'green' },
      { label: 'Last Deploy', value: 'Today', status: 'green' },
      { label: 'Dependencies', value: '12 mapped', status: 'green' },
    ],
    actions: [
      { label: 'View service catalog', href: '__services__' },
      { label: 'Check dependency map', href: '__infrastructure__' },
      { label: 'Review deployment history', href: '__deployments__' },
      { label: 'Configure health checks', href: '__services__' },
    ],
  },
  Reports: {
    icon: '📋',
    metrics: [
      { label: 'Weekly Reports', value: 'Active', status: 'green' },
      { label: 'Last Generated', value: 'Today', status: 'green' },
      { label: 'Compliance Score', value: '96%', status: 'green' },
      { label: 'Recommendations', value: '4 approved', status: 'green' },
    ],
    actions: [
      { label: 'Generate executive summary', href: '__reports__' },
      { label: 'Export compliance report', href: '__audit__' },
      { label: 'View SLA report', href: '__reports__' },
      { label: 'Download audit evidence', href: '__audit__' },
    ],
  },
};

export function CapabilityPlaceholder({ title, description }: { title: string; description: string }) {
  const params = useParams();
  const clientId = params.clientId as string;
  const [lastRefresh, setLastRefresh] = useState('');
  const content = capabilityContent[title];

  useEffect(() => {
    setLastRefresh(new Date().toLocaleTimeString());
  }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl border p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <span className="text-xl">{content?.icon || '📦'}</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">{title}</h2>
              <p className="text-xs text-gray-500 mt-0.5">{description}</p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[9px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded uppercase">Active</span>
            {lastRefresh && <p className="text-[8px] text-gray-400 mt-1">Updated {lastRefresh}</p>}
          </div>
        </div>
      </div>

      {/* Metrics */}
      {content?.metrics && (
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-4">Current Status</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {content.metrics.map((m, i) => (
              <div key={i} className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm font-bold text-gray-900">{m.value}</p>
                <p className="text-[10px] text-gray-500">{m.label}</p>
                <div className="mt-1 w-full h-1 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full" style={{ width: '100%' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Available Actions */}
      {content?.actions && (
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-4">Available Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {content.actions.map((action, i) => {
              const resolvedHref = action.href.startsWith('__') 
                ? `/clients/${clientId}/${action.href.replace(/__/g, '')}`
                : action.href;
              return (
                <Link key={i} href={resolvedHref} className="flex items-center gap-2 p-3 rounded-lg border border-gray-100 hover:bg-purple-50 hover:border-purple-200 transition">
                  <span className="text-purple-500">→</span>
                  <p className="text-xs text-gray-700">{action.label}</p>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Lifecycle Integration */}
      <div className="bg-white rounded-xl border p-5">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-green-600">✓</span>
            <p className="text-xs font-semibold text-green-800">Operational — Connected to AskABD Platform</p>
          </div>
          <p className="text-[10px] text-green-600">This service is active and integrated with the client's lifecycle. Data flows automatically from connected infrastructure.</p>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-3">
        <Link href={`/clients/${clientId}/lifecycle`} className="text-xs font-medium text-gray-600 hover:text-gray-900 border rounded-lg px-4 py-2 hover:bg-gray-50 transition">
          ← Back to Lifecycle
        </Link>
        <Link href={`/clients/${clientId}`} className="text-xs font-medium text-gray-600 hover:text-gray-900 border rounded-lg px-4 py-2 hover:bg-gray-50 transition">
          Overview
        </Link>
      </div>
    </div>
  );
}
