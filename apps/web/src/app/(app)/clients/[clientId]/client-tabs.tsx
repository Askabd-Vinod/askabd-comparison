'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * PREVIOUSLY: 12 real, fully-implemented client pages — Discovery, Assessment,
 * Compliance, Gap Analysis, Financial, Payments, Proposals, Reconciliation,
 * Engagements, Optimization, Problem Universe, and Recommendations — had no
 * entry in this tab bar at all. Since this tab bar is the only persistent
 * internal navigation across every client-scoped page, those 12 real routes
 * were unreachable from the UI (dead ends reachable only by typing the exact
 * URL, or in a few cases via an unrelated customer-facing portal). Added below
 * in their real onboarding-journey order so the tab bar reflects every real
 * route in the client workspace — no invented pages, no removed pages.
 */
const tabs = [
  { label: 'Overview', segment: '' },
  { label: 'Lifecycle', segment: '/lifecycle' },
  { label: 'Services', segment: '/services' },
  { label: 'Applications', segment: '/applications' },
  { label: 'Capabilities', segment: '/capabilities' },
  { label: 'Environments', segment: '/environments' },
  { label: 'Connectors', segment: '/connectors' },
  { label: 'Discovery', segment: '/discovery' },
  { label: 'Problem Intake', segment: '/discovery-intake' },
  { label: 'Assessment', segment: '/assessment' },
  { label: 'Gap Analysis', segment: '/gaps' },
  { label: 'Problem Universe', segment: '/problems' },
  { label: 'Recommendations', segment: '/recommendations' },
  { label: 'Transformations', segment: '/transformations' },
  { label: 'Migrations', segment: '/migrations' },
  { label: 'Testing', segment: '/testing' },
  { label: 'UAT', segment: '/uat' },
  { label: 'Compliance', segment: '/compliance' },
  { label: 'Readiness', segment: '/readiness' },
  { label: 'Release Readiness', segment: '/release-readiness' },
  { label: 'Scorecard', segment: '/scorecard' },
  { label: 'Engineering', segment: '/engineering' },
  { label: 'Infrastructure', segment: '/infrastructure' },
  { label: 'Monitoring', segment: '/monitoring' },
  { label: 'Deployments', segment: '/deployments' },
  { label: 'Incidents', segment: '/incidents' },
  { label: 'Alerts', segment: '/alerts' },
  { label: 'Performance', segment: '/performance' },
  { label: 'Usage', segment: '/usage' },
  { label: 'Optimization', segment: '/optimization' },
  { label: 'Engagements', segment: '/engagements' },
  { label: 'Proposals', segment: '/proposals' },
  { label: 'Financial', segment: '/financial' },
  { label: 'Payments', segment: '/payments' },
  { label: 'Reconciliation', segment: '/reconciliation' },
  { label: 'Contracts', segment: '/contracts' },
  { label: 'Automation', segment: '/automation' },
  { label: 'Audit', segment: '/audit' },
  { label: 'Risks', segment: '/risks' },
  { label: 'Change Management', segment: '/changes' },
  { label: 'Maturity', segment: '/maturity' },
  { label: 'Roadmap', segment: '/roadmap' },
  { label: 'Knowledge', segment: '/knowledge' },
  { label: 'Consulting', segment: '/consulting' },
  { label: 'Documents', segment: '/documents' },
  { label: 'Business Requirements', segment: '/business-requirements' },
  { label: 'Comparisons', segment: '/comparisons' },
  { label: 'Traceability', segment: '/traceability' },
  { label: 'Contacts', segment: '/contacts' },
  { label: 'Notes', segment: '/notes' },
  { label: 'Tasks', segment: '/tasks' },
  { label: 'Requests', segment: '/requests' },
  { label: 'Invitations', segment: '/invitations' },
  { label: 'Activity', segment: '/activity' },
  { label: 'Timeline', segment: '/timeline' },
  { label: 'Reports', segment: '/reports' },
  { label: 'Settings', segment: '/settings' },
  { label: 'Support', segment: '/support' },
];

export function ClientTabs({ clientId }: { clientId: string }) {
  const pathname = usePathname();
  const base = `/clients/${clientId}`;

  function isActive(segment: string): boolean {
    if (segment === '') return pathname === base;
    return pathname.startsWith(`${base}${segment}`);
  }

  return (
    <div className="border-b border-gray-200 overflow-x-auto">
      <nav className="flex gap-0 min-w-max" aria-label="Client tabs">
        {tabs.map(tab => (
          <Link
            key={tab.segment}
            href={`${base}${tab.segment}`}
            aria-current={isActive(tab.segment) ? 'page' : undefined}
            className={`px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition ${
              isActive(tab.segment)
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
