/**
 * Unified presentation-status vocabulary.
 *
 * AskABD's backend endpoints use several different, independently-evolved status
 * vocabularies today (confirmed by code inspection during the reliability-hardening
 * milestone): `/health` and `/ready` use `ok|ready|degraded|failed|starting` plus
 * `connected|disconnected`; connector tests use `connected|failed`; capability
 * maturity uses `operational|foundation|planned|concept`; lifecycle/requirement
 * status uses `provided|not_provided|in_progress|invalid`; and so on. Each of these
 * is a legitimate, domain-specific value in its own right — this file does NOT
 * change any of them.
 *
 * What it provides is a single place to translate any of those raw values into one
 * small, consistent set of PRESENTATION states, so a user reading two different
 * screens sees the same word and color for "this is fine" vs "this needs attention"
 * instead of visually re-deriving it per page. Backend contracts are untouched —
 * this is purely a frontend display-layer normalization, additive and opt-in.
 *
 * Rollout: introduced but not yet wired into existing pages (see the reliability
 * hardening milestone's final report for the rationale — avoiding a multi-page
 * change in the same pass as the reliability work). Adopt incrementally, page by
 * page, starting with the ones that already show the most different vocabularies
 * side by side (Platform dashboard, Service Registry, Production Readiness).
 */

export type PresentationStatus =
  | 'healthy'
  | 'degraded'
  | 'unhealthy'
  | 'blocked'
  | 'ready'
  | 'not_ready'
  | 'verified'
  | 'unverified'
  | 'not_configured'
  | 'not_deployed'
  | 'optional';

export interface StatusPresentation {
  status: PresentationStatus;
  label: string;
  /** Tailwind color token family — pick the shade you need (e.g. `${color}-500`, `bg-${color}-50`). */
  color: 'green' | 'amber' | 'red' | 'gray' | 'blue';
}

const PRESENTATION: Record<PresentationStatus, Omit<StatusPresentation, 'status'>> = {
  healthy: { label: 'Healthy', color: 'green' },
  degraded: { label: 'Degraded', color: 'amber' },
  unhealthy: { label: 'Unhealthy', color: 'red' },
  blocked: { label: 'Blocked', color: 'red' },
  ready: { label: 'Ready', color: 'green' },
  not_ready: { label: 'Not Ready', color: 'amber' },
  verified: { label: 'Verified', color: 'green' },
  unverified: { label: 'Unverified', color: 'gray' },
  not_configured: { label: 'Not Configured', color: 'gray' },
  not_deployed: { label: 'Not Deployed', color: 'gray' },
  optional: { label: 'Optional', color: 'blue' },
};

/**
 * Maps a raw backend status string (from any AskABD endpoint) to a unified
 * presentation status. Unknown values fall back to `unverified` (gray, neutral)
 * rather than guessing green or red — an unrecognized status should never be
 * silently presented as healthy.
 */
export function toPresentationStatus(raw: string | null | undefined): StatusPresentation {
  const key = (raw ?? '').toLowerCase().trim();
  const status: PresentationStatus = (() => {
    switch (key) {
      case 'ok': case 'ready': case 'connected': case 'healthy': case 'operational':
      case 'provided': case 'valid': case 'passed': case 'active': case 'approved':
        return 'ready';
      case 'degraded': case 'in_progress': case 'starting': case 'pending':
        return 'degraded';
      case 'failed': case 'disconnected': case 'unhealthy': case 'invalid':
      case 'error': case 'rejected': case 'blocked':
        return 'unhealthy';
      case 'not_provided': case 'not_configured': case 'not_started':
        return 'not_configured';
      case 'not_deployed': case 'planned': case 'concept':
        return 'not_deployed';
      case 'optional': case 'foundation':
        return 'optional';
      case '': case 'unknown': case 'unverified':
        return 'unverified';
      default:
        return 'unverified'; // never guess — unrecognized values are neutral, not green
    }
  })();
  return { status, ...PRESENTATION[status] };
}
