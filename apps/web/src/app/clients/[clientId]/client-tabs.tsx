'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { label: 'Overview', segment: '' },
  { label: 'Lifecycle', segment: '/lifecycle' },
  { label: 'Applications', segment: '/applications' },
  { label: 'Services', segment: '/services' },
  { label: 'Capabilities', segment: '/capabilities' },
  { label: 'Environments', segment: '/environments' },
  { label: 'Infrastructure', segment: '/infrastructure' },
  { label: 'Monitoring', segment: '/monitoring' },
  { label: 'Deployments', segment: '/deployments' },
  { label: 'Incidents', segment: '/incidents' },
  { label: 'Alerts', segment: '/alerts' },
  { label: 'Audit', segment: '/audit' },
  { label: 'Risks', segment: '/risks' },
  { label: 'Maturity', segment: '/maturity' },
  { label: 'Roadmap', segment: '/roadmap' },
  { label: 'Knowledge', segment: '/knowledge' },
  { label: 'Consulting', segment: '/consulting' },
  { label: 'Documents', segment: '/documents' },
  { label: 'Contacts', segment: '/contacts' },
  { label: 'Timeline', segment: '/timeline' },
  { label: 'Scorecard', segment: '/scorecard' },
  { label: 'Reports', segment: '/reports' },
  { label: 'Connectors', segment: '/connectors' },
  { label: 'Automation', segment: '/automation' },
  { label: 'Contracts', segment: '/contracts' },
  { label: 'Testing', segment: '/testing' },
  { label: 'Readiness', segment: '/readiness' },
  { label: 'Engineering', segment: '/engineering' },
  { label: 'Migrations', segment: '/migrations' },
  { label: 'Settings', segment: '/settings' },
  { label: 'Support', segment: '/support' },
  { label: 'Performance', segment: '/performance' },
  { label: 'Usage', segment: '/usage' },
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
