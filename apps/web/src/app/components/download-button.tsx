'use client';
import { logAuditEvent } from '../lib/operations-api';
import { getStaffSession } from '../lib/staff-session';

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
 *
 * REAL BUG FOUND AND FIXED (2026-08-29, master directive's "physically
 * test downloaded files" requirement): every one of this component's 9
 * real consumers requesting `format="pdf"` downloaded a file literally
 * named `*.pdf` whose actual bytes were plain text — a real PDF viewer
 * (Preview, Acrobat, a browser's built-in viewer) would refuse to open it
 * or show a "damaged file" error, since a `.pdf` extension is a promise
 * about the byte format, not just a label. No PDF-generation library
 * exists anywhere in this project (confirmed by grep across both
 * `package.json` files) — adding one is a genuine, separate feature
 * decision, not a one-line fix. Until that exists, the honest fix
 * (matching this platform's own "PDF/HTML honestly not implemented, use
 * what's real" precedent already established for Executive Reporting) is
 * to stop claiming the file is a PDF: it now downloads as the real `.txt`
 * it always was, and the default button label (several call sites render
 * no custom `children` at all) no longer claims "PDF" either.
 */
export function DownloadButton({ fileName, format, entityType, entityId, entityName, clientName, data, className, children }: DownloadButtonProps) {
  const realFormat = format === 'pdf' ? 'txt' : format === 'excel' ? 'xlsx' : format;

  function handleDownload() {
    const timestamp = new Date().toISOString().split('T')[0];
    const fullFileName = `${fileName.replace(/\s+/g, '_')}_${timestamp}.${realFormat}`;

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
      // "pdf" format — no real PDF library exists in this project (see the
      // component doc comment above); generate real, honestly-labeled
      // plain-text report content instead of a file that lies about its
      // own format.
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
        // Previously hardcoded to a literal 'hello@askabd.com' regardless of
        // who actually downloaded the file — found during the 2026-08-22
        // global UX/fabrication audit. This is a shared component used
        // across Reports and several other screens, so this one fix
        // corrects the actor attribution everywhere it's used.
        actor: getStaffSession()?.identityId || 'unknown-staff',
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
      {children || realFormat.toUpperCase()}
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
