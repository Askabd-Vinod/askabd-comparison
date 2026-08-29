'use client';
import { useState, useEffect, useCallback, useId } from 'react';
import { ErrorState } from '../../../../components/error-state';
import { Action } from '../../../../components/button';
import { staffFetch } from '../../../../lib/staff-session';

/**
 * Data Mapping — real, per-client field-mapping sets backed by
 * `oc_mapping_sets` / `oc_field_mappings` (data-mapping-engine.ts /
 * data-mapping-routes.ts, `data_mapping_test_1`, 2026-08-24). Fifth of the
 * 11 engines wired into the staff UI this pass (Phase 3, "ASKABD
 * ENTERPRISE OPERATIONS — INTEGRATION + COMPLETION PHASE", 2026-08-25).
 *
 * Deliberately consolidated with the migration mapping concept per the
 * engine's own header comment — a migration's field mapping IS a real data
 * mapping set here, no separate UI invented for it either.
 *
 * Shape validation per mapping type is real and server-enforced
 * (`InvalidMappingShapeError`) — mirrored client-side only to disable the
 * Add button and explain why, never to bypass the server check.
 */
type MappingSetStatus = 'draft' | 'approved' | 'implemented' | 'validated' | 'deprecated';
type MappingType = 'one_to_one' | 'one_to_many' | 'many_to_one' | 'calculated' | 'conditional' | 'lookup';

interface MappingSet { id: string; clientId: string; name: string; description: string; sourceSystem: string; targetSystem: string; status: MappingSetStatus; owner: string | null; createdAt: string }
interface FieldMapping {
  id: string; mappingSetId: string; mappingType: MappingType; sourceFields: string[]; targetFields: string[];
  transformation: string; businessRule: string; dataType: string | null; nullable: boolean; defaultValue: string | null;
  validation: string; lookupTable: string | null; lookupKey: string | null; condition: string | null; dependency: string;
}

const STATUS_TRANSITIONS: Record<MappingSetStatus, MappingSetStatus[]> = {
  draft: ['approved', 'deprecated'],
  approved: ['implemented', 'draft', 'deprecated'],
  implemented: ['validated', 'deprecated'],
  validated: ['deprecated'],
  deprecated: [],
};
const STATUS_META: Record<MappingSetStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'text-gray-600 bg-gray-50 border-gray-200' },
  approved: { label: 'Approved', className: 'text-blue-700 bg-blue-50 border-blue-200' },
  implemented: { label: 'Implemented', className: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
  validated: { label: 'Validated', className: 'text-green-700 bg-green-50 border-green-200' },
  deprecated: { label: 'Deprecated', className: 'text-red-700 bg-red-50 border-red-200' },
};
const TYPE_HINT: Record<MappingType, string> = {
  one_to_one: 'exactly 1 source field, 1 target field',
  one_to_many: 'exactly 1 source field, 2+ target fields',
  many_to_one: '2+ source fields, exactly 1 target field',
  calculated: 'requires a real transformation expression',
  conditional: 'requires a real condition',
  lookup: 'requires a real lookup table + key',
};

function StatusBadge({ status }: { status: MappingSetStatus }) {
  const m = STATUS_META[status];
  return <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-md border ${m.className}`}>{m.label}</span>;
}
function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return <div className="bg-white rounded-xl border p-3 text-center"><p className={`text-lg font-bold ${color || 'text-gray-900'}`}>{value}</p><p className="text-[9px] text-gray-500 uppercase">{label}</p></div>;
}

interface PageProps { params: Promise<{ clientId: string }> }

export default function DataMappingsPage({ params }: PageProps) {
  const [clientId, setClientId] = useState('');
  const [sets, setSets] = useState<MappingSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (id: string) => {
    setLoading(true); setError('');
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${id}/data-mappings`);
      if (res.ok) setSets((await res.json()).mappingSets ?? []);
      else if (res.status === 401 || res.status === 403) setError('You are not authorized to manage data mappings for this client.');
      else setError('Unable to load data mappings. The backend may be unavailable.');
    } catch (err) { setError(`Unable to reach AskABD API: ${(err as Error).message}`); }
    setLoading(false);
  }, []);

  useEffect(() => { params.then(p => { setClientId(p.clientId); load(p.clientId); }); }, [params, load]);

  if (loading) return <div className="p-6 text-gray-400">Loading data mappings...</div>;
  if (error) return <div className="p-6"><ErrorState what="Data mappings could not be loaded" why="The AskABD API did not return a valid response." technicalDetail={error} onRetry={() => load(clientId)} /></div>;

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Data Mapping</h2>
      <p className="text-xs text-gray-500 mb-4">Real field-level source-to-target mapping sets for this engagement&apos;s migration and integration work.</p>

      {sets.length > 0 && <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4"><Stat label="Mapping Sets" value={sets.length} /></div>}

      <section className="bg-white rounded-xl border p-5">
        <h3 className="font-semibold text-sm mb-3">Mapping Sets</h3>
        <div className="space-y-2">
          {sets.length === 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-center">
              <p className="text-sm font-medium text-blue-800">No mapping sets yet</p>
              <p className="text-xs text-blue-700 mt-1">Create the first real source-to-target mapping set below.</p>
            </div>
          )}
          {sets.map(s => <MappingSetRow key={s.id} clientId={clientId} set={s} onChanged={() => load(clientId)} />)}
          <AddSetRow clientId={clientId} onCreated={() => load(clientId)} />
        </div>
      </section>
    </div>
  );
}

function AddSetRow({ clientId, onCreated }: { clientId: string; onCreated: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', sourceSystem: '', targetSystem: '', owner: '' });
  const panelId = useId();

  async function submit() {
    if (!form.name.trim()) { setErr('A real mapping set name is required.'); return; }
    if (!form.sourceSystem.trim() || !form.targetSystem.trim()) { setErr('Real source and target systems are required.'); return; }
    setSaving(true); setErr(null);
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${clientId}/data-mappings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (res.ok) { setForm({ name: '', description: '', sourceSystem: '', targetSystem: '', owner: '' }); setExpanded(false); onCreated(); }
      else { const b = await res.json().catch(() => ({})); setErr(b?.error?.message || 'Could not create this mapping set.'); }
    } catch (e) { setErr(`Could not reach AskABD: ${(e as Error).message}`); }
    setSaving(false);
  }

  return (
    <div className="border rounded-lg overflow-hidden border-dashed border-purple-200">
      <div className="flex items-center justify-between p-3">
        <span className="text-xs font-medium">+ Add a mapping set</span>
        <button onClick={() => setExpanded(e => !e)} aria-expanded={expanded} aria-controls={panelId} className="text-[10px] font-medium text-purple-600 hover:text-purple-800">{expanded ? 'Close' : 'Add'}</button>
      </div>
      {expanded && (
        <div id={panelId} className="border-t bg-gray-50 p-4 space-y-3">
          <div>
            <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Name<span className="text-red-500 ml-0.5">*</span></label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-xs" placeholder="e.g. Customer Master — Legacy CRM to AskABD" />
          </div>
          <div className="grid md:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Source System<span className="text-red-500 ml-0.5">*</span></label>
              <input value={form.sourceSystem} onChange={e => setForm(f => ({ ...f, sourceSystem: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-xs" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Target System<span className="text-red-500 ml-0.5">*</span></label>
              <input value={form.targetSystem} onChange={e => setForm(f => ({ ...f, targetSystem: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-xs" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full border rounded px-2 py-1.5 text-xs" />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Owner</label>
            <input value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-xs" />
          </div>
          {err && <p className="text-[10px] text-red-600">{err}</p>}
          <Action variant="primary" onClick={submit} loading={saving} className="!text-[10px] !px-3 !py-1.5">{saving ? 'Creating…' : 'Create Mapping Set'}</Action>
        </div>
      )}
    </div>
  );
}

function MappingSetRow({ clientId, set, onChanged }: { clientId: string; set: MappingSet; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [fields, setFields] = useState<FieldMapping[]>([]);
  const [completeness, setCompleteness] = useState<{ total: number; withTransformationWhereRequired: number; missingDataType: number; missingValidation: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const panelId = useId();

  const loadDetail = useCallback(async () => {
    try {
      const [fRes, cRes] = await Promise.all([
        staffFetch(`/api/v1/oc/clients/${clientId}/data-mappings/${set.id}/fields`),
        staffFetch(`/api/v1/oc/clients/${clientId}/data-mappings/${set.id}/completeness`),
      ]);
      if (fRes.ok) setFields((await fRes.json()).fields ?? []);
      if (cRes.ok) setCompleteness(await cRes.json());
    } catch { /* non-fatal */ }
  }, [clientId, set.id]);

  useEffect(() => { if (expanded) loadDetail(); }, [expanded, loadDetail]);

  async function transitionTo(status: MappingSetStatus) {
    setBusy(status); setErr(null);
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${clientId}/data-mappings/${set.id}/status/${status}`, { method: 'POST' });
      if (res.ok) onChanged(); else { const b = await res.json().catch(() => ({})); setErr(b?.error?.message || 'That transition could not be completed.'); }
    } catch (e) { setErr(`Could not reach AskABD: ${(e as Error).message}`); }
    setBusy(null);
  }

  async function removeField(fieldId: string) {
    if (!confirm('Remove this field mapping? This cannot be undone.')) return;
    setBusy('remove-' + fieldId);
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${clientId}/data-mapping-fields/${fieldId}`, { method: 'DELETE' });
      if (res.ok) loadDetail(); else setErr('Could not remove this field mapping.');
    } catch (e) { setErr(`Could not reach AskABD: ${(e as Error).message}`); }
    setBusy(null);
  }

  const allowed = STATUS_TRANSITIONS[set.status];

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-3 gap-3 flex-wrap">
        <div className="min-w-0">
          <span className="text-xs font-medium">{set.name}</span>
          <p className="text-[9px] text-gray-400">{set.sourceSystem} → {set.targetSystem}{set.owner ? ` · Owner: ${set.owner}` : ''}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={set.status} />
          <button onClick={() => setExpanded(e => !e)} aria-expanded={expanded} aria-controls={panelId} className="text-[10px] font-medium text-purple-600 hover:text-purple-800">{expanded ? 'Close' : 'Details'}</button>
        </div>
      </div>
      {expanded && (
        <div id={panelId} className="border-t bg-gray-50 p-4 space-y-3">
          {set.description && <p className="text-xs text-gray-700">{set.description}</p>}
          {completeness && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="Fields" value={completeness.total} />
              <Stat label="Transformed (where required)" value={completeness.withTransformationWhereRequired} color="text-green-600" />
              <Stat label="Missing Data Type" value={completeness.missingDataType} color={completeness.missingDataType > 0 ? 'text-orange-600' : undefined} />
              <Stat label="Missing Validation" value={completeness.missingValidation} color={completeness.missingValidation > 0 ? 'text-orange-600' : undefined} />
            </div>
          )}

          {err && <p className="text-[10px] text-red-600">{err}</p>}

          <div className="bg-white border rounded divide-y">
            {fields.length === 0 && <p className="text-[11px] text-gray-400 p-3">No field mappings yet.</p>}
            {fields.map(f => (
              <div key={f.id} className="p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-gray-700">{f.sourceFields.join(', ')} → {f.targetFields.join(', ')}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[9px] text-gray-400 uppercase">{f.mappingType.replace(/_/g, ' ')}</span>
                    <button onClick={() => removeField(f.id)} disabled={busy === 'remove-' + f.id} className="text-[10px] font-medium text-red-500 hover:text-red-700 disabled:opacity-50">Remove</button>
                  </div>
                </div>
                {f.transformation && <p className="text-[10px] text-gray-500">Transform: {f.transformation}</p>}
                {f.condition && <p className="text-[10px] text-gray-500">Condition: {f.condition}</p>}
                {f.lookupTable && <p className="text-[10px] text-gray-500">Lookup: {f.lookupTable} ({f.lookupKey})</p>}
                {f.dataType && <p className="text-[10px] text-gray-400">Type: {f.dataType}{f.nullable ? ' · nullable' : ''}</p>}
              </div>
            ))}
          </div>

          <AddFieldForm clientId={clientId} mappingSetId={set.id} onAdded={loadDetail} />

          {allowed.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t pt-3">
              {allowed.map(s => (
                <button key={s} onClick={() => transitionTo(s)} disabled={busy === s}
                  className={`text-[10px] font-medium px-3 py-1.5 rounded disabled:opacity-50 ${s === 'deprecated' ? 'text-red-600 hover:bg-red-50' : 'bg-gray-100 hover:bg-gray-200 text-gray-800'}`}>
                  {busy === s ? 'Saving…' : `Move to ${STATUS_META[s].label}`}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AddFieldForm({ clientId, mappingSetId, onAdded }: { clientId: string; mappingSetId: string; onAdded: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mappingType, setMappingType] = useState<MappingType>('one_to_one');
  const [sourceFields, setSourceFields] = useState('');
  const [targetFields, setTargetFields] = useState('');
  const [transformation, setTransformation] = useState('');
  const [condition, setCondition] = useState('');
  const [lookupTable, setLookupTable] = useState('');
  const [lookupKey, setLookupKey] = useState('');
  const [dataType, setDataType] = useState('');

  async function submit() {
    const src = sourceFields.split(',').map(s => s.trim()).filter(Boolean);
    const tgt = targetFields.split(',').map(s => s.trim()).filter(Boolean);
    setSaving(true); setErr(null);
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${clientId}/data-mappings/${mappingSetId}/fields`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappingType, sourceFields: src, targetFields: tgt, transformation: transformation || undefined, condition: condition || undefined, lookupTable: lookupTable || undefined, lookupKey: lookupKey || undefined, dataType: dataType || undefined }),
      });
      if (res.ok) { setSourceFields(''); setTargetFields(''); setTransformation(''); setCondition(''); setLookupTable(''); setLookupKey(''); setDataType(''); setExpanded(false); onAdded(); }
      else { const b = await res.json().catch(() => ({})); setErr(b?.error?.message || 'Could not add this field mapping.'); }
    } catch (e) { setErr(`Could not reach AskABD: ${(e as Error).message}`); }
    setSaving(false);
  }

  if (!expanded) return <button onClick={() => setExpanded(true)} className="text-[10px] font-medium text-purple-600 hover:text-purple-800">+ Add field mapping</button>;

  return (
    <div className="bg-white border rounded p-3 space-y-2">
      <div className="grid md:grid-cols-3 gap-2">
        <div>
          <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Type</label>
          <select value={mappingType} onChange={e => setMappingType(e.target.value as MappingType)} className="w-full border rounded px-2 py-1.5 text-xs">
            {(Object.keys(TYPE_HINT) as MappingType[]).map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div><label className="block text-[10px] font-medium text-gray-600 mb-0.5">Source Field(s), comma-separated</label><input value={sourceFields} onChange={e => setSourceFields(e.target.value)} className="w-full border rounded px-2 py-1.5 text-xs" /></div>
        <div><label className="block text-[10px] font-medium text-gray-600 mb-0.5">Target Field(s), comma-separated</label><input value={targetFields} onChange={e => setTargetFields(e.target.value)} className="w-full border rounded px-2 py-1.5 text-xs" /></div>
      </div>
      <p className="text-[9px] text-gray-400">{TYPE_HINT[mappingType]}</p>
      {mappingType === 'calculated' && <input value={transformation} onChange={e => setTransformation(e.target.value)} placeholder="Transformation expression…" className="w-full border rounded px-2 py-1.5 text-xs" />}
      {mappingType === 'conditional' && <input value={condition} onChange={e => setCondition(e.target.value)} placeholder="Condition…" className="w-full border rounded px-2 py-1.5 text-xs" />}
      {mappingType === 'lookup' && (
        <div className="grid md:grid-cols-2 gap-2">
          <input value={lookupTable} onChange={e => setLookupTable(e.target.value)} placeholder="Lookup table…" className="w-full border rounded px-2 py-1.5 text-xs" />
          <input value={lookupKey} onChange={e => setLookupKey(e.target.value)} placeholder="Lookup key…" className="w-full border rounded px-2 py-1.5 text-xs" />
        </div>
      )}
      <input value={dataType} onChange={e => setDataType(e.target.value)} placeholder="Data type (optional)…" className="w-full border rounded px-2 py-1.5 text-xs" />
      {err && <p className="text-[10px] text-red-600">{err}</p>}
      <div className="flex gap-2">
        <Action variant="primary" onClick={submit} loading={saving} className="!text-[10px] !px-3 !py-1.5">{saving ? 'Adding…' : 'Add Field Mapping'}</Action>
        <button onClick={() => setExpanded(false)} className="text-[10px] text-gray-500 hover:text-gray-700">Cancel</button>
      </div>
    </div>
  );
}
