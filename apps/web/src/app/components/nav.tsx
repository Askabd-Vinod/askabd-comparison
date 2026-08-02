'use client';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { getEnvConfig, envColor, envLabel } from '../lib/env';

export function NavBar() {
  const { user, authenticated, logout, loading } = useAuth();
  const env = getEnvConfig();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const initials = user?.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?';

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <a href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 gradient-brand rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">A</span>
          </div>
          <span className="text-xl font-bold text-gray-900">AskABD</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold text-white ${envColor(env.environment)}`}>{envLabel(env.environment)}</span>
        </a>

        {/* Nav Links */}
        <div className="hidden md:flex items-center gap-1">
          <NavLink href="/categories">Categories</NavLink>
          <NavLink href="/search">Search</NavLink>
          <NavLink href="/compare">Compare</NavLink>
          <NavLink href="/deals">Deals</NavLink>
          {authenticated && <NavLink href="/dashboard">Dashboard</NavLink>}
          <NavLink href="/platform" className="text-purple-600">Platform</NavLink>
        </div>

        {/* Right */}
        <div className="flex items-center gap-3">
          {loading ? (
            <div className="w-8 h-8 skeleton rounded-full" />
          ) : authenticated ? (
            <div className="relative" ref={menuRef}>
              <button onClick={() => setMenuOpen(!menuOpen)} className="flex items-center gap-2 hover:bg-gray-100 rounded-lg px-2 py-1.5 transition">
                <div className="w-8 h-8 gradient-brand rounded-full flex items-center justify-center">
                  <span className="text-white text-xs font-bold">{initials}</span>
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-sm font-medium text-gray-900 leading-none">{user?.name}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5 capitalize">{user?.role?.replace('_', ' ')}</p>
                </div>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200 py-2 animate-in">
                  <div className="px-4 py-2 border-b border-gray-100">
                    <p className="text-sm font-medium">{user?.name}</p>
                    <p className="text-xs text-gray-500">{user?.email}</p>
                    <p className="text-[10px] text-gray-400 mt-1 capitalize">{user?.role?.replace('_', ' ')} • {env.environment}</p>
                  </div>
                  <a href="/dashboard" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Dashboard</a>
                  <a href="/dashboard/settings" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Settings</a>
                  <a href="/platform" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Platform Manager</a>
                  <div className="border-t border-gray-100 mt-1 pt-1">
                    <button onClick={() => { logout(); setMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">Sign Out</button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <a href="/login" className="text-sm font-medium text-gray-700 hover:text-gray-900 px-3 py-2">Sign In</a>
              <a href="/signup" className="text-sm font-medium text-white gradient-brand px-4 py-2 rounded-lg hover:opacity-90">Get Started</a>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

function NavLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return <a href={href} className={`px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition ${className || ''}`}>{children}</a>;
}
