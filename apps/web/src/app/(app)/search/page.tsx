'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { mockClients, platformServices } from '../../lib/mock-clients';
import { statusColor } from '../../components/status-badge';
import { Breadcrumb } from '../../components/breadcrumb';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

type SearchResult = { type: string; title: string; subtitle: string; href: string; status?: string; source: 'real' | 'demo' };

/**
 * Real fix (final closure pass): this page previously searched ONLY
 * mock-clients.ts's ~20 static sample records — a genuinely onboarded client,
 * incident, defect, or migration was never findable here regardless of exact
 * spelling. Now queries the real GET /oc/search endpoint (real Postgres ILIKE
 * across oc_clients/oc_incidents/oc_defects/oc_migration_runs/oc_remediations)
 * and merges it with the existing demo-data search, each result explicitly
 * labeled by source so nothing implies a demo record is real.
 */
export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [realResults, setRealResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) { setRealResults([]); setError(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const timer = setTimeout(() => {
      fetch(`${API}/api/v1/oc/search?q=${encodeURIComponent(query.trim())}`)
        .then(res => {
          if (!res.ok) throw new Error(`Search request failed (${res.status})`);
          return res.json();
        })
        .then(data => {
          if (cancelled) return;
          const r: SearchResult[] = [];
          for (const c of data.results?.clients || []) {
            r.push({ type: 'Client', title: c.name, subtitle: c.industry || '—', href: `/clients/${c.id}`, status: c.health, source: 'real' });
          }
          // Previously showed the raw internal client_id (e.g. "Client
          // client-689fbe34-...") in every one of these 4 subtitles instead
          // of the client's real name — found during the 2026-08-22 global
          // UX audit. The API now joins oc_clients and returns client_name;
          // still falls back to the id for any orphaned row with no
          // matching client (should not happen in practice, but stays
          // honest rather than crashing).
          for (const i of data.results?.incidents || []) {
            r.push({ type: 'Incident', title: i.title, subtitle: `${i.client_name || i.client_id} • ${i.severity}`, href: `/clients/${i.client_id}/incidents/${i.id}`, source: 'real' });
          }
          for (const d of data.results?.defects || []) {
            r.push({ type: 'Defect', title: d.title, subtitle: `${d.category} • ${d.severity}`, href: `/engineering/${d.id}`, source: 'real' });
          }
          for (const m of data.results?.migrations || []) {
            r.push({ type: 'Migration', title: `${m.source_schema || '?'} → ${m.target_schema || '?'}`, subtitle: `${m.client_name || m.client_id} • ${m.status}`, href: `/migrations/${m.id}`, source: 'real' });
          }
          for (const rem of data.results?.remediations || []) {
            r.push({ type: 'Remediation', title: rem.title, subtitle: `${rem.client_name || rem.client_id} • ${rem.phase}`, href: `/clients/${rem.client_id}/incidents`, source: 'real' });
          }
          setRealResults(r);
        })
        .catch(err => { if (!cancelled) setError(err.message); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 250); // debounce
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  const demoResults = useMemo(() => {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    const matches: SearchResult[] = [];

    mockClients.filter(c => c.name.toLowerCase().includes(q) || c.industry.toLowerCase().includes(q)).forEach(c => {
      matches.push({ type: 'Client', title: c.name, subtitle: c.industry, href: `/clients/${c.id}`, status: c.health, source: 'demo' });
    });
    mockClients.forEach(c => c.applications.filter(a => a.toLowerCase().includes(q)).forEach(a => {
      matches.push({ type: 'Application', title: a, subtitle: c.name, href: `/clients/${c.id}/applications/${a.toLowerCase().replace(/\s+/g, '-')}`, source: 'demo' });
    }));
    platformServices.filter(s => s.name.toLowerCase().includes(q)).forEach(s => {
      matches.push({ type: 'Service', title: s.name, subtitle: s.description, href: `/services/${s.id}`, status: s.status, source: 'demo' });
    });
    mockClients.forEach(c => c.deployments.filter(d => d.version.includes(q) || d.gitCommit.includes(q)).forEach(d => {
      matches.push({ type: 'Deployment', title: `v${d.version}`, subtitle: `${c.name} • ${d.environment}`, href: `/clients/${c.id}/deployments/${d.id}`, source: 'demo' });
    }));
    mockClients.forEach(c => c.incidents.filter(i => i.title.toLowerCase().includes(q)).forEach(i => {
      matches.push({ type: 'Incident', title: i.title, subtitle: c.name, href: `/clients/${c.id}/incidents/${i.id}`, source: 'demo' });
    }));
    mockClients.forEach(c => c.alerts.filter(a => a.title.toLowerCase().includes(q)).forEach(a => {
      matches.push({ type: 'Alert', title: a.title, subtitle: c.name, href: `/clients/${c.id}/alerts/${a.id}`, source: 'demo' });
    }));
    mockClients.forEach(c => c.auditLog.filter(a => a.what.toLowerCase().includes(q) || a.who.toLowerCase().includes(q)).forEach(a => {
      matches.push({ type: 'Audit', title: a.what, subtitle: `${a.who} • ${c.name}`, href: `/clients/${c.id}/audit/${a.id}`, source: 'demo' });
    }));
    if (['development', 'staging', 'production', 'dev', 'stg', 'prod'].some(e => e.includes(q))) {
      mockClients.forEach(c => {
        (['development', 'staging', 'production'] as const).filter(e => e.includes(q)).forEach(e => {
          matches.push({ type: 'Environment', title: `${e} — ${c.name}`, subtitle: `v${c.environments[e].version}`, href: `/clients/${c.id}/environments/${e}`, status: c.environments[e].status, source: 'demo' });
        });
      });
    }
    return matches.slice(0, 30);
  }, [query]);

  const results = [...realResults, ...demoResults];

  const typeColors: Record<string, string> = {
    Client: 'bg-purple-100 text-purple-700',
    Application: 'bg-blue-100 text-blue-700',
    Service: 'bg-green-100 text-green-700',
    Deployment: 'bg-indigo-100 text-indigo-700',
    Incident: 'bg-red-100 text-red-700',
    Alert: 'bg-orange-100 text-orange-700',
    Audit: 'bg-gray-100 text-gray-700',
    Environment: 'bg-teal-100 text-teal-700',
    Defect: 'bg-rose-100 text-rose-700',
    Migration: 'bg-cyan-100 text-cyan-700',
    Remediation: 'bg-lime-100 text-lime-700',
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
          placeholder="Search real clients, incidents, defects, migrations, remediations..."
          className="w-full pl-12 pr-4 py-4 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent shadow-sm"
          aria-label="Global search"
          autoFocus
        />
      </div>

      {query.length >= 2 && (
        <div className="flex items-center gap-2 mb-4">
          <p className="text-xs text-gray-500">{results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;</p>
          {loading && <span className="text-[10px] text-purple-500">Searching real data…</span>}
        </div>
      )}

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
          Real search is currently unavailable ({error}). Showing sample-data results only below, if any.
        </div>
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
                <div className="flex items-center gap-1.5 shrink-0">
                  {r.source === 'demo' && <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-500">Sample</span>}
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${typeColors[r.type] || 'bg-gray-100 text-gray-600'}`}>{r.type}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {query.length >= 2 && !loading && results.length === 0 && (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-500 text-sm">
          No results found for &ldquo;{query}&rdquo;. Try a different search term.
        </div>
      )}

      {query.length < 2 && (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-500 text-sm">
          <p className="mb-2">Search across the entire Enterprise Operations Center.</p>
          <p className="text-xs text-gray-400">Real clients • incidents • defects • migrations • remediations, plus sample data for illustration</p>
        </div>
      )}
    </div>
  );
}
