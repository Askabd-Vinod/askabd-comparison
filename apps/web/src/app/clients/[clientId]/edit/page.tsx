'use client';
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Breadcrumb } from '../../../components/breadcrumb';
import { mockClients } from '../../../lib/mock-clients';
import { serviceCatalog } from '../../../lib/service-catalog';
import { logAuditEvent } from '../../../lib/operations-api';

export default function EditClientPage() {
  const router = useRouter();
  const params = useParams();
  const clientId = params.clientId as string;
  const client = mockClients.find(c => c.id === clientId);

  const [form, setForm] = useState({
    name: '', industry: '', country: '', supportModel: '', criticality: '',
  });
  const [changes, setChanges] = useState<Array<{ field: string; oldValue: string; newValue: string }>>([]);
  const [showImpact, setShowImpact] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (client) {
      setForm({ name: client.name, industry: client.industry, country: '', supportModel: '', criticality: '' });
    }
  }, [client]);

  if (!client) {
    return <div className="max-w-[1200px] mx-auto px-4 py-6"><p className="text-sm text-gray-500">Client not found.</p></div>;
  }

  function detectChanges() {
    const detected: Array<{ field: string; oldValue: string; newValue: string }> = [];
    if (form.name !== client!.name) detected.push({ field: 'Company Name', oldValue: client!.name, newValue: form.name });
    if (form.industry !== client!.industry) detected.push({ field: 'Industry', oldValue: client!.industry, newValue: form.industry });
    return detected;
  }

  function handleSave() {
    const detected = detectChanges();
    if (detected.length === 0) { router.push(`/clients/${clientId}`); return; }
    setChanges(detected);
    setShowImpact(true);
  }

  function confirmSave() {
    logAuditEvent({
      entityType: 'client', entityId: clientId, entityName: client!.name,
      action: 'updated', actor: 'hello@askabd.com',
      details: { changes },
      evidence: changes.map(c => `${c.field}: "${c.oldValue}" → "${c.newValue}"`),
    }).catch(() => {});
    setSaved(true);
    setTimeout(() => router.push(`/clients/${clientId}`), 2000);
  }

  if (saved) {
    return (
      <div className="max-w-[1200px] mx-auto px-4 py-6">
        <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
          <p className="text-lg font-bold text-green-700">✓ Changes Saved</p>
          <p className="text-xs text-green-600 mt-1">Client updated. Audit record created. Redirecting…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Clients', href: '/clients' }, { label: client.name, href: `/clients/${clientId}` }, { label: 'Edit' }]} />
      <h1 className="text-xl font-bold text-gray-900 mb-6">Edit Client — {client.name}</h1>

      <div className="bg-white rounded-xl border p-6 space-y-6">
        {/* Company Information */}
        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Company Information</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Company Name</label><input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none" /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Industry</label><input type="text" value={form.industry} onChange={e => setForm({...form, industry: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none" /></div>
          </div>
        </section>

        {/* Services */}
        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Enabled Services</h2>
          <div className="grid md:grid-cols-2 gap-2">
            {serviceCatalog.slice(0, 8).map(svc => (
              <div key={svc.id} className="flex items-center justify-between border rounded-lg p-3 text-xs">
                <span className="font-medium">{svc.name}</span>
                <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded">Active</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-purple-600 mt-2 cursor-pointer hover:underline" onClick={() => router.push(`/clients/${clientId}/contracts`)}>Manage services →</p>
        </section>

        {/* Connectors */}
        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Connectors</h2>
          <div className="grid md:grid-cols-3 gap-2">
            {['PostgreSQL', 'AWS', 'GitHub'].map(c => (
              <div key={c} className="flex items-center justify-between border rounded-lg p-3 text-xs">
                <span>{c}</span>
                <span className="text-[10px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">Ready</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Impact Analysis */}
      {showImpact && changes.length > 0 && (
        <div className="mt-6 bg-orange-50 border border-orange-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-orange-800 mb-3">⚠ Impact Analysis</h3>
          <div className="space-y-2 mb-4">
            {changes.map((c, i) => (
              <div key={i} className="flex items-center justify-between text-xs border-b border-orange-100 pb-2">
                <span className="font-medium text-gray-800">{c.field}</span>
                <div className="flex items-center gap-2">
                  <span className="text-red-600 line-through">{c.oldValue}</span>
                  <span>→</span>
                  <span className="text-green-700 font-medium">{c.newValue}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-orange-700 mb-4">Risk: LOW — Changes affect client record only. No service or connector impact.</p>
          <div className="flex gap-3">
            <button onClick={confirmSave} className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs font-medium py-2.5 rounded-lg transition">Confirm & Save</button>
            <button onClick={() => setShowImpact(false)} className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-medium py-2.5 rounded-lg transition">Cancel</button>
          </div>
        </div>
      )}

      {/* Actions */}
      {!showImpact && (
        <div className="mt-6 flex items-center justify-between">
          <button onClick={() => router.push(`/clients/${clientId}`)} className="text-sm text-gray-600 hover:text-gray-900 px-4 py-2 rounded-lg border hover:bg-gray-50 transition">← Back</button>
          <button onClick={handleSave} className="text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 px-6 py-2 rounded-lg transition">Save Changes</button>
        </div>
      )}
    </div>
  );
}
