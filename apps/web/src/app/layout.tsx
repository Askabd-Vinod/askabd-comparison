import type { Metadata } from 'next';
import './globals.css';
import { getEnvConfig, envColor, envLabel } from './lib/env';
import { AuthContextProvider } from './lib/auth';
import { NavBar } from './components/nav';

export const metadata: Metadata = {
  title: 'AskABD - Compare • Decide • Save',
  description: 'Enterprise comparison platform. Compare products, services, insurance, travel, education, banking and more.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const env = getEnvConfig();

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-white">
        <AuthContextProvider>
          {env.environment !== 'production' && (
            <div className={`${envColor(env.environment)} text-white text-center text-[11px] py-1 font-medium tracking-wide`}>
              {envLabel(env.environment)} ENVIRONMENT — v{env.version} — {env.apiUrl}
            </div>
          )}
          <NavBar />
          <main>{children}</main>
          <footer className="bg-gray-900 text-gray-400 py-12">
            <div className="max-w-7xl mx-auto px-4">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 gradient-brand rounded flex items-center justify-center"><span className="text-white text-xs font-bold">A</span></div>
                  <span className="text-white font-semibold">AskABD</span>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <a href="/categories" className="hover:text-white">Categories</a>
                  <a href="/search" className="hover:text-white">Search</a>
                  <a href="/deals" className="hover:text-white">Deals</a>
                  <a href="/platform" className="hover:text-white">Platform</a>
                </div>
                <p className="text-xs">&copy; 2026 AskABD Technologies • v{env.version}</p>
              </div>
            </div>
          </footer>
        </AuthContextProvider>
      </body>
    </html>
  );
}
