import { PortalSessionKeepAlive } from '../components/portal-session-keepalive';

/**
 * Portal layout — the customer-facing client-portal shell.
 *
 * The existing `client-portal/[clientId]/*` pages are already fully
 * self-contained (their own dark-theme header, sign-out control, and full-page
 * background) — they were never designed to be wrapped in the staff console's
 * NavBar/footer, they simply had no choice under the old single root layout.
 * This layout intentionally renders nothing but the page itself: no staff
 * navigation, no StaffAuthGuard, no AICopilot. A customer never sees any staff
 * console chrome here, structurally, not via CSS hiding.
 *
 * `PortalSessionKeepAlive` (2026-08-20) is the one addition — a real background
 * renewal timer (see that component's doc) so a customer's session survives
 * being left open, the same real guarantee StaffAuthGuard already provides on
 * the staff side. It renders nothing visible.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PortalSessionKeepAlive />
      {children}
    </>
  );
}
