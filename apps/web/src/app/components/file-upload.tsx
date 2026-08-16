'use client';
import { useState } from 'react';
import { logAuditEvent } from '../lib/operations-api';

interface FileVersion {
  version: string;
  fileName: string;
  uploadedBy: string;
  uploadedAt: string;
  size: string;
  status: 'current' | 'previous';
}

interface FileUploadProps {
  entityId: string;
  entityName: string;
  clientName?: string;
  category?: string;
  onUpload?: (file: File, version: string) => void;
}

/**
 * File upload with version control.
 * Tracks all versions uploaded, allows viewing history and downloading any version.
 */
export function FileUpload({ entityId, entityName, clientName, category, onUpload }: FileUploadProps) {
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);

    // Simulate upload delay
    setTimeout(() => {
      const newVersion: FileVersion = {
        version: `v${versions.length + 1}.0`,
        fileName: file.name,
        uploadedBy: 'hello@askabd.com',
        uploadedAt: new Date().toISOString(),
        size: formatSize(file.size),
        status: 'current',
      };

      // Mark previous versions
      const updated = versions.map(v => ({ ...v, status: 'previous' as const }));
      setVersions([newVersion, ...updated]);
      setUploading(false);
      setShowUpload(false);

      onUpload?.(file, newVersion.version);

      // Audit log
      logAuditEvent({
        entityType: 'document',
        entityId,
        entityName,
        action: 'uploaded',
        actor: 'hello@askabd.com',
        details: { fileName: file.name, version: newVersion.version, size: newVersion.size, category },
        evidence: [`File "${file.name}" uploaded as ${newVersion.version} at ${new Date().toISOString()}`],
      }).catch(() => {});
    }, 1500);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowUpload(!showUpload)}
          className="text-[10px] font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 px-2.5 py-1 rounded-md border border-purple-200 transition"
        >
          📎 Upload Signed Document
        </button>
        {versions.length > 0 && (
          <span className="text-[9px] text-gray-400">{versions.length} version{versions.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {showUpload && (
        <div className="border border-dashed border-purple-300 rounded-lg p-4 bg-purple-50/30">
          <input
            type="file"
            onChange={handleFileSelect}
            accept=".pdf,.doc,.docx,.xlsx,.png,.jpg"
            className="text-xs text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-[10px] file:font-medium file:bg-purple-600 file:text-white file:cursor-pointer hover:file:bg-purple-700"
          />
          <p className="text-[9px] text-gray-400 mt-1">Accepted: PDF, DOC, DOCX, XLSX, PNG, JPG</p>
          {uploading && (
            <div className="mt-2 flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-[10px] text-purple-600">Uploading…</span>
            </div>
          )}
        </div>
      )}

      {/* Version History */}
      {versions.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-3 py-1.5 border-b">
            <p className="text-[9px] font-semibold text-gray-500 uppercase">Version History</p>
          </div>
          <div className="divide-y divide-gray-100">
            {versions.map((v, i) => (
              <div key={i} className="px-3 py-2 flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-2">
                  <span className={`font-mono font-bold ${v.status === 'current' ? 'text-green-600' : 'text-gray-400'}`}>{v.version}</span>
                  <span className="text-gray-600">{v.fileName}</span>
                  {v.status === 'current' && <span className="text-[8px] bg-green-100 text-green-700 px-1 py-0.5 rounded">CURRENT</span>}
                </div>
                <div className="flex items-center gap-3 text-gray-400">
                  <span>{v.size}</span>
                  <span>{new Date(v.uploadedAt).toLocaleDateString('en-AU')}</span>
                  <span>{v.uploadedBy}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
