'use client';

import { useState } from 'react';

interface SearchFiltersProps {
  onSearch: (query: string) => void;
  onFilter: (filters: FilterValues) => void;
  industries: string[];
}

export interface FilterValues {
  industry: string;
  status: string;
  environment: string;
  health: string;
}

export function SearchFilters({ onSearch, onFilter, industries }: SearchFiltersProps) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<FilterValues>({
    industry: 'all',
    status: 'all',
    environment: 'all',
    health: 'all',
  });

  const handleSearch = (value: string) => {
    setQuery(value);
    onSearch(value);
  };

  const handleFilter = (key: keyof FilterValues, value: string) => {
    const updated = { ...filters, [key]: value };
    setFilters(updated);
    onFilter(updated);
  };

  return (
    <div className="space-y-4">
      {/* Global Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search clients, applications, services, issues, environments..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          aria-label="Global search"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filters.industry}
          onChange={(e) => handleFilter('industry', e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
          aria-label="Filter by industry"
        >
          <option value="all">All Industries</option>
          {industries.map(ind => (
            <option key={ind} value={ind}>{ind}</option>
          ))}
        </select>

        <select
          value={filters.health}
          onChange={(e) => handleFilter('health', e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
          aria-label="Filter by health"
        >
          <option value="all">All Health</option>
          <option value="healthy">Healthy</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
          <option value="offline">Offline</option>
        </select>

        <select
          value={filters.status}
          onChange={(e) => handleFilter('status', e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
          aria-label="Filter by SLA status"
        >
          <option value="all">All SLA Status</option>
          <option value="compliant">Compliant</option>
          <option value="at-risk">At Risk</option>
          <option value="breached">Breached</option>
        </select>

        <select
          value={filters.environment}
          onChange={(e) => handleFilter('environment', e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
          aria-label="Filter by environment"
        >
          <option value="all">All Environments</option>
          <option value="development">Development</option>
          <option value="staging">Staging</option>
          <option value="production">Production</option>
        </select>
      </div>
    </div>
  );
}
