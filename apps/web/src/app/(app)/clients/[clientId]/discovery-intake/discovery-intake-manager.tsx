'use client';
import { useId, useState } from 'react';
import { Action } from '../../../../components/button';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

export type SourceType = 'free_text' | 'document' | 'meeting_notes' | 'email' | 'other';
export type SourceStatus = 'submitted' | 'reviewed' | 'archived';
export type ExtractionConfidence = 'high' | 'medium' | 'low' | 'unverified';

export type ExtractionStatus = 'not_applicable' | 'extracted' | 'not_supported' | 'failed';

export interface DiscoverySource {
  id: string; clientId: string; sourceType: SourceType; title: string; rawContent: string;
  status: SourceStatus; submittedBy: string | null; createdAt: string; updatedAt: string;
  originalFileName?: string | null; mimeType?: string | null; fileSize?: number | null;
  extractionStatus?: ExtractionStatus;
}

const EXTRACTION_STATUS_META: Record<ExtractionStatus, { label: string; className: string }> = {
  not_applicable: { label: 'Text', className: 'bg-gray-100 text-gray-500' },
  extracted: { label: 'Text Extracted', className: 'bg-green-100 text-green-700' },
  not_supported: { label: 'Extraction Not Yet Supported', className: 'bg-amber-100 text-amber-700' },
  failed: { label: 'Extraction Failed', className: 'bg-red-100 text-red-700' },
};
export interface DiscoveryExtraction {
  id: string; sourceId: string; fieldName: string; fieldValue: string; evidenceQuote: string;
  confidence: ExtractionConfidence; extractedBy: string | null; createdAt: string;
}

const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  free_text: 'Free Text', document: 'Document', meeting_notes: 'Meeting Notes', email: 'Email', other: 'Other',
};
const STATUS_CLASS: Record<SourceStatus, string> = {
  submitted: 'bg-blue-100 text-blue-700', reviewed: 'bg-green-100 text-green-700', archived: 'bg-gray-200 text-gray-500',
};
const CONFIDENCE_META: Record<ExtractionConfidence, { icon: string; className: string }> = {
  high: { icon: '✓', className: 'text-green-700 bg-green-50 border-green-200' },
  medium: { icon: '◐', className: 'text-blue-700 bg-blue-50 border-blue-200' },
  low: { icon: '!', className: 'text-amber-700 bg-amber-50 border-amber-200' },
  unverified: { icon: '—', className: 'text-gray-500 bg-gray-50 border-gray-200' },
};

const EMPTY_SOURCE_FORM = { title: '', rawContent: '', sourceType: 'free_text' as SourceType };
const EMPTY_EXTRACTION_FORM = { fieldName: '', fieldValue: '', evidenceQuote: '', confidence: 'unverified' as ExtractionConfidence };

function SourceRow({ source, onChanged }: { source: DiscoverySource; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [extractions, setExtractions] = useState<DiscoveryExtraction[] | null>(null);
  const [showExtractForm, setShowExtractForm] = useState(false);
  const [extractForm, setExtractForm] = useState(EMPTY_EXTRACTION_FORM);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const panelId = useId();

  async function loadExtractions() {
    const res = await fetch(`${API}/api/v1/oc/discovery-sources/${source.id}/extractions`);
    if (res.ok) setExtractions((await res.json()).extractions);
  }

  async function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && extractions === null) await loadExtractions();
  }

  async function handleExtract(e: React.FormEvent) {
    e.preventDefault();
    if (!extractForm.fieldName.trim() || !extractForm.fieldValue.trim()) { setExtractError('Field name and value are required.'); return; }
    if (!extractForm.evidenceQuote.trim()) { setExtractError('An evidence quote — an exact excerpt from the raw text below — is required.'); return; }
    setSaving(true); setExtractError(null);
    try {
      const res = await fetch(`${API}/api/v1/oc/discovery-sources/${source.id}/extractions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(extractForm),
      });
      if (!res.ok) { const body = await res.json().catch(() => ({})); setExtractError(body?.error?.message || 'Could not save this extraction.'); return; }
      setExtractForm(EMPTY_EXTRACTION_FORM);
      setShowExtractForm(false);
      await loadExtractions();
    } catch { setExtractError('Could not reach the server. Please try again.'); }
    finally { setSaving(false); }
  }

  async function transition(action: 'review' | 'archive') {
    setTransitioning(true);
    try {
      const res = await fetch(`${API}/api/v1/oc/discovery-sources/${source.id}/${action}`, { method: 'POST' });
      if (res.ok) onChanged();
    } finally { setTransitioning(false); }
  }

  return (
    <div className={`border rounded-lg overflow-hidden bg-white ${source.status === 'archived' ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between p-3 gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium">{source.title}</span>
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{SOURCE_TYPE_LABEL[source.sourceType]}</span>
            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded uppercase ${STATUS_CLASS[source.status]}`}>{source.status}</span>
            {source.sourceType === 'document' && source.extractionStatus && source.extractionStatus !== 'not_applicable' && (
              <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${EXTRACTION_STATUS_META[source.extractionStatus].className}`}>{EXTRACTION_STATUS_META[source.extractionStatus].label}</span>
            )}
          </div>
          <p className="text-[9px] text-gray-400 mt-0.5">
            {new Date(source.createdAt).toLocaleString('en-AU')}{source.submittedBy ? ` · ${source.submittedBy}` : ''}
            {source.originalFileName ? ` · ${source.originalFileName}${source.fileSize ? ` (${(source.fileSize / 1024).toFixed(0)} KB)` : ''}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button onClick={toggle} aria-expanded={expanded} aria-controls={panelId} className="text-[10px] font-medium text-purple-600 hover:text-purple-800">
            {expanded ? 'Close' : 'Details'}
          </button>
        </div>
      </div>
      {expanded && (
        <div id={panelId} className="border-t bg-gray-50 p-4 space-y-3">
          <div>
            <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Raw content</p>
            <p className="text-[11px] text-gray-700 bg-white border rounded-md p-3 whitespace-pre-wrap">{source.rawContent}</p>
          </div>

          <div>
            <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Extracted findings — real, staff-tagged, evidence-quoted (never automated)</p>
            {extractions === null ? (
              <p className="text-[10px] text-gray-400">Loading…</p>
            ) : extractions.length === 0 ? (
              <p className="text-[10px] text-gray-400">No findings extracted yet.</p>
            ) : (
              <div className="space-y-1.5">
                {extractions.map(ex => {
                  const meta = CONFIDENCE_META[ex.confidence];
                  return (
                    <div key={ex.id} className="bg-white border rounded-md p-2.5 text-[11px]">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-medium">{ex.fieldName}: {ex.fieldValue}</span>
                        <span className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded border ${meta.className}`}>
                          <span aria-hidden="true">{meta.icon}</span>{ex.confidence}
                        </span>
                      </div>
                      <p className="text-gray-500 italic">&ldquo;{ex.evidenceQuote}&rdquo;</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {source.status !== 'archived' && (
            <>
              <Action variant="secondary" onClick={() => setShowExtractForm(v => !v)} className="!text-[10px] !px-3 !py-1.5">
                {showExtractForm ? 'Cancel' : '+ Extract a finding'}
              </Action>

              {showExtractForm && (
                <form onSubmit={handleExtract} className="bg-white border rounded-md p-3 space-y-2">
                  <div className="grid sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Field name *</label>
                      <input value={extractForm.fieldName} onChange={e => setExtractForm(f => ({ ...f, fieldName: e.target.value }))} placeholder="e.g. affected_area" className="w-full border rounded px-2 py-1.5 text-xs" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Value *</label>
                      <input value={extractForm.fieldValue} onChange={e => setExtractForm(f => ({ ...f, fieldValue: e.target.value }))} placeholder="e.g. Checkout / Payment" className="w-full border rounded px-2 py-1.5 text-xs" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Evidence quote *</label>
                    <input value={extractForm.evidenceQuote} onChange={e => setExtractForm(f => ({ ...f, evidenceQuote: e.target.value }))} placeholder="Paste the exact excerpt from the raw text above" className="w-full border rounded px-2 py-1.5 text-xs" />
                    <p className="text-[9px] text-gray-400 mt-0.5">Must be an exact, verbatim excerpt of the raw content — verified against it before saving.</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Confidence</label>
                    <select value={extractForm.confidence} onChange={e => setExtractForm(f => ({ ...f, confidence: e.target.value as ExtractionConfidence }))} className="border rounded px-2 py-1.5 text-xs">
                      {(['unverified', 'low', 'medium', 'high'] as ExtractionConfidence[]).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  {extractError && <div className="text-[10px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">{extractError}</div>}
                  <Action type="submit" variant="primary" loading={saving} className="!text-[10px] !px-3 !py-1.5">Save Finding</Action>
                </form>
              )}

              <div className="flex gap-2 pt-2 border-t">
                {source.status === 'submitted' && (
                  <Action variant="secondary" onClick={() => transition('review')} loading={transitioning} className="!text-[10px] !px-3 !py-1.5">Mark Reviewed</Action>
                )}
                <Action variant="tertiary" onClick={() => transition('archive')} loading={transitioning} className="!text-[10px] !px-3 !py-1.5 !text-red-600">Archive</Action>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function DiscoveryIntakeManager({ clientId, initialSources }: { clientId: string; initialSources: DiscoverySource[] }) {
  const [sources, setSources] = useState(initialSources);
  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState<'text' | 'file'>('text');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_SOURCE_FORM);
  const [fileTitle, setFileTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  async function refresh() {
    const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/discovery-sources`);
    if (res.ok) setSources((await res.json()).sources);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title is required.'); return; }
    if (!form.rawContent.trim()) { setError('The problem statement text is required.'); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/discovery-sources`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      if (!res.ok) { const body = await res.json().catch(() => ({})); setError(body?.error?.message || 'Could not save this source.'); return; }
      setForm(EMPTY_SOURCE_FORM);
      setShowForm(false);
      await refresh();
    } catch { setError('Could not reach the server. Please try again.'); }
    finally { setSaving(false); }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) { setError('Choose a file to upload.'); return; }
    setSaving(true); setError(null);
    try {
      const body = new FormData();
      if (fileTitle.trim()) body.append('title', fileTitle.trim());
      body.append('file', selectedFile);
      const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/discovery-sources/document`, { method: 'POST', body });
      if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b?.error?.message || 'Could not upload this file.'); return; }
      setFileTitle(''); setSelectedFile(null);
      setShowForm(false);
      await refresh();
    } catch { setError('Could not reach the server. Please try again.'); }
    finally { setSaving(false); }
  }

  const active = sources.filter(s => s.status !== 'archived');
  const archived = sources.filter(s => s.status === 'archived');

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Action variant="primary" onClick={() => setShowForm(v => !v)}>{showForm ? 'Cancel' : '+ Add Discovery Source'}</Action>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border p-5 mb-6">
          <div className="flex gap-1 mb-3 border-b">
            <button type="button" onClick={() => { setMode('text'); setError(null); }} className={`text-xs font-medium px-3 py-2 border-b-2 ${mode === 'text' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500'}`}>Type Problem Statement</button>
            <button type="button" onClick={() => { setMode('file'); setError(null); }} className={`text-xs font-medium px-3 py-2 border-b-2 ${mode === 'file' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500'}`}>Upload a Document</button>
          </div>

          {mode === 'text' ? (
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Checkout abandonment issue" className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Source type</label>
                <select value={form.sourceType} onChange={e => setForm(f => ({ ...f, sourceType: e.target.value as SourceType }))} className="w-full border rounded-md px-3 py-2 text-sm">
                  {Object.entries(SOURCE_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Problem statement, in the client's own words *</label>
                <textarea value={form.rawContent} onChange={e => setForm(f => ({ ...f, rawContent: e.target.value }))} rows={4} placeholder="Describe the problem exactly as told to you — this raw text is preserved as the real evidence source for any later findings." className="w-full border rounded-md px-3 py-2 text-sm" />
                <p className="text-[9px] text-gray-400 mt-0.5">Kept verbatim — real structured findings can later be tagged from this text, each with a required exact-quote back-reference.</p>
              </div>
              {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
              <Action type="submit" variant="primary" loading={saving}>Submit</Action>
            </form>
          ) : (
            <form onSubmit={handleUpload} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
                <input value={fileTitle} onChange={e => setFileTitle(e.target.value)} placeholder="Defaults to the file name if left blank" className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">File *</label>
                <input type="file" accept=".pdf,.docx,.txt,.csv,.png,.jpg,.jpeg" onChange={e => setSelectedFile(e.target.files?.[0] || null)} className="w-full text-sm" />
                <p className="text-[9px] text-gray-400 mt-0.5">
                  PDF, DOCX, TXT, CSV, PNG, JPEG — up to 20 MB. Real text is currently extracted automatically for TXT and CSV files;
                  other formats are stored securely and can be reviewed directly, with real text extraction for them a planned fast-follow — never fabricated in the meantime.
                </p>
              </div>
              {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
              <Action type="submit" variant="primary" loading={saving} disabled={!selectedFile}>Upload</Action>
            </form>
          )}
        </div>
      )}

      {active.length === 0 ? (
        <div className="bg-white rounded-xl border p-10 text-center text-sm text-gray-400">
          No problem statements recorded yet for this client.
        </div>
      ) : (
        <div className="space-y-2">
          {active.map(s => <SourceRow key={s.id} source={s} onChanged={refresh} />)}
        </div>
      )}

      {archived.length > 0 && (
        <details className="mt-6">
          <summary className="text-xs text-gray-400 cursor-pointer">{archived.length} archived source{archived.length !== 1 ? 's' : ''}</summary>
          <div className="space-y-2 mt-3">
            {archived.map(s => <SourceRow key={s.id} source={s} onChanged={refresh} />)}
          </div>
        </details>
      )}
    </div>
  );
}
