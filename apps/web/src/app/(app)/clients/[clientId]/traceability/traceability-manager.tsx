'use client';
import { useState } from 'react';
import type { BusinessRequirement } from '../business-requirements/business-requirements-manager';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

interface ChainLink {
  id: string; sourceType: string; sourceId: string; targetType: string; targetId: string;
  linkType: string; depth: number; sourceLabel: string | null; targetLabel: string | null;
}
interface TraceResult {
  entity: { type: string; id: string; label: string | null };
  outbound: unknown[]; inbound: unknown[];
  forwardChain: ChainLink[]; backwardChain: ChainLink[];
}

const TYPE_LABEL: Record<string, string> = {
  business_requirement: 'Requirement', gap: 'Gap', recommendation: 'Recommendation',
  transformation: 'Transformation', generated_document: 'Document', problem: 'Problem',
  discovery_source: 'Discovery Source', discovery_extraction: 'Extraction', assessment: 'Assessment',
  decision: 'Decision', gap_evidence: 'Evidence', client_profile: 'Client',
};
const TYPE_COLOR: Record<string, string> = {
  business_requirement: 'bg-blue-50 text-blue-700 border-blue-200',
  gap: 'bg-orange-50 text-orange-700 border-orange-200',
  recommendation: 'bg-purple-50 text-purple-700 border-purple-200',
  transformation: 'bg-green-50 text-green-700 border-green-200',
  generated_document: 'bg-gray-100 text-gray-700 border-gray-200',
};

function EntityChip({ type, id, label }: { type: string; id: string; label: string | null }) {
  const cls = TYPE_COLOR[type] || 'bg-gray-50 text-gray-500 border-gray-200';
  return (
    <span className={`inline-flex flex-col items-start text-left px-2 py-1 rounded-md border ${cls}`}>
      <span className="text-[8px] font-semibold uppercase tracking-wide opacity-70">{TYPE_LABEL[type] || type}</span>
      <span className="text-[11px] font-medium">
        {label ?? <span className="italic opacity-60">Label unavailable ({id.slice(0, 8)}…)</span>}
      </span>
    </span>
  );
}

function ChainView({ chain, rootLabel, rootType, rootId, emptyMessage }: { chain: ChainLink[]; rootLabel: string | null; rootType: string; rootId: string; emptyMessage: string }) {
  if (chain.length === 0) {
    return <p className="text-xs text-gray-400 italic py-2">{emptyMessage}</p>;
  }
  const byDepth = new Map<number, ChainLink[]>();
  for (const link of chain) {
    if (!byDepth.has(link.depth)) byDepth.set(link.depth, []);
    byDepth.get(link.depth)!.push(link);
  }
  const depths = Array.from(byDepth.keys()).sort((a, b) => a - b);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-gray-400 uppercase tracking-wide">Start</span>
        <EntityChip type={rootType} id={rootId} label={rootLabel} />
      </div>
      {depths.map(depth => (
        <div key={depth} className="pl-4 border-l-2 border-gray-200 space-y-2">
          <p className="text-[9px] text-gray-400 uppercase tracking-wide">Hop {depth}</p>
          {byDepth.get(depth)!.map(link => (
            <div key={link.id} className="flex items-center gap-2 flex-wrap">
              <EntityChip type={link.sourceType} id={link.sourceId} label={link.sourceLabel} />
              <span className="text-[9px] text-gray-400 font-mono">— {link.linkType} →</span>
              <EntityChip type={link.targetType} id={link.targetId} label={link.targetLabel} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function TraceabilityManager({ clientId, requirements }: { clientId: string; requirements: BusinessRequirement[] }) {
  const [selectedId, setSelectedId] = useState('');
  const [result, setResult] = useState<TraceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadTrace(requirementId: string) {
    setSelectedId(requirementId);
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch(`${API}/api/v1/oc/traceability/business_requirement/${requirementId}`);
      if (!res.ok) { setError('Could not load the trace for this requirement.'); return; }
      setResult(await res.json());
    } catch { setError('Could not reach the server. Please try again.'); }
    finally { setLoading(false); }
  }

  if (requirements.length === 0) {
    return (
      <div className="bg-white rounded-xl border p-10 text-center text-sm text-gray-400">
        No business requirements recorded yet for this client. Add one from the Business Requirements tab
        to start tracing its real downstream chain.
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div className="bg-white rounded-xl border p-3 md:col-span-1">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Business Requirements</p>
        <div className="space-y-1">
          {requirements.map(r => (
            <button
              key={r.id}
              onClick={() => loadTrace(r.id)}
              className={`w-full text-left px-2.5 py-2 rounded-md text-xs transition ${selectedId === r.id ? 'bg-purple-50 text-purple-800 border border-purple-200' : 'hover:bg-gray-50 border border-transparent'}`}
            >
              {r.title}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border p-5 md:col-span-2 space-y-5">
        {!selectedId && <p className="text-xs text-gray-400">Select a requirement on the left to see its real trace, in both directions.</p>}
        {loading && <p className="text-xs text-gray-400">Loading trace…</p>}
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</p>}
        {result && !loading && (
          <>
            {/*
              Real, honest fix found via live Playwright verification (not assumed): the
              Testing Engine records `test_case --tests--> business_requirement` (the test
              case as source), the opposite direction from Gap Analysis/Document Generation's
              `business_requirement --derives_from--> gap` convention (the requirement as
              source). Showing only the forward chain silently hid every real, existing
              test-case link — under-reporting real data is its own kind of dishonesty, not
              just fabrication. Fixed by rendering BOTH directions, clearly labeled, so a
              real link is never invisible just because of which direction it happened to be
              recorded in.
            */}
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Downstream — what this requirement leads to</p>
              <ChainView chain={result.forwardChain} rootLabel={result.entity.label} rootType="business_requirement" rootId={result.entity.id} emptyMessage="No downstream links recorded for this requirement yet." />
            </div>
            <div className="pt-4 border-t">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Upstream — what points to this requirement (e.g. test cases that test it)</p>
              <ChainView chain={result.backwardChain} rootLabel={result.entity.label} rootType="business_requirement" rootId={result.entity.id} emptyMessage="No upstream links recorded for this requirement yet." />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
