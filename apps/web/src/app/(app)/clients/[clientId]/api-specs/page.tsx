'use client';
import { useState, useEffect, useCallback, useId } from 'react';
import { ErrorState } from '../../../../components/error-state';
import { Action } from '../../../../components/button';
import { staffFetch } from '../../../../lib/staff-session';

/**
 * API Discovery / Validation — real OpenAPI 3.0 / Swagger 2.0 spec
 * ingestion and endpoint validation backed by `oc_api_specs` /
 * `oc_api_endpoints` (api-discovery-engine.ts / api-discovery-routes.ts,
 * `api_discovery_test_1`, 2026-08-24). Ninth of the 11 engines wired into
 * the staff UI (Phase 3, "ASKABD ENTERPRISE OPERATIONS — INTEGRATION +
 * COMPLETION PHASE", 2026-08-25).
 *
 * Real, opt-in, SSRF-protected live validation — mirrored exactly, not
 * loosened: `validateEndpoint` refuses outright unless the spec's own
 * `liveValidationAuthorized` flag is explicitly true, so this page requires
 * staff to flip that flag on before any "Validate" button is even shown,
 * matching the directive's own "never send unauthorized traffic to client
 * systems" rule. `lastValidationStatus` renders exactly what the server
 * returns (`reachable`/`unreachable`/`blocked`/`not_checked`) — `not_checked`
 * is never presented as if it were a pass.
 */
type SourceFormat = 'openapi3' | 'swagger2';
type EndpointValidationStatus = 'reachable' | 'unreachable' | 'blocked' | 'not_checked';
interface ApiSpec { id: string; clientId: string; name: string; sourceFormat: SourceFormat; baseUrl: string | null; liveValidationAuthorized: boolean; createdAt: string }
interface ApiEndpoint {
  id: string; specId: string; path: string; method: string; summary: string;
  hasDescription: boolean; hasResponseSchema: boolean; hasSecurityRequirement: boolean; documentedStatusCodes: string[];
  lastValidationStatus: EndpointValidationStatus; lastValidatedAt: string | null; lastValidationEvidence: string | null;
}
interface GapReport { total: number; missingDescription: number; missingResponseSchema: number; missingSecurity: number; notValidated: number }

const VALIDATION_META: Record<EndpointValidationStatus, { label: string; className: string }> = {
  reachable: { label: 'Reachable', className: 'text-green-700 bg-green-50 border-green-200' },
  unreachable: { label: 'Unreachable', className: 'text-red-700 bg-red-50 border-red-200' },
  blocked: { label: 'Blocked (SSRF policy)', className: 'text-orange-700 bg-orange-50 border-orange-200' },
  not_checked: { label: 'Not Checked', className: 'text-gray-400 bg-gray-50 border-gray-200 border-dashed' },
};

function ValidationBadge({ status }: { status: EndpointValidationStatus }) {
  const m = VALIDATION_META[status];
  return <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-md border ${m.className}`}>{m.label}</span>;
}
function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return <div className="bg-white rounded-xl border p-3 text-center"><p className={`text-lg font-bold ${color || 'text-gray-900'}`}>{value}</p><p className="text-[9px] text-gray-500 uppercase">{label}</p></div>;
}

interface PageProps { params: Promise<{ clientId: string }> }

export default function ApiSpecsPage({ params }: PageProps) {
  const [clientId, setClientId] = useState('');
  const [specs, setSpecs] = useState<ApiSpec[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (id: string) => {
    setLoading(true); setError('');
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${id}/api-specs`);
      if (res.ok) setSpecs((await res.json()).specs ?? []);
      else if (res.status === 401 || res.status === 403) setError('You are not authorized to view API specs for this client.');
      else setError('Unable to load API specs. The backend may be unavailable.');
    } catch (err) { setError(`Unable to reach AskABD API: ${(err as Error).message}`); }
    setLoading(false);
  }, []);

  useEffect(() => { params.then(p => { setClientId(p.clientId); load(p.clientId); }); }, [params, load]);

  if (loading) return <div className="p-6 text-gray-400">Loading API specs...</div>;
  if (error) return <div className="p-6"><ErrorState what="API specs could not be loaded" why="The AskABD API did not return a valid response." technicalDetail={error} onRetry={() => load(clientId)} /></div>;

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">API Discovery &amp; Validation</h2>
      <p className="text-xs text-gray-500 mb-4">Real OpenAPI/Swagger spec ingestion, documentation-completeness gap reporting, and opt-in, SSRF-protected live endpoint validation.</p>

      {specs.length > 0 && <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4"><Stat label="Specs" value={specs.length} /></div>}

      <section className="bg-white rounded-xl border p-5">
        <h3 className="font-semibold text-sm mb-3">API Specs</h3>
        <div className="space-y-2">
          {specs.length === 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-center">
              <p className="text-sm font-medium text-blue-800">No API specs ingested yet</p>
              <p className="text-xs text-blue-700 mt-1">Paste a real OpenAPI 3.0 or Swagger 2.0 JSON document below.</p>
            </div>
          )}
          {specs.map(s => <SpecRow key={s.id} clientId={clientId} spec={s} onChanged={() => load(clientId)} />)}
          <AddSpecRow clientId={clientId} onCreated={() => load(clientId)} />
        </div>
      </section>
    </div>
  );
}

function AddSpecRow({ clientId, onCreated }: { clientId: string; onCreated: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [sourceFormat, setSourceFormat] = useState<SourceFormat>('openapi3');
  const [baseUrl, setBaseUrl] = useState('');
  const [rawSpecText, setRawSpecText] = useState('');
  const panelId = useId();

  async function submit() {
    if (!name.trim()) { setErr('A real spec name is required.'); return; }
    let rawSpec: unknown;
    try { rawSpec = JSON.parse(rawSpecText); } catch { setErr('The pasted spec is not valid JSON.'); return; }
    setSaving(true); setErr(null);
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${clientId}/api-specs`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), sourceFormat, baseUrl: baseUrl || undefined, rawSpec }),
      });
      if (res.ok) { setName(''); setBaseUrl(''); setRawSpecText(''); setExpanded(false); onCreated(); }
      else { const b = await res.json().catch(() => ({})); setErr(b?.error?.message || 'Could not ingest this spec.'); }
    } catch (e) { setErr(`Could not reach AskABD: ${(e as Error).message}`); }
    setSaving(false);
  }

  return (
    <div className="border rounded-lg overflow-hidden border-dashed border-purple-200">
      <div className="flex items-center justify-between p-3">
        <span className="text-xs font-medium">+ Ingest an API spec</span>
        <button onClick={() => setExpanded(e => !e)} aria-expanded={expanded} aria-controls={panelId} className="text-[10px] font-medium text-purple-600 hover:text-purple-800">{expanded ? 'Close' : 'Add'}</button>
      </div>
      {expanded && (
        <div id={panelId} className="border-t bg-gray-50 p-4 space-y-3">
          <div className="grid md:grid-cols-3 gap-2">
            <div className="md:col-span-2">
              <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Name<span className="text-red-500 ml-0.5">*</span></label>
              <input value={name} onChange={e => setName(e.target.value)} className="w-full border rounded px-2 py-1.5 text-xs" placeholder="e.g. Legacy Order API v2" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Format</label>
              <select value={sourceFormat} onChange={e => setSourceFormat(e.target.value as SourceFormat)} className="w-full border rounded px-2 py-1.5 text-xs">
                <option value="openapi3">OpenAPI 3.0</option>
                <option value="swagger2">Swagger 2.0</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Base URL (optional — required before live validation can be authorized)</label>
            <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} className="w-full border rounded px-2 py-1.5 text-xs" placeholder="https://api.client-example.com" />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Spec JSON<span className="text-red-500 ml-0.5">*</span></label>
            <textarea value={rawSpecText} onChange={e => setRawSpecText(e.target.value)} rows={6} className="w-full border rounded px-2 py-1.5 text-[10px] font-mono" placeholder={'{ "openapi": "3.0.0", "paths": { ... } }'} />
          </div>
          {err && <p className="text-[10px] text-red-600">{err}</p>}
          <Action variant="primary" onClick={submit} loading={saving} className="!text-[10px] !px-3 !py-1.5">{saving ? 'Ingesting…' : 'Ingest Spec'}</Action>
        </div>
      )}
    </div>
  );
}

function SpecRow({ clientId, spec, onChanged }: { clientId: string; spec: ApiSpec; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>([]);
  const [gapReport, setGapReport] = useState<GapReport | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const panelId = useId();

  const loadDetail = useCallback(async () => {
    try {
      const [eRes, gRes] = await Promise.all([
        staffFetch(`/api/v1/oc/clients/${clientId}/api-specs/${spec.id}/endpoints`),
        staffFetch(`/api/v1/oc/clients/${clientId}/api-specs/${spec.id}/gap-report`),
      ]);
      if (eRes.ok) setEndpoints((await eRes.json()).endpoints ?? []);
      if (gRes.ok) setGapReport(await gRes.json());
    } catch { /* non-fatal */ }
  }, [clientId, spec.id]);

  useEffect(() => { if (expanded) loadDetail(); }, [expanded, loadDetail]);

  async function toggleLiveAuth(authorize: boolean) {
    setBusy('auth'); setErr(null);
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${clientId}/api-specs/${spec.id}/authorize-live-validation`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ authorized: authorize }) });
      if (res.ok) onChanged(); else { const b = await res.json().catch(() => ({})); setErr(b?.error?.message || 'Could not update live-validation authorization.'); }
    } catch (e) { setErr(`Could not reach AskABD: ${(e as Error).message}`); }
    setBusy(null);
  }

  async function validate(endpointId: string) {
    setBusy(endpointId); setErr(null);
    try {
      const res = await staffFetch(`/api/v1/oc/clients/${clientId}/api-endpoints/${endpointId}/validate`, { method: 'POST' });
      if (res.ok) loadDetail(); else { const b = await res.json().catch(() => ({})); setErr(b?.error?.message || 'Could not validate this endpoint.'); }
    } catch (e) { setErr(`Could not reach AskABD: ${(e as Error).message}`); }
    setBusy(null);
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-3 gap-3 flex-wrap">
        <div className="min-w-0">
          <span className="text-xs font-medium">{spec.name}</span>
          <p className="text-[9px] text-gray-400">{spec.sourceFormat === 'openapi3' ? 'OpenAPI 3.0' : 'Swagger 2.0'}{spec.baseUrl ? ` · ${spec.baseUrl}` : ''}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {spec.liveValidationAuthorized ? (
            <span className="text-[9px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded px-2 py-0.5">Live Validation Authorized</span>
          ) : (
            <span className="text-[9px] font-semibold text-gray-400 bg-gray-50 border border-gray-200 border-dashed rounded px-2 py-0.5">Live Validation Not Authorized</span>
          )}
          <button onClick={() => setExpanded(e => !e)} aria-expanded={expanded} aria-controls={panelId} className="text-[10px] font-medium text-purple-600 hover:text-purple-800">{expanded ? 'Close' : 'Details'}</button>
        </div>
      </div>
      {expanded && (
        <div id={panelId} className="border-t bg-gray-50 p-4 space-y-3">
          {gapReport && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <Stat label="Endpoints" value={gapReport.total} />
              <Stat label="Missing Description" value={gapReport.missingDescription} color={gapReport.missingDescription > 0 ? 'text-orange-600' : undefined} />
              <Stat label="Missing Response Schema" value={gapReport.missingResponseSchema} color={gapReport.missingResponseSchema > 0 ? 'text-orange-600' : undefined} />
              <Stat label="Missing Security" value={gapReport.missingSecurity} color={gapReport.missingSecurity > 0 ? 'text-red-600' : undefined} />
              <Stat label="Not Validated" value={gapReport.notValidated} color="text-gray-500" />
            </div>
          )}

          {err && <p className="text-[10px] text-red-600">{err}</p>}

          <div className="flex items-center gap-2 border-t pt-3">
            <p className="text-[10px] text-gray-500 flex-1">
              {spec.liveValidationAuthorized
                ? 'Staff has explicitly authorized real outbound requests to this spec\'s base URL for endpoint validation (SSRF-protected).'
                : 'Live validation sends a real outbound request to this spec\'s base URL — explicit authorization is required before any endpoint can be validated.'}
            </p>
            {spec.liveValidationAuthorized ? (
              <button onClick={() => toggleLiveAuth(false)} disabled={busy === 'auth'} className="text-[10px] font-medium px-3 py-1.5 rounded text-red-600 hover:bg-red-50 disabled:opacity-50">Revoke Authorization</button>
            ) : (
              <button onClick={() => toggleLiveAuth(true)} disabled={busy === 'auth' || !spec.baseUrl} title={!spec.baseUrl ? 'This spec has no base URL — nothing to validate against.' : undefined} className="text-[10px] font-medium px-3 py-1.5 rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50">Authorize Live Validation</button>
            )}
          </div>

          <div className="bg-white border rounded divide-y">
            {endpoints.map(ep => (
              <div key={ep.id} className="flex items-center justify-between gap-2 p-2.5">
                <div className="min-w-0">
                  <span className="text-[10px] font-mono font-semibold text-gray-500 uppercase mr-1.5">{ep.method}</span>
                  <span className="text-[11px] text-gray-700">{ep.path}</span>
                  {!ep.hasDescription && <span className="ml-2 text-[9px] text-orange-500">no description</span>}
                  {!ep.hasSecurityRequirement && <span className="ml-2 text-[9px] text-red-500">no security</span>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <ValidationBadge status={ep.lastValidationStatus} />
                  {spec.liveValidationAuthorized && (
                    <button onClick={() => validate(ep.id)} disabled={busy === ep.id} className="text-[10px] font-medium px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-800 disabled:opacity-50">{busy === ep.id ? 'Validating…' : 'Validate'}</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
