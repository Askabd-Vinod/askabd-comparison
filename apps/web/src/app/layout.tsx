import type { Metadata } from 'next';
import './globals.css';
import { getEnvConfig, envColor, envLabel } from './lib/env';
import { NavBar } from './components/nav';
import { AICopilot } from './components/ai-copilot';

export const metadata: Metadata = {
  title: 'AskABD Enterprise Operations Center',
  description: 'AskABD internal platform for client operations, monitoring, deployments, and service delivery.',
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
      <body className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-indigo-50/30">
        {env.environment !== 'production' && (
          <div className={`${envColor(env.environment)} text-white text-center text-[11px] py-0.5 font-medium tracking-wide`}>
            {envLabel(env.environment)} — v{env.version} — INTERNAL USE ONLY — hello@askabd.com
          </div>
        )}
        <NavBar />
        <main className="min-h-[calc(100vh-8rem)]">{children}</main>
        <AICopilot />
        <footer className="border-t border-gray-200 bg-gradient-to-r from-[#1E1B4B] to-[#312E81] py-3">
          <div className="max-w-[1600px] mx-auto px-4 flex items-center justify-between text-[11px] text-indigo-200">
            <p>&copy; 2026 AskABD Technologies — Enterprise Operations Centre</p>
            <p>Super Admin: hello@askabd.com</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
