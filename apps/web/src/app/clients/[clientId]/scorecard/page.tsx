'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

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
  strengths: string[];
  weaknesses: string[];
  recommendedActions: string[];
  computedAt: string;
}

interface PageProps { params: Promise<{ clientId: string }> }

export default function ClientScorecardPage({ params }: PageProps) {
  const [clientId, setClientId] = useState('');
  const [health, setHealth] = useState<ClientHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    params.then(p => {
      setClientId(p.clientId);
      loadHealth(p.clientId);
    });
  }, [params]);

  async function loadHealth(id: string) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/v1/oc/clients/${id}/health-score`);
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      } else {
        setError('Unable to compute health score. The backend may be unavailable.');
      }
    } catch (err) {
      setError(`Unable to reach AskABD API: ${(err as Error).message}`);
    }
    setLoading(false);
  }

  if (loading) return <div className="p-6 text-gray-400">Computing health score...</div>;
  if (error) return (
    <div className="p-6">
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700 font-medium">Health Score Unavailable</p>
        <p className="text-sm text-red-600 mt-1">{error}</p>
        <button onClick={() => loadHealth(clientId)} className="mt-2 px-3 py-1 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200">Retry</button>
      </div>
    </div>
  );
  if (!health) return <div className="p-6 text-gray-400">No health data available.</div>;

  const overallLabel = health.overallScore >= 90 ? 'Excellent' : health.overallScore >= 75 ? 'Good' : health.overallScore >= 60 ? 'Needs Improvement' : health.overallScore >= 40 ? 'At Risk' : 'Critical';
  const overallColor = health.overallScore >= 80 ? 'text-green-600' : health.overallScore >= 60 ? 'text-orange-600' : 'text-red-600';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-lg">Client Health Score</h2>
          <p className="text-xs text-gray-500">Multi-dimensional health computed from real platform data.</p>
        </div>
        <button onClick={() => loadHealth(clientId)} className="text-xs px-3 py-1.5 bg-purple-50 text-purple-700 rounded hover:bg-purple-100">
          Recompute
        </button>
      </div>

      {/* Overall Score */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-5 text-center">
          <p className={`text-4xl font-bold ${overallColor}`}>{health.overallScore}</p>
          <p className="text-xs text-gray-500 mt-1">Overall Health (0–100)</p>
        </div>
        <div className="bg-white rounded-xl border p-5 text-center">
          <p className={`text-2xl font-bold ${overallColor}`}>{overallLabel}</p>
          <p className="text-xs text-gray-500 mt-1">Status</p>
        </div>
        <div className="bg-white rounded-xl border p-5 text-center">
          <p className="text-xs text-gray-400">Computed at</p>
          <p className="text-sm font-medium mt-1">{new Date(health.computedAt).toLocaleString()}</p>
        </div>
      </div>

      {/* Dimension Breakdown */}
      <section className="bg-white rounded-xl border p-5">
        <h3 className="font-semibold mb-4">Health Dimensions</h3>
        <div className="space-y-4">
          {health.dimensions.map(dim => {
            const color = dim.score >= 80 ? 'bg-green-500' : dim.score >= 60 ? 'bg-yellow-500' : dim.score >= 40 ? 'bg-orange-500' : 'bg-red-500';
            return (
              <div key={dim.name} className="space-y-1">
                <div className="flex items-center gap-4">
                  <span className="text-xs font-medium w-24 text-gray-700">{dim.name}</span>
                  <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${dim.score}%` }} />
                  </div>
                  <span className="text-xs font-bold w-12 text-right">{dim.score}%</span>
                  <span className="text-[10px] text-gray-400 w-16 text-right">weight: {dim.weight}%</span>
                </div>
                {/* Explain score */}
                {dim.weaknesses.length > 0 && (
                  <div className="ml-28 text-[11px] text-orange-600">
                    Why not 100%: {dim.weaknesses.slice(0, 2).join('; ')}
                  </div>
                )}
                {dim.score === 100 && dim.strengths.length > 0 && (
                  <div className="ml-28 text-[11px] text-green-600">
                    ✓ {dim.strengths[0]}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Recommended Actions */}
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

      {/* Top Risks */}
      {health.topRisks.length > 0 && (
        <section className="bg-red-50 border border-red-200 rounded-xl p-5">
          <h3 className="font-semibold text-red-800 mb-3">Top Risks</h3>
          <ul className="space-y-1.5">
            {health.topRisks.map((risk, i) => (
              <li key={i} className="text-sm text-red-700">⚠ {risk}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Strengths */}
      {health.strengths.length > 0 && (
        <section className="bg-green-50 border border-green-200 rounded-xl p-5">
          <h3 className="font-semibold text-green-800 mb-3">Strengths</h3>
          <ul className="space-y-1.5">
            {health.strengths.map((s, i) => (
              <li key={i} className="text-sm text-green-700">✓ {s}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
