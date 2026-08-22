'use client';
import { useState } from 'react';
import { Action } from '../../../../components/button';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

export interface ClientNote {
  id: string; clientId: string; author: string; body: string; visibility: 'internal' | 'customer';
  createdAt: string; updatedAt: string; archivedAt: string | null;
}

export function NotesManager({ clientId, initialNotes }: { clientId: string; initialNotes: ClientNote[] }) {
  const [notes, setNotes] = useState(initialNotes);
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<'internal' | 'customer'>('internal');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/notes`);
    if (res.ok) setNotes((await res.json()).notes);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) { setError('Note cannot be empty.'); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/notes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: body.trim(), visibility }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b?.error?.message || 'Could not save this note.'); return; }
      setBody('');
      setVisibility('internal');
      await refresh();
    } catch { setError('Could not reach the server. Please try again.'); }
    finally { setSaving(false); }
  }

  async function handleArchive(id: string) {
    const res = await fetch(`${API}/api/v1/oc/notes/${id}/archive`, { method: 'POST' });
    if (res.ok) await refresh();
  }

  return (
    <div>
      <form onSubmit={handleCreate} className="bg-white rounded-xl border p-4 mb-6">
        <textarea
          value={body} onChange={e => setBody(e.target.value)} rows={3}
          placeholder="Add a note about this client — a call summary, a decision, context for the next person who opens this workspace…"
          className="w-full border rounded-md px-3 py-2 text-sm resize-none"
        />
        <label className="flex items-center gap-2 mt-2 text-xs text-gray-600">
          <input type="checkbox" checked={visibility === 'customer'} onChange={e => setVisibility(e.target.checked ? 'customer' : 'internal')} />
          Visible to the customer in their portal (default: internal / staff-only)
        </label>
        {error && <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
        <div className="mt-2 flex justify-end">
          <Action type="submit" variant="primary" loading={saving} disabled={!body.trim()}>Add Note</Action>
        </div>
      </form>

      {notes.length === 0 ? (
        <div className="bg-white rounded-xl border p-10 text-center text-sm text-gray-400">
          No notes recorded yet for this client.
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map(n => (
            <div key={n.id} className="bg-white rounded-xl border p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-700">{n.author}</span>
                  {n.visibility === 'customer' && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">CUSTOMER-VISIBLE</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400">{new Date(n.createdAt).toLocaleString()}</span>
                  <button onClick={() => handleArchive(n.id)} className="text-[10px] text-gray-300 hover:text-red-600">Archive</button>
                </div>
              </div>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{n.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
