'use client';
import { getEnvConfig, envColor, envLabel } from '../lib/env';

export function NavBar() {
  const env = getEnvConfig();

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 gradient-brand rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">A</span>
          </div>
          <span className="text-xl font-bold text-gray-900">AskABD</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold text-white ${envColor(env.environment)}`}>{envLabel(env.environment)}</span>
        </a>
        <div className="hidden md:flex items-center gap-1">
          <NavLink href="/">Compare</NavLink>
          <NavLink href="/categories">Categories</NavLink>
          <NavLink href="/deals">Deals</NavLink>
          <NavLink href="/search">Search</NavLink>
          <NavLink href="/services">Services</NavLink>
          <NavLink href="/platform" className="text-purple-600">Platform</NavLink>
        </div>
        <a href="/services" className="text-sm font-medium text-white gradient-brand px-4 py-2 rounded-lg hover:opacity-90">Contact Us</a>
      </div>
    </nav>
  );
}

function NavLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return <a href={href} className={`px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition ${className || ''}`}>{children}</a>;
}
