'use client';
import { useId, useState } from 'react';
import { Action } from '../../../../components/button';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

export type DocumentStatus = 'draft' | 'in_review' | 'changes_requested' | 'approved' | 'rejected' | 'superseded' | 'archived';
export interface DocumentTemplate { id: string; documentType: string; name: string; description: string; approvalRequired: boolean; }
export interface GeneratedSection { key: string; title: string; content: string; missingFields: string[]; sourceType: string; sourceIds: string[]; }
export interface GeneratedDocument {
  id: string; clientId: string; templateId: string; documentType: string; title: string; status: DocumentStatus;
  content: GeneratedSection[]; customerVisible: boolean; version: number; createdBy?: string | null; updatedAt: string;
}

const STATUS_META: Record<DocumentStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-600' },
  in_review: { label: 'In Review', className: 'bg-blue-100 text-blue-700' },
  changes_requested: { label: 'Changes Requested', className: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Approved', className: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-700' },
  superseded: { label: 'Superseded', className: 'bg-gray-200 text-gray-500' },
  archived: { label: 'Archived', className: 'bg-gray-200 text-gray-400' },
};

function DocumentDetail({ clientId, document, onChanged, onClose }: { clientId: string; document: GeneratedDocument; onChanged: () => void; onClose: () => void }) {
  const [quality, setQuality] = useState<{ ready: boolean; reasons: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showDecideForm, setShowDecideForm] = useState<'approve' | 'reject' | 'request_changes' | null>(null);
  const [note, setNote] = useState('');
  // Real, more serious defect found and fixed live during
  // document_generation_test_1: every action here (submit/decide/
  // regenerate/archive/toggle-visibility) fired its real fetch and called
  // onChanged() unconditionally, NEVER checking `res.ok`. Reproduced live:
  // clicking "Submit for Approval" on a document whose template does NOT
  // require approval hits a real, correct backend 400
  // ("This document's template does not require approval") — but the
  // button is shown regardless of the template's real approvalRequired
  // flag, the UI never inspected the response, and the user got ZERO
  // feedback: no error, no explanation, the document just silently stayed
  // in "draft" with a "Submit for Approval" button that will never work.
  // A silently swallowed real error is exactly the failure class this
  // session has fixed repeatedly elsewhere (Discovery, Assessment) — this
  // is a variant of it on the write side, not the read/polling side.
  // Fixed by checking `res.ok` on every action and surfacing the real,
  // specific backend error message instead of pretending nothing happened.
  const [actionError, setActionError] = useState<string | null>(null);
  const formId = useId();

  async function loadQuality() {
    const res = await fetch(`${API}/api/v1/oc/documents/${document.id}/quality-check`);
    if (res.ok) setQuality(await res.json());
  }
  async function runAction(url: string, options: RequestInit = {}): Promise<boolean> {
    setBusy(true); setQuality(null); setActionError(null);
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setActionError(body?.error?.message || 'This action could not be completed.');
        return false;
      }
      onChanged();
      return true;
    } catch {
      setActionError('Could not reach the server. Please try again.');
      return false;
    } finally { setBusy(false); }
  }
  async function regenerate() {
    await runAction(`${API}/api/v1/oc/documents/${document.id}/regenerate`, { method: 'POST' });
  }
  async function submitForApproval() {
    await runAction(`${API}/api/v1/oc/documents/${document.id}/submit-for-approval`, { method: 'POST' });
  }
  async function decide(decision: 'approve' | 'reject' | 'request_changes') {
    const ok = await runAction(`${API}/api/v1/oc/documents/${document.id}/decide-approval`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, note }) });
    if (ok) { setShowDecideForm(null); setNote(''); }
  }
  async function archive() {
    await runAction(`${API}/api/v1/oc/documents/${document.id}/archive`, { method: 'POST' });
  }
  async function toggleVisibility() {
    await runAction(`${API}/api/v1/oc/documents/${document.id}/customer-visibility`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visible: !document.customerVisible }) });
  }
  function exportUrl(format: 'html' | 'markdown') {
    return `${API}/api/v1/oc/documents/${document.id}/export?format=${format}`;
  }

  const editable = document.status === 'draft' || document.status === 'changes_requested';

  return (
    <div className="bg-white rounded-xl border p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-sm text-gray-900">{document.title}</h3>
          <p className="text-[10px] text-gray-400 mt-0.5">Version {document.version} · Updated {new Date(document.updatedAt).toLocaleString('en-AU')}{document.createdBy ? ` · by ${document.createdBy}` : ''}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase ${STATUS_META[document.status].className}`}>{STATUS_META[document.status].label}</span>
          <button onClick={onClose} className="text-[10px] text-gray-400 hover:text-gray-700">Close</button>
        </div>
      </div>

      <div className="space-y-3">
        {document.content.map(section => (
          <div key={section.key} className="border rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-800 mb-1">{section.title}</p>
            <pre className="text-[10px] text-gray-600 whitespace-pre-wrap font-sans">{section.content}</pre>
            {section.missingFields.length > 0 && (
              <div className="mt-2 bg-amber-50 border border-amber-200 rounded p-2">
                <p className="text-[9px] font-bold text-amber-700 uppercase mb-1">Information Required</p>
                {section.missingFields.map((m, i) => <p key={i} className="text-[9px] text-amber-700">• {m}</p>)}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="pt-3 border-t space-y-2">
        <div className="flex flex-wrap gap-2">
          {editable && <Action variant="secondary" onClick={regenerate} loading={busy} className="!text-[10px] !px-3 !py-1.5">↻ Regenerate from Latest Data</Action>}
          <Action variant="secondary" onClick={loadQuality} className="!text-[10px] !px-3 !py-1.5">Run Quality Check</Action>
          {editable && <Action variant="primary" onClick={submitForApproval} loading={busy} className="!text-[10px] !px-3 !py-1.5">Submit for Approval</Action>}
          {document.status === 'in_review' && !showDecideForm && (
            <>
              <button onClick={() => setShowDecideForm('approve')} className="text-[10px] font-semibold text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded">Approve</button>
              <button onClick={() => setShowDecideForm('reject')} className="text-[10px] font-semibold text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded">Reject</button>
              <button onClick={() => setShowDecideForm('request_changes')} className="text-[10px] font-semibold text-gray-700 border px-3 py-1.5 rounded">Request Changes</button>
            </>
          )}
          <a href={exportUrl('html')} target="_blank" rel="noreferrer" className="text-[10px] font-semibold text-purple-600 hover:text-purple-800 self-center">Export HTML →</a>
          <a href={exportUrl('markdown')} target="_blank" rel="noreferrer" className="text-[10px] font-semibold text-purple-600 hover:text-purple-800 self-center">Export Markdown →</a>
          <span className="text-[9px] text-gray-400 self-center">PDF / DOCX — not supported yet</span>
        </div>

        {showDecideForm && (
          <div className="bg-gray-50 border rounded-lg p-3 space-y-2">
            <label htmlFor={`${formId}-note`} className="block text-[10px] font-medium text-gray-600">
              Note {showDecideForm === 'request_changes' && <span className="text-red-500">*</span>}
            </label>
            <textarea id={`${formId}-note`} value={note} onChange={e => setNote(e.target.value)} rows={2} className="w-full text-[10px] border rounded p-2" placeholder={showDecideForm === 'request_changes' ? 'Explain exactly what needs to change (required)' : 'Optional note'} />
            <div className="flex gap-2">
              <button onClick={() => decide(showDecideForm)} disabled={busy || (showDecideForm === 'request_changes' && !note.trim())} className="text-[9px] font-semibold text-white bg-purple-600 hover:bg-purple-700 px-2 py-1 rounded disabled:opacity-50">Confirm</button>
              <button onClick={() => { setShowDecideForm(null); setNote(''); }} className="text-[9px] text-gray-500">Cancel</button>
            </div>
          </div>
        )}

        {actionError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-[10px] font-bold text-red-700">⚠ {actionError}</p>
          </div>
        )}

        {quality && (
          <div className={`rounded-lg p-3 border ${quality.ready ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
            <p className={`text-[10px] font-bold ${quality.ready ? 'text-green-700' : 'text-amber-700'}`}>{quality.ready ? '✓ READY' : '⚠ NOT READY'}</p>
            {quality.reasons.map((r, i) => <p key={i} className="text-[9px] text-gray-600 mt-1">• {r}</p>)}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t">
          <div>
            <p className="text-[9px] font-bold text-gray-700 uppercase">Customer Visibility</p>
            <p className="text-[9px] text-gray-400">{document.customerVisible ? 'Visible in the client portal' : 'Internal only'}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={toggleVisibility} disabled={busy} className={`text-[9px] font-semibold px-2 py-1 rounded disabled:opacity-50 ${document.customerVisible ? 'bg-gray-100 text-gray-600' : 'bg-blue-600 text-white'}`}>
              {document.customerVisible ? 'Make Internal' : 'Make Customer-Visible'}
            </button>
            {document.status !== 'archived' && <button onClick={archive} disabled={busy} className="text-[9px] font-semibold text-red-600">Archive</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

export function DocumentGenerationView({ clientId, initialTemplates, initialDocuments }: { clientId: string; initialTemplates: DocumentTemplate[]; initialDocuments: GeneratedDocument[] }) {
  const [templates] = useState(initialTemplates);
  const [documents, setDocuments] = useState(initialDocuments);
  const [selected, setSelected] = useState<GeneratedDocument | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [templateId, setTemplateId] = useState(templates[0]?.id || '');
  const [title, setTitle] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/documents`);
    if (res.ok) {
      const d = await res.json();
      setDocuments(d.documents || []);
      if (selected) {
        const updated = (d.documents || []).find((doc: GeneratedDocument) => doc.id === selected.id);
        if (updated) setSelected(updated);
      }
    }
  }

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!templateId) { setError('Choose a document type.'); return; }
    setGenerating(true); setError(null);
    try {
      const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/documents`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId, title: title.trim() || undefined }) });
      if (!res.ok) { const body = await res.json().catch(() => ({})); setError(body?.error?.message || 'Could not generate this document.'); return; }
      const d = await res.json();
      setTitle(''); setShowGenerate(false);
      await refresh();
      setSelected(d.document);
    } catch { setError('Could not reach the server. Please try again.'); }
    finally { setGenerating(false); }
  }

  const active = documents.filter(d => d.status !== 'archived');
  const archived = documents.filter(d => d.status === 'archived');

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Documents</h2>
            <p className="text-xs text-gray-500 mt-1 max-w-xl">
              Real documents generated from this client's own platform data — requirements, gaps, evidence, assessments.
              Any section the platform doesn't have real data for is shown honestly as &quot;Information Required&quot;, never invented.
            </p>
          </div>
          <Action variant="primary" onClick={() => setShowGenerate(v => !v)}>{showGenerate ? 'Cancel' : '+ Generate Document'}</Action>
        </div>

        {showGenerate && (
          <form onSubmit={generate} className="mt-4 border-t pt-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Document Type *</label>
              <select value={templateId} onChange={e => setTemplateId(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm">
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.approvalRequired ? ' (requires approval)' : ''}</option>)}
              </select>
              <p className="text-[9px] text-gray-400 mt-0.5">{templates.find(t => t.id === templateId)?.description}</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Defaults to the template name" className="w-full border rounded-md px-3 py-2 text-sm" />
            </div>
            {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
            <Action type="submit" variant="primary" loading={generating}>Generate</Action>
          </form>
        )}
      </div>

      {selected ? (
        <DocumentDetail clientId={clientId} document={selected} onChanged={refresh} onClose={() => setSelected(null)} />
      ) : active.length === 0 ? (
        <div className="bg-white rounded-xl border p-10 text-center text-sm text-gray-400">No documents generated yet for this client.</div>
      ) : (
        <div className="space-y-2">
          {active.map(d => (
            <button key={d.id} onClick={() => setSelected(d)} className="w-full text-left bg-white rounded-xl border p-4 hover:border-purple-300 transition">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{d.title}</p>
                  <p className="text-[9px] text-gray-400 mt-0.5">v{d.version} · {new Date(d.updatedAt).toLocaleDateString('en-AU')}</p>
                </div>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase shrink-0 ${STATUS_META[d.status].className}`}>{STATUS_META[d.status].label}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {archived.length > 0 && !selected && (
        <details className="mt-2">
          <summary className="text-xs text-gray-400 cursor-pointer">{archived.length} archived document{archived.length !== 1 ? 's' : ''}</summary>
          <div className="space-y-2 mt-3">
            {archived.map(d => (
              <button key={d.id} onClick={() => setSelected(d)} className="w-full text-left bg-gray-50 rounded-xl border p-4 opacity-60 hover:opacity-100 transition">
                <p className="text-sm font-medium text-gray-700">{d.title}</p>
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
