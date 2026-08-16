'use client';
import { useState } from 'react';
import Link from 'next/link';
import { DownloadButton } from '../../../components/download-button';
import { FileUpload } from '../../../components/file-upload';
import { logAuditEvent } from '../../../lib/operations-api';
import { sendNotification, getStandardSubject } from '../../../lib/notifications';
import type { CatalogService } from '../../../lib/service-catalog';

interface Contract {
  id: string; type: string; title: string; status: string; start: string; expiry: string; value: string; version: string; owner: string; basis: string;
}

interface ClientData {
  id: string; name: string; primaryContact: string; services: Array<{ id: string; name: string }>;
}

export function ContractsView({ contracts, client, serviceCatalog }: { contracts: Contract[]; client: ClientData; serviceCatalog: CatalogService[] }) {
  const [showAddService, setShowAddService] = useState(false);
  const [addedServices, setAddedServices] = useState<string[]>([]);
  const [showBasis, setShowBasis] = useState<string | null>(null);

  function requestService(svc: CatalogService) {
    setAddedServices(prev => [...prev, svc.id]);

    logAuditEvent({
      entityType: 'service-request', entityId: `${client.id}-${svc.id}`, entityName: svc.name,
      action: 'created', actor: 'hello@askabd.com',
      details: { clientId: client.id, service: svc.name, timeline: svc.expectedTimeline },
      evidence: [`Service "${svc.name}" requested for ${client.name} at ${new Date().toISOString()}`],
    }).catch(() => {});

    sendNotification({
      clientId: client.id, clientName: client.name, phase: 'service-change', priority: 'medium',
      subject: getStandardSubject('service-change', `New Service: ${svc.name}`, client.name),
      summary: `Additional service "${svc.name}" has been requested for ${client.name}. Timeline: ${svc.expectedTimeline}.`,
      details: { action: `Service Added: ${svc.name}`, performedBy: 'hello@askabd.com', timestamp: new Date().toISOString(), impactLevel: 'None — new service provisioning' },
      recipients: [],
    }).catch(() => {});
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-lg">Contract Management</h2>
          <p className="text-xs text-gray-500">{contracts.length} active contracts</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAddService(!showAddService)} className="text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 px-3 py-1.5 rounded transition">
            + Add Service
          </button>
          <DownloadButton fileName={`${client.name}_Contracts`} format="csv" entityId={client.id} entityName="All Contracts" clientName={client.name}>
            Export All
          </DownloadButton>
        </div>
      </div>

      {/* Add Service Panel */}
      {showAddService && (
        <div className="mb-6 bg-purple-50 border border-purple-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-purple-900 mb-2">Add Additional Services</h3>
          <p className="text-[10px] text-purple-600 mb-4">Select services to add to this client&apos;s engagement. A notification will be sent and the timeline starts immediately.</p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto">
            {serviceCatalog.map(svc => {
              const alreadyAdded = addedServices.includes(svc.id);
              return (
                <button key={svc.id} onClick={() => !alreadyAdded && requestService(svc)} disabled={alreadyAdded}
                  className={`text-left p-3 rounded-lg border transition ${alreadyAdded ? 'bg-green-50 border-green-300 cursor-default' : 'bg-white border-gray-200 hover:border-purple-300 hover:shadow-sm'}`}>
                  <p className="text-xs font-medium text-gray-900">{svc.name}</p>
                  <p className="text-[9px] text-gray-500 mt-0.5">{svc.description.substring(0, 60)}…</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[9px] text-gray-400">{svc.expectedTimeline}</span>
                    {alreadyAdded ? (
                      <span className="text-[9px] font-medium text-green-600">✓ Requested</span>
                    ) : (
                      <span className="text-[9px] font-medium text-purple-600">+ Add</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Contracts Table */}
      <div className="bg-white rounded-xl border overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="text-left px-5 py-3">Contract</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Value</th>
              <th className="text-left px-4 py-3">Start</th>
              <th className="text-left px-4 py-3">Expiry</th>
              <th className="text-left px-4 py-3">Version</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {contracts.map(c => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-5 py-3">
                  <button onClick={() => setShowBasis(showBasis === c.id ? null : c.id)} className="font-medium text-xs text-left hover:text-purple-700">
                    {c.title}
                  </button>
                  {showBasis === c.id && (
                    <div className="mt-2 p-2 bg-blue-50 border border-blue-100 rounded text-[10px] text-blue-800">
                      <span className="font-semibold">Basis of Analysis: </span>{c.basis}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3"><span className="text-[10px] font-medium px-2 py-0.5 rounded bg-purple-100 text-purple-700">{c.type}</span></td>
                <td className="px-4 py-3"><span className="text-[10px] font-medium px-2 py-0.5 rounded bg-green-100 text-green-700">{c.status}</span></td>
                <td className="px-4 py-3 text-xs">{c.value}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{c.start}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{c.expiry}</td>
                <td className="px-4 py-3 text-xs font-mono">v{c.version}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <DownloadButton fileName={c.title} format="pdf" entityId={c.id} entityName={c.title} clientName={client.name} data={{ type: c.type, value: c.value, start: c.start, expiry: c.expiry, basis: c.basis }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Upload Signed Contracts */}
      <div className="bg-gray-50 rounded-xl border p-5 mb-6">
        <h3 className="text-sm font-semibold mb-2">Upload Signed Contracts</h3>
        <p className="text-[10px] text-gray-500 mb-3">Upload signed copies. Version control tracks all uploads with timestamps.</p>
        <FileUpload entityId={client.id} entityName={`${client.name} Contract`} clientName={client.name} category="Contracts" />
      </div>

      {/* Covered Services */}
      <section className="bg-white rounded-xl border p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Contract-Covered Services</h3>
          <span className="text-[10px] text-gray-400">{client.services.length + addedServices.length} services</span>
        </div>
        <div className="grid md:grid-cols-2 gap-2 text-xs">
          {client.services.map(svc => (
            <Link key={svc.id} href={`/services/${svc.id}`} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 border">
              <span className="font-medium">{svc.name}</span>
              <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded">Covered</span>
            </Link>
          ))}
          {addedServices.map(id => {
            const svc = serviceCatalog.find(s => s.id === id);
            if (!svc) return null;
            return (
              <div key={id} className="flex items-center justify-between py-2 px-3 rounded-lg border border-purple-200 bg-purple-50/30">
                <span className="font-medium text-purple-700">{svc.name}</span>
                <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded">Pending</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
