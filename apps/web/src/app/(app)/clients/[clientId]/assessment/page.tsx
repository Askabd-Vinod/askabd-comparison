'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Assessment {
  id: string;
  client_id: string;
  domain?: string;
  status: string;
  risk_score: number;
  complexity_score: number;
  findings: any[];
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  evidence: string[];
}

// Current State Assessment — the six domains beyond Infrastructure (roadmap
// Phase 2 item 2, migration 043, assessment-service.ts). Infrastructure
// assessment above is discovery-run-driven; these six assess the client's
// own real onboarding record (departments/capabilities/tech inventory/
// connectors/compliance/defects/monitoring) — no discovery run required.
const DOMAINS = [
  { id: 'business', label: 'Business' }, { id: 'application', label: 'Application' },
  { id: 'data', label: 'Data' }, { id: 'security', label: 'Security' },
  { id: 'quality', label: 'Quality' }, { id: 'operations', label: 'Operations' },
] as const;

function DomainAssessmentCard({ clientId, domain, label }: { clientId: string; domain: string; label: string }) {
  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';
  const [latest, setLatest] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/v1/oc/assessment/${clientId}/domain/${domain}`);
      if (res.ok) {
        const data = await res.json();
        setLatest(data.assessments?.[0] || null);
      }
    } catch { /* leave latest as-is; real fetch failure surfaces via unchanged state */ }
  }, [clientId, domain, API]);

  useEffect(() => { load(); }, [load]);

  async function run() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/v1/oc/assessment/domain/start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, domain }),
      });
      if (res.ok) await load();
    } finally { setLoading(false); }
  }

  const findings: any[] = latest?.findings || [];
  const nonInfoCount = findings.filter(f => f.severity !== 'info').length;

  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-gray-900">{label}</p>
        <button onClick={run} disabled={loading} className="text-[10px] font-semibold text-purple-600 hover:text-purple-800 disabled:text-gray-300">
          {loading ? 'Running…' : latest ? 'Re-run' : 'Run'}
        </button>
      </div>
      {!latest ? (
        <p className="text-[10px] text-gray-400">Not yet assessed.</p>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${nonInfoCount > 0 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
              {findings.length} finding{findings.length !== 1 ? 's' : ''}
            </span>
            <span className="text-[9px] text-gray-400">{new Date(latest.completed_at || latest.started_at).toLocaleString('en-AU')}</span>
          </div>
          <button onClick={() => setExpanded(e => !e)} className="text-[10px] text-purple-600 hover:text-purple-800">
            {expanded ? 'Hide details' : 'Show details'}
          </button>
          {expanded && (
            <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
              {findings.map((f: any, i: number) => (
                <div key={i} className={`p-2 rounded border text-[10px] ${f.severity === 'critical' || f.severity === 'high' ? 'border-red-200 bg-red-50' : f.severity === 'medium' ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[8px] font-bold uppercase px-1 py-0.5 rounded ${f.severity === 'critical' || f.severity === 'high' ? 'bg-red-200 text-red-700' : f.severity === 'medium' ? 'bg-amber-200 text-amber-700' : 'bg-gray-200 text-gray-600'}`}>{f.severity}</span>
                    <p className="font-medium text-gray-800">{f.title}</p>
                  </div>
                  <p className="text-gray-500 mt-0.5">{f.evidence}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function AssessmentProgressPage() {
  const params = useParams();
  const clientId = params.clientId as string;
  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [discoveryRuns, setDiscoveryRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  // Real defect found (and fixed here) via technology_adapter_test_1's
  // follow-on static review: the exact same bug class already found and
  // fixed live in clients/[clientId]/discovery/page.tsx during
  // discovery_test_1 — a single shared `error` state was written by two
  // unrelated things: (1) startAssessment()'s real "no discovery run" /
  // "failed to start" failures, and (2) fetchData()'s own network-failure
  // path, polled automatically every 5 seconds. fetchData()'s SUCCESS path
  // unconditionally called setError(null), which would silently wipe a
  // real, still-true startAssessment() error within one 5s tick, since the
  // GET calls it makes succeed regardless of whether the real blocker
  // (missing discovery run) was resolved. Fixed by splitting into two
  // independently-owned states, exactly matching the discovery page's fix.
  const [startError, setStartError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [assessRes, discRes] = await Promise.all([
        fetch(`${API}/api/v1/oc/assessment/${clientId}`),
        fetch(`${API}/api/v1/oc/discovery/${clientId}`),
      ]);
      if (assessRes.ok) {
        const data = await assessRes.json();
        setAssessments(data.assessments || []);
      }
      if (discRes.ok) {
        const data = await discRes.json();
        setDiscoveryRuns(data.runs || []);
      }
      setLoadError(null);
    } catch {
      setLoadError('Unable to load assessment data. Retrying...');
    }
    setLoading(false);
    setLastRefresh(new Date().toLocaleTimeString());
  }, [clientId, API]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  async function startAssessment() {
    const latestDiscovery = discoveryRuns[0];
    if (!latestDiscovery) {
      setStartError('No discovery run found. Complete discovery first.');
      return;
    }
    setStarting(true);
    setStartError(null);
    try {
      const res = await fetch(`${API}/api/v1/oc/assessment/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, discoveryRunId: latestDiscovery.id }),
      });
      if (res.ok) {
        await fetchData();
      } else {
        const d = await res.json().catch(() => null);
        setStartError(d?.error || 'Failed to start assessment');
      }
    } catch {
      setStartError('Service unavailable. Please try again.');
    }
    setStarting(false);
  }

  // Real defect found and fixed live during technology_adapter_test_1's
  // follow-on assessment_test_1: `assessments` from GET /assessment/:clientId
  // contains BOTH the top-level "Infrastructure" pipeline assessment
  // (assessment-service.ts always stores it as `domain: 'infrastructure'`)
  // AND the six separate per-domain "Current State Assessment" cards below
  // (business/application/data/security/quality/operations), all in the
  // same oc_assessments table, ordered by recency with no filter. Taking
  // `assessments[0]` unconditionally meant running ANY domain card after
  // the top pipeline silently swapped the top "Assessment Progress"/
  // "Assessment Results" summary to show that domain's own narrower
  // numbers (e.g. Operations' "Risk Score: 8, Monitoring gaps") under a
  // heading that visually claims to track the full 6-step Infrastructure
  // pipeline (Load Discovery Data/Security/Performance/Compatibility/Risk/
  // Report) — real, correct data, wrong section. Fixed by scoping the top
  // summary to the real `domain: 'infrastructure'` assessment only; each
  // domain card already independently fetches and displays its own latest
  // assessment via its own `domain`-scoped endpoint, unaffected by this fix.
  const infrastructureAssessments = assessments.filter(a => a.domain === 'infrastructure');
  const latest = infrastructureAssessments[0];
  const isRunning = latest?.status === 'running' || latest?.status === 'in_progress';
  const isComplete = latest?.status === 'completed';
  const isFailed = latest?.status === 'failed';

  const assessmentSteps = [
    { id: 'init', label: 'Load Discovery Data', status: latest ? 'complete' : 'pending' },
    { id: 'security', label: 'Security Assessment', status: isComplete ? 'complete' : latest ? 'running' : 'pending' },
    { id: 'performance', label: 'Performance Assessment', status: isComplete ? 'complete' : 'pending' },
    { id: 'compatibility', label: 'Compatibility Assessment', status: isComplete ? 'complete' : 'pending' },
    { id: 'risk', label: 'Risk Analysis', status: isComplete ? 'complete' : 'pending' },
    { id: 'report', label: 'Generate Assessment Report', status: isComplete ? 'complete' : 'pending' },
  ];

  const completedSteps = assessmentSteps.filter(s => s.status === 'complete').length;
  const progressPercent = Math.round((completedSteps / assessmentSteps.length) * 100);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border p-5">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-[9px] text-gray-400 uppercase font-semibold tracking-wide">Real-Time Assessment</p>
            <h2 className="text-lg font-bold text-gray-900">Assessment Progress</h2>
            <p className="text-xs text-gray-500 mt-0.5">Analyzing security, performance, compatibility, and risks</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-purple-600">{progressPercent}%</p>
            <p className="text-[9px] text-gray-400">
              {isRunning ? 'IN PROGRESS' : isComplete ? 'COMPLETE' : isFailed ? 'FAILED' : 'NOT STARTED'}
            </p>
          </div>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-3">
          <div className={`h-full rounded-full transition-all duration-1000 ${isComplete ? 'bg-green-500' : isFailed ? 'bg-red-500' : 'bg-purple-500'}`} style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-[9px] text-gray-400">{completedSteps}/{assessmentSteps.length} steps complete</p>
          <p className="text-[9px] text-gray-400">Updated {lastRefresh || '—'}</p>
        </div>
      </div>

      {/* Assessment Steps */}
      <div className="bg-white rounded-xl border p-5">
        <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-4">Assessment Steps</h3>
        <div className="space-y-3">
          {assessmentSteps.map((step, idx) => (
            <div key={step.id} className={`flex items-center gap-3 p-3 rounded-lg border ${step.status === 'complete' ? 'border-green-200 bg-green-50/30' : step.status === 'running' ? 'border-purple-200 bg-purple-50/30' : 'border-gray-100'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${step.status === 'complete' ? 'bg-green-500 text-white' : step.status === 'running' ? 'bg-purple-500 text-white animate-pulse' : 'bg-gray-200 text-gray-400'}`}>
                {step.status === 'complete' ? '✓' : step.status === 'running' ? '⟳' : idx + 1}
              </div>
              <p className={`text-xs font-medium flex-1 ${step.status === 'complete' ? 'text-green-700' : step.status === 'running' ? 'text-purple-700' : 'text-gray-500'}`}>{step.label}</p>
              <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded ${step.status === 'complete' ? 'bg-green-100 text-green-700' : step.status === 'running' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-400'}`}>
                {step.status === 'complete' ? 'DONE' : step.status === 'running' ? 'RUNNING' : 'PENDING'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Results */}
      {latest && (
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-4">Assessment Results</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-red-50 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-red-600">{latest.risk_score || 0}</p>
              <p className="text-[9px] text-red-500">Risk Score /100</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-amber-600">{latest.complexity_score || 0}</p>
              <p className="text-[9px] text-amber-500">Complexity /100</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-purple-600">{latest.findings?.length || 0}</p>
              <p className="text-[9px] text-purple-500">Findings</p>
            </div>
            <div className={`${latest.status === 'completed' ? 'bg-green-50' : 'bg-gray-50'} rounded-lg p-3 text-center`}>
              <p className={`text-lg font-bold ${latest.status === 'completed' ? 'text-green-600' : 'text-gray-600'}`}>{latest.status}</p>
              <p className="text-[9px] text-gray-500">Status</p>
            </div>
          </div>

          {/* Findings */}
          {latest.findings?.length > 0 && (
            <div className="mt-4 pt-3 border-t">
              <p className="text-[10px] font-semibold text-gray-700 mb-2">Findings ({latest.findings.length})</p>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {latest.findings.map((f: any, i: number) => (
                  <div key={i} className={`p-2 rounded border ${f.severity === 'critical' ? 'border-red-200 bg-red-50' : f.severity === 'high' ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-[8px] font-bold uppercase px-1 py-0.5 rounded ${f.severity === 'critical' ? 'bg-red-200 text-red-700' : f.severity === 'high' ? 'bg-amber-200 text-amber-700' : 'bg-gray-200 text-gray-600'}`}>{f.severity || 'info'}</span>
                      <p className="text-[10px] font-medium text-gray-800">{f.title || f.category || 'Finding'}</p>
                    </div>
                    {f.description && <p className="text-[9px] text-gray-600 mt-1 ml-10">{f.description}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Evidence */}
          {latest.evidence?.length > 0 && (
            <div className="mt-4 pt-3 border-t">
              <p className="text-[10px] font-semibold text-gray-700 mb-2">Evidence Trail</p>
              <div className="space-y-1">
                {latest.evidence.map((e: string, i: number) => (
                  <p key={i} className="text-[10px] text-gray-600 flex items-start gap-2"><span className="text-green-500 shrink-0">✓</span>{e}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Current State Assessment — the six domains beyond Infrastructure */}
      <div className="bg-white rounded-xl border p-5">
        <p className="text-[9px] text-gray-400 uppercase font-semibold tracking-wide">Current State Assessment</p>
        <h3 className="text-sm font-bold text-gray-900 mb-1">Beyond Infrastructure</h3>
        <p className="text-xs text-gray-500 mb-4">Real, evidence-based assessment of this client's own recorded profile — no discovery run required.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {DOMAINS.map(d => <DomainAssessmentCard key={d.id} clientId={clientId} domain={d.id} label={d.label} />)}
        </div>
      </div>

      {/* No Assessment Yet */}
      {!latest && !loading && (
        <div className="bg-white rounded-xl border p-5 text-center">
          <div className="w-14 h-14 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">📊</span>
          </div>
          <p className="text-sm font-semibold text-gray-800">No Assessment Run Yet</p>
          <p className="text-xs text-gray-500 mt-1">Start assessment to analyze the discovered environment.</p>
          {discoveryRuns.length > 0 && (
            <p className="text-[10px] text-green-600 mt-2">✓ Discovery completed — {discoveryRuns[0].resources_found} resources available for assessment</p>
          )}
          {startError && (
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-left">
              <p className="text-xs font-semibold text-amber-700">⚠ {startError}</p>
            </div>
          )}
          <button onClick={startAssessment} disabled={starting || discoveryRuns.length === 0} className="mt-4 text-sm font-semibold bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white px-5 py-2.5 rounded-lg transition">
            {starting ? 'Starting...' : 'Start Assessment →'}
          </button>
        </div>
      )}

      {/* Error loading assessment data (fetchData's own failure — independent of startAssessment's) */}
      {loadError && latest && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-xs text-red-700">{loadError}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Link href={`/clients/${clientId}/lifecycle`} className="text-xs font-medium text-gray-600 hover:text-gray-900 border rounded-lg px-4 py-2 hover:bg-gray-50 transition">
          ← Back to Lifecycle
        </Link>
        <Link href={`/clients/${clientId}/discovery`} className="text-xs font-medium text-gray-600 hover:text-gray-900 border rounded-lg px-4 py-2 hover:bg-gray-50 transition">
          View Discovery
        </Link>
        {isComplete && (
          <button onClick={async () => {
            try {
              await fetch(`${API}/api/v1/oc/recommendations/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, assessmentId: latest.id }),
              });
            } catch {}
            window.location.href = `/clients/${clientId}/lifecycle`;
          }} className="text-xs font-semibold bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition">
            Generate Recommendations →
          </button>
        )}
        <button onClick={fetchData} className="text-xs text-purple-600 hover:text-purple-800 font-medium ml-auto">
          ↻ Refresh Now
        </button>
      </div>
    </div>
  );
}
