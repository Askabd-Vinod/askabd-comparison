import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getEnvConfig, envColor, envLabel } from '../lib/env';
import { NavBar } from '../components/nav';
import { AICopilot } from '../components/ai-copilot';
import { StaffAuthGuard } from '../components/staff-auth-guard';

/**
 * The real staff Operations Centre shell — everything the old root layout used
 * to render unconditionally, now scoped to only the routes that are genuinely
 * part of the internal console (Dashboard, Clients, Platform, and every
 * sub-page under them). `/staff/login`, `/login`, and `/accept-invitation` live
 * in the separate `(auth)` group and never reach this layout at all, so they
 * never render this navigation — not hidden with CSS, structurally absent.
 *
 * Server-side gate (found necessary during live UAT, not originally shipped
 * with the route-group split): a brand-new browser TAB in the same profile as
 * an already-logged-in staff member shares that same-site cookie (cookies are
 * inherently cross-tab; `sessionStorage` is not), so the child Server
 * Component pages under this layout would render real staff data on the
 * very first server response even though the new tab's own client-side
 * session (`sessionStorage`) is empty — the client guard in
 * `staff-auth-guard.tsx` would then redirect a moment later, but not before
 * that first real-data render was already in the HTML. This check closes
 * that gap authoritatively at the layout boundary, before ANY child page
 * runs its own data fetch: no cookie, no shell, full stop — matching the
 * same "server boundary is authoritative" requirement the auth-page fix
 * used. It is a presence check, not a validity check (verifying signature/
 * expiry here would add a network round-trip to every navigation); an
 * expired or revoked token still reaches the shell but every real API call
 * a page makes will then 401 honestly, and the client-side guard's live
 * `/oc/me` re-check (staff-auth-guard.tsx) evicts the stale session shortly
 * after.
 */
export default async function AppShellLayout({ children }: { children: React.ReactNode }) {
  const env = getEnvConfig();
  const store = await cookies();
  if (!store.get('askabd_staff_token')?.value) {
    redirect('/staff/login');
  }

  return (
    <>
      <StaffAuthGuard />
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
    </>
  );
}
