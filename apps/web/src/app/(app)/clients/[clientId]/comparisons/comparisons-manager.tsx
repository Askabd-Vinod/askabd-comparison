'use client';
import { Fragment, useId, useState } from 'react';
import { Action } from '../../../../components/button';
import type { DatabaseConnection } from '../../../../components/database-connections-manager';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

// The real, reusable 9-state classification model (Approved Baseline
// directive, migration 053) — a difference is not automatically a
// defect. The 5 baseline-aware statuses only ever appear when a real
// baseline was actually consulted for a key; without one, findings keep
// using the original 5 (match/mismatch/missing/extra/unknown).
export type ComparisonObjectStatus =
  | 'match' | 'mismatch' | 'missing' | 'extra' | 'unknown'
  | 'expected_difference' | 'approved_override' | 'approved_exception' | 'unapproved_difference' | 'not_assessed';
export type DisplaySeverity = 'red' | 'orange' | 'green' | 'neutral';
export interface ComparisonObjectResult {
  objectType: string; name: string; status: ComparisonObjectStatus; leftDetail: string; rightDetail: string;
  baselineValue?: string; overrideReason?: string; overrideApprovedBy?: string; overrideApprovedAt?: string;
  // Real, dynamic, environment-aware status line — "Missing in Staging",
  // never "Missing on Left/Right" — see the "BIDIRECTIONAL COMPARISON UI"
  // directive. Computed server-side from the ACTUAL environment names of
  // this run (see ComparisonRun.leftEnvironmentLabel/rightEnvironmentLabel).
  displayIcon: string; displayText: string; displaySeverity: DisplaySeverity;
}
export interface ComparisonSummary {
  total: number; match: number; mismatch: number; missing: number; extra: number; unknown: number;
  expectedDifference: number; approvedOverride: number; approvedException: number; unapprovedDifference: number; notAssessed: number;
}
export interface ComparisonRun {
  id: string; clientId: string; comparisonType: 'database_schema' | 'configuration'; leftLabel: string; rightLabel: string;
  leftConnectionId: string | null; rightConnectionId: string | null;
  leftSnapshotId: string | null; rightSnapshotId: string | null;
  baselineId: string | null; baselineVersion: string | null;
  /** Real environment display names for this run's two sides, e.g. "Production"/"Staging"/"UAT" — never hardcoded. */
  leftEnvironmentLabel: string | null; rightEnvironmentLabel: string | null;
  status: 'running' | 'completed' | 'failed';
  results: ComparisonObjectResult[]; summary: ComparisonSummary; errorMessage: string | null;
  createdBy: string | null; createdAt: string; completedAt: string | null;
}
export interface ConfigurationSnapshot {
  id: string; clientId: string; name: string; environment: string; config: Record<string, string>;
  source: 'manual'; createdBy: string | null; createdAt: string; updatedAt: string;
}
export interface ConfigurationBaseline {
  id: string; clientId: string; name: string; version: string; description: string; owner: string | null;
  status: 'draft' | 'approved' | 'deprecated'; approvedBy: string | null; approvedAt: string | null;
  classification: string; environmentScope: string[]; applicationScope: string;
  rules: Record<string, { approvedValue?: string; expectedToVaryByEnvironment?: boolean; overrides?: Record<string, { value: string; reason: string; approvedBy: string; approvedAt: string }> }>;
  createdBy: string | null; createdAt: string; updatedAt: string;
}

// Same icon+label discipline as evidence-status.tsx / QualityBadge elsewhere in
// this app — never color alone.
const STATUS_META: Record<ComparisonRun['status'], { icon: string; label: string; className: string }> = {
  running: { icon: '…', label: 'Running', className: 'text-blue-700 bg-blue-50 border-blue-200' },
  completed: { icon: '✓', label: 'Completed', className: 'text-green-700 bg-green-50 border-green-200' },
  failed: { icon: '✕', label: 'Failed', className: 'text-red-700 bg-red-50 border-red-200' },
};

// Exact icons per the directive's own Section 43 "UI DISPLAY" spec — this
// distinction is explicitly mandatory, not a stylistic choice.
const OBJECT_META: Record<ComparisonObjectStatus, { icon: string; label: string; className: string }> = {
  match: { icon: '✓', label: 'Match', className: 'text-green-700 bg-green-50 border-green-200' },
  expected_difference: { icon: '✓', label: 'Expected Difference', className: 'text-teal-700 bg-teal-50 border-teal-200' },
  approved_override: { icon: '✓', label: 'Approved Override', className: 'text-blue-700 bg-blue-50 border-blue-200' },
  approved_exception: { icon: '✓', label: 'Approved Exception', className: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
  unapproved_difference: { icon: '⚠', label: 'Unapproved Difference', className: 'text-amber-700 bg-amber-50 border-amber-200' },
  missing: { icon: '✕', label: 'Missing', className: 'text-orange-700 bg-orange-50 border-orange-200' },
  mismatch: { icon: '✕', label: 'Mismatch', className: 'text-red-700 bg-red-50 border-red-200' },
  extra: { icon: '⚠', label: 'Extra', className: 'text-purple-700 bg-purple-50 border-purple-200' },
  not_assessed: { icon: '?', label: 'Not Assessed', className: 'text-gray-500 bg-gray-50 border-gray-200' },
  unknown: { icon: '?', label: 'Unknown', className: 'text-gray-500 bg-gray-50 border-gray-200' },
};

// Only these statuses can real-world be turned into an "Approved
// Exception" — a genuinely raw, unapproved finding. Never offered on a
// row that's already match/approved/expected — there is nothing to except.
const EXCEPTIONABLE: ComparisonObjectStatus[] = ['mismatch', 'unapproved_difference'];

function StatusBadge({ status }: { status: ComparisonRun['status'] }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-md border ${meta.className}`}>
      <span aria-hidden="true">{meta.icon}</span>{meta.label}
    </span>
  );
}

// Traffic-light severity, real and fixed per finding — never dependent on
// which physical column an environment happens to sit in (see
// buildDisplayStatus() server-side). Icon+text are always shown together,
// never color alone.
const SEVERITY_CLASSNAME: Record<DisplaySeverity, string> = {
  red: 'text-red-700 bg-red-50 border-red-200',
  orange: 'text-orange-700 bg-orange-50 border-orange-200',
  green: 'text-green-700 bg-green-50 border-green-200',
  neutral: 'text-gray-500 bg-gray-50 border-gray-200',
};

/** Renders the real, dynamic, environment-aware status line the server
 * already computed — e.g. "🔴 Missing in Staging" — never a generic
 * "Missing on Left/Right" the user would have to mentally translate. */
function ObjectBadge({ icon, text, severity }: { icon: string; text: string; severity: DisplaySeverity }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded border ${SEVERITY_CLASSNAME[severity]}`}>
      <span aria-hidden="true">{icon}</span>{text}
    </span>
  );
}

/** "Mark as Intentional" / "Request Exception" — creates a real, traceable
 * exception record against one specific finding (never fabricates a new run,
 * reclassifies the SAME run's stored result in place — see
 * applyExceptionToRun on the backend). The original finding stays visible
 * as an approved exception, not hidden. */
function ExceptionForm({ clientId, runId, configKey, onDone, onCancel }: { clientId: string; runId: string; configKey: string; onDone: (run: ComparisonRun) => void; onCancel: () => void }) {
  const [reason, setReason] = useState('');
  const [owner, setOwner] = useState('');
  const [approver, setApprover] = useState('');
  const [businessJustification, setBusinessJustification] = useState('');
  const [riskAcceptance, setRiskAcceptance] = useState('');
  const [mitigation, setMitigation] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [reviewDate, setReviewDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) { setError('A reason is required — this becomes part of the permanent audit trail.'); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/comparisons/${runId}/exceptions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configKey, reason: reason.trim(),
          owner: owner.trim() || undefined, approver: approver.trim() || undefined,
          businessJustification: businessJustification.trim() || undefined, riskAcceptance: riskAcceptance.trim() || undefined,
          mitigation: mitigation.trim() || undefined, expiresAt: expiresAt || undefined, reviewDate: reviewDate || undefined,
        }),
      });
      if (!res.ok) { const body = await res.json().catch(() => ({})); setError(body?.error?.message || 'Could not record this exception.'); return; }
      const body = await res.json();
      onDone(body.run);
    } catch { setError('Could not reach the server. Please try again.'); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="bg-indigo-50 border border-indigo-200 rounded-md p-3 space-y-2">
      <p className="text-[10px] font-semibold text-indigo-800">Mark "{configKey}" as an Approved Exception</p>
      <p className="text-[9px] text-indigo-600">This does not hide the finding — it stays traceable, shown as an approved exception with this record attached.</p>
      <div>
        <label className="block text-[9px] font-medium text-gray-600 mb-0.5">Reason *</label>
        <input value={reason} onChange={e => setReason(e.target.value)} required placeholder="e.g. Higher production workload" className="w-full border rounded-md px-2 py-1 text-[11px]" />
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        <div>
          <label className="block text-[9px] font-medium text-gray-600 mb-0.5">Owner</label>
          <input value={owner} onChange={e => setOwner(e.target.value)} className="w-full border rounded-md px-2 py-1 text-[11px]" />
        </div>
        <div>
          <label className="block text-[9px] font-medium text-gray-600 mb-0.5">Approver</label>
          <input value={approver} onChange={e => setApprover(e.target.value)} className="w-full border rounded-md px-2 py-1 text-[11px]" />
        </div>
      </div>
      <div>
        <label className="block text-[9px] font-medium text-gray-600 mb-0.5">Business justification</label>
        <input value={businessJustification} onChange={e => setBusinessJustification(e.target.value)} className="w-full border rounded-md px-2 py-1 text-[11px]" />
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        <div>
          <label className="block text-[9px] font-medium text-gray-600 mb-0.5">Risk acceptance</label>
          <input value={riskAcceptance} onChange={e => setRiskAcceptance(e.target.value)} className="w-full border rounded-md px-2 py-1 text-[11px]" />
        </div>
        <div>
          <label className="block text-[9px] font-medium text-gray-600 mb-0.5">Mitigation</label>
          <input value={mitigation} onChange={e => setMitigation(e.target.value)} className="w-full border rounded-md px-2 py-1 text-[11px]" />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        <div>
          <label className="block text-[9px] font-medium text-gray-600 mb-0.5">Expires</label>
          <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} className="w-full border rounded-md px-2 py-1 text-[11px]" />
        </div>
        <div>
          <label className="block text-[9px] font-medium text-gray-600 mb-0.5">Review date</label>
          <input type="date" value={reviewDate} onChange={e => setReviewDate(e.target.value)} className="w-full border rounded-md px-2 py-1 text-[11px]" />
        </div>
      </div>
      {error && <div className="text-[10px] text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1">{error}</div>}
      <div className="flex gap-2">
        <Action type="submit" variant="primary" loading={saving}>Record Exception</Action>
        <button type="button" onClick={onCancel} className="text-[10px] text-gray-500 hover:text-gray-800">Cancel</button>
      </div>
    </form>
  );
}

// Keys shown in the summary tiles. The original 5 always show (so a
// plain, baseline-free run's grid looks exactly as it always has); the 5
// baseline-aware ones only show once a real finding of that kind exists —
// never padding the UI with permanently-zero baseline tiles on runs that
// never consulted a baseline.
const ALWAYS_SHOWN_KEYS: (keyof ComparisonSummary)[] = ['match', 'mismatch', 'missing', 'extra', 'unknown'];
const BASELINE_AWARE_KEYS: { key: keyof ComparisonSummary; status: ComparisonObjectStatus }[] = [
  { key: 'expectedDifference', status: 'expected_difference' },
  { key: 'approvedOverride', status: 'approved_override' },
  { key: 'approvedException', status: 'approved_exception' },
  { key: 'unapprovedDifference', status: 'unapproved_difference' },
  { key: 'notAssessed', status: 'not_assessed' },
];
const KEY_TO_STATUS: Record<string, ComparisonObjectStatus> = {
  match: 'match', mismatch: 'mismatch', missing: 'missing', extra: 'extra', unknown: 'unknown',
  expectedDifference: 'expected_difference', approvedOverride: 'approved_override', approvedException: 'approved_exception',
  unapprovedDifference: 'unapproved_difference', notAssessed: 'not_assessed',
};

/** Real "View Difference" detail — WHAT EXISTS / WHAT IS MISSING /
 * EXPECTED / WHY IT MATTERS / RECOMMENDATION, built only from real,
 * already-available data (never a fabricated business explanation). Where
 * this platform genuinely cannot determine a specific impact, it says so
 * honestly instead of inventing one. */
function DifferenceDetail({ result, run }: { result: ComparisonObjectResult; run: ComparisonRun }) {
  const leftEnv = run.leftEnvironmentLabel || run.leftLabel;
  const rightEnv = run.rightEnvironmentLabel || run.rightLabel;
  const objectWord = run.comparisonType === 'configuration' ? 'configuration key' : 'object';
  const rows: { label: string; content: React.ReactNode }[] = [];

  if (result.status === 'missing' || result.status === 'extra') {
    const presentEnv = result.status === 'missing' ? leftEnv : rightEnv;
    const missingEnv = result.status === 'missing' ? rightEnv : leftEnv;
    const presentValue = result.status === 'missing' ? result.leftDetail : result.rightDetail;
    rows.push({ label: 'WHAT EXISTS', content: <>{presentEnv} contains <span className="font-mono">{result.name}</span>{presentValue && presentValue !== 'present' ? <> (<span className="font-mono">{presentValue}</span>)</> : ''}.</> });
    rows.push({ label: 'WHAT IS MISSING', content: <>{missingEnv} does not contain <span className="font-mono">{result.name}</span>.</> });
    rows.push({ label: 'EXPECTED', content: result.baselineValue !== undefined ? <>Approved baseline value: <span className="font-mono">{result.baselineValue}</span>, expected present in both environments.</> : <>Present in both environments, unless this is an intentional environment-specific difference.</> });
    rows.push({ label: 'WHY IT MATTERS', content: <span className="italic text-gray-400">Not automatically determined — no dependency/impact evidence is available for this {objectWord} in v1. Verify manually before promoting further.</span> });
    rows.push({ label: 'RECOMMENDATION', content: <>Add <span className="font-mono">{result.name}</span> to {missingEnv}, or mark this as intentional if the difference is expected.</> });
  } else if (result.status === 'mismatch' || result.status === 'unapproved_difference') {
    rows.push({ label: leftEnv.toUpperCase(), content: <span className="font-mono">{result.leftDetail}</span> });
    rows.push({ label: rightEnv.toUpperCase(), content: <span className="font-mono">{result.rightDetail}</span> });
    rows.push({ label: 'DIFFERENCE', content: <>The value differs between {leftEnv} and {rightEnv}.</> });
    rows.push({ label: 'EXPECTED', content: result.baselineValue !== undefined ? <span className="font-mono">{result.baselineValue}</span> : <span className="italic text-gray-400">No approved baseline value defined for this key.</span> });
    if (result.status === 'unapproved_difference') {
      rows.push({ label: 'RISK', content: 'This difference is not covered by any approved override or exception — real, unreviewed drift.' });
    }
    rows.push({ label: 'RECOMMENDATION', content: result.baselineValue !== undefined ? <>Align both environments to the approved value, or record an approved exception if the difference is intentional.</> : <>Confirm which value is correct, then align both environments or define a baseline rule for this key.</> });
  } else if (result.status === 'approved_override') {
    rows.push({ label: 'BASELINE', content: result.baselineValue !== undefined ? <span className="font-mono">{result.baselineValue}</span> : '—' });
    rows.push({ label: 'ENVIRONMENT OVERRIDE', content: <span className="font-mono">{result.rightDetail}</span> });
    rows.push({ label: 'APPROVED BY', content: result.overrideApprovedBy || <span className="italic text-gray-400">Not recorded</span> });
    rows.push({ label: 'REASON', content: result.overrideReason || <span className="italic text-gray-400">Not recorded</span> });
  } else if (result.status === 'approved_exception') {
    rows.push({ label: leftEnv.toUpperCase(), content: <span className="font-mono">{result.leftDetail}</span> });
    rows.push({ label: rightEnv.toUpperCase(), content: <span className="font-mono">{result.rightDetail}</span> });
    rows.push({ label: 'CLASSIFICATION', content: 'Approved Exception — the original difference is never hidden, only formally accepted.' });
  } else if (result.status === 'expected_difference') {
    rows.push({ label: leftEnv.toUpperCase(), content: <span className="font-mono">{result.leftDetail}</span> });
    rows.push({ label: rightEnv.toUpperCase(), content: <span className="font-mono">{result.rightDetail}</span> });
    rows.push({ label: 'REASON', content: 'This key is configured to intentionally vary by environment — never flagged as a defect.' });
  }

  return (
    <div className="bg-white border rounded-md p-3 space-y-2 text-[11px]">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[110px_1fr] gap-2">
          <span className="text-[9px] font-semibold text-gray-400 uppercase pt-0.5">{r.label}</span>
          <span className="text-gray-700">{r.content}</span>
        </div>
      ))}
    </div>
  );
}

function RunCard({ run, clientId, onRunUpdated }: { run: ComparisonRun; clientId: string; onRunUpdated: (run: ComparisonRun) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [exceptionRowKey, setExceptionRowKey] = useState<string | null>(null);
  const [detailRowKey, setDetailRowKey] = useState<string | null>(null);
  const panelId = useId();
  const leftEnv = run.leftEnvironmentLabel || run.leftLabel;
  const rightEnv = run.rightEnvironmentLabel || run.rightLabel;

  // "Differ" at a glance means genuinely unresolved — an expected
  // difference, approved override, or approved exception is NOT a
  // difference the user needs to look at again.
  const differCount = run.status === 'completed'
    ? run.summary.missing + run.summary.extra + run.summary.mismatch + run.summary.unknown + run.summary.unapprovedDifference + run.summary.notAssessed
    : 0;

  const visibleKeys = run.status === 'completed'
    ? [...ALWAYS_SHOWN_KEYS, ...BASELINE_AWARE_KEYS.filter(k => run.summary[k.key] > 0).map(k => k.key)]
    : [];

  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      <div className="flex items-center justify-between p-3 gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-900">{run.leftLabel} <span className="text-gray-400">vs</span> {run.rightLabel}</p>
          <p className="text-[9px] text-gray-400 mt-0.5">
            {run.comparisonType === 'configuration' ? 'Configuration comparison' : 'Database schema comparison'} · {new Date(run.createdAt).toLocaleString('en-AU')}
            {run.createdBy && <> · by {run.createdBy}</>}
            {run.baselineId && <> · against baseline v{run.baselineVersion}</>}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {run.status === 'completed' && (
            <span className="text-[10px] text-gray-500">
              {run.summary.match} match{run.summary.match !== 1 ? 'es' : ''}
              {differCount > 0 && <span className="text-amber-600 font-medium"> · {differCount} differ</span>}
            </span>
          )}
          <StatusBadge status={run.status} />
          <button onClick={() => setExpanded(e => !e)} aria-expanded={expanded} aria-controls={panelId} className="text-[10px] font-medium text-purple-600 hover:text-purple-800">
            {expanded ? 'Close' : 'Details'}
          </button>
        </div>
      </div>
      {expanded && (
        <div id={panelId} className="border-t bg-gray-50 p-4 space-y-3">
          {run.status === 'failed' && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-[11px] text-red-700">
              <p className="font-semibold mb-1">Comparison could not complete</p>
              <p>{run.errorMessage || 'An unknown error occurred.'}</p>
            </div>
          )}
          {run.status === 'completed' && (
            <>
              <div className="grid gap-2 text-center" style={{ gridTemplateColumns: `repeat(${visibleKeys.length}, minmax(0, 1fr))` }}>
                {visibleKeys.map(k => (
                  <div key={k} className="bg-white rounded-md border p-2">
                    <p className="text-sm font-bold text-gray-900">{run.summary[k]}</p>
                    <p className="text-[8px] text-gray-500 uppercase">{OBJECT_META[KEY_TO_STATUS[k]].label}</p>
                  </div>
                ))}
              </div>
              {run.results.length === 0 ? (
                <p className="text-[11px] text-gray-400 italic">{run.comparisonType === 'configuration' ? 'No config keys found on either side.' : 'No tables found on either side.'}</p>
              ) : (
                <div className="bg-white border rounded-md overflow-hidden">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-gray-100 text-gray-500 text-left">
                        <th className="px-2 py-1.5 font-medium">{run.comparisonType === 'configuration' ? 'Config Key' : 'Table'}</th>
                        <th className="px-2 py-1.5 font-medium">{leftEnv}</th>
                        <th className="px-2 py-1.5 font-medium">{rightEnv}</th>
                        <th className="px-2 py-1.5 font-medium">Status</th>
                        <th className="px-2 py-1.5 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {run.results.map((r, i) => {
                        // Per the "BIDIRECTIONAL COMPARISON UI" directive: for a
                        // structural presence difference, each column shows a real
                        // ✓ Present / ✕ Missing indicator (not internal "left/right"
                        // wording); for match/mismatch/baseline-aware statuses,
                        // both real values are shown as before.
                        const isPresenceDiff = r.status === 'missing' || r.status === 'extra';
                        const leftPresent = r.status !== 'extra';
                        const rightPresent = r.status !== 'missing';
                        return (
                          <Fragment key={i}>
                            <tr className="border-t align-top">
                              <td className="px-2 py-1.5 font-mono text-gray-700">{r.name}</td>
                              <td className="px-2 py-1.5 text-gray-500">
                                {isPresenceDiff ? (leftPresent ? <span className="text-green-600">✓ Present</span> : <span className="text-red-600">✕ Missing</span>) : r.leftDetail}
                              </td>
                              <td className="px-2 py-1.5 text-gray-500">
                                {isPresenceDiff ? (rightPresent ? <span className="text-green-600">✓ Present</span> : <span className="text-red-600">✕ Missing</span>) : r.rightDetail}
                              </td>
                              <td className="px-2 py-1.5">
                                <ObjectBadge icon={r.displayIcon} text={r.displayText} severity={r.displaySeverity} />
                                {r.baselineValue !== undefined && (
                                  <p className="text-[8px] text-gray-400 mt-0.5">Baseline: <span className="font-mono">{r.baselineValue}</span></p>
                                )}
                                {r.overrideReason && <p className="text-[8px] text-gray-400 mt-0.5 italic">"{r.overrideReason}"</p>}
                              </td>
                              <td className="px-2 py-1.5 whitespace-nowrap">
                                <button onClick={() => setDetailRowKey(k => k === r.name ? null : r.name)} className="text-[9px] font-semibold text-purple-600 hover:text-purple-800">
                                  {detailRowKey === r.name ? 'Hide' : 'View Difference'}
                                </button>
                                {run.comparisonType === 'configuration' && EXCEPTIONABLE.includes(r.status) && (
                                  exceptionRowKey === r.name ? (
                                    <button onClick={() => setExceptionRowKey(null)} className="text-[9px] text-gray-500 hover:text-gray-800 ml-2">Cancel</button>
                                  ) : (
                                    <button onClick={() => setExceptionRowKey(r.name)} className="text-[9px] font-semibold text-indigo-600 hover:text-indigo-800 ml-2">Mark as Intentional</button>
                                  )
                                )}
                              </td>
                            </tr>
                            {detailRowKey === r.name && (
                              <tr className="border-t bg-gray-50">
                                <td colSpan={5} className="px-2 py-2">
                                  <DifferenceDetail result={r} run={run} />
                                </td>
                              </tr>
                            )}
                            {exceptionRowKey === r.name && (
                              <tr className="border-t bg-gray-50">
                                <td colSpan={5} className="px-2 py-2">
                                  <ExceptionForm
                                    clientId={clientId} runId={run.id} configKey={r.name}
                                    onDone={(updatedRun) => { onRunUpdated(updatedRun); setExceptionRowKey(null); }}
                                    onCancel={() => setExceptionRowKey(null)}
                                  />
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export interface DatabaseAdapterStatus { technology: string; status: string }

const CONFIG_ENV_OPTIONS = ['production', 'staging', 'uat', 'development', 'other'];

/** Real, staff-entered configuration snapshot creation — the input side of the Configuration comparison type (migration 052). */
function SnapshotForm({ clientId, onCreated, onCancel }: { clientId: string; onCreated: () => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [environment, setEnvironment] = useState('production');
  const [raw, setRaw] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function parseConfig(text: string): { config: Record<string, string> | null; error: string | null } {
    const config: Record<string, string> = {};
    const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    for (const line of lines) {
      const eq = line.indexOf('=');
      if (eq === -1) return { config: null, error: `Line "${line}" is not in KEY=VALUE format.` };
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim();
      if (!key) return { config: null, error: `Line "${line}" is missing a key before "=".` };
      config[key] = value;
    }
    return { config, error: null };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const { config, error: parseError } = parseConfig(raw);
    if (parseError || !config || Object.keys(config).length === 0) {
      setError(parseError || 'Enter at least one KEY=VALUE line.');
      return;
    }
    setSaving(true); setError(null);
    try {
      const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/configuration-snapshots`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), environment, config }),
      });
      if (!res.ok) { const body = await res.json().catch(() => ({})); setError(body?.error?.message || 'Could not save this snapshot.'); return; }
      onCreated();
    } catch { setError('Could not reach the server. Please try again.'); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-xl border p-5 mb-4 space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Snapshot name *</label>
          <input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Checkout Service Config" className="w-full border rounded-md px-3 py-2 text-sm" />
          <p className="text-[9px] text-gray-400 mt-0.5">A short, recognizable label for this configuration capture.</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Environment *</label>
          <select value={environment} onChange={e => setEnvironment(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm capitalize">
            {CONFIG_ENV_OPTIONS.map(o => <option key={o} value={o} className="capitalize">{o}</option>)}
          </select>
          <p className="text-[9px] text-gray-400 mt-0.5">Which real environment this configuration was captured from.</p>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Configuration (one KEY=VALUE per line) *</label>
        <textarea value={raw} onChange={e => setRaw(e.target.value)} required rows={6} placeholder={'LOG_LEVEL=info\nFEATURE_FLAG_X=true\nAPI_TIMEOUT_MS=3000'} className="w-full border rounded-md px-3 py-2 text-sm font-mono" />
        <p className="text-[9px] text-gray-400 mt-0.5">
          Paste real config values (e.g. from a <code>.env</code> file or app config) — never invented. Lines starting with <code>#</code> are ignored.
          Secret-shaped keys (password/secret/token/key/credential) are automatically masked wherever this snapshot's values are displayed.
        </p>
      </div>
      {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
      <div className="flex gap-2">
        <Action type="submit" variant="primary" loading={saving}>Save Snapshot</Action>
        <button type="button" onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-800">Cancel</button>
      </div>
    </form>
  );
}

const BASELINE_CLASSIFICATIONS = ['application', 'database', 'security', 'integration', 'infrastructure', 'other'];

const BASELINE_RULES_EXAMPLE = `{
  "JWT_ALGORITHM": { "approvedValue": "RS256" },
  "CONN_TIMEOUT_MS": {
    "approvedValue": "30000",
    "overrides": {
      "production": { "value": "60000", "reason": "Higher production workload", "approvedBy": "", "approvedAt": "" }
    }
  },
  "API_URL": { "expectedToVaryByEnvironment": true }
}`;

/** Real, staff-defined Configuration Baseline (migration 053) — the
 * approved reference a comparison can be checked against, so that a real
 * difference can be classified as expected/approved/unapproved instead of
 * automatically flagged as a defect. */
function BaselineForm({ clientId, onCreated, onCancel }: { clientId: string; onCreated: () => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [version, setVersion] = useState('1.0');
  const [description, setDescription] = useState('');
  const [owner, setOwner] = useState('');
  const [classification, setClassification] = useState('application');
  const [environmentScope, setEnvironmentScope] = useState<string[]>([]);
  const [applicationScope, setApplicationScope] = useState('');
  const [rulesRaw, setRulesRaw] = useState(BASELINE_RULES_EXAMPLE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleEnv(env: string) {
    setEnvironmentScope(s => s.includes(env) ? s.filter(e => e !== env) : [...s, env]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    let rules: unknown;
    try { rules = rulesRaw.trim() ? JSON.parse(rulesRaw) : {}; }
    catch { setError('Rules must be valid JSON — see the example format below.'); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/configuration-baselines`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(), version: version.trim() || '1.0', description: description.trim(),
          owner: owner.trim() || undefined, classification, environmentScope,
          applicationScope: applicationScope.trim() || undefined, rules,
        }),
      });
      if (!res.ok) { const body = await res.json().catch(() => ({})); setError(body?.error?.message || 'Could not save this baseline.'); return; }
      onCreated();
    } catch { setError('Could not reach the server. Please try again.'); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-xl border p-5 mb-4 space-y-3">
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Baseline name *</label>
          <input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. AskABD Standard PostgreSQL Security Profile" className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Version</label>
          <input value={version} onChange={e => setVersion(e.target.value)} placeholder="1.0" className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="What this baseline represents and why" className="w-full border rounded-md px-3 py-2 text-sm" />
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Owner</label>
          <input value={owner} onChange={e => setOwner(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Classification</label>
          <select value={classification} onChange={e => setClassification(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm capitalize">
            {BASELINE_CLASSIFICATIONS.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Application scope</label>
          <input value={applicationScope} onChange={e => setApplicationScope(e.target.value)} placeholder="e.g. Checkout Service" className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Environment scope</label>
        <div className="flex flex-wrap gap-2">
          {CONFIG_ENV_OPTIONS.map(env => (
            <label key={env} className={`text-[10px] font-medium capitalize px-2 py-1 rounded-md border cursor-pointer ${environmentScope.includes(env) ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-300'}`}>
              <input type="checkbox" checked={environmentScope.includes(env)} onChange={() => toggleEnv(env)} className="sr-only" />
              {env}
            </label>
          ))}
        </div>
        <p className="text-[9px] text-gray-400 mt-1">Which environments this baseline applies to. Leave all unchecked to apply everywhere.</p>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Rules (JSON) *</label>
        <textarea value={rulesRaw} onChange={e => setRulesRaw(e.target.value)} required rows={10} className="w-full border rounded-md px-3 py-2 text-[11px] font-mono" />
        <div className="text-[9px] text-gray-400 mt-1 space-y-0.5">
          <p>Per key: <code>approvedValue</code> (the single correct value), <code>expectedToVaryByEnvironment: true</code> (never flagged — e.g. a per-environment API URL), or <code>overrides</code> — a named per-environment approved deviation with its own <code>reason</code>/<code>approvedBy</code>/<code>approvedAt</code>.</p>
          <p>A key with no rule here is never baseline-reclassified — it keeps its plain match/mismatch/missing/extra result.</p>
        </div>
      </div>
      {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
      <div className="flex gap-2">
        <Action type="submit" variant="primary" loading={saving}>Save Baseline (draft)</Action>
        <button type="button" onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-800">Cancel</button>
      </div>
    </form>
  );
}

function BaselineList({ clientId, baselines, onChanged }: { clientId: string; baselines: ConfigurationBaseline[]; onChanged: () => void }) {
  const [approvingId, setApprovingId] = useState<string | null>(null);

  async function approve(id: string) {
    setApprovingId(id);
    try {
      const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/configuration-baselines/${id}/approve`, { method: 'POST' });
      if (res.ok) onChanged();
    } finally { setApprovingId(null); }
  }

  if (baselines.length === 0) return <p className="text-[10px] text-gray-400 italic">No configuration baselines defined yet for this client.</p>;

  return (
    <ul className="space-y-1.5">
      {baselines.map(b => {
        const ruleCount = Object.keys(b.rules || {}).length;
        const badgeMeta = b.status === 'approved'
          ? { icon: '✓', className: 'text-green-700 bg-green-50 border-green-200' }
          : b.status === 'deprecated'
            ? { icon: '✕', className: 'text-gray-500 bg-gray-50 border-gray-200' }
            : { icon: '…', className: 'text-amber-700 bg-amber-50 border-amber-200' };
        return (
          <li key={b.id} className="flex items-center justify-between gap-2 text-[10px] text-gray-600 bg-gray-50 rounded-md px-2 py-1.5">
            <div className="min-w-0">
              <span className="font-medium text-gray-800">{b.name}</span> <span className="text-gray-400">v{b.version}</span>
              <span className="text-gray-400"> · {ruleCount} rule{ruleCount !== 1 ? 's' : ''}</span>
              {b.environmentScope?.length > 0 && <span className="text-gray-400"> · {b.environmentScope.join(', ')}</span>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded border capitalize ${badgeMeta.className}`}>
                <span aria-hidden="true">{badgeMeta.icon}</span>{b.status}
              </span>
              {b.status === 'draft' && (
                <button onClick={() => approve(b.id)} disabled={approvingId === b.id} className="text-[9px] font-semibold text-purple-600 hover:text-purple-800 disabled:opacity-50">
                  {approvingId === b.id ? 'Approving…' : 'Approve'}
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ComparisonsManager({ clientId, initialRuns, connections, adapters, initialSnapshots, initialBaselines }: { clientId: string; initialRuns: ComparisonRun[]; connections: DatabaseConnection[]; adapters: DatabaseAdapterStatus[]; initialSnapshots: ConfigurationSnapshot[]; initialBaselines: ConfigurationBaseline[] }) {
  const [runs, setRuns] = useState(initialRuns);
  const [snapshots, setSnapshots] = useState(initialSnapshots);
  const [baselines, setBaselines] = useState(initialBaselines);
  const [mode, setMode] = useState<'database_schema' | 'configuration'>('database_schema');
  const [showForm, setShowForm] = useState(false);
  const [showSnapshotForm, setShowSnapshotForm] = useState(false);
  const [showBaselineForm, setShowBaselineForm] = useState(false);
  const [leftId, setLeftId] = useState('');
  const [rightId, setRightId] = useState('');
  const [baselineId, setBaselineId] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const approvedBaselines = baselines.filter(b => b.status === 'approved');

  // Real capability negotiation, not a hard-coded 'postgresql' check: a
  // connection is only selectable for comparison if the Technology
  // Adapter Registry (migration 051) reports its connector_type as
  // `supported`. Unregistered/adapter_required technologies are never
  // silently attempted — see the disabled, honestly-labelled options below.
  const adapterStatus = new Map(adapters.map(a => [a.technology, a.status]));
  const statusOf = (connectorType: string) => adapterStatus.get(connectorType) ?? 'unknown_technology';
  const comparableConnections = connections.filter(c => statusOf(c.connectorType) === 'supported');
  const blockedConnections = connections.filter(c => statusOf(c.connectorType) !== 'supported');

  async function refresh() {
    const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/comparisons`);
    if (res.ok) setRuns((await res.json()).runs);
  }
  async function refreshSnapshots() {
    const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/configuration-snapshots`);
    if (res.ok) setSnapshots((await res.json()).snapshots);
  }
  async function refreshBaselines() {
    const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/configuration-baselines`);
    if (res.ok) setBaselines((await res.json()).baselines);
  }
  function handleRunUpdated(updated: ComparisonRun) {
    setRuns(rs => rs.map(r => (r.id === updated.id ? updated : r)));
  }

  async function handleRun(e: React.FormEvent) {
    e.preventDefault();
    if (!leftId || !rightId) { setError(mode === 'configuration' ? 'Choose two different snapshots to compare.' : 'Choose two different connections to compare.'); return; }
    if (leftId === rightId) { setError(mode === 'configuration' ? 'Choose two different snapshots — comparing one against itself is not meaningful.' : 'Choose two different connections — comparing a connection against itself is not meaningful.'); return; }
    setRunning(true); setError(null);
    try {
      const url = mode === 'configuration' ? `${API}/api/v1/oc/clients/${clientId}/comparisons/configuration` : `${API}/api/v1/oc/clients/${clientId}/comparisons/database-schema`;
      const payload = mode === 'configuration'
        ? { leftSnapshotId: leftId, rightSnapshotId: rightId, baselineId: baselineId || undefined }
        : { leftConnectionId: leftId, rightConnectionId: rightId };
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) { const body = await res.json().catch(() => ({})); setError(body?.error?.message || 'Could not run this comparison.'); return; }
      setLeftId(''); setRightId(''); setBaselineId(''); setShowForm(false);
      await refresh();
    } catch { setError('Could not reach the server. Please try again.'); }
    finally { setRunning(false); }
  }

  const canRunDbSchema = comparableConnections.length >= 2;
  const canRunConfig = snapshots.length >= 2;

  return (
    <div>
      {comparableConnections.length < 2 && (
        <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4 text-[11px] text-amber-800">
          At least two connections with a real, supported adapter are needed to run a database schema comparison. Add them from the
          <span className="font-medium"> Lifecycle</span> tab's Database Connections section.
        </div>
      )}
      {blockedConnections.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2 mb-4 text-[11px] text-gray-600">
          <p className="font-medium text-gray-700 mb-1">Not available for comparison — honest adapter status, not hidden silently:</p>
          <ul className="space-y-0.5">
            {blockedConnections.map(c => (
              <li key={c.id}>
                <span className="font-mono">{c.name}</span> ({c.connectorType}) — <span className="font-medium">{statusOf(c.connectorType) === 'unknown_technology' ? 'Unknown Technology' : 'Adapter Required'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Configuration snapshots — the input side of the Configuration comparison type */}
      <div className="bg-white rounded-xl border p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-xs font-semibold text-gray-800">Configuration Snapshots</p>
            <p className="text-[9px] text-gray-400 mt-0.5">Real, staff-entered configuration captures — used as the two sides of a Configuration comparison.</p>
          </div>
          <button onClick={() => setShowSnapshotForm(v => !v)} className="text-[10px] font-semibold text-purple-600 hover:text-purple-800">
            {showSnapshotForm ? 'Cancel' : '+ Add Snapshot'}
          </button>
        </div>
        {showSnapshotForm && (
          <SnapshotForm clientId={clientId} onCreated={() => { setShowSnapshotForm(false); refreshSnapshots(); }} onCancel={() => setShowSnapshotForm(false)} />
        )}
        {snapshots.length === 0 ? (
          <p className="text-[10px] text-gray-400 italic">No configuration snapshots yet for this client.</p>
        ) : (
          <ul className="space-y-1">
            {snapshots.map(s => (
              <li key={s.id} className="text-[10px] text-gray-600 flex items-center gap-2">
                <span className="font-medium text-gray-800">{s.name}</span>
                <span className="capitalize text-gray-400">({s.environment})</span>
                <span className="text-gray-400">· {Object.keys(s.config).length} key{Object.keys(s.config).length !== 1 ? 's' : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Configuration Baselines — the approved reference a comparison can be checked against, so a real difference can be classified rather than automatically flagged. */}
      <div className="bg-white rounded-xl border p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-xs font-semibold text-gray-800">Configuration Baselines</p>
            <p className="text-[9px] text-gray-400 mt-0.5">Approved reference settings. A difference is not automatically a defect — it's classified against the rules defined here.</p>
          </div>
          <button onClick={() => setShowBaselineForm(v => !v)} className="text-[10px] font-semibold text-purple-600 hover:text-purple-800">
            {showBaselineForm ? 'Cancel' : '+ New Baseline'}
          </button>
        </div>
        {showBaselineForm && (
          <BaselineForm clientId={clientId} onCreated={() => { setShowBaselineForm(false); refreshBaselines(); }} onCancel={() => setShowBaselineForm(false)} />
        )}
        <BaselineList clientId={clientId} baselines={baselines} onChanged={refreshBaselines} />
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="inline-flex rounded-md border overflow-hidden text-[10px] font-semibold">
          <button onClick={() => { setMode('database_schema'); setLeftId(''); setRightId(''); setBaselineId(''); setError(null); }} className={`px-3 py-1.5 ${mode === 'database_schema' ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Database Schema</button>
          <button onClick={() => { setMode('configuration'); setLeftId(''); setRightId(''); setBaselineId(''); setError(null); }} className={`px-3 py-1.5 border-l ${mode === 'configuration' ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Configuration</button>
        </div>
        <Action variant="primary" onClick={() => setShowForm(v => !v)} disabled={mode === 'configuration' ? !canRunConfig : !canRunDbSchema}>
          {showForm ? 'Cancel' : '+ New Comparison'}
        </Action>
      </div>

      {showForm && (
        <form onSubmit={handleRun} className="bg-white rounded-xl border p-5 mb-6 grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Left side (reference) *</label>
            <select value={leftId} onChange={e => setLeftId(e.target.value)} required className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="">{mode === 'configuration' ? 'Select a snapshot…' : 'Select a connection…'}</option>
              {mode === 'configuration'
                ? snapshots.map(s => <option key={s.id} value={s.id}>{s.name} ({s.environment})</option>)
                : comparableConnections.map(c => <option key={c.id} value={c.id}>{c.name} ({c.environment})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Right side (comparison target) *</label>
            <select value={rightId} onChange={e => setRightId(e.target.value)} required className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="">{mode === 'configuration' ? 'Select a snapshot…' : 'Select a connection…'}</option>
              {mode === 'configuration'
                ? snapshots.map(s => <option key={s.id} value={s.id}>{s.name} ({s.environment})</option>)
                : comparableConnections.map(c => <option key={c.id} value={c.id}>{c.name} ({c.environment})</option>)}
            </select>
          </div>
          {mode === 'configuration' && (
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Compare against baseline (optional)</label>
              <select value={baselineId} onChange={e => setBaselineId(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm">
                <option value="">No baseline — plain key-value diff only</option>
                {approvedBaselines.map(b => <option key={b.id} value={b.id}>{b.name} (v{b.version})</option>)}
              </select>
              <p className="text-[9px] text-gray-400 mt-0.5">
                {approvedBaselines.length === 0
                  ? 'No approved baselines yet — differences will be reported plainly (match/mismatch/missing/extra) with no classification applied.'
                  : 'When set, differences are classified against this baseline\'s rules (expected / approved override / unapproved) instead of reported plainly. Only approved baselines are selectable.'}
              </p>
            </div>
          )}
          <p className="sm:col-span-2 text-[9px] text-gray-400">
            {mode === 'configuration'
              ? 'Real key-value diff: added, removed, changed, and unchanged keys are all reported — never fabricated.'
              : 'Both sides must have a real, stored credential (tested successfully at least once). A connection whose credential is unavailable will honestly report unresolved tables rather than guessing.'}
          </p>
          {error && <div className="sm:col-span-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
          <div className="sm:col-span-2">
            <Action type="submit" variant="primary" loading={running}>Run Comparison</Action>
          </div>
        </form>
      )}

      {runs.length === 0 ? (
        <div className="bg-white rounded-xl border p-10 text-center text-sm text-gray-400">
          No comparisons run yet for this client.
        </div>
      ) : (
        <div className="space-y-2">
          {runs.map(r => <RunCard key={r.id} run={r} clientId={clientId} onRunUpdated={handleRunUpdated} />)}
        </div>
      )}
    </div>
  );
}
