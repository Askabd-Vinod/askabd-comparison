import type { Metadata } from 'next';
import './globals.css';

/**
 * Root layout — deliberately minimal.
 *
 * This used to unconditionally render the full staff Operations Centre shell
 * (env banner, NavBar with Dashboard/Clients/Platform navigation, StaffAuthGuard,
 * AICopilot, footer) for EVERY route in the app, including /staff/login, /login,
 * and /accept-invitation. That meant an unauthenticated visitor to a login page
 * briefly saw the full authenticated console chrome (and could click into it)
 * before any redirect logic ran — a genuine security/UX defect, not just a
 * cosmetic one.
 *
 * The fix is route-group layout separation, not CSS hiding:
 *   - `(app)/layout.tsx`   — the real staff console shell (NavBar, StaffAuthGuard,
 *                            AICopilot, footer). Everything that isn't auth/portal.
 *   - `(auth)/layout.tsx`  — minimal AskABD-branded auth chrome only. Used by
 *                            /login, /staff/login, /accept-invitation, and any
 *                            forgot/reset-password pages.
 *   - `(portal)/layout.tsx`— minimal customer-branded chrome for /client-portal/*.
 *
 * This root layout now supplies ONLY what every single route genuinely needs
 * (html/head/fonts/global CSS/metadata) — no navigation, no auth guard, no
 * authenticated data-fetching, no workspace UI. Route groups below choose their
 * own shell; none of them inherit anything from each other.
 */
export const metadata: Metadata = {
  title: 'AskABD Enterprise Operations Center',
  description: 'AskABD internal platform for client operations, monitoring, deployments, and service delivery.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-indigo-50/30">
        {children}
      </body>
    </html>
  );
}
