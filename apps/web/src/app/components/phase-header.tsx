import { ActionLink } from './button';

/**
 * AskABD Design System — Standard Phase Header
 *
 * The reusable header for every major workflow/phase page (Discovery,
 * Assessment, Requirements, Connectors, Readiness, etc.) so a customer
 * looking at any of them recognizes the same product and the same pattern:
 * name, short explanation, real status, real progress, and a single primary
 * next action — never hardcoded, always driven by whatever real data the
 * calling page has.
 */
export type PhaseStatus = 'not_started' | 'in_progress' | 'blocked' | 'complete' | 'not_applicable';

const PHASE_STATUS_META: Record<PhaseStatus, { label: string; className: string }> = {
  not_started: { label: 'Not Started', className: 'text-gray-500 bg-gray-50 border-gray-200' },
  in_progress: { label: 'In Progress', className: 'text-blue-700 bg-blue-50 border-blue-200' },
  blocked: { label: 'Blocked', className: 'text-red-700 bg-red-50 border-red-200' },
  complete: { label: 'Complete', className: 'text-green-700 bg-green-50 border-green-200' },
  not_applicable: { label: 'Not Applicable', className: 'text-gray-400 bg-gray-50 border-gray-200' },
};

export interface PhaseHeaderProps {
  name: string;
  description: string;
  status: PhaseStatus;
  /** 0-100. Omit if this phase has no meaningful progress metric. */
  progress?: number;
  nextAction?: { label: string; href: string };
  secondaryActions?: { label: string; href: string }[];
  /** Real evidence timestamp — omit rather than hardcode if none exists. */
  lastVerified?: string | Date;
}

export function PhaseHeader({ name, description, status, progress, nextAction, secondaryActions, lastVerified }: PhaseHeaderProps) {
  const meta = PHASE_STATUS_META[status];
  return (
    <div className="bg-white rounded-xl border p-5 mb-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-gray-900">{name}</h2>
          <p className="text-xs text-gray-500 mt-1 max-w-xl">{description}</p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          {progress !== undefined && (
            <div className="text-right">
              <p className="text-xl font-bold text-gray-900">{progress}%</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Progress</p>
            </div>
          )}
          <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-md border ${meta.className}`}>{meta.label}</span>
        </div>
      </div>

      {progress !== undefined && (
        <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${name} progress`}>
          <div
            className={`h-full rounded-full ${status === 'blocked' ? 'bg-red-500' : status === 'complete' ? 'bg-green-500' : 'bg-blue-500'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {(nextAction || secondaryActions?.length || lastVerified) && (
        <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {nextAction && (
              <ActionLink variant="primary" href={nextAction.href}>{nextAction.label} →</ActionLink>
            )}
            {secondaryActions?.map((a, i) => (
              <ActionLink key={i} variant="secondary" href={a.href}>{a.label}</ActionLink>
            ))}
          </div>
          {lastVerified && (
            <p className="text-[10px] text-gray-400">
              Last verified: {typeof lastVerified === 'string' ? lastVerified : lastVerified.toLocaleString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
