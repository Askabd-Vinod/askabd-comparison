'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { getSession, authFetch, logout } from '../../../lib/session';
import { getCurrentStepInfo, type LifecycleStatus } from '../../../lib/onboarding-lifecycle';

const REQUEST_STATUS_CLASS: Record<string, string> = {
  requested: 'bg-blue-50 text-blue-700 border-blue-200',
  under_review: 'bg-orange-50 text-orange-700 border-orange-200',
  approved: 'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  in_progress: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  completed: 'bg-gray-100 text-gray-700 border-gray-200',
};
const REQUEST_STATUS_LABEL: Record<string, string> = {
  requested: 'Requested', under_review: 'Under Review', approved: 'Approved',
  rejected: 'Rejected', in_progress: 'In Progress', completed: 'Completed',
};
const PRIORITY_CLASS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700', high: 'bg-orange-100 text-orange-700', medium: 'bg-blue-100 text-blue-700',
};
const VALID_TABS = ['home', 'actions', 'problems', 'gaps', 'transformations', 'financial', 'optimization', 'notifications', 'timeline', 'team', 'requests'];

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return <div className="bg-white rounded-xl border p-3 text-center"><p className={`text-xl font-bold ${color || 'text-gray-900'}`}>{value}</p><p className="text-[10px] text-gray-500">{label}</p></div>;
}

export default function ClientPortalPage() {
  const { clientId } = useParams() as { clientId: string };
  const router = useRouter();
  const searchParams = useSearchParams();
  const [home, setHome] = useState<any>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [actions, setActions] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [problems, setProblems] = useState<any[]>([]);
  const [gaps, setGaps] = useState<any[]>([]);
  const [transformations, setTransformations] = useState<any[]>([]);
  const [financial, setFinancial] = useState<any>(null);
  const [optimization, setOptimization] = useState<any>(null);
  const [serviceCoverage, setServiceCoverage] = useState<any>(null);
  const [serviceRecs, setServiceRecs] = useState<any[]>([]);
  const [engagements, setEngagements] = useState<any[]>([]);
  const [crmContacts, setCrmContacts] = useState<any[]>([]);
  const [crmNotes, setCrmNotes] = useState<any[]>([]);
  const [crmTasks, setCrmTasks] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [availableServices, setAvailableServices] = useState<{ serviceId: string; name: string }[]>([]);
  const [requestForm, setRequestForm] = useState<{ type: 'service' | 'connector' | 'support' | 'incident' | 'change'; targetKey: string; targetLabel: string; description: string; priority: 'low' | 'normal' | 'high' | 'urgent' } | null>(null);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestFormError, setRequestFormError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  // Reads a real `?tab=` query param on load — previously this was pure
  // client-side state with no URL representation at all, so nothing (not
  // even this app's own Journey page) could deep-link into a specific tab;
  // every such link silently landed on Home instead. Found during the
  // 2026-08-22 global UX audit.
  const [tab, setTab] = useState<string>(() => {
    const t = searchParams.get('tab');
    return t && VALID_TABS.includes(t) ? t : 'home';
  });

  const loadData = useCallback(async () => {
    // Real auth guard: no session at all → straight to login, no data ever requested.
    if (!getSession()) {
      router.replace('/login');
      return;
    }
    try {
      setLoading(true);
      setUnauthorized(false);
      const base = `/api/v1/oc/portal/${clientId}`;
      const [hRes, aRes, tRes, nRes, pRes, gRes, tfRes, fRes, oRes, scRes, srRes] = await Promise.all([
        authFetch(`${base}/home`), authFetch(`${base}/actions`), authFetch(`${base}/timeline`),
        authFetch(`${base}/notifications`), authFetch(`${base}/problems`), authFetch(`${base}/gaps`),
        authFetch(`${base}/transformations`), authFetch(`${base}/financial`), authFetch(`${base}/optimization`),
        authFetch(`/api/v1/oc/clients/${clientId}/services/coverage`).catch(() => null),
        authFetch(`/api/v1/oc/clients/${clientId}/services/recommendations`).catch(() => null),
      ]);
      // A real 401 here means authFetch's own proactive+reactive renewal (see
      // lib/session.ts) ALREADY tried and genuinely failed — the refresh token
      // itself is expired/revoked/reused, not just the access token. This is a
      // real, terminal session failure: clear it and send the user back to a real
      // login, with their intended destination preserved so they land back here
      // (not the generic portal root) after signing in again.
      if (hRes.status === 401) {
        await logout();
        router.replace(`/login?next=${encodeURIComponent(`/client-portal/${clientId}`)}&expired=1`);
        return;
      }
      // A real 403 means the session IS valid but this identity's organization is not
      // authorized for THIS client — this is the tenant boundary working correctly, not
      // an error to hide. Shown explicitly, never silently treated as "no data yet."
      if (hRes.status === 403) { setUnauthorized(true); setLoading(false); return; }

      if (hRes.ok) setHome(await hRes.json());
      // Real fix (2026-08-20): the portal previously showed the raw
      // client-<uuid> as its own primary heading — a real, reported UX defect
      // (a customer should never need to recognize an internal database key
      // as "who they are"). This is the same real, tenant-scoped, already-
      // proven endpoint the multi-workspace picker on /login uses to resolve
      // real names — never a fabricated label, and 403s honestly (caught
      // below) rather than ever guessing a name for a client this session
      // isn't actually authorized to see.
      try {
        const cRes = await authFetch(`/api/v1/oc/clients/${clientId}`);
        if (cRes.ok) { const body = await cRes.json(); setClientName(body.client?.name || null); }
      } catch { /* non-critical — falls back to the technical id below */ }
      if (aRes.ok) setActions((await aRes.json()).actions || []);
      if (tRes.ok) setTimeline((await tRes.json()).events || []);
      if (nRes.ok) setNotifications((await nRes.json()).notifications || []);
      if (pRes.ok) setProblems((await pRes.json()).problems || []);
      if (gRes.ok) setGaps((await gRes.json()).gaps || []);
      if (tfRes.ok) setTransformations((await tfRes.json()).transformations || []);
      if (fRes.ok) setFinancial(await fRes.json());
      if (oRes.ok) setOptimization(await oRes.json());
      if (scRes?.ok) setServiceCoverage(await scRes.json());
      if (srRes?.ok) setServiceRecs((await srRes.json()).recommendations || []);
      // Load commercial engagements
      try {
        const eRes = await authFetch(`/api/v1/oc/clients/${clientId}/engagements`);
        if (eRes.ok) setEngagements((await eRes.json()).engagements || []);
      } catch { /* non-critical */ }
      // Real, persisted service/connector/support requests — never fabricated
      // client-side state (see client-request-service.ts).
      try {
        const rRes = await authFetch(`/api/v1/oc/portal/${clientId}/requests`);
        if (rRes.ok) setRequests((await rRes.json()).requests || []);
      } catch { /* non-critical */ }
      // Real, not-yet-enabled services this client could request — powers a
      // real dropdown (a real capability id) instead of free-text, so an
      // approved request can auto-enable the actual service (see
      // client-request-service.ts's transition()).
      try {
        const availRes = await authFetch(`/api/v1/oc/clients/${clientId}/services`);
        if (availRes.ok) {
          const svcBody = await availRes.json();
          setAvailableServices((svcBody.services || []).filter((s: any) => s.clientStatus !== 'enabled').map((s: any) => ({ serviceId: s.serviceId, name: s.name })));
        }
      } catch { /* non-critical */ }
      // Real CRM data explicitly marked customer-visible by staff — the portal read
      // path (crm-service.ts's listCustomerVisible*) never returns internal-only
      // records, filtered at the query level, not client-side.
      try {
        const [ccRes, cnRes, ctRes] = await Promise.all([
          authFetch(`${base}/contacts`), authFetch(`${base}/notes`), authFetch(`${base}/tasks`),
        ]);
        if (ccRes.ok) setCrmContacts((await ccRes.json()).contacts || []);
        if (cnRes.ok) setCrmNotes((await cnRes.json()).notes || []);
        if (ctRes.ok) setCrmTasks((await ctRes.json()).tasks || []);
      } catch { /* non-critical */ }
    } catch { /* silent */ } finally { setLoading(false); }
  }, [clientId, router]);

  useEffect(() => { loadData(); }, [loadData]);

  async function submitRequest() {
    if (!requestForm || !requestForm.description.trim()) return;
    setSubmittingRequest(true);
    setRequestFormError(null);
    try {
      const res = await authFetch(`/api/v1/oc/portal/${clientId}/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestType: requestForm.type, targetKey: requestForm.targetKey || undefined, targetLabel: requestForm.targetLabel || undefined, description: requestForm.description.trim(), priority: requestForm.priority }),
      });
      const body = await res.json();
      if (res.ok) {
        // A 200-ish response with an existing request means this is a real
        // reuse — a duplicate pending request was never created (Phase 8/9,
        // 2026-08-20). Either way, the real, current row is what's shown.
        setRequests(prev => prev.some(r => r.id === body.request.id) ? prev : [body.request, ...prev]);
        setRequestForm(null);
        setTab('requests');
      } else {
        setRequestFormError(body?.error?.message || 'Could not submit this request. Please try again.');
      }
    } catch {
      setRequestFormError('Could not reach AskABD. Please try again.');
    } finally {
      setSubmittingRequest(false);
    }
  }

  async function runSearch(q: string) {
    setSearchQuery(q);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await authFetch(`/api/v1/oc/portal/${clientId}/search?q=${encodeURIComponent(q.trim())}`);
      if (res.ok) setSearchResults((await res.json()).results || []);
    } finally {
      setSearching(false);
    }
  }

  const hc = (v: string) => v === 'critical' ? 'bg-red-500' : v === 'high' ? 'bg-orange-500' : v === 'medium' ? 'bg-blue-500' : 'bg-gray-500';
  const hcBorder = (v: string) => v === 'critical' ? 'border-red-400' : v === 'high' ? 'border-orange-400' : v === 'medium' ? 'border-blue-400' : 'border-gray-300';
  const fmt = (n: number) => n >= 1000000 ? `$${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n.toFixed(0)}`;

  if (loading) return <p className="text-xs text-gray-500 text-center py-16">Loading portal…</p>;

  if (unauthorized) {
    return (
      <div className="max-w-[1600px] mx-auto px-4 py-16 text-center">
        <p className="text-lg font-semibold text-gray-900 mb-2">Access denied</p>
        <p className="text-xs text-gray-500 max-w-md mx-auto">
          Your organization is not authorized to view this client workspace. If you believe this is a mistake, contact your AskABD account manager.
        </p>
        <button
          onClick={async () => { await logout(); router.replace('/login'); }}
          className="mt-5 text-xs font-medium text-gray-600 hover:text-gray-900 border rounded-lg px-4 py-2 hover:bg-gray-50 transition"
        >
          Sign out
        </button>
      </div>
    );
  }

  const tabs = VALID_TABS;

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6">
      <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">AskABD Client Portal</p>
          <h1 className="text-lg font-bold text-gray-900">{clientName || 'Loading workspace…'}</h1>
          {clientId === 'demo-meridian-financial' && <span className="inline-block mt-1 text-[9px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded">DEMO — Fictional Data</span>}
        </div>
        <div className="relative flex-1 max-w-xs">
          <input
            value={searchQuery}
            onChange={e => runSearch(e.target.value)}
            placeholder="Search your workspace…"
            aria-label="Search your workspace"
            className="w-full border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
          {searchQuery.trim().length >= 2 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-20 max-h-80 overflow-y-auto">
              {searching ? (
                <p className="p-3 text-xs text-gray-400">Searching…</p>
              ) : searchResults.length === 0 ? (
                <p className="p-3 text-xs text-gray-400">No matching results found.</p>
              ) : searchResults.map(r => (
                <a key={`${r.type}-${r.id}`} href={r.url} className="block px-3 py-2 border-b last:border-0 hover:bg-gray-50">
                  <p className="text-xs text-gray-900">{r.name}</p>
                  <p className="text-[10px] text-gray-400">{r.module} · {r.type}{r.status ? ` · ${r.status}` : ''}</p>
                </a>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span title={`Workspace ID: ${clientId}`} className="text-[10px] text-gray-400 cursor-help">ⓘ</span>
          {/* Previously showed the raw internal lifecycle status enum
              (e.g. "recommendations-generated") directly to the customer —
              found during the 2026-08-22 global UX audit, same bug class
              already fixed on the Journey page. Now reuses the single
              shared statusMeta label so both pages always agree. */}
          {home && <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">{getCurrentStepInfo((home.lifecycle?.status || 'organization-created') as LifecycleStatus).label}</span>}
          {home && <span className="text-xs px-2.5 py-1 rounded-full bg-blue-600 text-white">{home.lifecycle?.progress}% complete</span>}
          <a href={`/client-portal/${clientId}/journey`} className="text-xs px-2.5 py-1 rounded-full bg-green-50 text-green-700 hover:bg-green-100 transition">View Journey →</a>
          {notifications.filter(n => n.unread).length > 0 && <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-600 text-white">🔔 {notifications.filter(n => n.unread).length}</span>}
          <button onClick={loadData} className="text-xs text-gray-500 hover:text-gray-800 border rounded-lg px-2.5 py-1 transition">↻</button>
          <button onClick={async () => { await logout(); router.replace('/login'); }} className="text-xs text-gray-500 hover:text-gray-800 border rounded-lg px-2.5 py-1 transition">Sign out</button>
        </div>
      </div>

      {/* Executive Business Summary */}
      {home && tab === 'home' && (
        <div className="bg-white rounded-xl border p-4 mb-4">
          <p className="text-sm font-semibold text-gray-900 mb-1.5">
            {home.lifecycle?.progress === 100 ? 'Your transformation is actively managed by AskABD.' : home.lifecycle?.progress >= 50 ? 'AskABD is progressing your transformation.' : 'AskABD is analyzing your environment.'}
          </p>
          <p className="text-xs text-gray-500 leading-relaxed">
            {home.problems?.total > 0 && `We identified ${home.problems.total} problem${home.problems.total > 1 ? 's' : ''} in your environment${home.problems.critical > 0 ? ` including ${home.problems.critical} critical issue${home.problems.critical > 1 ? 's' : ''} requiring attention` : ''}. `}
            {home.gaps?.open > 0 && `There are ${home.gaps.open} gap${home.gaps.open > 1 ? 's' : ''} between your current and target state. `}
            {home.financial?.realizedSavings > 0 && `So far, the transformation has realized $${(home.financial.realizedSavings / 1000).toFixed(0)}K in savings (${home.financial.benefitRealization}% of expected benefits). `}
            {home.financial?.realizedSavings === 0 && home.financial?.expectedSavings > 0 && `The expected annual savings opportunity is $${(home.financial.expectedSavings / 1000).toFixed(0)}K. `}
            {home.optimization?.openFindings > 0 && `${home.optimization.openFindings} optimization opportunit${home.optimization.openFindings > 1 ? 'ies have' : 'y has'} been detected. `}
          </p>
        </div>
      )}

      {/* Service Summary */}
      {home && tab === 'home' && (serviceCoverage || serviceRecs.length > 0) && (
        <div className="bg-white rounded-xl border p-4 mb-4">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-sm font-semibold text-gray-900">AskABD Services</span>
            <button onClick={() => { setRequestFormError(null); setRequestForm({ type: 'service', targetKey: '', targetLabel: '', description: '', priority: 'normal' }); }} className="text-[11px] text-purple-600 hover:text-purple-800 underline">+ Request a Service</button>
          </div>
          {serviceCoverage && (
            <div className="flex gap-4 text-xs mb-2.5 flex-wrap">
              <span className="text-green-600">● {serviceCoverage.overall?.enabled || 0} enabled</span>
              <span className="text-orange-600">● {serviceRecs.length} recommended</span>
              <span className="text-gray-500">{serviceCoverage.overall?.coverage || 0}% coverage</span>
            </div>
          )}
          {serviceRecs.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-400 mb-1">Recommended next:</p>
              {serviceRecs.slice(0, 3).map(r => (
                <div key={r.serviceId} className="text-xs text-gray-700 py-0.5 flex justify-between">
                  <span>{r.serviceName}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-semibold ${PRIORITY_CLASS[r.priority] || 'bg-gray-100 text-gray-600'}`}>{r.priority}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Commercial Summary */}
      {home && tab === 'home' && engagements.length > 0 && (
        <div className="bg-white rounded-xl border p-4 mb-4">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-sm font-semibold text-gray-900">Commercial Engagements</span>
            <a href={`/clients/${clientId}/engagements`} className="text-[11px] text-purple-600 hover:text-purple-800">View All →</a>
          </div>
          <div className="flex gap-4 text-xs flex-wrap">
            <span className="text-green-600">● {engagements.filter((e: any) => e.status === 'active').length} active</span>
            <span className="text-blue-600">● {engagements.filter((e: any) => e.status === 'proposed').length} proposed</span>
            <span className="text-gray-500">● {engagements.filter((e: any) => e.status === 'draft').length} draft</span>
            <span className="text-teal-600">● {engagements.filter((e: any) => e.status === 'completed').length} completed</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b flex-wrap">
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-3.5 py-2 text-xs font-medium rounded-t-lg transition ${tab === t ? 'bg-white border border-b-0 text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}{t === 'actions' && actions.length > 0 ? ` (${actions.length})` : ''}{t === 'notifications' && notifications.filter(n => n.unread).length > 0 ? ` (${notifications.filter(n => n.unread).length})` : ''}
          </button>
        ))}
      </div>

      {/* Home Tab */}
      {tab === 'home' && home && (
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
            <Stat label="Progress" value={`${home.lifecycle.progress}%`} color="text-blue-600" />
            <Stat label="Critical Problems" value={home.problems.critical} color="text-red-600" />
            <Stat label="Open Gaps" value={home.gaps.open} color="text-orange-600" />
            <Stat label="Realized Savings" value={fmt(home.financial.realizedSavings)} color="text-green-600" />
            <Stat label="Missing Requirements" value={home.requirements.missing} />
          </div>
          {/* Second summary row — added 2026-08-22 SDLC-completion pass. Every
              value below is derived from state this page already fetches
              (requests, serviceCoverage) — no new endpoint, no fabricated
              count. Open Incidents/Changes/Requests use the exact same
              "not completed, not rejected" openness definition the staff
              Requests page (requests/page.tsx) already uses. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Stat label="Open Incidents" value={requests.filter(r => r.requestType === 'incident' && r.status !== 'completed' && r.status !== 'rejected').length} color="text-red-600" />
            <Stat label="Open Changes" value={requests.filter(r => r.requestType === 'change' && r.status !== 'completed' && r.status !== 'rejected').length} color="text-amber-600" />
            <Stat label="Open Requests" value={requests.filter(r => r.status !== 'completed' && r.status !== 'rejected').length} color="text-purple-600" />
            <Stat label="Active Services" value={serviceCoverage?.overall?.enabled ?? 0} color="text-green-600" />
          </div>
          {actions.length > 0 && (
            <section className="bg-white rounded-xl border p-4 mb-4">
              <h3 className="text-sm font-semibold text-orange-600 mb-2.5">⚡ Action Required ({actions.length})</h3>
              <div className="space-y-1.5">
                {actions.slice(0, 5).map((a, i) => (
                  <div key={i} className={`bg-gray-50 rounded-md p-2.5 border-l-4 ${hcBorder(a.priority)}`}>
                    <p className="text-xs font-medium text-gray-900">{a.title}</p>
                    <p className="text-[11px] text-gray-500">{a.description}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <section className="bg-white rounded-xl border p-4">
              <h4 className="text-xs font-semibold text-gray-500 mb-2">Connectors</h4>
              <p className="text-sm text-gray-800">{home.connectors.connected}/{home.connectors.total} connected</p>
            </section>
            <section className="bg-white rounded-xl border p-4">
              <h4 className="text-xs font-semibold text-gray-500 mb-2">Transformations</h4>
              <p className="text-sm text-gray-800">{home.transformations.completed} completed / {home.transformations.total} total</p>
            </section>
          </div>
        </div>
      )}

      {/* Actions Tab */}
      {tab === 'actions' && (
        <section className="bg-white rounded-xl border overflow-hidden">
          {actions.length === 0 ? <p className="text-xs text-green-600 text-center py-6">✓ No actions required</p> : (
            <div className="divide-y">
              {actions.map((a, i) => (
                <div key={i} className="p-3.5 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-gray-900">{a.title}</p>
                    <p className="text-[11px] text-gray-500">{a.description}</p>
                  </div>
                  <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md text-white shrink-0 ${hc(a.priority)}`}>{a.priority}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Problems Tab */}
      {tab === 'problems' && (
        <section className="bg-white rounded-xl border overflow-hidden">
          {problems.length === 0 ? <p className="text-xs text-gray-400 text-center py-6">No problems identified yet</p> : (
            <div className="divide-y">
              {problems.map(p => (
                <div key={p.id} className="p-3.5">
                  <div className="flex justify-between gap-3">
                    <span className="text-xs font-medium text-gray-900">{p.title}</span>
                    <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md text-white shrink-0 ${hc(p.severity)}`}>{p.severity}</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">{p.domain} / {p.category} • Status: {p.status}</p>
                  {p.businessImpact && <p className="text-[11px] text-gray-500 mt-0.5">Impact: {p.businessImpact}</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Gaps Tab */}
      {tab === 'gaps' && (
        <section className="bg-white rounded-xl border overflow-hidden">
          {gaps.length === 0 ? <p className="text-xs text-gray-400 text-center py-6">No gaps identified yet</p> : (
            <div className="divide-y">
              {gaps.map(g => (
                <div key={g.id} className="p-3.5">
                  <div className="flex justify-between gap-3">
                    <span className="text-xs font-medium text-gray-900">{g.title}</span>
                    <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md text-white shrink-0 ${hc(g.severity)}`}>{g.severity}</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">Maturity: {g.currentMaturity} → {g.targetMaturity} • {g.status}</p>
                  {g.currentState && <p className="text-[11px] text-gray-500 mt-0.5">Current: {g.currentState.substring(0, 80)}</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Transformations Tab */}
      {tab === 'transformations' && (
        <section className="bg-white rounded-xl border overflow-hidden">
          {transformations.length === 0 ? <p className="text-xs text-gray-400 text-center py-6">No transformations planned yet</p> : (
            <div className="divide-y">
              {transformations.map(t => (
                <div key={t.id} className="p-3.5">
                  <div className="flex justify-between gap-3 mb-1">
                    <span className="text-sm font-semibold text-gray-900">{t.title}</span>
                    <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md shrink-0 ${t.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{t.status}</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-1">{t.description?.substring(0, 100)}</p>
                  <div className="flex gap-3 text-[11px] text-gray-400 flex-wrap">
                    {t.investment && <span>Investment: {fmt(t.investment)}</span>}
                    {t.expectedSavings && <span>Expected: {fmt(t.expectedSavings)}/yr</span>}
                    {t.duration && <span>Duration: {t.duration}</span>}
                  </div>
                  {t.outcome && <span className="inline-block mt-1.5 text-[11px] px-2 py-1 bg-gray-50 rounded">Benefit: {t.outcome.benefitRealization?.toFixed(0) || '?'}% | Health: {t.outcome.health}</span>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Financial Tab */}
      {tab === 'financial' && financial && (
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            <Stat label="Investment" value={fmt(financial.investment)} />
            <Stat label="Expected Savings" value={fmt(financial.expectedSavings)} color="text-blue-600" />
            <Stat label="Realized" value={fmt(financial.realizedSavings)} color="text-green-600" />
            <Stat label="Missed" value={fmt(financial.missedSavings)} color="text-red-600" />
            <Stat label="ROI" value={`${financial.avgRoi}%`} />
            <Stat label="Benefit Realized" value={`${financial.benefitRealization}%`} />
          </div>
          <div className="bg-white rounded-xl border p-3 text-[11px] text-gray-500">
            Data source: {financial.dataSource}. Values are {financial.dataSource === 'measured' ? 'based on actual transformation outcomes' : 'estimated based on assessment data'}.
          </div>
        </div>
      )}

      {/* Optimization Tab */}
      {tab === 'optimization' && optimization && (
        <div className="space-y-4">
          {optimization.findings.length > 0 && (
            <section className="bg-white rounded-xl border p-4">
              <h3 className="text-sm font-semibold text-orange-600 mb-2.5">Optimization Findings</h3>
              <div className="space-y-1.5">
                {optimization.findings.map((f: any) => (
                  <div key={f.id} className={`bg-gray-50 rounded-md p-2.5 border-l-4 ${hcBorder(f.severity)}`}>
                    <p className="text-xs font-medium text-gray-900">{f.title}</p>
                    {f.variancePct != null && <p className="text-[11px] text-gray-400">Variance: {f.variancePct.toFixed(1)}% (baseline: {f.baselineValue} → actual: {f.actualValue})</p>}
                    {f.recommendation && <p className="text-[11px] text-blue-600 mt-0.5">💡 {f.recommendation}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}
          {optimization.metrics.length > 0 && (
            <section className="bg-white rounded-xl border p-4">
              <h3 className="text-sm font-semibold text-gray-500 mb-2.5">Active Metrics</h3>
              <div className="space-y-1">
                {optimization.metrics.map((m: any) => (
                  <div key={m.id} className="text-xs text-gray-600 flex justify-between py-1">
                    <span>{m.name} ({m.category})</span>
                    <span className="text-gray-400">{m.targetValue != null ? `Target: ${m.targetValue} ${m.unit}` : m.unit}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          {optimization.findings.length === 0 && optimization.metrics.length === 0 && (
            <p className="bg-white rounded-xl border p-6 text-center text-xs text-gray-400">No optimization data available yet</p>
          )}
        </div>
      )}

      {/* Notifications Tab */}
      {tab === 'notifications' && (
        <section className="bg-white rounded-xl border overflow-hidden">
          {notifications.length === 0 ? <p className="text-xs text-gray-400 text-center py-6">No notifications</p> : (
            <div className="divide-y">
              {notifications.map(n => (
                <div key={n.id} className={`p-3.5 ${n.unread ? 'bg-blue-50/40' : ''}`}>
                  <div className="flex justify-between gap-3">
                    <span className={`text-xs text-gray-900 ${n.unread ? 'font-semibold' : ''}`}>{n.subject}</span>
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md text-white shrink-0 ${hc(n.priority)}`}>{n.priority}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">{n.summary}</p>
                  <p className="text-[10px] text-gray-400 mt-1">{new Date(n.createdAt).toLocaleString('en-AU')} • {n.phase}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Timeline Tab */}
      {tab === 'timeline' && (
        <section className="bg-white rounded-xl border p-4">
          {timeline.length === 0 ? <p className="text-xs text-gray-400 text-center">No activity recorded yet</p> : (
            <div className="divide-y">
              {timeline.map((e, i) => (
                <div key={i} className="flex gap-3 py-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-800">{e.description}</p>
                    <p className="text-[10px] text-gray-400">{new Date(e.timestamp).toLocaleString('en-AU')}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Team & Notes Tab — real, only ever items a real staff member explicitly
          marked customer-visible (crm-service.ts's listCustomerVisible*, filtered
          at the query level). Never shows internal-only CRM data. */}
      {tab === 'team' && (
        <div className="space-y-4">
          <section className="bg-white rounded-xl border p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-2.5">Your AskABD Contacts</h3>
            {crmContacts.length === 0 ? (
              <p className="text-xs text-gray-400">No contacts have been shared with you yet.</p>
            ) : (
              <div className="divide-y">
                {crmContacts.map((c: any) => (
                  <div key={c.id} className="py-2">
                    <p className="text-xs font-medium text-gray-900">{c.name}{c.title ? ` — ${c.title}` : ''}</p>
                    {c.email && <p className="text-[11px] text-purple-600">{c.email}</p>}
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="bg-white rounded-xl border p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-2.5">Notes from AskABD</h3>
            {crmNotes.length === 0 ? (
              <p className="text-xs text-gray-400">No notes have been shared with you yet.</p>
            ) : (
              <div className="divide-y">
                {crmNotes.map((n: any) => (
                  <div key={n.id} className="py-2">
                    <p className="text-xs text-gray-800">{n.body}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{new Date(n.createdAt).toLocaleString('en-AU')}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="bg-white rounded-xl border p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-2.5">Action Items</h3>
            {crmTasks.length === 0 ? (
              <p className="text-xs text-gray-400">No action items have been shared with you yet.</p>
            ) : (
              <div className="divide-y">
                {crmTasks.map((t: any) => (
                  <div key={t.id} className="py-2 flex justify-between gap-3">
                    <div>
                      <p className="text-xs text-gray-800">{t.title}</p>
                      {t.dueDate && <p className="text-[10px] text-gray-400">Due {new Date(t.dueDate).toLocaleDateString('en-AU')}</p>}
                    </div>
                    <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md h-fit shrink-0 ${t.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{t.status}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Requests Tab — real, persisted (client-request-service.ts). Never a
          localStorage-only workflow: every row here round-trips through the
          real API and survives a refresh. */}
      {tab === 'requests' && (
        <div>
          <div className="flex gap-2 mb-4 flex-wrap">
            <button onClick={() => { setRequestFormError(null); setRequestForm({ type: 'service', targetKey: '', targetLabel: '', description: '', priority: 'normal' }); }} className="text-xs font-semibold px-3.5 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition">+ Request a Service</button>
            <button onClick={() => { setRequestFormError(null); setRequestForm({ type: 'connector', targetKey: '', targetLabel: '', description: '', priority: 'normal' }); }} className="text-xs font-semibold px-3.5 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition">+ Request a Connector / Source</button>
            <button onClick={() => { setRequestFormError(null); setRequestForm({ type: 'support', targetKey: '', targetLabel: '', description: '', priority: 'normal' }); }} className="text-xs font-semibold px-3.5 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition">+ Request Support</button>
            {/* Incident/Change added 2026-08-22 — real post-delivery operations support,
                reusing the exact same request pipeline (see client-request-service.ts). */}
            <button onClick={() => { setRequestFormError(null); setRequestForm({ type: 'incident', targetKey: '', targetLabel: '', description: '', priority: 'high' }); }} className="text-xs font-semibold px-3.5 py-2 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 transition">🚨 Report an Incident</button>
            <button onClick={() => { setRequestFormError(null); setRequestForm({ type: 'change', targetKey: '', targetLabel: '', description: '', priority: 'normal' }); }} className="text-xs font-semibold px-3.5 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition">+ Request a Change</button>
          </div>
          <section className="bg-white rounded-xl border p-4">
            {requests.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">No requests yet. Need a service, a data source connected, or help with something? Use the buttons above.</p>
            ) : (
              <div className="divide-y">
                {requests.map((r: any) => (
                  <div key={r.id} className="py-3">
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <span className="text-[10px] text-gray-400 uppercase">{r.requestType}</span>
                        <p className="text-xs font-medium text-gray-900">{r.targetLabel || r.description.slice(0, 50)}</p>
                      </div>
                      <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-md border shrink-0 whitespace-nowrap ${REQUEST_STATUS_CLASS[r.status] || REQUEST_STATUS_CLASS.requested}`}>{REQUEST_STATUS_LABEL[r.status] || r.status}</span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1">{r.description}</p>
                    {r.resolutionNotes && <p className="text-[11px] text-green-600 mt-1">AskABD: {r.resolutionNotes}</p>}
                    <p className="text-[10px] text-gray-400 mt-1">Submitted {new Date(r.createdAt).toLocaleString('en-AU')}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Request submission modal */}
      {requestForm && (
        <div role="dialog" aria-modal="true" aria-label="Submit a request" className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setRequestForm(null)}>
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              {requestForm.type === 'service' ? 'Request a Service'
                : requestForm.type === 'connector' ? 'Request a Connector / Source'
                : requestForm.type === 'incident' ? 'Report an Incident'
                : requestForm.type === 'change' ? 'Request a Change'
                : 'Request Support'}
            </h3>
            <p className="text-[11px] text-gray-500 mb-4">
              AskABD staff will review this request. Nothing is enabled automatically.
            </p>
            {requestFormError && (
              <div role="alert" className="mb-3.5 px-3 py-2.5 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
                {requestFormError}
              </div>
            )}
            {requestForm.type === 'service' && (
              <>
                <label className="block text-xs text-gray-500 mb-1">Which service?</label>
                <select
                  value={requestForm.targetKey}
                  onChange={e => {
                    const svc = availableServices.find(s => s.serviceId === e.target.value);
                    setRequestForm({ ...requestForm, targetKey: e.target.value, targetLabel: svc?.name || '' });
                  }}
                  className="w-full border rounded-md px-3 py-2 text-xs mb-3"
                >
                  <option value="">Select a service…</option>
                  {availableServices.map(s => <option key={s.serviceId} value={s.serviceId}>{s.name}</option>)}
                </select>
              </>
            )}
            {requestForm.type === 'connector' && (
              <>
                <label className="block text-xs text-gray-500 mb-1">Which system, environment, or data source?</label>
                <input
                  value={requestForm.targetLabel}
                  onChange={e => setRequestForm({ ...requestForm, targetKey: e.target.value.toLowerCase().replace(/\s+/g, '-'), targetLabel: e.target.value })}
                  placeholder="e.g. Snowflake, our internal HR system"
                  className="w-full border rounded-md px-3 py-2 text-xs mb-3"
                />
              </>
            )}
            {(requestForm.type === 'incident' || requestForm.type === 'change') && (
              <>
                <label className="block text-xs text-gray-500 mb-1">{requestForm.type === 'incident' ? 'Severity' : 'Priority'}</label>
                <select
                  value={requestForm.priority}
                  onChange={e => setRequestForm({ ...requestForm, priority: e.target.value as typeof requestForm.priority })}
                  className="w-full border rounded-md px-3 py-2 text-xs mb-3"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent{requestForm.type === 'incident' ? ' — service down / major impact' : ''}</option>
                </select>
              </>
            )}
            <label className="block text-xs text-gray-500 mb-1">Description</label>
            <textarea
              value={requestForm.description}
              onChange={e => setRequestForm({ ...requestForm, description: e.target.value })}
              placeholder="Tell AskABD what you need and why."
              rows={4}
              className="w-full border rounded-md px-3 py-2 text-xs resize-y"
            />
            <div className="flex gap-2 mt-4 justify-end">
              <button onClick={() => setRequestForm(null)} className="text-xs font-medium text-gray-600 hover:text-gray-900 border rounded-lg px-3.5 py-2 hover:bg-gray-50 transition">Cancel</button>
              <button
                onClick={submitRequest}
                disabled={submittingRequest || !requestForm.description.trim()}
                className="text-xs font-semibold px-3.5 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:bg-gray-300 transition"
              >
                {submittingRequest ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
