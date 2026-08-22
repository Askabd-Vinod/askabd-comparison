'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ErrorState } from '../../../../components/error-state';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

/**
 * PREVIOUSLY: this page derived 11 named "maturity dimensions" (Architecture,
 * DevOps, Security, Operations, Governance, Monitoring, Documentation, Testing,
 * Automation, Cloud, AI Readiness) by adding/subtracting arbitrary constants
 * (+5, -3, +2, -5, +8, -15, -8, -10, +3, -25) from a single `mock-clients.ts`
 * field (`platformScore`) — arithmetic on one number, not eleven independent
 * measurements — then compounded that fabrication into a weighted "overall
 * maturity" average, a "gap to close," and auto-generated improvement-priority
 * recommendations that cited the fabricated per-dimension gaps as if real.
 * Only reachable at all for the ~20 static demo clients (every real client
 * fell through to a fabricated CapabilityPlaceholder fallback, fixed earlier
 * this session).
 *
 * NOW: reuses the same real, evidence-based `GET /oc/clients/:clientId/health-score`
 * endpoint already used correctly by the Readiness and Scorecard pages —
 * one real calculation engine, three framings (see docs/enterprise-feature-
 * gap-register.md, "duplicated readiness calculations"). Readiness asks "is
 * this dimension blocking progress right now?"; Maturity asks "how close is
 * this dimension to a mature target level?" — same underlying real
 * dimensions and scores either way. Found during the 2026-08-22 global UX
 * audit.
 */
const TARGET_MATURITY = 85;

interface HealthDimension {
  name: string;
  score: number;
  weight: number;
  checks: { name: string; passed: boolean; detail: string }[];
  strengths: string[];
  weaknesses: string[];
}

interface ClientHealth {
  clientId: string;
  overallScore: number;
  dimensions: HealthDimension[];
  topRisks: string[];
  recommendedActions: string[];
  computedAt: string;
}

interface PageProps { params: Promise<{ clientId: string }> }

export default function ClientMaturityPage({ params }: PageProps) {
  const [clientId, setClientId] = useState('');
  const [health, setHealth] = useState<ClientHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    params.then(p => { setClientId(p.clientId); load(p.clientId); });
  }, [params]);

  async function load(id: string) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/v1/oc/clients/${id}/health-score`);
      if (res.ok) setHealth(await res.json());
      else setError('Unable to compute maturity. The backend may be unavailable.');
    } catch (err) {
      setError(`Unable to reach AskABD API: ${(err as Error).message}`);
    }
    setLoading(false);
  }

  if (loading) return <div className="p-6 text-gray-400">Computing maturity...</div>;
  if (error) return (
    <div className="p-6">
      <ErrorState what="Maturity could not be computed" why="The AskABD API did not return a valid response." actions={['Confirm the API is reachable', 'Retry the computation']} technicalDetail={error} onRetry={() => load(clientId)} />
    </div>
  );
  if (!health) return <div className="p-6 text-gray-400">No maturity data available.</div>;

  const met = health.dimensions.filter(d => d.score >= TARGET_MATURITY);
  const gaps = health.dimensions.filter(d => d.score < TARGET_MATURITY).sort((a, b) => a.score - b.score);

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Enterprise Maturity Assessment</h2>
      <p className="text-xs text-gray-500 mb-6">
        How close each real dimension is to a {TARGET_MATURITY}% mature target level — computed from the same real data as the client scorecard and readiness pages.
      </p>

      {/* Overall Score */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border p-5 text-center">
          <p className="text-3xl font-bold gradient-text">{health.overallScore}%</p>
          <p className="text-xs text-gray-500 mt-1">Current Maturity</p>
        </div>
        <div className="bg-white rounded-xl border p-5 text-center">
          <p className="text-3xl font-bold text-green-600">{met.length}/{health.dimensions.length}</p>
          <p className="text-xs text-gray-500 mt-1">Dimensions At Target</p>
        </div>
        <div className="bg-white rounded-xl border p-5 text-center">
          <p className="text-3xl font-bold text-orange-600">{Math.max(0, TARGET_MATURITY - health.overallScore)}%</p>
          <p className="text-xs text-gray-500 mt-1">Overall Gap to Target</p>
        </div>
      </div>

      {/* Dimension Breakdown */}
      <section className="bg-white rounded-xl border p-5 mb-6">
        <h3 className="font-semibold mb-4">Dimension Scores</h3>
        <div className="space-y-3">
          {health.dimensions.map(dim => {
            const gap = TARGET_MATURITY - dim.score;
            const color = dim.score >= TARGET_MATURITY ? 'bg-green-500' : dim.score >= TARGET_MATURITY - 15 ? 'bg-orange-500' : 'bg-red-500';
            return (
              <div key={dim.name} className="flex items-center gap-4">
                <span className="text-xs font-medium w-28 text-gray-700">{dim.name}</span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden relative">
                  <div className={`h-full rounded-full ${color}`} style={{ width: `${dim.score}%` }} />
                  <div className="absolute top-0 h-full w-px bg-purple-600" style={{ left: `${TARGET_MATURITY}%` }} title={`Target: ${TARGET_MATURITY}%`} />
                </div>
                <span className="text-xs font-bold w-10 text-right">{dim.score}%</span>
                <span className="text-[10px] text-gray-400 w-16 text-right">Target: {TARGET_MATURITY}%</span>
                <span className={`text-[10px] font-medium w-12 text-right ${gap > 0 ? 'text-orange-600' : 'text-green-600'}`}>{gap > 0 ? `-${gap}%` : '✓ Met'}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Improvement Priorities — real weaknesses from the health-score engine,
          not fabricated per-dimension gap narration */}
      {gaps.length > 0 && (
        <section className="bg-orange-50 border border-orange-200 rounded-xl p-5 mb-6">
          <h3 className="font-semibold text-orange-800 mb-3">Improvement Priorities</h3>
          <div className="space-y-3">
            {gaps.slice(0, 4).map(dim => (
              <div key={dim.name}>
                <p className="text-sm font-medium text-orange-900">{dim.name}: {TARGET_MATURITY - dim.score}% below target</p>
                {dim.weaknesses.length > 0 ? (
                  <p className="text-xs text-orange-700 mt-0.5">{dim.weaknesses.slice(0, 2).join('; ')}</p>
                ) : (
                  <p className="text-xs text-orange-600 mt-0.5">No specific weaknesses recorded for this dimension yet.</p>
                )}
              </div>
            ))}
          </div>
          <Link href={`/clients/${clientId}/roadmap`} className="inline-block mt-3 text-xs font-medium text-orange-700 hover:text-orange-900 underline">
            View improvement roadmap →
          </Link>
        </section>
      )}

      <div className="flex items-center gap-3 text-xs text-gray-400">
        <span>Computed at {new Date(health.computedAt).toLocaleString()}</span>
        <Link href={`/clients/${clientId}/readiness`} className="text-purple-600 hover:text-purple-800 font-medium">View readiness breakdown →</Link>
        <Link href={`/clients/${clientId}/scorecard`} className="text-purple-600 hover:text-purple-800 font-medium">View full scorecard →</Link>
      </div>
    </div>
  );
}
