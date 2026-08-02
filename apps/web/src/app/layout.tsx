import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AskABD - Compare • Decide • Save',
  description: 'The world\'s best comparison platform. Compare products, services, travel, insurance, education, banking, and more.',
  keywords: ['compare', 'comparison', 'products', 'services', 'deals', 'save money'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        <nav className="gradient-brand text-white shadow-lg">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <a href="/" className="text-2xl font-bold">AskABD</a>
            <div className="flex items-center gap-6">
              <a href="/categories" className="hover:opacity-80">Categories</a>
              <a href="/search" className="hover:opacity-80">Search</a>
              <a href="/deals" className="hover:opacity-80">Deals</a>
              <a href="/dashboard" className="hover:opacity-80">Dashboard</a>
              <a href="/platform" className="hover:opacity-80 text-xs border border-white/30 px-2 py-1 rounded">Platform</a>
              <a href="/login" className="bg-white text-purple-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-100">Sign In</a>
            </div>
          </div>
        </nav>
        <main>{children}</main>
        <footer className="bg-gray-900 text-gray-400 py-12 mt-20">
          <div className="max-w-7xl mx-auto px-4 text-center">
            <p className="text-lg font-semibold text-white">AskABD</p>
            <p className="mt-2">Compare • Decide • Save</p>
            <p className="mt-4 text-sm">&copy; 2026 AskABD Technologies. All rights reserved.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
