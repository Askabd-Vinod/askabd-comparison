'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { mockClients, platformServices } from '../lib/mock-clients';
import { statusColor } from '../components/status-badge';
import { Breadcrumb } from '../components/breadcrumb';

type SearchResult = { type: string; title: string; subtitle: string; href: string; status?: string };

export default function SearchPage() {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    const matches: SearchResult[] = [];

    // Search clients
    mockClients.filter(c => c.name.toLowerCase().includes(q) || c.industry.toLowerCase().includes(q)).forEach(c => {
      matches.push({ type: 'Client', title: c.name, subtitle: c.industry, href: `/clients/${c.id}`, status: c.health });
    });

    // Search applications
    mockClients.forEach(c => c.applications.filter(a => a.toLowerCase().includes(q)).forEach(a => {
      matches.push({ type: 'Application', title: a, subtitle: c.name, href: `/clients/${c.id}/applications/${a.toLowerCase().replace(/\s+/g, '-')}` });
    }));

    // Search services
    platformServices.filter(s => s.name.toLowerCase().includes(q)).forEach(s => {
      matches.push({ type: 'Service', title: s.name, subtitle: s.description, href: `/services/${s.id}`, status: s.status });
    });

    // Search deployments
    mockClients.forEach(c => c.deployments.filter(d => d.version.includes(q) || d.gitCommit.includes(q)).forEach(d => {
      matches.push({ type: 'Deployment', title: `v${d.version}`, subtitle: `${c.name} • ${d.environment}`, href: `/clients/${c.id}/deployments/${d.id}` });
    }));

    // Search incidents
    mockClients.forEach(c => c.incidents.filter(i => i.title.toLowerCase().includes(q)).forEach(i => {
      matches.push({ type: 'Incident', title: i.title, subtitle: c.name, href: `/clients/${c.id}/incidents/${i.id}` });
    }));

    // Search alerts
    mockClients.forEach(c => c.alerts.filter(a => a.title.toLowerCase().includes(q)).forEach(a => {
      matches.push({ type: 'Alert', title: a.title, subtitle: c.name, href: `/clients/${c.id}/alerts/${a.id}` });
    }));

    // Search audit
    mockClients.forEach(c => c.auditLog.filter(a => a.what.toLowerCase().includes(q) || a.who.toLowerCase().includes(q)).forEach(a => {
      matches.push({ type: 'Audit', title: a.what, subtitle: `${a.who} • ${c.name}`, href: `/clients/${c.id}/audit/${a.id}` });
    }));

    // Search environments
    if (['development', 'staging', 'production', 'dev', 'stg', 'prod'].some(e => e.includes(q))) {
      mockClients.forEach(c => {
        (['development', 'staging', 'production'] as const).filter(e => e.includes(q)).forEach(e => {
          matches.push({ type: 'Environment', title: `${e} — ${c.name}`, subtitle: `v${c.environments[e].version}`, href: `/clients/${c.id}/environments/${e}`, status: c.environments[e].status });
        });
      });
    }

    return matches.slice(0, 50);
  }, [query]);

  const typeColors: Record<string, string> = {
    Client: 'bg-purple-100 text-purple-700',
    Application: 'bg-blue-100 text-blue-700',
    Service: 'bg-green-100 text-green-700',
    Deployment: 'bg-indigo-100 text-indigo-700',
    Incident: 'bg-red-100 text-red-700',
    Alert: 'bg-orange-100 text-orange-700',
    Audit: 'bg-gray-100 text-gray-700',
    Environment: 'bg-teal-100 text-teal-700',
  };

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Search' }]} />
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Global Search</h1>

      <div className="relative mb-6">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search clients, applications, services, deployments, incidents, alerts, audit, environments..."
          className="w-full pl-12 pr-4 py-4 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent shadow-sm"
          aria-label="Global search"
          autoFocus
        />
      </div>

      {query.length >= 2 && (
        <p className="text-xs text-gray-500 mb-4">{results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;</p>
      )}

      {results.length > 0 && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="divide-y divide-gray-100">
            {results.map((r, i) => (
              <Link key={i} href={r.href} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition">
                <div className="flex items-center gap-3 min-w-0">
                  {r.status && <span className={`w-2 h-2 rounded-full shrink-0 ${statusColor(r.status as any)}`} />}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{r.title}</p>
                    <p className="text-[11px] text-gray-500 truncate">{r.subtitle}</p>
                  </div>
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded shrink-0 ${typeColors[r.type] || 'bg-gray-100 text-gray-600'}`}>{r.type}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {query.length >= 2 && results.length === 0 && (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-500 text-sm">
          No results found for &ldquo;{query}&rdquo;. Try a different search term.
        </div>
      )}

      {query.length < 2 && (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-500 text-sm">
          <p className="mb-2">Search across the entire Enterprise Operations Center.</p>
          <p className="text-xs text-gray-400">Clients • Applications • Services • Deployments • Incidents • Alerts • Audit • Environments</p>
        </div>
      )}
    </div>
  );
}
