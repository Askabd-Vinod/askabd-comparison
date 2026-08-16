'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface DiscoveryRun {
  id: string;
  client_id: string;
  status: string;
  connectors_used: string[];
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  resources_found: number;
  warnings: number;
  errors: number;
  results: { resources: any[]; summary: any };
  evidence: string[];
}

export default function DiscoveryProgressPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.clientId as string;
  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

  const [runs, setRuns] = useState<DiscoveryRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string>('');

  const fetchDiscovery = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/v1/oc/discovery/${clientId}`);
      if (res.ok) {
        const data = await res.json();
        setRuns(data.runs || []);
        setError(null);
      }
    } catch {
      setError('Unable to load discovery data. Retrying...');
    }
    setLoading(false);
    setLastRefresh(new Date().toLocaleTimeString());
  }, [clientId, API]);

  useEffect(() => {
    fetchDiscovery();
    // Auto-refresh every 5 seconds for real-time progress
    const interval = setInterval(fetchDiscovery, 5000);
    return () => clearInterval(interval);
  }, [fetchDiscovery]);

  async function startDiscovery() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/v1/oc/discovery/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      if (res.ok) {
        await fetchDiscovery();
      } else {
        const d = await res.json().catch(() => null);
        if (d?.missing) {
          setError(`Prerequisites not met: ${d.missing.join(', ')}`);
        } else {
          setError(d?.error || 'Failed to start discovery');
        }
      }
    } catch {
      setError('Service unavailable. Please try again.');
    }
    setStarting(false);
  }

  const latestRun = runs[0];
  const isRunning = latestRun?.status === 'running' || latestRun?.status === 'in_progress';
  const isComplete = latestRun?.status === 'completed';
  const isFailed = latestRun?.status === 'failed';

  // Discovery steps simulation based on status
  const discoverySteps = [
    { id: 'init', label: 'Initialize Discovery Engine', status: latestRun ? 'complete' : 'pending' },
    { id: 'connectors', label: 'Verify Connector Access', status: latestRun ? 'complete' : 'pending' },
    { id: 'apps', label: 'Scan Applications', status: latestRun && latestRun.resources_found > 0 ? 'complete' : isRunning ? 'running' : 'pending' },
    { id: 'databases', label: 'Map Databases & Schemas', status: isComplete ? 'complete' : isRunning ? 'running' : 'pending' },
    { id: 'infra', label: 'Map Infrastructure', status: isComplete ? 'complete' : 'pending' },
    { id: 'deps', label: 'Identify Dependencies', status: isComplete ? 'complete' : 'pending' },
    { id: 'report', label: 'Generate Discovery Report', status: isComplete ? 'complete' : 'pending' },
  ];

  const completedSteps = discoverySteps.filter(s => s.status === 'complete').length;
  const progressPercent = Math.round((completedSteps / discoverySteps.length) * 100);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border p-5">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-[9px] text-gray-400 uppercase font-semibold tracking-wide">Real-Time Discovery</p>
            <h2 className="text-lg font-bold text-gray-900">Discovery Progress</h2>
            <p className="text-xs text-gray-500 mt-0.5">Automated scanning of client environment (read-only)</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-purple-600">{progressPercent}%</p>
            <p className="text-[9px] text-gray-400">
              {isRunning ? 'IN PROGRESS' : isComplete ? 'COMPLETE' : isFailed ? 'FAILED' : 'NOT STARTED'}
            </p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-3">
          <div className={`h-full rounded-full transition-all duration-1000 ${isComplete ? 'bg-green-500' : isFailed ? 'bg-red-500' : 'bg-purple-500'}`} style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-[9px] text-gray-400">{completedSteps}/{discoverySteps.length} steps complete</p>
          <p className="text-[9px] text-gray-400">Updated {lastRefresh || '—'}</p>
        </div>
      </div>

      {/* Discovery Steps — Real-time */}
      <div className="bg-white rounded-xl border p-5">
        <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-4">Discovery Steps</h3>
        <div className="space-y-3">
          {discoverySteps.map((step, idx) => (
            <div key={step.id} className={`flex items-center gap-3 p-3 rounded-lg border ${step.status === 'complete' ? 'border-green-200 bg-green-50/30' : step.status === 'running' ? 'border-purple-200 bg-purple-50/30' : 'border-gray-100'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${step.status === 'complete' ? 'bg-green-500 text-white' : step.status === 'running' ? 'bg-purple-500 text-white animate-pulse' : 'bg-gray-200 text-gray-400'}`}>
                {step.status === 'complete' ? (
                  <span className="text-xs font-bold">✓</span>
                ) : step.status === 'running' ? (
                  <span className="text-xs font-bold">⟳</span>
                ) : (
                  <span className="text-xs font-bold">{idx + 1}</span>
                )}
              </div>
              <div className="flex-1">
                <p className={`text-xs font-medium ${step.status === 'complete' ? 'text-green-700' : step.status === 'running' ? 'text-purple-700' : 'text-gray-500'}`}>{step.label}</p>
              </div>
              <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded ${step.status === 'complete' ? 'bg-green-100 text-green-700' : step.status === 'running' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-400'}`}>
                {step.status === 'complete' ? 'DONE' : step.status === 'running' ? 'RUNNING' : 'PENDING'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Discovery Results (if any) */}
      {latestRun && (
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-4">Discovery Results</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-purple-50 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-purple-600">{latestRun.resources_found}</p>
              <p className="text-[9px] text-purple-500">Resources Found</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-blue-600">{latestRun.connectors_used?.length || 0}</p>
              <p className="text-[9px] text-blue-500">Connectors Used</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-amber-600">{latestRun.warnings}</p>
              <p className="text-[9px] text-amber-500">Warnings</p>
            </div>
            <div className={`${latestRun.errors > 0 ? 'bg-red-50' : 'bg-green-50'} rounded-lg p-3 text-center`}>
              <p className={`text-lg font-bold ${latestRun.errors > 0 ? 'text-red-600' : 'text-green-600'}`}>{latestRun.errors}</p>
              <p className={`text-[9px] ${latestRun.errors > 0 ? 'text-red-500' : 'text-green-500'}`}>Errors</p>
            </div>
          </div>

          {/* Run Details */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-[10px]">
            <div className="flex justify-between"><span className="text-gray-500">Run ID</span><span className="font-mono text-gray-700">{latestRun.id}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Status</span><span className={`font-bold uppercase ${latestRun.status === 'completed' ? 'text-green-600' : latestRun.status === 'failed' ? 'text-red-600' : 'text-purple-600'}`}>{latestRun.status}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Started</span><span className="text-gray-700">{new Date(latestRun.started_at).toLocaleString()}</span></div>
            {latestRun.completed_at && <div className="flex justify-between"><span className="text-gray-500">Completed</span><span className="text-gray-700">{new Date(latestRun.completed_at).toLocaleString()}</span></div>}
            {latestRun.duration_ms && <div className="flex justify-between"><span className="text-gray-500">Duration</span><span className="text-gray-700">{latestRun.duration_ms}ms</span></div>}
            {latestRun.connectors_used?.length > 0 && <div className="flex justify-between"><span className="text-gray-500">Connectors</span><span className="text-gray-700">{latestRun.connectors_used.join(', ')}</span></div>}
          </div>

          {/* Evidence Trail */}
          {latestRun.evidence?.length > 0 && (
            <div className="mt-4 pt-3 border-t">
              <p className="text-[10px] font-semibold text-gray-700 mb-2">Evidence Trail</p>
              <div className="space-y-1">
                {latestRun.evidence.map((e, i) => (
                  <p key={i} className="text-[10px] text-gray-600 flex items-start gap-2">
                    <span className="text-green-500 shrink-0">✓</span>{e}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* No Discovery Yet */}
      {!latestRun && !loading && (
        <div className="bg-white rounded-xl border p-5 text-center">
          <div className="w-14 h-14 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">🔍</span>
          </div>
          <p className="text-sm font-semibold text-gray-800">No Discovery Run Yet</p>
          <p className="text-xs text-gray-500 mt-1">Start discovery to scan the client's environment.</p>
          {error && (
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-left">
              <p className="text-xs font-semibold text-amber-700 mb-1">⚠ Cannot start discovery</p>
              <p className="text-[10px] text-amber-600">{error}</p>
              <p className="text-[10px] text-gray-500 mt-2">Go back to the lifecycle page and complete the Connector Configuration step first.</p>
            </div>
          )}
          <button onClick={startDiscovery} disabled={starting} className="mt-4 text-sm font-semibold bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white px-5 py-2.5 rounded-lg transition">
            {starting ? 'Starting...' : 'Start Discovery →'}
          </button>
        </div>
      )}

      {/* Error (when discovery already exists but refresh fails) */}
      {error && latestRun && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Link href={`/clients/${clientId}/lifecycle`} className="text-xs font-medium text-gray-600 hover:text-gray-900 border rounded-lg px-4 py-2 hover:bg-gray-50 transition">
          ← Back to Lifecycle
        </Link>
        {isComplete && (
          <Link href={`/clients/${clientId}/lifecycle`} className="text-xs font-semibold bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition">
            Continue to Assessment →
          </Link>
        )}
        {!latestRun && (
          <button onClick={startDiscovery} disabled={starting} className="text-xs font-semibold bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg transition">
            {starting ? 'Starting...' : 'Start Discovery'}
          </button>
        )}
        <button onClick={fetchDiscovery} className="text-xs text-purple-600 hover:text-purple-800 font-medium ml-auto">
          ↻ Refresh Now
        </button>
      </div>
    </div>
  );
}
