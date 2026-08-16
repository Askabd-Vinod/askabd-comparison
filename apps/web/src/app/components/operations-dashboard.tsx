'use client';

import { useState, useMemo } from 'react';
import { Client } from '../lib/types';
import { ClientCard } from './client-card';
import { SearchFilters, FilterValues } from './search-filters';

interface OperationsDashboardProps {
  clients: Client[];
}

export function OperationsDashboard({ clients }: OperationsDashboardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<FilterValues>({
    industry: 'all',
    status: 'all',
    environment: 'all',
    health: 'all',
  });

  const industries = useMemo(
    () => [...new Set(clients.map(c => c.industry))].sort(),
    [clients],
  );

  const filteredClients = useMemo(() => {
    return clients.filter(client => {
      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const searchable = [
          client.name,
          client.industry,
          ...client.activeServices,
          client.id,
          client.health,
          client.slaStatus,
        ].join(' ').toLowerCase();
        if (!searchable.includes(q)) return false;
      }

      // Industry filter
      if (filters.industry !== 'all' && client.industry !== filters.industry) return false;

      // Health filter
      if (filters.health !== 'all' && client.health !== filters.health) return false;

      // SLA status filter
      if (filters.status !== 'all' && client.slaStatus !== filters.status) return false;

      // Environment filter (show clients where the selected environment has issues)
      if (filters.environment !== 'all') {
        const env = client.environments[filters.environment as keyof typeof client.environments];
        if (!env) return false;
      }

      return true;
    });
  }, [clients, searchQuery, filters]);

  // Summary stats
  const stats = useMemo(() => ({
    total: clients.length,
    healthy: clients.filter(c => c.health === 'healthy').length,
    warning: clients.filter(c => c.health === 'warning').length,
    critical: clients.filter(c => c.health === 'critical').length,
    offline: clients.filter(c => c.health === 'offline').length,
    incidents: clients.reduce((acc, c) => acc + c.activeIncidents, 0),
    requests: clients.reduce((acc, c) => acc + c.openServiceRequests, 0),
  }), [clients]);

  return (
    <div className="animate-in">
      {/* Summary Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
        <SummaryCard label="Total Clients" value={stats.total} />
        <SummaryCard label="Healthy" value={stats.healthy} color="text-green-600" />
        <SummaryCard label="Warning" value={stats.warning} color="text-orange-600" />
        <SummaryCard label="Critical" value={stats.critical} color="text-red-600" />
        <SummaryCard label="Offline" value={stats.offline} color="text-gray-500" />
        <SummaryCard label="Incidents" value={stats.incidents} color="text-red-600" />
        <SummaryCard label="Requests" value={stats.requests} color="text-orange-600" />
      </div>

      {/* Search & Filters */}
      <div className="mb-8">
        <SearchFilters
          onSearch={setSearchQuery}
          onFilter={setFilters}
          industries={industries}
        />
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          Showing {filteredClients.length} of {clients.length} clients
        </p>
      </div>

      {/* Client Grid */}
      {filteredClients.length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredClients.map(client => (
            <ClientCard key={client.id} client={client} />
          ))}
        </div>
      ) : (
        <div className="card p-12 text-center">
          <p className="text-gray-500 text-sm">No clients match the current filters.</p>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
      <p className={`text-xl font-bold ${color || 'text-gray-900'}`}>{value}</p>
      <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
    </div>
  );
}
