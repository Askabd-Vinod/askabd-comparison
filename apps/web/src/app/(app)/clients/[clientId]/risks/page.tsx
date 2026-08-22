'use client';
import { useState, useEffect } from 'react';
import { ErrorState } from '../../../../components/error-state';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

/**
 * PREVIOUSLY: this page showed 4 hardcoded risks — identical title, category,
 * likelihood, impact, mitigation text, and even the same named engineer as
 * "owner" — for every single client, plus a hardcoded "Priority: Address
 * single point of failure" recommendation and a hardcoded "database
 * replication" SolutionRecommendation regardless of whether that client's
 * real environment even has a database-layer risk. Only reachable at all
 * for the ~20 static demo clients (every real client fell through to a
 * fabricated CapabilityPlaceholder fallback, fixed earlier this session).
 *
 * NOW: reuses the same real, evidence-based `GET /oc/clients/:clientId/health-score`
 * endpoint already used by Readiness, Scorecard, and Maturity — each
 * dimension's real weaknesses become this client's real risk register
 * entries. No fabricated likelihood/impact/owner/trend fields are shown —
 * the health-score engine doesn't track those per-weakness, so they're
 * omitted rather than invented. Found during the 2026-08-22 global UX audit.
 */
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

interface RiskRow { id: string; category: string; title: string; severity: 'critical' | 'high' | 'medium' | 'low'; dimensionScore: number; }

interface PageProps { params: Promise<{ clientId: string }> }

function severityForScore(score: number): RiskRow['severity'] {
  if (score < 30) return 'critical';
  if (score < 55) return 'high';
  if (score < 80) return 'medium';
  return 'low';
}

export default function ClientRisksPage({ params }: PageProps) {
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
      else setError('Unable to compute the risk register. The backend may be unavailable.');
    } catch (err) {
      setError(`Unable to reach AskABD API: ${(err as Error).message}`);
    }
    setLoading(false);
  }

  if (loading) return <div className="p-6 text-gray-400">Computing risk register...</div>;
  if (error) return (
    <div className="p-6">
      <ErrorState what="Risk register could not be computed" why="The AskABD API did not return a valid response." actions={['Confirm the API is reachable', 'Retry the computation']} technicalDetail={error} onRetry={() => load(clientId)} />
    </div>
  );
  if (!health) return <div className="p-6 text-gray-400">No risk data available.</div>;

  const risks: RiskRow[] = health.dimensions.flatMap((dim, di) =>
    dim.weaknesses.map((w, wi) => ({ id: `${di}-${wi}`, category: dim.name, title: w, severity: severityForScore(dim.score), dimensionScore: dim.score }))
  ).sort((a, b) => a.dimensionScore - b.dimensionScore);

  const severityColor: Record<string, string> = { critical: 'bg-red-100 text-red-700', high: 'bg-orange-100 text-orange-700', medium: 'bg-yellow-100 text-yellow-700', low: 'bg-blue-100 text-blue-700' };

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Risk Register</h2>
      <p className="text-xs text-gray-500 mb-4">Real risks derived from the same evidence-based dimension checks as the client scorecard, readiness, and maturity pages.</p>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Total Risks" value={risks.length} />
        <Stat label="Critical" value={risks.filter(r => r.severity === 'critical').length} color="text-red-600" />
        <Stat label="High" value={risks.filter(r => r.severity === 'high').length} color="text-orange-600" />
        <Stat label="Medium" value={risks.filter(r => r.severity === 'medium').length} color="text-yellow-600" />
      </div>

      {/* Risk Table */}
      {risks.length === 0 ? (
        <div className="bg-white rounded-xl border p-10 text-center">
          <p className="text-sm font-medium text-gray-700">No risks identified</p>
          <p className="text-xs text-gray-400 mt-1">Every evidence-based dimension check is currently passing for this client.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="text-left px-5 py-3">Risk</th>
                  <th className="text-left px-4 py-3">Category</th>
                  <th className="text-left px-4 py-3">Severity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {risks.map(risk => (
                  <tr key={risk.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3"><p className="font-medium text-gray-900 text-xs">{risk.title}</p></td>
                    <td className="px-4 py-3 text-xs">{risk.category}</td>
                    <td className="px-4 py-3"><span className={`text-[11px] font-medium px-2 py-0.5 rounded ${severityColor[risk.severity]}`}>{risk.severity}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {health.recommendedActions.length > 0 && (
        <section className="bg-orange-50 border border-orange-200 rounded-xl p-5">
          <h3 className="font-semibold text-orange-800 mb-3">Recommended Actions</h3>
          <ul className="space-y-2">
            {health.recommendedActions.map((action, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-orange-700">
                <span className="mt-0.5 text-orange-400">→</span>
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return <div className="bg-white rounded-xl border p-3 text-center"><p className={`text-lg font-bold ${color || 'text-gray-900'}`}>{value}</p><p className="text-[10px] text-gray-500 uppercase">{label}</p></div>;
}
