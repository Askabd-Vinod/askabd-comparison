import type { Metadata } from 'next';
import './globals.css';
import { getEnvConfig, envColor, envLabel } from './lib/env';
import { AuthContextProvider } from './lib/auth';
import { NavBar } from './components/nav';

export const metadata: Metadata = {
  title: 'AskABD - Compare • Decide • Save',
  description: 'The world\'s best comparison platform.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const env = getEnvConfig();

  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        <AuthContextProvider>
          {env.environment !== 'production' && (
            <div className={`${envColor(env.environment)} text-white text-center text-xs py-1 font-medium`}>
              {envLabel(env.environment)} — {env.apiUrl} — v{env.version}
            </div>
          )}
          <NavBar />
          <main>{children}</main>
          <footer className="bg-gray-900 text-gray-400 py-8 mt-20">
            <div className="max-w-7xl mx-auto px-4 text-center">
              <p className="text-lg font-semibold text-white">AskABD</p>
              <p className="mt-1 text-sm">Compare • Decide • Save</p>
              <p className="mt-3 text-xs">&copy; 2026 AskABD Technologies • v{env.version} • {env.environment}</p>
            </div>
          </footer>
        </AuthContextProvider>
      </body>
    </html>
  );
}
