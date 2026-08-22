'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getSession, refreshSession } from '../lib/session';

/**
 * Background, self-rescheduling renewal timer for the customer-portal domain —
 * the exact same real-token-driven renewal architecture as StaffAuthGuard's
 * proactive timer (see components/staff-auth-guard.tsx), mirrored here so
 * "automatic renewal before expiry" holds for customer sessions too, not just
 * staff ones. Without this, a customer who leaves a portal page open and idle
 * (no further clicks/fetches) for the token's full lifetime would only discover
 * the expiry reactively on their NEXT action — this timer renews proactively in
 * the background instead, so the session simply never has a chance to interrupt
 * them. Mounted from `(portal)/layout.tsx`, so it covers every customer-portal
 * page without each one needing its own copy of this logic.
 */
export function PortalSessionKeepAlive() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const session = getSession();
    if (!session) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = (expiresAt: number) => {
      const delay = Math.max(5_000, expiresAt - Date.now() - 60_000);
      timer = setTimeout(async () => {
        if (cancelled) return;
        const renewed = await refreshSession();
        if (cancelled) return;
        if (!renewed) {
          router.replace(`/login?next=${encodeURIComponent(pathname)}&expired=1`);
          return;
        }
        scheduleNext(renewed.expiresAt);
      }, delay);
    };
    scheduleNext(session.expiresAt);

    return () => { cancelled = true; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
