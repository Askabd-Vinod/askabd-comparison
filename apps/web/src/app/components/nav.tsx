'use client';
import { useAuth } from '../lib/auth';
import { getEnvConfig, envColor, envLabel } from '../lib/env';

export function NavBar() {
  const { user, authenticated, logout } = useAuth();
  const env = getEnvConfig();

  return (
    <nav className="gradient-brand text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <a href="/" className="text-2xl font-bold flex items-center gap-2">
          AskABD
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${envColor(env.environment)} font-bold`}>{envLabel(env.environment)}</span>
        </a>
        <div className="flex items-center gap-5 text-sm">
          <a href="/categories" className="hover:opacity-80">Categories</a>
          <a href="/search" className="hover:opacity-80">Search</a>
          <a href="/deals" className="hover:opacity-80">Deals</a>
          {authenticated && <a href="/dashboard" className="hover:opacity-80">Dashboard</a>}
          <a href="/platform" className="hover:opacity-80 border border-white/30 px-2 py-1 rounded text-xs">Platform</a>
          {authenticated ? (
            <div className="flex items-center gap-3">
              <span className="text-xs opacity-70">{user?.name || user?.email}</span>
              <button onClick={logout} className="bg-white/20 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-white/30">Logout</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <a href="/login" className="bg-white text-purple-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-100">Sign In</a>
              <a href="/signup" className="border border-white/50 px-3 py-2 rounded-lg text-xs hover:bg-white/10">Sign Up</a>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
