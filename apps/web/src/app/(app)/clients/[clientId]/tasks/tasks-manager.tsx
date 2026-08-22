'use client';
import { useState } from 'react';
import { Action } from '../../../../components/button';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

export interface ClientTask {
  id: string; clientId: string; title: string; description: string; assignee: string | null;
  dueDate: string | null; priority: 'low' | 'medium' | 'high' | 'critical'; visibility: 'internal' | 'customer';
  status: 'open' | 'in_progress' | 'completed' | 'cancelled'; completedAt: string | null; createdAt: string;
}

const PRIORITY_COLOR: Record<ClientTask['priority'], string> = {
  low: 'bg-gray-100 text-gray-600', medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700', critical: 'bg-red-100 text-red-700',
};
const STATUS_LABEL: Record<ClientTask['status'], string> = {
  open: 'Open', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled',
};

export function TasksManager({ clientId, initialTasks }: { clientId: string; initialTasks: ClientTask[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', description: '', assignee: '', dueDate: '', priority: 'medium' as ClientTask['priority'], visibility: 'internal' as ClientTask['visibility'] });

  async function refresh() {
    const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/tasks`);
    if (res.ok) setTasks((await res.json()).tasks);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title is required.'); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/tasks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, dueDate: form.dueDate || undefined }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b?.error?.message || 'Could not save this task.'); return; }
      setForm({ title: '', description: '', assignee: '', dueDate: '', priority: 'medium', visibility: 'internal' });
      setShowForm(false);
      await refresh();
    } catch { setError('Could not reach the server. Please try again.'); }
    finally { setSaving(false); }
  }

  async function setStatus(id: string, status: ClientTask['status']) {
    const res = await fetch(`${API}/api/v1/oc/tasks/${id}/status`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    });
    if (res.ok) await refresh();
  }

  const now = new Date();
  const open = tasks.filter(t => t.status === 'open' || t.status === 'in_progress');
  const done = tasks.filter(t => t.status === 'completed' || t.status === 'cancelled');

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Action variant="primary" onClick={() => setShowForm(v => !v)}>{showForm ? 'Cancel' : '+ Add Task'}</Action>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border p-5 mb-6 grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full border rounded-md px-3 py-2 text-sm resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Assignee</label>
            <input value={form.assignee} onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))} placeholder="staff email or identity" className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Due Date</label>
            <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
            <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as ClientTask['priority'] }))} className="w-full border rounded-md px-3 py-2 text-sm">
              {(['low', 'medium', 'high', 'critical'] as const).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <label className="sm:col-span-2 flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={form.visibility === 'customer'} onChange={e => setForm(f => ({ ...f, visibility: e.target.checked ? 'customer' : 'internal' }))} />
            Visible to the customer in their portal (default: internal / staff-only)
          </label>
          {error && <div className="sm:col-span-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
          <div className="sm:col-span-2">
            <Action type="submit" variant="primary" loading={saving}>Save Task</Action>
          </div>
        </form>
      )}

      {open.length === 0 ? (
        <div className="bg-white rounded-xl border p-10 text-center text-sm text-gray-400">
          No open tasks for this client.
        </div>
      ) : (
        <div className="space-y-2 mb-6">
          {open.map(t => {
            const overdue = t.dueDate && new Date(t.dueDate) < now && t.status !== 'completed';
            return (
              <div key={t.id} className="bg-white rounded-xl border p-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-900">{t.title}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${PRIORITY_COLOR[t.priority]}`}>{t.priority}</span>
                    {overdue && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-600 text-white">OVERDUE</span>}
                    {t.visibility === 'customer' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">CUSTOMER-VISIBLE</span>}
                  </div>
                  {t.description && <p className="text-xs text-gray-500 mb-1">{t.description}</p>}
                  <p className="text-[10px] text-gray-400">
                    {t.assignee ? `Assigned to ${t.assignee}` : 'Unassigned'}
                    {t.dueDate ? ` • Due ${new Date(t.dueDate).toLocaleDateString()}` : ''}
                    {' • '}{STATUS_LABEL[t.status]}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {t.status === 'open' && <button onClick={() => setStatus(t.id, 'in_progress')} className="text-[10px] text-blue-600 hover:underline">Start</button>}
                  <button onClick={() => setStatus(t.id, 'completed')} className="text-[10px] text-green-600 hover:underline">Complete</button>
                  <button onClick={() => setStatus(t.id, 'cancelled')} className="text-[10px] text-gray-400 hover:text-red-600">Cancel</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {done.length > 0 && (
        <details>
          <summary className="text-xs text-gray-400 cursor-pointer">{done.length} completed/cancelled task{done.length !== 1 ? 's' : ''}</summary>
          <div className="space-y-2 mt-3">
            {done.map(t => (
              <div key={t.id} className="bg-gray-50 rounded-xl border p-3 opacity-70">
                <span className="text-sm">{t.title}</span>
                <span className="ml-2 text-[10px] text-gray-400">{STATUS_LABEL[t.status]}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
