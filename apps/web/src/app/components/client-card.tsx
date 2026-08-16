import Link from 'next/link';
import { Client } from '../lib/types';
import { StatusBadge, SLABadge, statusColor } from './status-badge';

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ClientCard({ client }: { client: Client }) {
  const envStatuses = [
    { label: 'DEV', status: client.environments.development.status },
    { label: 'STG', status: client.environments.staging.status },
    { label: 'PRD', status: client.environments.production.status },
  ];

  return (
    <Link
      href={`/clients/${client.id}`}
      className="block card p-5 hover:shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
      aria-label={`View ${client.name} dashboard`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 gradient-brand rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-sm">{client.logo}</span>
          </div>
          <div>
            <h3 className="font-semibold text-sm text-gray-900 leading-tight">{client.name}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{client.industry}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold gradient-text">{client.platformScore}</p>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Score</p>
        </div>
      </div>

      {/* Status Row */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <StatusBadge status={client.health} />
        <SLABadge status={client.slaStatus} />
      </div>

      {/* Services */}
      <div className="mb-4">
        <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5">Active Services</p>
        <div className="flex flex-wrap gap-1">
          {client.activeServices.slice(0, 4).map(service => (
            <span key={service} className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
              {service}
            </span>
          ))}
          {client.activeServices.length > 4 && (
            <span className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
              +{client.activeServices.length - 4}
            </span>
          )}
        </div>
      </div>

      {/* Environments */}
      <div className="mb-4">
        <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5">Environments</p>
        <div className="flex gap-3">
          {envStatuses.map(env => (
            <div key={env.label} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${statusColor(env.status)}`} />
              <span className="text-xs text-gray-600">{env.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-100">
        <div className="text-center">
          <p className="text-xs font-medium text-gray-900">{formatRelativeTime(client.lastDeployment)}</p>
          <p className="text-[10px] text-gray-400">Deployment</p>
        </div>
        <div className="text-center">
          <p className="text-xs font-medium text-gray-900">{formatRelativeTime(client.lastHeartbeat)}</p>
          <p className="text-[10px] text-gray-400">Heartbeat</p>
        </div>
        <div className="text-center">
          <p className="text-xs font-medium text-gray-900">{formatRelativeTime(client.lastBackup)}</p>
          <p className="text-[10px] text-gray-400">Backup</p>
        </div>
      </div>

      {/* Incidents/Requests */}
      {(client.activeIncidents > 0 || client.openServiceRequests > 0) && (
        <div className="flex gap-3 mt-3 pt-3 border-t border-gray-100">
          {client.activeIncidents > 0 && (
            <span className="text-xs text-red-600 font-medium">
              {client.activeIncidents} incident{client.activeIncidents !== 1 ? 's' : ''}
            </span>
          )}
          {client.openServiceRequests > 0 && (
            <span className="text-xs text-orange-600 font-medium">
              {client.openServiceRequests} request{client.openServiceRequests !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}
