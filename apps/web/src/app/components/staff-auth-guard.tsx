'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getStaffSession, clearStaffSession, refreshStaffSession } from '../lib/staff-session';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

// Routes that are NOT part of the internal AskABD staff console — the customer-facing
// surface and the staff-login page itself. Everything else in this app (Dashboard,
// Clients, Platform, and every /clients/:clientId/* sub-page) IS the internal console.
const CUSTOMER_FACING_PREFIXES = ['/login', '/accept-invitation', '/client-portal', '/staff/login'];

function isGuardedPath(pathname: string): boolean {
  return !CUSTOMER_FACING_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

/** Sends the user back to staff sign-in with their intended destination preserved,
 *  and `expired=1` when this was a genuine renewal failure (not a fresh, never-signed-in
 *  visit) so the login page can show an honest "your session has expired" message
 *  instead of a generic sign-in prompt. */
function redirectToLogin(router: ReturnType<typeof useRouter>, pathname: string, reason: 'expired' | 'unauthenticated') {
  clearStaffSession();
  const suffix = reason === 'expired' ? '&expired=1' : '';
  router.replace(`/staff/login?next=${encodeURIComponent(pathname)}${suffix}`);
}

let interceptorInstalled = false;

/**
 * Installs a ONE-TIME global fetch interceptor that attaches the real staff
 * session's Authorization header to every request targeting this app's own API,
 * made while the current page is under a guarded (internal-console) route — without
 * needing to edit each of the ~57 individual page components that currently call
 * `fetch()` directly. Customer-portal pages already attach their own header via
 * `authFetch` (lib/session.ts) and are unaffected — this interceptor only acts when
 * `window.location.pathname` is currently a guarded path.
 *
 * Session-renewal aware (2026-08-20): proactively renews a near-expiry token before
 * attaching it, and — if the server still returns 401 (e.g. the token expired between
 * the proactive check and the request actually being processed, or was revoked) —
 * renews once and retries the SAME request exactly once before giving up. This is the
 * real fix for "the session gets interrupted while I'm actively using the app": every
 * one of the ~57 pages that call plain `fetch()` now transparently survives a token
 * expiring mid-session, without each page needing its own retry logic.
 *
 * Real, documented limitation: this is a page-load-time heuristic (checks the CURRENT
 * pathname at the moment each fetch fires), not a route-level API binding — a request
 * kicked off just before a client-side navigation completes could theoretically race.
 * Acceptable here because the server-side RBAC check (platform/rbac/middleware.ts,
 * now resolving real roles from staff_role_assignment) is the actual security
 * boundary; this interceptor only affects whether a legitimate staff member's own
 * requests carry their own token, not whether unauthorized access is possible.
 */
function installFetchInterceptor() {
  if (interceptorInstalled || typeof window === 'undefined') return;
  interceptorInstalled = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const isApiRequest = url.startsWith(API);
    const isGuardedNow = isGuardedPath(window.location.pathname);
    if (!isApiRequest || !isGuardedNow) {
      return originalFetch(input, init);
    }

    let session = getStaffSession();
    if (session && session.expiresAt - Date.now() < 60_000) {
      session = await refreshStaffSession();
    }
    const attach = (headers: Headers) => {
      if (session && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${session.accessToken}`);
      return headers;
    };

    const headers = attach(new Headers(init?.headers ?? (typeof input === 'object' && 'headers' in input ? (input as Request).headers : undefined)));
    const res = await originalFetch(input, { ...init, headers });

    if (res.status === 401 && session) {
      const renewed = await refreshStaffSession();
      if (renewed) {
        const retryHeaders = attach(new Headers(init?.headers ?? (typeof input === 'object' && 'headers' in input ? (input as Request).headers : undefined)));
        retryHeaders.set('Authorization', `Bearer ${renewed.accessToken}`);
        return originalFetch(input, { ...init, headers: retryHeaders });
      }
    }
    return res;
  };
}

export function StaffAuthGuard() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    installFetchInterceptor();
  }, []);

  // Proactive renewal: a background timer scheduled from the real token's own expiry
  // (never a fixed guess), so an actively-used session renews itself before it ever
  // has a chance to interrupt the user — no "your work just vanished" moment. Only
  // runs while a guarded staff page is mounted; the interceptor's own reactive retry
  // remains the safety net if this timer is ever delayed (e.g. a backgrounded tab).
  useEffect(() => {
    if (!isGuardedPath(pathname)) return;
    const session = getStaffSession();
    if (!session) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = (expiresAt: number) => {
      const delay = Math.max(5_000, expiresAt - Date.now() - 60_000); // renew 60s before real expiry
      timer = setTimeout(async () => {
        if (cancelled) return;
        const renewed = await refreshStaffSession();
        if (cancelled) return;
        if (!renewed) {
          redirectToLogin(router, pathname, 'expired');
          return;
        }
        scheduleNext(renewed.expiresAt);
      }, delay);
    };
    scheduleNext(session.expiresAt);

    return () => { cancelled = true; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!isGuardedPath(pathname)) return;
    const session = getStaffSession();
    if (!session) {
      redirectToLogin(router, pathname, 'unauthenticated');
      return;
    }
    // Real, live check — not just "a session object exists in storage": confirm the
    // token is still genuinely valid and still holds a real role, catching a revoked
    // staff grant or an expired session immediately rather than letting stale client
    // state render a page whose every real API call will 401/403 anyway. A 401 here
    // now attempts a real renewal before evicting — an access token that merely
    // expired mid-session is recoverable and must never look identical to a genuinely
    // revoked grant.
    fetch(`${API}/api/v1/oc/me`, { headers: { Authorization: `Bearer ${session.accessToken}` } })
      .then(async (res) => {
        if (res.status === 401) {
          const renewed = await refreshStaffSession();
          if (!renewed) {
            redirectToLogin(router, pathname, 'expired');
            return;
          }
          return; // renewed successfully — the page's own data fetches will use the new token
        }
        if (res.ok) {
          const me = await res.json() as { roles: string[] };
          if (!me.roles || me.roles.length === 0) {
            // A real staff grant existed at login time but has since been revoked.
            redirectToLogin(router, pathname, 'unauthenticated');
          }
        }
      })
      .catch(() => { /* network hiccup — do not evict a valid session over a transient failure */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
