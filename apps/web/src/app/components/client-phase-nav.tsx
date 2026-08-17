import Link from 'next/link';
import { statusMeta, type LifecycleStatus } from '../lib/onboarding-lifecycle';

/**
 * Compact "where are we" strip shown on every client-scoped page (via the shared
 * client layout). Answers the question the full Lifecycle page already answers in
 * depth — "what phase is this client in, what's done, what's next" — but makes it
 * visible everywhere, not just on /lifecycle, so a user working on e.g. Compliance
 * or Testing isn't disoriented about where that page sits in the overall journey.
 *
 * Every status shown here is derived from the same authoritative lifecycle state
 * (`GET /oc/lifecycle/:clientId`, single source of truth also used by PhaseHeader
 * on Overview and by the full Lifecycle timeline) — nothing here is invented.
 *
 * Only a curated subset of real client-workspace routes get a Complete/Next
 * gate badge: the ones that correspond to an actual, named lifecycle milestone
 * (Connectors, Discovery, Assessment, Gap Analysis, Migration, Validation,
 * Compliance). Other real pages (Services, Engineering, Readiness, Scorecard,
 * Problem Universe, Recommendations, etc.) are ongoing/always-available views,
 * not gated workflow steps, so they are deliberately NOT given a fabricated
 * Complete/Blocked badge here — that would overstate what's actually known.
 */

interface GatedItem {
  key: string;
  label: string;
  segment: string;
  /** Lifecycle order at which this milestone is considered reached. */
  gateOrder: number;
}

const GATED_ITEMS: GatedItem[] = [
  { key: 'connectors', label: 'Connectors', segment: '/connectors', gateOrder: 9 },
  { key: 'discovery', label: 'Discovery', segment: '/discovery', gateOrder: 11 },
  { key: 'assessment', label: 'Assessment', segment: '/assessment', gateOrder: 13 },
  { key: 'gaps', label: 'Gap Analysis', segment: '/gaps', gateOrder: 13 },
  { key: 'migrations', label: 'Migration', segment: '/migrations', gateOrder: 18 },
  { key: 'testing', label: 'Validation', segment: '/testing', gateOrder: 20 },
  { key: 'compliance', label: 'Compliance', segment: '/compliance', gateOrder: 22 },
];

export function ClientPhaseNav({ clientId, status }: { clientId: string; status: LifecycleStatus | null }) {
  if (!status || !statusMeta[status]) return null;
  const currentOrder = statusMeta[status].order;
  const currentLabel = statusMeta[status].label;
  const base = `/clients/${clientId}`;

  // First gated milestone not yet reached — the honest "what's next" pointer.
  const nextItem = GATED_ITEMS.find(i => i.gateOrder > currentOrder);

  return (
    <div className="flex items-center gap-2 flex-wrap text-[10px] mb-4 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg" role="navigation" aria-label="Client journey progress">
      <span className="font-semibold text-gray-500 uppercase tracking-wide shrink-0">Journey:</span>
      <span className="font-semibold text-purple-700">{currentLabel}</span>
      <div className="flex items-center gap-1 flex-wrap">
        {GATED_ITEMS.map(item => {
          const isComplete = item.gateOrder <= currentOrder;
          const isNext = nextItem?.key === item.key;
          return (
            <Link
              key={item.key}
              href={`${base}${item.segment}`}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium transition ${
                isComplete ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : isNext ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                : 'bg-white text-gray-400 border border-gray-200 hover:text-gray-600'
              }`}
              title={isComplete ? `${item.label} — complete` : isNext ? `${item.label} — next` : `${item.label} — not started`}
            >
              {isComplete ? '✓' : isNext ? '→' : '·'} {item.label}
            </Link>
          );
        })}
      </div>
      <Link href={`${base}/lifecycle`} className="ml-auto text-purple-600 hover:text-purple-800 font-medium shrink-0">
        View Full Lifecycle →
      </Link>
    </div>
  );
}
