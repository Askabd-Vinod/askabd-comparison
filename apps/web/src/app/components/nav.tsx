'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getEnvConfig, envColor, envLabel } from '../lib/env';
import { getStaffSession, staffLogout, type StaffSession } from '../lib/staff-session';

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/welcome', label: 'AskABD' },
  { href: '/clients', label: 'Clients' },
  { href: '/platform', label: 'Platform' },
  { href: '/platform/portfolio', label: 'Portfolio' },
  { href: '/platform/services/registry', label: 'Services' },
  { href: '/platform/capabilities', label: 'Capabilities' },
  { href: '/platform/commercial', label: 'Commercial' },
  { href: '/platform/workflows', label: 'Workflows' },
  { href: '/platform/production-readiness', label: 'Readiness' },
  { href: '/platform/verification', label: 'Verification' },
];

export function NavBar() {
  const env = getEnvConfig();
  const pathname = usePathname();
  const router = useRouter();
  const [staff, setStaff] = useState<StaffSession | null>(null);

  // Real session, re-read on every navigation — never a hardcoded "Super Admin" badge.
  useEffect(() => { setStaff(getStaffSession()); }, [pathname]);

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  return (
    <header className="sticky top-0 z-50 shadow-md">
      {/* Main heading — Logo + Title centred on top with gradient */}
      <div className="bg-gradient-to-r from-[#1E1B4B] via-[#312E81] to-[#4C1D95] py-4 px-4">
        <div className="flex items-center justify-center gap-3">
          {/* Site wordmark, not a page heading — every page below supplies its own single
              <h1>, so this being an <h1> too was giving every page in the app two level-1
              headings, which breaks heading-hierarchy navigation for screen reader users. */}
          <Link href="/" className="flex items-center gap-3">
            <Image src="/logo.png" alt="AskABD Logo" width={44} height={44} className="object-contain drop-shadow-lg" />
            <span className="text-xl font-bold text-white tracking-wide drop-shadow-sm">
              AskABD Enterprise Operations Centre
            </span>
          </Link>
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold text-white ${envColor(env.environment)} shadow-sm`}>
            {envLabel(env.environment)}
          </span>
        </div>
      </div>

      {/* Navigation bar below */}
      <nav className="bg-white/95 backdrop-blur-sm border-b border-gray-200" aria-label="Main navigation">
        <div className="max-w-[1600px] mx-auto px-4 h-11 flex items-center justify-between">
          <div className="flex items-center gap-0.5 overflow-x-auto min-w-0">
            {navItems.map(item => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition whitespace-nowrap ${
                    active
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'text-gray-700 hover:text-purple-700 hover:bg-purple-50'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link href="/search" className="text-gray-500 hover:text-purple-700 transition" aria-label="Search" title="Global Search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            </Link>
            <span className="text-[10px] text-gray-400 hidden sm:inline">v{env.version}</span>
            {staff ? (
              <div className="flex items-center gap-2">
                {/* Previously showed the raw internal identityId UUID in this
                    tooltip instead of the staff member's own email — found
                    during the 2026-08-22 global UX audit. */}
                <Link href="/account/security" className="w-7 h-7 bg-purple-100 rounded-full flex items-center justify-center ring-2 ring-purple-200 hover:ring-purple-400 transition" title={`${staff.email} — ${staff.roles.join(', ')} — Account Security`}>
                  <span className="text-[10px] font-bold text-purple-700">{staff.roles[0]?.[0]?.toUpperCase() ?? 'S'}</span>
                </Link>
                <button
                  onClick={async () => { await staffLogout(); router.replace('/staff/login'); }}
                  className="text-[11px] text-gray-500 hover:text-purple-700 font-medium"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <Link href="/staff/login" className="text-[11px] text-purple-600 hover:text-purple-800 font-semibold">
                Staff sign in
              </Link>
            )}
          </div>
        </div>
      </nav>
    </header>
  );
}
