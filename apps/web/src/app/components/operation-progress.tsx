'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * The ONE reusable, real-time operation-progress panel — for migration execution,
 * discovery scans, assessments, and any future long-running operation. Reads directly
 * from the real oc_operations model (operation-service.ts) via polling
 * GET /oc/operations/:id. Never invents a percentage: when the operation's
 * totalUnits/progressPercent are not yet known, this shows "Progress not available"
 * rather than a guessed number — matches the real backend's own honesty (NULL stays
 * NULL end to end).
 */

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';
const POLL_INTERVAL_MS = 1500;

interface OperationEvidence { at: string; message: string }
interface Operation {
  id: string; clientId: string; type: string; sourceId: string | null;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
  currentStage: string | null;
  totalUnits: number | null; completedUnits: number; failedUnits: number; warningUnits: number;
  progressPercent: number | null;
  errorSummary: string | null;
  evidence: OperationEvidence[];
  cancellable: boolean; retryable: boolean;
  startedAt: string | null; updatedAt: string; completedAt: string | null;
}

const statusColors: Record<Operation['status'], string> = {
  queued: 'bg-gray-100 text-gray-600',
  running: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-amber-100 text-amber-700',
  interrupted: 'bg-orange-100 text-orange-700',
};

export function OperationProgress({ operationId, onSettled }: { operationId: string; onSettled?: (op: Operation) => void }) {
  const [operation, setOperation] = useState<Operation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const settledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const res = await fetch(`${API}/api/v1/oc/operations/${operationId}`);
        if (!res.ok) {
          if (res.status === 404) { setError('Operation not found — it may have been created by a different session or was never persisted.'); return; }
          setError(`Could not load operation status (server returned ${res.status}).`);
        } else {
          const data = await res.json();
          if (cancelled) return;
          setOperation(data.operation);
          setError(null);
          const settled = ['completed', 'failed', 'cancelled', 'interrupted'].includes(data.operation.status);
          if (settled && !settledRef.current) { settledRef.current = true; onSettled?.(data.operation); }
          if (settled) return; // stop polling — real terminal state reached
        }
      } catch {
        if (!cancelled) setError('Lost connection while checking operation status. Last known status shown below.');
      }
      if (!cancelled) timer = setTimeout(poll, POLL_INTERVAL_MS);
    }
    poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [operationId]);

  async function cancelOperation() {
    try {
      const res = await fetch(`${API}/api/v1/oc/operations/${operationId}/cancel`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) setOperation(data.operation);
      else setError(data.error || 'Could not cancel this operation.');
    } catch { setError('Could not cancel this operation — connection failed.'); }
  }

  if (!operation) {
    return <div className="bg-white rounded-xl border p-5 text-xs text-gray-400">{error || 'Loading operation status…'}</div>;
  }

  const hasRealTotal = operation.totalUnits !== null && operation.totalUnits > 0;
  const lastUpdated = new Date(operation.updatedAt);

  return (
    <div className="bg-white rounded-xl border p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[9px] text-gray-500 uppercase font-semibold tracking-wide">{operation.type} operation</p>
          <p className="text-xs text-gray-700 mt-0.5">{operation.currentStage || (operation.status === 'queued' ? 'Waiting to start' : '—')}</p>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${statusColors[operation.status]}`}>{operation.status}</span>
      </div>

      {/* Real progress bar, or an honest "not available" state — never a guessed percentage */}
      {hasRealTotal ? (
        <>
          <div className="h-2 bg-gray-100 rounded-full mb-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${operation.status === 'failed' ? 'bg-red-500' : operation.status === 'completed' ? 'bg-green-500' : 'bg-purple-500'}`}
              style={{ width: `${operation.progressPercent ?? 0}%` }}
            />
          </div>
          <p className="text-[10px] text-gray-500 mb-3">{operation.progressPercent ?? 0}% complete — {operation.completedUnits} / {operation.totalUnits} units</p>
        </>
      ) : (
        <p className="text-[10px] text-gray-400 italic mb-3">Progress not available — total unit count is not yet known for this operation.</p>
      )}

      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
        <div className="bg-green-50 rounded p-1.5"><p className="text-xs font-bold text-green-600">{operation.completedUnits}</p><p className="text-[8px] text-green-500">Completed</p></div>
        <div className="bg-amber-50 rounded p-1.5"><p className="text-xs font-bold text-amber-600">{operation.warningUnits}</p><p className="text-[8px] text-amber-500">Warnings</p></div>
        <div className="bg-red-50 rounded p-1.5"><p className="text-xs font-bold text-red-600">{operation.failedUnits}</p><p className="text-[8px] text-red-500">Failed</p></div>
      </div>

      {operation.errorSummary && (
        <div className="bg-red-50 border border-red-200 rounded p-2 mb-3">
          <p className="text-[10px] text-red-700 font-medium">{operation.errorSummary}</p>
        </div>
      )}
      {operation.status === 'interrupted' && (
        <div className="bg-orange-50 border border-orange-200 rounded p-2 mb-3">
          <p className="text-[10px] text-orange-700 font-medium">This operation was interrupted by a server restart before it could finish. {operation.retryable ? 'Start a new run to retry.' : 'Contact support before retrying.'}</p>
        </div>
      )}
      {error && <p className="text-[10px] text-amber-600 mb-3">{error}</p>}

      <div className="flex items-center justify-between">
        <p className="text-[9px] text-gray-400">Last updated: {lastUpdated.toLocaleTimeString()}</p>
        {operation.cancellable && (operation.status === 'queued' || operation.status === 'running') && (
          <button onClick={cancelOperation} className="text-[10px] font-semibold text-red-600 hover:text-red-800">Cancel</button>
        )}
      </div>

      {operation.evidence.length > 0 && (
        <details className="mt-3 pt-3 border-t">
          <summary className="text-[10px] font-semibold text-gray-500 uppercase cursor-pointer">Evidence log ({operation.evidence.length})</summary>
          <ul className="mt-2 space-y-1 max-h-48 overflow-y-auto">
            {operation.evidence.slice().reverse().map((e, i) => (
              <li key={i} className="text-[10px] text-gray-600 font-mono"><span className="text-gray-400">{new Date(e.at).toLocaleTimeString()}</span> — {e.message}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
