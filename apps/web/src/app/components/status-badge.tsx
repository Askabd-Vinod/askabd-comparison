import { HealthStatus } from '../lib/types';

export function statusColor(status: HealthStatus): string {
  switch (status) {
    case 'healthy': return 'bg-green-500';
    case 'warning': return 'bg-orange-500';
    case 'critical': return 'bg-red-500';
    case 'offline': return 'bg-gray-400';
  }
}

export function statusTextColor(status: HealthStatus): string {
  switch (status) {
    case 'healthy': return 'text-green-700 bg-green-50 border-green-200';
    case 'warning': return 'text-orange-700 bg-orange-50 border-orange-200';
    case 'critical': return 'text-red-700 bg-red-50 border-red-200';
    case 'offline': return 'text-gray-500 bg-gray-50 border-gray-200';
  }
}

export function StatusDot({ status }: { status: HealthStatus }) {
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full ${statusColor(status)}`} aria-label={`Status: ${status}`} />
  );
}

export function StatusBadge({ status, label }: { status: HealthStatus; label?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded border ${statusTextColor(status)}`}>
      <StatusDot status={status} />
      {label || status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export function SLABadge({ status }: { status: 'compliant' | 'at-risk' | 'breached' }) {
  const colors = {
    compliant: 'text-green-700 bg-green-50 border-green-200',
    'at-risk': 'text-orange-700 bg-orange-50 border-orange-200',
    breached: 'text-red-700 bg-red-50 border-red-200',
  };
  const labels = {
    compliant: 'SLA Compliant',
    'at-risk': 'SLA At Risk',
    breached: 'SLA Breached',
  };
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded border ${colors[status]}`}>
      {labels[status]}
    </span>
  );
}
