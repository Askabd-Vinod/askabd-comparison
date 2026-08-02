import type { Metadata } from 'next';
import './globals.css';
import { getEnvConfig, envColor, envLabel } from './lib/env';

export const metadata: Metadata = {
  title: 'AskABD - Compare • Decide • Save',
  description: 'The world\'s best comparison platform. Compare products, services, travel, insurance, education, banking, and more.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const env = getEnvConfig();

  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        {/* Environment Banner */}
        {env.environment !== 'production' && (
          <div className={`${envColor(env.environment)} text-white text-center text-xs py-1 font-medium`}>
            {envLabel(env.environment)} — {env.apiUrl} — v{env.version}
          </div>
        )}
        <nav className="gradient-brand text-white shadow-lg">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <a href="/" className="text-2xl font-bold flex items-center gap-2">
              AskABD
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${envColor(env.environment)} font-bold`}>{envLabel(env.environment)}</span>
            </a>
            <div className="flex items-center gap-6 text-sm">
              <a href="/categories" className="hover:opacity-80">Categories</a>
              <a href="/search" className="hover:opacity-80">Search</a>
              <a href="/deals" className="hover:opacity-80">Deals</a>
              <a href="/dashboard" className="hover:opacity-80">Dashboard</a>
              <a href="/platform" className="hover:opacity-80 border border-white/30 px-2 py-1 rounded text-xs">Platform</a>
              <a href="/login" className="bg-white text-purple-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-100">Sign In</a>
            </div>
          </div>
        </nav>
        <main>{children}</main>
        <footer className="bg-gray-900 text-gray-400 py-8 mt-20">
          <div className="max-w-7xl mx-auto px-4 text-center">
            <p className="text-lg font-semibold text-white">AskABD</p>
            <p className="mt-1 text-sm">Compare • Decide • Save</p>
            <p className="mt-3 text-xs">&copy; 2026 AskABD Technologies • v{env.version} • {env.environment}</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
