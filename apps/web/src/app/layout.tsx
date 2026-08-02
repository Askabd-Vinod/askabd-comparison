import type { Metadata } from 'next';
import './globals.css';
import { getEnvConfig, envColor, envLabel } from './lib/env';
import { NavBar } from './components/nav';

export const metadata: Metadata = {
  title: 'AskABD - Compare • Decide • Save',
  description: 'Enterprise comparison platform by AskABD Technologies. Compare products, services, insurance, travel, education, banking and more.',
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
        {env.environment !== 'production' && (
          <div className={`${envColor(env.environment)} text-white text-center text-[11px] py-1 font-medium tracking-wide`}>
            {envLabel(env.environment)} — v{env.version}
          </div>
        )}
        <NavBar />
        <main>{children}</main>
        <footer className="bg-gray-900 text-gray-400 py-12 mt-16">
          <div className="max-w-7xl mx-auto px-4">
            <div className="grid md:grid-cols-4 gap-8 mb-8">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 gradient-brand rounded-lg flex items-center justify-center"><span className="text-white text-xs font-bold">A</span></div>
                  <span className="text-white font-semibold">AskABD</span>
                </div>
                <p className="text-sm">Enterprise Digital Services by AskABD Technologies</p>
              </div>
              <div>
                <p className="text-white font-medium text-sm mb-3">Platform</p>
                <div className="space-y-2 text-sm"><a href="/categories" className="block hover:text-white">Categories</a><a href="/compare" className="block hover:text-white">Compare</a><a href="/deals" className="block hover:text-white">Deals</a><a href="/search" className="block hover:text-white">Search</a></div>
              </div>
              <div>
                <p className="text-white font-medium text-sm mb-3">Services</p>
                <div className="space-y-2 text-sm"><a href="/services" className="block hover:text-white">All Services</a><a href="#" className="block hover:text-white">Business Analysis</a><a href="#" className="block hover:text-white">Digital Transformation</a><a href="#" className="block hover:text-white">Platform Engineering</a></div>
              </div>
              <div>
                <p className="text-white font-medium text-sm mb-3">Contact</p>
                <div className="space-y-2 text-sm"><p>hello@askabd.com</p><p>AskABD Technologies</p><a href="/platform" className="block hover:text-white text-purple-400">Platform Status</a></div>
              </div>
            </div>
            <div className="border-t border-gray-800 pt-6 flex flex-col md:flex-row items-center justify-between gap-4 text-xs">
              <p>&copy; 2026 AskABD Technologies. All rights reserved.</p>
              <p>Compare • Decide • Save</p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
