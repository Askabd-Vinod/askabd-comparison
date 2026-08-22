'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ErrorState } from '../../../../components/error-state';

export default function MigrationPlanPage() {
  const params = useParams();
  const clientId = params.clientId as string;
  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

  const [preflight, setPreflight] = useState<any>(null);
  const [validation, setValidation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function runPreflight() {
    setRunning('preflight');
    setError(null);
    try {
      const res = await fetch(`${API}/api/v1/oc/migration/preflight`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      if (res.ok) {
        const data = await res.json();
        setPreflight(data);
      } else {
        const d = await res.json().catch(() => null);
        setError(d?.error || 'Preflight failed');
      }
    } catch {
      setError('Service unavailable');
    }
    setRunning(null);
  }

  async function runValidation() {
    setRunning('validation');
    setError(null);
    try {
      const res = await fetch(`${API}/api/v1/oc/migration/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      if (res.ok) {
        const data = await res.json();
        setValidation(data);
        // Auto-advance lifecycle through validation
        await fetch(`${API}/api/v1/oc/lifecycle/transition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, event: 'validation_started', actor: 'system', actorType: 'system' }),
        }).catch(() => {});
        await fetch(`${API}/api/v1/oc/lifecycle/transition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, event: 'validation_passed', actor: 'system', actorType: 'system' }),
        }).catch(() => {});
      } else {
        const d = await res.json().catch(() => null);
        setError(d?.error || 'Validation failed');
      }
    } catch {
      setError('Service unavailable');
    }
    setRunning(null);
  }

  // Previously: this fired 3 lifecycle-transition events
  // (migration_approved/migration_started/migration_completed) and nothing
  // else — it never called the real migration engine at all, so clicking
  // "Execute Migration" made the lifecycle claim a migration had completed
  // when no plan, dry-run, or execution had actually happened. Found during
  // the 2026-08-22 SDLC-completion audit (exactly the failure mode the brief
  // calls out: "Do not claim a migration happened when it did not").
  //
  // Real fix: reuse the already-real, already-tested platform migration
  // engine (MigrationExecutionService via /oc/migration/plan, the same
  // endpoint apps/web/.../migrations/new/page.tsx calls) instead of building
  // a second one here. This creates a genuine plan against this client's own
  // schema and hands off to the existing dry-run/execute/validate/rollback
  // UI at /migrations/:id, which is real end-to-end.
  async function planMigration() {
    setRunning('approve');
    setError(null);
    try {
      const res = await fetch(`${API}/api/v1/oc/migration/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, sourceSchema: 'public' }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setError(data?.error || 'Failed to create migration plan'); setRunning(null); return; }
      window.location.href = `/migrations/${data.id}`;
    } catch {
      setError('Service unavailable');
      setRunning(null);
    }
  }

  const migrationSteps = [
    { id: 'preflight', label: 'Pre-Flight Checks', description: 'Validate all prerequisites before migration', status: preflight ? (preflight.status === 'passed' ? 'complete' : 'failed') : 'pending' },
    { id: 'validation', label: 'Migration Validation', description: 'Verify source/target compatibility and data integrity', status: validation ? (validation.status === 'passed' ? 'complete' : validation.status === 'failed' ? 'failed' : 'complete') : 'pending' },
    // Honest, not fabricated: these two don't have a "run" button on this
    // page — wave/rollback sequencing and final execution happen in the
    // real migration plan (see planMigration() below), and approval is
    // tracked through the client's Requests workflow, not a checkbox here.
    // Left visibly "Pending" rather than silently omitted or falsely
    // marked complete, so the full real journey stays visible.
    { id: 'waves', label: 'Migration Waves', description: 'Defined in the migration plan once created (see below)', status: 'pending' },
    { id: 'approval', label: 'Customer Approval', description: 'Tracked via the client\'s Requests workflow before execution', status: 'pending' },
  ];

  return (
    <div className="space-y-6">
      {/* Header — never shows the raw internal client ID; the workspace
          navigation already establishes which client you're in. */}
      <div className="bg-white rounded-xl border p-5">
        <p className="text-[9px] text-gray-400 uppercase font-semibold tracking-wide">Data Migration</p>
        <h2 className="text-lg font-bold text-gray-900">Migration Plan</h2>
        <p className="text-xs text-gray-500 mt-1 max-w-2xl">
          This checks readiness and validates data integrity before a real database migration.
          Pre-Flight and Validation run real checks against this client&apos;s environment right now;
          creating a plan hands off to AskABD&apos;s migration engine, where you can review, do a
          practice run (dry run), and only then execute for real.
        </p>
      </div>

      {/* Steps */}
      <div className="bg-white rounded-xl border p-5">
        <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-4">Migration Steps</h3>
        <div className="space-y-3">
          {migrationSteps.map((step, idx) => (
            <div key={step.id} className={`flex items-center gap-3 p-3 rounded-lg border ${step.status === 'complete' ? 'border-green-200 bg-green-50/30' : step.status === 'failed' ? 'border-red-200 bg-red-50/30' : 'border-gray-100'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${step.status === 'complete' ? 'bg-green-500 text-white' : step.status === 'failed' ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
                {step.status === 'complete' ? '✓' : step.status === 'failed' ? '✗' : idx + 1}
              </div>
              <div className="flex-1">
                <p className={`text-xs font-medium ${step.status === 'complete' ? 'text-green-700' : step.status === 'failed' ? 'text-red-700' : 'text-gray-700'}`}>{step.label}</p>
                <p className="text-[9px] text-gray-500">{step.description}</p>
              </div>
              <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded ${step.status === 'complete' ? 'bg-green-100 text-green-700' : step.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-400'}`}>
                {step.status === 'complete' ? 'PASSED' : step.status === 'failed' ? 'FAILED' : 'PENDING'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Preflight Results */}
      {preflight && (
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-3">Pre-Flight Results</h3>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="bg-green-50 rounded p-2 text-center"><p className="text-sm font-bold text-green-600">{preflight.checks?.filter((c: any) => c.status === 'passed').length || 0}</p><p className="text-[8px] text-green-500">Passed</p></div>
            <div className="bg-amber-50 rounded p-2 text-center"><p className="text-sm font-bold text-amber-600">{preflight.checks?.filter((c: any) => c.status === 'warning').length || 0}</p><p className="text-[8px] text-amber-500">Warnings</p></div>
            <div className="bg-red-50 rounded p-2 text-center"><p className="text-sm font-bold text-red-600">{preflight.checks?.filter((c: any) => c.status === 'failed').length || 0}</p><p className="text-[8px] text-red-500">Failed</p></div>
          </div>
          {preflight.checks?.map((check: any, i: number) => (
            <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
              <span className="text-[10px] text-gray-700">{check.name || check.check}</span>
              <span className={`text-[9px] font-bold ${check.status === 'passed' ? 'text-green-600' : check.status === 'warning' ? 'text-amber-600' : 'text-red-600'}`}>{check.status?.toUpperCase()}</span>
            </div>
          ))}
          {preflight.status === 'passed' && !validation && (
            <p className="text-[11px] text-green-700 mt-3">✓ Pre-flight passed. Run Validation next.</p>
          )}
          {preflight.status !== 'passed' && (
            <p className="text-[11px] text-amber-700 mt-3">Resolve the failed checks above, then run Pre-Flight again.</p>
          )}
        </div>
      )}

      {/* Validation Results */}
      {validation && (
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-3">Validation Results</h3>
          <p className="text-[10px] text-gray-600">Status: <span className="font-bold">{validation.status}</span></p>
          {validation.summary && (
            <div className="grid grid-cols-3 gap-3 mt-2">
              <div className="bg-green-50 rounded p-2 text-center"><p className="text-sm font-bold text-green-600">{validation.summary.passed || 0}</p><p className="text-[8px] text-green-500">Passed</p></div>
              <div className="bg-amber-50 rounded p-2 text-center"><p className="text-sm font-bold text-amber-600">{validation.summary.warnings || 0}</p><p className="text-[8px] text-amber-500">Warnings</p></div>
              <div className="bg-red-50 rounded p-2 text-center"><p className="text-sm font-bold text-red-600">{validation.summary.failed || 0}</p><p className="text-[8px] text-red-500">Failed</p></div>
            </div>
          )}
          {validation.status === 'passed' && (
            <p className="text-[11px] text-green-700 mt-3">✓ Validation passed. You can now create a real migration plan below.</p>
          )}
        </div>
      )}

      {error && (
        <ErrorState what="That didn't work" why={error} onRetry={() => setError(null)} />
      )}

      {/* Actions */}
      <div className="bg-white rounded-xl border p-5">
        <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-1">What Would You Like To Do?</h3>
        <p className="text-[10px] text-gray-500 mb-3">Run these in order — Pre-Flight, then Validation. Once both pass, create the real migration plan.</p>
        <div className="flex flex-wrap gap-3">
          <button onClick={runPreflight} disabled={running !== null} className="text-xs font-semibold bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg transition">
            {running === 'preflight' ? 'Running Pre-Flight checks…' : '1. Run Pre-Flight Checks'}
          </button>
          <button onClick={runValidation} disabled={running !== null} className="text-xs font-semibold bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg transition">
            {running === 'validation' ? 'Running Validation…' : '2. Run Validation'}
          </button>
          <button onClick={planMigration} disabled={running !== null} className="text-xs font-semibold bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg transition">
            {running === 'approve' ? 'Creating plan…' : '3. Create Real Migration Plan →'}
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-3">
        <Link href={`/clients/${clientId}/lifecycle`} className="text-xs font-medium text-gray-600 hover:text-gray-900 border rounded-lg px-4 py-2 hover:bg-gray-50 transition">
          ← Back to Lifecycle
        </Link>
        <Link href={`/clients/${clientId}/recommendations`} className="text-xs font-medium text-gray-600 hover:text-gray-900 border rounded-lg px-4 py-2 hover:bg-gray-50 transition">
          View Recommendations
        </Link>
      </div>
    </div>
  );
}
