'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { getEnvConfig, envColor, envLabel } from '../lib/env';

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
];

export function NavBar() {
  const env = getEnvConfig();
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  return (
    <header className="sticky top-0 z-50 shadow-md">
      {/* Main heading — Logo + Title centred on top with gradient */}
      <div className="bg-gradient-to-r from-[#1E1B4B] via-[#312E81] to-[#4C1D95] py-4 px-4">
        <div className="flex items-center justify-center gap-3">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/logo.png" alt="AskABD Logo" width={44} height={44} className="object-contain drop-shadow-lg" />
            <h1 className="text-xl font-bold text-white tracking-wide drop-shadow-sm">
              AskABD Enterprise Operations Centre
            </h1>
          </Link>
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold text-white ${envColor(env.environment)} shadow-sm`}>
            {envLabel(env.environment)}
          </span>
        </div>
      </div>

      {/* Navigation bar below */}
      <nav className="bg-white/95 backdrop-blur-sm border-b border-gray-200" aria-label="Main navigation">
        <div className="max-w-[1600px] mx-auto px-4 h-11 flex items-center justify-between">
          <div className="flex items-center gap-0.5 overflow-x-auto">
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
            <div className="w-7 h-7 bg-purple-100 rounded-full flex items-center justify-center ring-2 ring-purple-200" title="hello@askabd.com — Super Admin">
              <span className="text-[10px] font-bold text-purple-700">SA</span>
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
}
