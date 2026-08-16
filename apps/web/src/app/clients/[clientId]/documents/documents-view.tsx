'use client';
import { useState } from 'react';
import { DownloadButton } from '../../../components/download-button';
import { FileUpload } from '../../../components/file-upload';

interface Doc {
  id: string;
  title: string;
  category: string;
  status: string;
  updated: string;
  owner: string;
  version: string;
}

export function DocumentsView({ documents, clientId, clientName }: { documents: Doc[]; clientId: string; clientName: string }) {
  const [filter, setFilter] = useState<string>('all');
  const categories = [...new Set(documents.map(d => d.category))];
  const filtered = filter === 'all' ? documents : documents.filter(d => d.category === filter);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-lg">Documents</h2>
          <p className="text-xs text-gray-500">{documents.length} documents • Contracts, Architecture, Runbooks, Reports, Invoices</p>
        </div>
        <div className="flex gap-2">
          <DownloadButton fileName={`${clientName}_All_Documents`} format="csv" entityId={clientId} entityName="All Documents" clientName={clientName} className="text-xs bg-purple-50 text-purple-600 px-3 py-1.5 rounded font-medium hover:bg-purple-100 cursor-pointer">
            Export All
          </DownloadButton>
        </div>
      </div>

      {/* Upload Section */}
      <div className="mb-4 p-4 bg-gray-50 rounded-xl border">
        <FileUpload entityId={clientId} entityName={`${clientName} Document`} clientName={clientName} category="Signed Documents" />
      </div>

      {/* Category Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => setFilter('all')} className={`text-[10px] font-medium px-3 py-1.5 rounded-lg transition ${filter === 'all' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>All ({documents.length})</button>
        {categories.map(cat => (
          <button key={cat} onClick={() => setFilter(cat)} className={`text-[10px] font-medium px-3 py-1.5 rounded-lg transition ${filter === cat ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {cat} ({documents.filter(d => d.category === cat).length})
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="text-left px-5 py-3">Document</th>
              <th className="text-left px-4 py-3">Category</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Version</th>
              <th className="text-left px-4 py-3">Owner</th>
              <th className="text-left px-4 py-3">Updated</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(doc => (
              <tr key={doc.id} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-medium text-xs">{doc.title}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{doc.category}</td>
                <td className="px-4 py-3"><span className={`text-[10px] font-medium px-2 py-0.5 rounded ${doc.status === 'active' || doc.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{doc.status}</span></td>
                <td className="px-4 py-3 text-xs font-mono">v{doc.version}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{doc.owner}</td>
                <td className="px-4 py-3 text-xs text-gray-400">{doc.updated}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <DownloadButton fileName={doc.title} format="pdf" entityId={doc.id} entityName={doc.title} clientName={clientName} data={{ category: doc.category, version: doc.version, owner: doc.owner, status: doc.status }} />
                    <DownloadButton fileName={doc.title} format="csv" entityId={doc.id} entityName={doc.title} clientName={clientName} data={{ category: doc.category, version: doc.version, owner: doc.owner }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
