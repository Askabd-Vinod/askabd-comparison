/**
 * AskABD Design System — Evidence Status
 *
 * A single, semantic status vocabulary for anything the platform verifies
 * (connections, tests, requirements, readiness dimensions) — distinct from
 * `status-badge.tsx`'s `HealthStatus` (healthy/warning/critical/offline),
 * which describes ongoing client health, a different concept.
 *
 * Every status pairs an icon with text — never color alone (accessibility;
 * also matches this platform's own "never claim what you cannot prove"
 * principle: the icon+word together state a verifiable fact, not just a hue).
 */
export type EvidenceStatus = 'verified' | 'action_required' | 'checking' | 'failed' | 'not_configured' | 'not_yet_available';

const EVIDENCE_STATUS_META: Record<EvidenceStatus, { icon: string; label: string; className: string }> = {
  verified: { icon: '✓', label: 'Verified', className: 'text-green-700 bg-green-50 border-green-200' },
  action_required: { icon: '!', label: 'Action Required', className: 'text-orange-700 bg-orange-50 border-orange-200' },
  checking: { icon: '◷', label: 'Checking', className: 'text-blue-700 bg-blue-50 border-blue-200' },
  failed: { icon: '✕', label: 'Failed', className: 'text-red-700 bg-red-50 border-red-200' },
  not_configured: { icon: '—', label: 'Not Configured', className: 'text-gray-500 bg-gray-50 border-gray-200' },
  not_yet_available: { icon: '○', label: 'Not Yet Available', className: 'text-gray-400 bg-gray-50 border-gray-200 border-dashed' },
};

export function EvidenceBadge({ status, label }: { status: EvidenceStatus; label?: string }) {
  const meta = EVIDENCE_STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-md border ${meta.className}`}>
      <span aria-hidden="true">{meta.icon}</span>
      {label || meta.label}
    </span>
  );
}

/**
 * The evidence trail behind a "Verified" (or similar) claim — Fortune 500
 * customers will ask "why do you say that?"; this answers it inline, every
 * time, rather than requiring a claim to be taken on faith. All fields are
 * optional so callers only show what they genuinely have evidence for.
 */
export function EvidenceTrail({ source, lastTested, result }: { source?: string; lastTested?: string | Date; result?: string }) {
  if (!source && !lastTested && !result) return null;
  return (
    <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
      {source && <div><span className="text-gray-400 uppercase tracking-wide">Source</span><p className="text-gray-700 font-medium">{source}</p></div>}
      {lastTested && <div><span className="text-gray-400 uppercase tracking-wide">Last Tested</span><p className="text-gray-700 font-medium">{typeof lastTested === 'string' ? lastTested : lastTested.toLocaleString()}</p></div>}
      {result && <div><span className="text-gray-400 uppercase tracking-wide">Result</span><p className="text-gray-700 font-medium">{result}</p></div>}
    </div>
  );
}

/** Maps this platform's real connector-test status vocabulary onto EvidenceStatus.
 *  'configured' means fields were saved but never tested — that needs the customer's
 *  action (run a test), not "checking" (which implies a test is actively in progress). */
export function connectionEvidenceStatus(status: string | undefined): EvidenceStatus {
  switch (status) {
    case 'connected': return 'verified';
    case 'partial': return 'action_required';
    case 'failed': return 'failed';
    case 'configured': return 'action_required';
    default: return 'not_configured';
  }
}
