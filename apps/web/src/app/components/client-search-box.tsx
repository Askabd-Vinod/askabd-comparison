'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { staffFetch } from '../lib/staff-session';

/**
 * Staff-side client-scoped search (Phase 1, 2026-08-20 continuation). Real
 * results only — calls the real, tenant-scoped `/oc/clients/:clientId/search`
 * (client-search-service.ts) already built and tested this session. No
 * client-side fake results, ever: an empty/failed response renders an honest
 * empty/error state, never a fabricated placeholder.
 *
 * Mounted once per client-scoped page (from the client layout), so it is
 * always scoped to the client the staff member is currently viewing —
 * searching Client B while inside Client A is structurally impossible here
 * (the component only ever knows about `clientId`), not just RBAC-denied.
 */
interface SearchResult { id: string; name: string; type: string; status: string | null; module: string; url: string }

export function ClientSearchBox({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Ctrl/Cmd+K opens and focuses the search box from anywhere on the page.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const runSearch = useCallback(async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) { setResults([]); setStatus('idle'); return; }
    setStatus('loading');
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${clientId}/search?q=${encodeURIComponent(q.trim())}`);
      if (!res.ok) { setStatus('error'); setResults([]); return; }
      const body = await res.json();
      setResults(body.results || []);
      setStatus('idle');
    } catch {
      setStatus('error');
      setResults([]);
    }
  }, [clientId]);

  function goTo(url: string) {
    setOpen(false);
    setQuery('');
    setResults([]);
    router.push(url);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => { setOpen(true); requestAnimationFrame(() => inputRef.current?.focus()); }}
        aria-label="Search this client's workspace"
        className="flex items-center gap-2 text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:border-gray-300 hover:bg-gray-50 transition w-full sm:w-56"
      >
        <span aria-hidden="true">🔍</span>
        <span className="hidden sm:inline">Search this client…</span>
        <span className="sm:hidden">Search…</span>
        <kbd className="hidden sm:inline ml-auto text-[10px] text-gray-400 border border-gray-200 rounded px-1">Ctrl K</kbd>
      </button>

      {/* Section 14 fix (2026-08-21): this panel always anchored `right-0` on mobile
          but switched to `left-0` at `sm:` and up. The trigger button is mounted as the
          last item in a right-aligned header row on every real page (client layout header,
          flush against the right edge), so anchoring the panel's LEFT edge to the button's
          left edge let a 420px-wide panel grow past the viewport's right edge on desktop
          widths (e.g. 1440px) — verified live: docScrollWidth 1605 > viewport 1440, a real
          unwanted horizontal scrollbar. Anchoring `right-0` at every breakpoint (grow
          leftward from the button, which already sits near the container's right edge)
          fixes this with no behavior change on mobile, where it was already correct. */}
      {open && (
        <div role="dialog" aria-label="Client search" className="absolute right-0 mt-2 w-[min(92vw,420px)] bg-white border border-gray-200 rounded-xl shadow-xl z-30">
          <input
            ref={inputRef}
            value={query}
            onChange={e => runSearch(e.target.value)}
            placeholder="Search requirements, services, connectors, CRM, requests…"
            aria-label="Search query"
            className="w-full px-4 py-3 text-sm border-b border-gray-100 focus:outline-none rounded-t-xl"
          />
          <div className="max-h-80 overflow-y-auto">
            {status === 'loading' && <div className="p-4 text-xs text-gray-400">Searching…</div>}
            {status === 'error' && <div className="p-4 text-xs text-red-500">Search is temporarily unavailable. Please try again.</div>}
            {status === 'idle' && query.trim().length >= 2 && results.length === 0 && (
              <div className="p-4 text-xs text-gray-400">No matching results found.</div>
            )}
            {status === 'idle' && query.trim().length > 0 && query.trim().length < 2 && (
              <div className="p-4 text-xs text-gray-400">Keep typing… (2+ characters)</div>
            )}
            {results.map(r => (
              <button
                key={`${r.type}-${r.id}`}
                onClick={() => goTo(r.url)}
                className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-900 truncate">{r.name}</p>
                  <p className="text-[10px] text-gray-400">{r.module} · {r.type}</p>
                </div>
                {r.status && <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 whitespace-nowrap">{r.status}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
