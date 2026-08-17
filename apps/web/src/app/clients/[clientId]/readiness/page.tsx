'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ErrorState } from '../../../components/error-state';
import { EvidenceBadge } from '../../../components/evidence-status';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

/**
 * PREVIOUSLY: this page derived 10 named "readiness dimensions" (Business, Technology,
 * Connector, Security, Governance, Operations, Documentation, Automation, Production, AI
 * Readiness) by adding or subtracting arbitrary constants (+3, +5, -15, -20, -25, -30, etc.)
 * from a single `mock-clients.ts` field (`platformScore`) — arithmetic on one number, not ten
 * independent measurements, and only reachable at all for the ~20 static demo clients (every
 * real client fell through to a fabricated CapabilityPlaceholder fallback, fixed earlier this
 * session).
 *
 * NOW: this page calls the same real, evidence-based `GET /oc/clients/:clientId/health-score`
 * endpoint already used correctly by the Scorecard page — reusing the same real calculation
 * rather than duplicating it (see docs/enterprise-feature-gap-register.md, "duplicated
 * readiness calculations"), with a distinct framing: which dimensions are below a proceed
 * threshold and therefore BLOCK moving the client forward, vs. Scorecard's ongoing
 * health-monitoring framing of the identical underlying data.
 */
const PROCEED_THRESHOLD = 80;

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

export default function ClientReadinessPage({ params }: PageProps) {
  const [clientId, setClientId] = useState('');
  const [health, setHealth] = useState<ClientHealth | null>(null);
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
      const res = await fetch(`${API}/api/v1/oc/clients/${id}/health-score`);
      if (res.ok) {
        setHealth(await res.json());
      } else {
        setError('Unable to compute readiness. The backend may be unavailable.');
      }
    } catch (err) {
      setError(`Unable to reach AskABD API: ${(err as Error).message}`);
    }
    setLoading(false);
  }

  if (loading) return <div className="p-6 text-gray-400">Computing readiness...</div>;
  if (error) return (
    <div className="p-6">
      <ErrorState
        what="Readiness could not be computed"
        why="The AskABD API did not return a valid response."
        actions={['Confirm the API is reachable', 'Retry the computation']}
        technicalDetail={error}
        onRetry={() => load(clientId)}
      />
    </div>
  );
  if (!health) return <div className="p-6 text-gray-400">No readiness data available.</div>;

  const blocking = health.dimensions.filter(d => d.score < PROCEED_THRESHOLD);
  const met = health.dimensions.filter(d => d.score >= PROCEED_THRESHOLD);

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Readiness Center</h2>
      <p className="text-xs text-gray-500 mb-6">
        Which dimensions are ready to proceed vs. blocking — computed from the same real data as the client scorecard, evaluated against an {PROCEED_THRESHOLD}% proceed threshold.
      </p>

      {/* Overall */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border p-5 text-center">
          <p className={`text-3xl font-bold ${health.overallScore >= PROCEED_THRESHOLD ? 'text-green-600' : health.overallScore >= 50 ? 'text-orange-600' : 'text-red-600'}`}>{health.overallScore}%</p>
          <p className="text-xs text-gray-500 mt-1">Overall Readiness</p>
        </div>
        <div className="bg-white rounded-xl border p-5 text-center">
          <p className="text-3xl font-bold text-green-600">{met.length}/{health.dimensions.length}</p>
          <p className="text-xs text-gray-500 mt-1">Dimensions Ready</p>
        </div>
        <div className="bg-white rounded-xl border p-5 text-center">
          <p className="text-3xl font-bold text-orange-600">{blocking.length}</p>
          <p className="text-xs text-gray-500 mt-1">Blocking Progress</p>
        </div>
      </div>

      {/* Dimensions */}
      <section className="bg-white rounded-xl border p-5 mb-6">
        <h3 className="font-semibold mb-4">Readiness Dimensions</h3>
        <div className="space-y-3">
          {health.dimensions.map(dim => {
            const ready = dim.score >= PROCEED_THRESHOLD;
            const color = ready ? 'bg-green-500' : dim.score >= 50 ? 'bg-orange-500' : 'bg-red-500';
            return (
              <div key={dim.name}>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium w-40 text-gray-700">{dim.name}</span>
                  <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${color}`} style={{ width: `${dim.score}%` }} />
                  </div>
                  <span className="text-xs font-bold w-10 text-right">{dim.score}%</span>
                  <EvidenceBadge status={ready ? 'verified' : 'action_required'} label={ready ? 'Ready' : 'Blocking'} />
                </div>
                {!ready && dim.weaknesses.length > 0 && (
                  <p className="ml-40 mt-1 text-[11px] text-orange-600">Why: {dim.weaknesses.slice(0, 2).join('; ')}</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* What's blocking progress */}
      {health.recommendedActions.length > 0 && (
        <section className="bg-orange-50 border border-orange-200 rounded-xl p-5 mb-6">
          <h3 className="font-semibold text-orange-800 mb-3">What's Blocking Progress</h3>
          <ul className="space-y-2">
            {health.recommendedActions.map((action, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-orange-700">
                <span className="mt-0.5 text-orange-400">→</span>
                <span>{action}</span>
              </li>
            ))}
          </ul>
          <Link href={`/clients/${clientId}/lifecycle`} className="inline-block mt-3 text-xs font-medium text-orange-700 hover:text-orange-900 underline">
            Resolve on the client lifecycle page →
          </Link>
        </section>
      )}

      <div className="flex items-center gap-3 text-xs text-gray-400">
        <span>Computed at {new Date(health.computedAt).toLocaleString()}</span>
        <Link href={`/clients/${clientId}/scorecard`} className="text-purple-600 hover:text-purple-800 font-medium">View full scorecard →</Link>
      </div>
    </div>
  );
}
