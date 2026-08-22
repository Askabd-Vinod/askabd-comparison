'use client';
import { useState } from 'react';
import { Action } from '../../../../components/button';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

export interface Contact {
  id: string; clientId: string; name: string; email: string; phone: string; title: string;
  roleType: 'executive' | 'technical' | 'billing' | 'decision_maker' | 'general';
  isPrimary: boolean; status: 'active' | 'inactive'; visibility: 'internal' | 'customer'; createdAt: string;
}

const ROLE_LABEL: Record<Contact['roleType'], string> = {
  executive: 'Executive', technical: 'Technical', billing: 'Billing',
  decision_maker: 'Decision Maker', general: 'General',
};

export function ContactsManager({ clientId, initialContacts }: { clientId: string; initialContacts: Contact[] }) {
  const [contacts, setContacts] = useState(initialContacts);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', title: '', roleType: 'general' as Contact['roleType'], isPrimary: false, visibility: 'internal' as Contact['visibility'] });

  async function refresh() {
    const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/contacts`);
    if (res.ok) setContacts((await res.json()).contacts);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/contacts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      if (!res.ok) { const body = await res.json().catch(() => ({})); setError(body?.error?.message || 'Could not save this contact.'); return; }
      setForm({ name: '', email: '', phone: '', title: '', roleType: 'general', isPrimary: false, visibility: 'internal' });
      setShowForm(false);
      await refresh();
    } catch { setError('Could not reach the server. Please try again.'); }
    finally { setSaving(false); }
  }

  async function handleDeactivate(id: string) {
    const res = await fetch(`${API}/api/v1/oc/contacts/${id}/deactivate`, { method: 'POST' });
    if (res.ok) await refresh();
  }

  const active = contacts.filter(c => c.status === 'active');
  const inactive = contacts.filter(c => c.status === 'inactive');

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Action variant="primary" onClick={() => setShowForm(v => !v)}>{showForm ? 'Cancel' : '+ Add Contact'}</Action>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border p-5 mb-6 grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
            <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
            <select value={form.roleType} onChange={e => setForm(f => ({ ...f, roleType: e.target.value as Contact['roleType'] }))} className="w-full border rounded-md px-3 py-2 text-sm">
              {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600 self-end pb-2">
            <input type="checkbox" checked={form.isPrimary} onChange={e => setForm(f => ({ ...f, isPrimary: e.target.checked }))} />
            Primary contact
          </label>
          <label className="sm:col-span-2 flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={form.visibility === 'customer'} onChange={e => setForm(f => ({ ...f, visibility: e.target.checked ? 'customer' : 'internal' }))} />
            Visible to the customer in their portal (default: internal / staff-only)
          </label>
          {error && <div className="sm:col-span-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
          <div className="sm:col-span-2">
            <Action type="submit" variant="primary" loading={saving}>Save Contact</Action>
          </div>
        </form>
      )}

      {active.length === 0 ? (
        <div className="bg-white rounded-xl border p-10 text-center text-sm text-gray-400">
          No contacts recorded yet for this client.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {active.map(c => (
            <div key={c.id} className="bg-white rounded-xl border p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">{c.name}{c.isPrimary && <span className="ml-1.5 text-[9px] font-bold text-purple-600">★ PRIMARY</span>}</span>
                <div className="flex items-center gap-1">
                  {c.visibility === 'customer' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">CUSTOMER</span>}
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-600">{ROLE_LABEL[c.roleType]}</span>
                </div>
              </div>
              <div className="space-y-1 text-xs text-gray-600 mb-3">
                {c.title && <p>{c.title}</p>}
                {c.email && <p className="text-purple-600">{c.email}</p>}
                {c.phone && <p>{c.phone}</p>}
              </div>
              <button onClick={() => handleDeactivate(c.id)} className="text-[10px] text-gray-400 hover:text-red-600">Deactivate</button>
            </div>
          ))}
        </div>
      )}

      {inactive.length > 0 && (
        <details className="mt-6">
          <summary className="text-xs text-gray-400 cursor-pointer">{inactive.length} inactive contact{inactive.length !== 1 ? 's' : ''}</summary>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
            {inactive.map(c => (
              <div key={c.id} className="bg-gray-50 rounded-xl border p-4 opacity-60">
                <span className="text-sm font-medium">{c.name}</span>
                <p className="text-[10px] text-gray-400 mt-1">Inactive</p>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
