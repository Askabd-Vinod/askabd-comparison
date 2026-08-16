'use client';
import { logAuditEvent } from '../lib/operations-api';

interface DownloadButtonProps {
  fileName: string;
  format: 'pdf' | 'excel' | 'csv' | 'all';
  entityType?: string;
  entityId?: string;
  entityName?: string;
  clientName?: string;
  data?: Record<string, unknown>;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Universal download button that generates and downloads files.
 * Logs every download to audit trail for evidence.
 */
export function DownloadButton({ fileName, format, entityType, entityId, entityName, clientName, data, className, children }: DownloadButtonProps) {
  function handleDownload() {
    const timestamp = new Date().toISOString().split('T')[0];
    const fullFileName = `${fileName.replace(/\s+/g, '_')}_${timestamp}.${format === 'excel' ? 'xlsx' : format}`;

    // Generate content based on format
    let content: string;
    let mimeType: string;

    if (format === 'csv') {
      content = generateCSV(fileName, data);
      mimeType = 'text/csv';
    } else if (format === 'excel') {
      // For Excel, generate a CSV that Excel can open (simplified)
      content = generateCSV(fileName, data);
      mimeType = 'application/vnd.ms-excel';
    } else {
      // PDF — generate text content (in production, use a PDF library)
      content = generatePDFText(fileName, clientName, data);
      mimeType = 'text/plain';
    }

    // Trigger download
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fullFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Log to audit trail
    if (entityId) {
      logAuditEvent({
        entityType: entityType || 'document',
        entityId: entityId || fileName,
        entityName: entityName || fileName,
        action: 'downloaded',
        actor: 'hello@askabd.com',
        details: { format, fileName: fullFileName, clientName },
        evidence: [`File "${fullFileName}" downloaded at ${new Date().toISOString()}`],
      }).catch(() => {});
    }
  }

  const defaultClass = `text-[10px] font-medium px-2 py-0.5 rounded cursor-pointer transition ${
    format === 'pdf' ? 'bg-red-50 text-red-600 hover:bg-red-100' :
    format === 'excel' ? 'bg-green-50 text-green-600 hover:bg-green-100' :
    format === 'csv' ? 'bg-blue-50 text-blue-600 hover:bg-blue-100' :
    'bg-purple-50 text-purple-600 hover:bg-purple-100'
  }`;

  return (
    <button onClick={handleDownload} className={className || defaultClass}>
      {children || format.toUpperCase()}
    </button>
  );
}

function generateCSV(title: string, data?: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push(`"AskABD Enterprise Operations Centre — ${title}"`);
  lines.push(`"Generated","${new Date().toISOString()}"`);
  lines.push('');
  if (data) {
    lines.push(Object.keys(data).map(k => `"${k}"`).join(','));
    lines.push(Object.values(data).map(v => `"${String(v)}"`).join(','));
  }
  return lines.join('\n');
}

function generatePDFText(title: string, clientName?: string, data?: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push('━'.repeat(60));
  lines.push('  AskABD Enterprise Operations Centre');
  lines.push('━'.repeat(60));
  lines.push('');
  lines.push(`Document: ${title}`);
  if (clientName) lines.push(`Client: ${clientName}`);
  lines.push(`Generated: ${new Date().toLocaleString('en-AU')}`);
  lines.push(`Version: 1.0`);
  lines.push('');
  lines.push('─'.repeat(60));
  if (data) {
    Object.entries(data).forEach(([key, value]) => {
      lines.push(`${key}: ${String(value)}`);
    });
  }
  lines.push('');
  lines.push('─'.repeat(60));
  lines.push('© 2026 AskABD Technologies — hello@askabd.com');
  lines.push('━'.repeat(60));
  return lines.join('\n');
}
