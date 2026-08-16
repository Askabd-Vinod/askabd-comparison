'use client';
import { useState } from 'react';
import Link from 'next/link';
import { DownloadButton } from '../../components/download-button';

interface KnowledgeEntry {
  id: string; problem: string; evidence: string[]; rootCause: string; solution: string; validation: string; regression: string; owner: string; approval: string; timeToResolve: string; businessImpact: string; lessonsLearned: string[]; tags: string[]; createdAt: string; reusedCount: number;
}

export function KnowledgeBaseView({ entries }: { entries: KnowledgeEntry[] }) {
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const lastSync = new Date().toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const allTags = [...new Set(entries.flatMap(e => e.tags))];
  const filtered = entries.filter(e => {
    if (search && !e.problem.toLowerCase().includes(search.toLowerCase()) && !e.rootCause.toLowerCase().includes(search.toLowerCase()) && !e.tags.some(t => t.includes(search.toLowerCase()))) return false;
    if (selectedTag && !e.tags.includes(selectedTag)) return false;
    return true;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Engineering Knowledge Base</h1>
          <p className="text-sm text-gray-500 mt-0.5">{entries.length} resolved issues • Searchable, reusable resolutions</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-gray-400">Last sync: {lastSync}</span>
          <DownloadButton fileName="Engineering_Knowledge_Base" format="csv" entityId="knowledge-base" entityName="Knowledge Base Export" data={{ totalEntries: entries.length, totalReuse: entries.reduce((a, e) => a + e.reusedCount, 0) }}>Export</DownloadButton>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-3 mb-4">
        <input type="text" placeholder="Search problems, root causes, tags…" value={search} onChange={e => setSearch(e.target.value)} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
      </div>
      <div className="flex flex-wrap gap-1.5 mb-6">
        <button onClick={() => setSelectedTag(null)} className={`text-[10px] font-medium px-2.5 py-1 rounded-lg transition ${!selectedTag ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>All</button>
        {allTags.map(tag => (
          <button key={tag} onClick={() => setSelectedTag(tag === selectedTag ? null : tag)} className={`text-[10px] font-medium px-2.5 py-1 rounded-lg transition ${selectedTag === tag ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{tag}</button>
        ))}
      </div>

      {/* Entries */}
      <div className="space-y-3">
        {filtered.map(entry => (
          <div key={entry.id} className="bg-white rounded-xl border hover:border-purple-200 hover:shadow-sm transition overflow-hidden">
            <button onClick={() => setExpanded(expanded === entry.id ? null : entry.id)} className="w-full text-left px-5 py-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{entry.problem}</p>
                  <p className="text-xs text-gray-500 mt-1 truncate">Root cause: {entry.rootCause}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {entry.tags.slice(0, 5).map(t => <span key={t} className="text-[9px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded">{t}</span>)}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  <div className="text-right">
                    <p className="text-xs font-bold text-green-600">Reused {entry.reusedCount}×</p>
                    <p className="text-[9px] text-gray-400">TTR: {entry.timeToResolve}</p>
                  </div>
                  <span className="text-gray-400">{expanded === entry.id ? '▲' : '▼'}</span>
                </div>
              </div>
            </button>
            {expanded === entry.id && (
              <div className="px-5 pb-5 border-t pt-4 space-y-4">
                <div className="grid md:grid-cols-2 gap-4 text-xs">
                  <div><p className="text-[10px] text-gray-500 uppercase font-medium mb-1">Solution</p><p className="text-gray-700">{entry.solution}</p></div>
                  <div><p className="text-[10px] text-gray-500 uppercase font-medium mb-1">Validation</p><p className="text-gray-700">{entry.validation}</p></div>
                  <div><p className="text-[10px] text-gray-500 uppercase font-medium mb-1">Business Impact</p><p className="text-red-600">{entry.businessImpact}</p></div>
                  <div><p className="text-[10px] text-gray-500 uppercase font-medium mb-1">Regression</p><p className="text-gray-700">{entry.regression}</p></div>
                </div>
                <div><p className="text-[10px] text-gray-500 uppercase font-medium mb-1">Evidence</p><ul className="space-y-0.5">{entry.evidence.map((e, i) => <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5"><span className="text-green-500">✓</span>{e}</li>)}</ul></div>
                <div><p className="text-[10px] text-gray-500 uppercase font-medium mb-1">Lessons Learned</p><ul className="space-y-0.5">{entry.lessonsLearned.map((l, i) => <li key={i} className="text-xs text-gray-600">• {l}</li>)}</ul></div>
                <div className="flex items-center justify-between text-[10px] text-gray-400 pt-2 border-t">
                  <span>Owner: {entry.owner} | Approved by: {entry.approval}</span>
                  <span>Created: {new Date(entry.createdAt).toLocaleDateString('en-AU')}</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
