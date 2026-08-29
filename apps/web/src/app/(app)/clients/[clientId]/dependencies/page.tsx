'use client';
import { useState, useEffect, useCallback } from 'react';
import { Action } from '../../../../components/button';
import { staffFetch } from '../../../../lib/staff-session';

/**
 * Dependency Analysis — real `depends_on` links, cycle detection, and
 * impact analysis backed by `traceability_links` (dependency-analysis
 * -engine.ts / dependency-analysis-routes.ts, `dependency_analysis_test_1`,
 * 2026-08-24). Tenth of the 11 engines wired into the staff UI (Phase 3,
 * "ASKABD ENTERPRISE OPERATIONS — INTEGRATION + COMPLETION PHASE",
 * 2026-08-25) — the last one with genuinely no prior UI anywhere.
 *
 * Deliberately not a list page: the real API has no "list all dependency
 * links" endpoint (by design — `TraceabilityEngine` already owns link
 * storage; this engine only adds cycle detection and impact analysis on
 * top of it), so this page is entity-picker-driven, matching the real
 * route shape exactly rather than inventing a listing endpoint that
 * doesn't exist.
 *
 * Entity pickers are restricted to the engine's own real, honest
 * ownership-verifiable allowlist (`risk`, `gaps`, `change_record`,
 * `deployment`, `requirement`) — sourced from each domain's own real,
 * already-wired API (Risk Register, Gap Analysis, Change Management,
 * Deployments, Business Requirements) rather than a free-typed id, so
 * every link this page can create is guaranteed to resolve.
 */
type EntityType = 'risk' | 'gaps' | 'change_record' | 'deployment' | 'requirement';
const ENTITY_TYPE_LABEL: Record<EntityType, string> = {
  risk: 'Risk', gaps: 'Gap', change_record: 'Change Record', deployment: 'Deployment', requirement: 'Requirement',
};
const ENTITY_LIST_PATH: Record<EntityType, string> = {
  risk: 'risks', gaps: 'gaps', change_record: 'changes', deployment: 'deployments', requirement: 'business-requirements',
};
const ENTITY_LIST_KEY: Record<EntityType, string> = {
  risk: 'risks', gaps: 'gaps', change_record: 'changes', deployment: 'deployments', requirement: 'requirements',
};

interface EntityOption { id: string; label: string }
interface DependencyLink { sourceType: string; sourceId: string; targetType: string; targetId: string; depth: number }
interface CycleResult { hasCycle: boolean; cyclePath: string[] }
interface DependencyImpact { entityType: string; entityId: string; dependents: number; dependencies: number; dependentPaths: DependencyLink[]; dependencyPaths: DependencyLink[] }

function entityLabel(type: EntityType, raw: any): string {
  if (type === 'deployment') return `${raw.application ?? raw.id} ${raw.version ?? ''} (${raw.environment ?? ''})`.trim();
  return raw.title ?? raw.id;
}

function useEntityOptions(clientId: string, type: EntityType) {
  const [options, setOptions] = useState<EntityOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!clientId) return;
    setLoaded(false);
    staffFetch(`/api/v1/oc/clients/${clientId}/${ENTITY_LIST_PATH[type]}`).then(async r => {
      if (r.ok) {
        const data = await r.json();
        const list: any[] = data[ENTITY_LIST_KEY[type]] ?? [];
        setOptions(list.map(item => ({ id: item.id, label: entityLabel(type, item) })));
      } else {
        setOptions([]);
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [clientId, type]);
  return { options, loaded };
}

function EntityPicker({ clientId, type, onTypeChange, entityId, onEntityChange }: {
  clientId: string; type: EntityType; onTypeChange: (t: EntityType) => void; entityId: string; onEntityChange: (id: string) => void;
}) {
  const { options, loaded } = useEntityOptions(clientId, type);
  return (
    <div className="grid md:grid-cols-2 gap-2">
      <select value={type} onChange={e => { onTypeChange(e.target.value as EntityType); onEntityChange(''); }} className="border rounded px-2 py-1.5 text-xs">
        {(Object.keys(ENTITY_TYPE_LABEL) as EntityType[]).map(t => <option key={t} value={t}>{ENTITY_TYPE_LABEL[t]}</option>)}
      </select>
      <select value={entityId} onChange={e => onEntityChange(e.target.value)} className="border rounded px-2 py-1.5 text-xs" disabled={!loaded}>
        <option value="">{loaded ? (options.length === 0 ? 'No real records of this type yet' : 'Choose…') : 'Loading…'}</option>
        {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  );
}

interface PageProps { params: Promise<{ clientId: string }> }

export default function DependenciesPage({ params }: PageProps) {
  const [clientId, setClientId] = useState('');
  useEffect(() => { params.then(p => setClientId(p.clientId)); }, [params]);

  const [sourceType, setSourceType] = useState<EntityType>('risk');
  const [sourceId, setSourceId] = useState('');
  const [targetType, setTargetType] = useState<EntityType>('gaps');
  const [targetId, setTargetId] = useState('');
  const [linking, setLinking] = useState(false);
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [linkOk, setLinkOk] = useState<string | null>(null);

  const [analyzeType, setAnalyzeType] = useState<EntityType>('risk');
  const [analyzeId, setAnalyzeId] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeErr, setAnalyzeErr] = useState<string | null>(null);
  const [cycle, setCycle] = useState<CycleResult | null>(null);
  const [impact, setImpact] = useState<DependencyImpact | null>(null);

  async function createLink() {
    if (!sourceId || !targetId) { setLinkErr('Choose both a source and a target.'); return; }
    setLinking(true); setLinkErr(null); setLinkOk(null);
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${clientId}/dependencies/link`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceType, sourceId, targetType, targetId }),
      });
      if (res.ok) { setLinkOk(`Linked — ${ENTITY_TYPE_LABEL[sourceType]} now depends on ${ENTITY_TYPE_LABEL[targetType]}.`); setSourceId(''); setTargetId(''); }
      else { const b = await res.json().catch(() => ({})); setLinkErr(b?.error?.message || 'Could not create this dependency link.'); }
    } catch (e) { setLinkErr(`Could not reach AskABD: ${(e as Error).message}`); }
    setLinking(false);
  }

  const analyze = useCallback(async () => {
    if (!analyzeId) { setAnalyzeErr('Choose an entity to analyze.'); return; }
    setAnalyzing(true); setAnalyzeErr(null); setCycle(null); setImpact(null);
    try {
      const [cRes, iRes] = await Promise.all([
        staffFetch(`/api/v1/oc/clients/${clientId}/dependencies/${analyzeType}/${analyzeId}/cycles`),
        staffFetch(`/api/v1/oc/clients/${clientId}/dependencies/${analyzeType}/${analyzeId}/impact`),
      ]);
      if (cRes.ok) setCycle(await cRes.json()); else { const b = await cRes.json().catch(() => ({})); setAnalyzeErr(b?.error?.message || 'Could not detect cycles.'); }
      if (iRes.ok) setImpact(await iRes.json());
    } catch (e) { setAnalyzeErr(`Could not reach AskABD: ${(e as Error).message}`); }
    setAnalyzing(false);
  }, [clientId, analyzeType, analyzeId]);

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Dependency Analysis</h2>
      <p className="text-xs text-gray-500 mb-4">Real dependency links (`depends_on`) between this client&apos;s own risks, gaps, change records, deployments, and requirements — with real cycle detection and impact analysis, never a fabricated risk score.</p>

      <section className="bg-white rounded-xl border p-5 mb-4">
        <h3 className="font-semibold text-sm mb-1">Create a Dependency Link</h3>
        <p className="text-[10px] text-gray-500 mb-3">Both ends must be real records already owned by this client — picked from each engine&apos;s own live list, never typed as a bare id.</p>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] font-medium text-gray-600 mb-1">Source (depends on target)</p>
            <EntityPicker clientId={clientId} type={sourceType} onTypeChange={setSourceType} entityId={sourceId} onEntityChange={setSourceId} />
          </div>
          <div>
            <p className="text-[10px] font-medium text-gray-600 mb-1">Target</p>
            <EntityPicker clientId={clientId} type={targetType} onTypeChange={setTargetType} entityId={targetId} onEntityChange={setTargetId} />
          </div>
        </div>
        {linkErr && <p className="text-[10px] text-red-600 mt-2">{linkErr}</p>}
        {linkOk && <p className="text-[10px] text-green-700 mt-2">{linkOk}</p>}
        <Action variant="primary" onClick={createLink} loading={linking} className="!text-xs mt-3">{linking ? 'Linking…' : 'Create Link'}</Action>
      </section>

      <section className="bg-white rounded-xl border p-5">
        <h3 className="font-semibold text-sm mb-1">Analyze an Entity</h3>
        <p className="text-[10px] text-gray-500 mb-3">Real cycle detection and impact (how many real entities depend on this one, and how many it depends on).</p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[280px]">
            <EntityPicker clientId={clientId} type={analyzeType} onTypeChange={setAnalyzeType} entityId={analyzeId} onEntityChange={setAnalyzeId} />
          </div>
          <Action variant="primary" onClick={analyze} loading={analyzing} className="!text-xs">{analyzing ? 'Analyzing…' : 'Analyze'}</Action>
        </div>
        {analyzeErr && <p className="text-[10px] text-red-600 mt-2">{analyzeErr}</p>}

        {cycle && (
          <div className={`mt-4 rounded-lg border p-3 ${cycle.hasCycle ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
            <p className={`text-xs font-semibold ${cycle.hasCycle ? 'text-red-800' : 'text-green-800'}`}>{cycle.hasCycle ? '✕ Circular dependency detected' : '✓ No circular dependency'}</p>
            {cycle.hasCycle && cycle.cyclePath.length > 0 && <p className="text-[11px] text-red-700 mt-1 font-mono break-all">{cycle.cyclePath.join(' → ')}</p>}
          </div>
        )}

        {impact && (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white border rounded-xl p-3 text-center"><p className="text-lg font-bold text-gray-900">{impact.dependents}</p><p className="text-[9px] text-gray-500 uppercase">Depend On This</p></div>
              <div className="bg-white border rounded-xl p-3 text-center"><p className="text-lg font-bold text-gray-900">{impact.dependencies}</p><p className="text-[9px] text-gray-500 uppercase">This Depends On</p></div>
            </div>
            {impact.dependentPaths.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-gray-600 mb-1">Would be affected if this changes</p>
                <div className="bg-white border rounded divide-y">
                  {impact.dependentPaths.map((p, i) => <p key={i} className="text-[10px] text-gray-600 px-2 py-1 font-mono">{p.sourceType}:{p.sourceId} → {p.targetType}:{p.targetId} (depth {p.depth})</p>)}
                </div>
              </div>
            )}
            {impact.dependencyPaths.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-gray-600 mb-1">This depends on</p>
                <div className="bg-white border rounded divide-y">
                  {impact.dependencyPaths.map((p, i) => <p key={i} className="text-[10px] text-gray-600 px-2 py-1 font-mono">{p.sourceType}:{p.sourceId} → {p.targetType}:{p.targetId} (depth {p.depth})</p>)}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
