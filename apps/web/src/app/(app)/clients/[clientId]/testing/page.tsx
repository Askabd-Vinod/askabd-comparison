'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ErrorState } from '../../../../components/error-state';
import { EvidenceBadge, connectionEvidenceStatus } from '../../../../components/evidence-status';
import { TestingEngineManager } from './testing-engine-manager';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

/**
 * PREVIOUSLY: this page showed a hardcoded `testSuites` array ("Smoke Tests: 12/12 passed",
 * "Deployment Validation: 7/8 passed", etc.) — identical for every mock client, never sourced
 * from any real test-execution system. That was replaced with real connection-test history
 * from `oc_connection_tests` (see `ConnectionTestHistory` below) — a real history of connector
 * verification attempts, but genuinely narrower than a real QA test system.
 *
 * NOW: this page's primary content is the real Universal Testing & Validation Engine
 * (migration 049) — real, rule-based test-case generation from business requirements/gaps/
 * discovery evidence, real execution recording (never a fabricated PASS), real defect creation
 * and retest workflow, real requirement coverage, and a real exportable report. See
 * `testing-engine-manager.tsx`. Connection-test history remains real and useful — it is kept
 * as a secondary section below, since a connector verification attempt is itself one real,
 * legitimate source of test evidence, not a competing concept.
 */
interface ConnectionTest {
  id: string;
  provider: string;
  status: 'connected' | 'failed' | 'partial';
  mode: string;
  duration_ms: number;
  steps: { step: string; pass: boolean; durationMs: number; error?: string }[];
  error_message: string;
  tested_at: string;
}

interface PageProps { params: Promise<{ clientId: string }> }

export default function ClientTestingPage({ params }: PageProps) {
  const [clientId, setClientId] = useState('');
  const [tests, setTests] = useState<ConnectionTest[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    params.then(p => {
      setClientId(p.clientId);
      load(p.clientId);
    });
  }, [params]);

  async function load(id: string) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/v1/oc/clients/${id}/connection-tests`);
      if (res.ok) {
        const data = await res.json();
        setTests(data.tests);
      } else {
        setError('Unable to load connection-test history. The backend may be unavailable.');
      }
    } catch (err) {
      setError(`Unable to reach AskABD API: ${(err as Error).message}`);
    }
    setLoading(false);
  }

  if (loading) return <div className="p-6 text-gray-400">Loading connection-test history...</div>;
  if (error) return (
    <div className="p-6">
      <ErrorState
        what="Connection-test history could not be loaded"
        why="The AskABD API did not return a valid response."
        actions={['Confirm the API is reachable', 'Retry the request']}
        technicalDetail={error}
        onRetry={() => load(clientId)}
      />
    </div>
  );

  const passed = (tests ?? []).filter(t => t.status === 'connected').length;
  const failed = (tests ?? []).filter(t => t.status === 'failed').length;
  const partial = (tests ?? []).filter(t => t.status === 'partial').length;

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Testing</h2>
      <p className="text-xs text-gray-500 mb-6">
        The real Universal Testing &amp; Validation Engine — generate real, reasoned test cases from this
        client's requirements, gaps, and discovery evidence, record real execution evidence, and track real
        defects through to retest. Connection-test history (below) remains a real, separate evidence source.
      </p>

      <TestingEngineManager clientId={clientId} />

      <h3 className="font-semibold text-sm mt-10 mb-1">Connection Test History</h3>
      <p className="text-xs text-gray-500 mb-4">
        Real evidence from every connector verification attempt for this client.
      </p>

      {!tests || tests.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
          <p className="text-sm font-medium text-gray-700">No connection tests have been run yet for this client</p>
          <p className="text-xs text-gray-500 mt-1">Configure and test a connector to see real verification evidence here.</p>
          <Link href={`/clients/${clientId}/connectors`} className="inline-block mt-3 text-xs font-medium text-purple-600 hover:text-purple-800 underline">
            Go to Connectors →
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Stat label="Total Tests" value={tests.length} />
            <Stat label="Connected" value={passed} color="text-green-600" />
            <Stat label="Failed" value={failed} color={failed > 0 ? 'text-red-600' : undefined} />
            <Stat label="Partial" value={partial} color={partial > 0 ? 'text-orange-600' : undefined} />
          </div>

          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="text-left px-5 py-3">Provider</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Mode</th>
                  <th className="text-left px-4 py-3">Duration</th>
                  <th className="text-left px-4 py-3">Steps</th>
                  <th className="text-left px-4 py-3">Tested At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tests.map(t => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-xs">{t.provider}</td>
                    <td className="px-4 py-3">
                      <EvidenceBadge status={connectionEvidenceStatus(t.status)} />
                      {t.error_message && <p className="text-[10px] text-red-500 mt-1">{t.error_message}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{t.mode}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{t.duration_ms}ms</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{t.steps.filter(s => s.pass).length}/{t.steps.length} passed</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{new Date(t.tested_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </>
      )}

      <div className="mt-6">
        <Link href={`/clients/${clientId}/connectors`} className="text-xs text-purple-600 font-medium hover:text-purple-800">Manage Connectors →</Link>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return <div className="bg-white rounded-xl border p-3 text-center"><p className={`text-lg font-bold ${color || 'text-gray-900'}`}>{value}</p><p className="text-[10px] text-gray-500 uppercase">{label}</p></div>;
}
