'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Breadcrumb } from '../../components/breadcrumb';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

interface RealClient { id: string; name: string }

/**
 * Create a real migration plan. This platform's migration engine performs real
 * PostgreSQL schema-to-schema migrations (MigrationExecutionService): it discovers
 * the actual tables/indexes/views/sequences in the given source schema and plans a
 * step-by-step migration into a fresh target schema. It does not connect to arbitrary
 * external systems (Oracle, SAP, mainframes, etc.) or estimate cost/timeline — this
 * form reflects only what the engine actually does.
 */
export default function NewMigrationPage() {
  const router = useRouter();
  const [clients, setClients] = useState<RealClient[]>([]);
  const [clientId, setClientId] = useState('');
  const [sourceSchema, setSourceSchema] = useState('public');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/api/v1/oc/clients`)
      .then(res => res.json())
      .then(data => setClients(data.clients || []))
      .catch(() => setClients([]));
  }, []);

  async function createPlan() {
    if (!clientId) { setError('Select a client first.'); return; }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/v1/oc/migration/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, sourceSchema: sourceSchema || 'public' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to create migration plan');
      router.push(`/migrations/${data.id}`);
    } catch (err) {
      setError((err as Error).message);
    }
    setCreating(false);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Migrations', href: '/migrations' }, { label: 'New Migration' }]} />
      <h1 className="text-xl font-bold text-gray-900 mb-1">Create Migration Plan</h1>
      <p className="text-sm text-gray-500 mb-6">Discovers the real tables, indexes, views, and sequences in the selected source schema and plans a step-by-step migration into a new target schema.</p>

      <div className="bg-white rounded-xl border p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Client <span className="text-red-500">*</span></label>
          <select value={clientId} onChange={e => setClientId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none">
            <option value="">Select a client…</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Source Schema</label>
          <input type="text" value={sourceSchema} onChange={e => setSourceSchema(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-purple-500 focus:outline-none" placeholder="public" />
          <p className="text-[10px] text-gray-400 mt-1">A PostgreSQL schema name in this platform's own database. Defaults to "public".</p>
        </div>
        {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">{error}</div>}
        <button onClick={createPlan} disabled={creating} className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white text-sm font-semibold py-3 rounded-lg transition">
          {creating ? 'Creating plan…' : 'Create Migration Plan'}
        </button>
      </div>
    </div>
  );
}
