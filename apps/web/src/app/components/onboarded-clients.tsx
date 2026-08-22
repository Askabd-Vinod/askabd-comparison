'use client';
import { useEffect, useState } from 'react';

/**
 * Found during the onboarding data-integrity audit: this file previously ALSO
 * exported `OnboardedClientsRows`/`OnboardedClientsCards`/`LifecycleBadge` — a
 * second, localStorage-only client listing/grid, entirely disconnected from the
 * real client directory (`GET /oc/clients`, used by `/clients/page.tsx`). They were
 * dead code — not imported anywhere — but a real fabrication risk if ever wired up:
 * they would only ever show clients onboarded in the CURRENT browser, invisible to
 * every other staff member, device, or session, duplicating what the real directory
 * already correctly shows. Removed rather than left as a landmine. `OnboardSuccessBanner`
 * is real, still used by `/clients/page.tsx`, and legitimately same-session/ephemeral —
 * it only fires immediately after a create this same browser tab just performed.
 */

export function OnboardSuccessBanner() {
  const [show, setShow] = useState(false);
  const [verifyUrl, setVerifyUrl] = useState('/verify');

  useEffect(() => {
    if (window.location.search.includes('onboarded=true')) {
      setShow(true);
      // Find the most recent onboarded client for the verify link — same-tab,
      // same-session state only (this banner never renders otherwise).
      try {
        const clients = JSON.parse(localStorage.getItem('askabd-onboarded-clients') || '[]');
        if (Array.isArray(clients) && clients.length > 0) {
          const latest = clients[clients.length - 1];
          if (latest?.id) setVerifyUrl(`/verify?clientId=${encodeURIComponent(latest.id)}`);
        }
      } catch { /* fallback to /verify */ }
      setTimeout(() => setShow(false), 8000);
      // Clean URL
      window.history.replaceState({}, '', '/clients');
    }
  }, []);

  if (!show) return null;

  return (
    <div className="mb-4 bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center gap-3 animate-in">
      <span className="text-lg">🎉</span>
      <div>
        <p className="text-sm font-semibold text-green-800">Organization Created Successfully!</p>
        <p className="text-[10px] text-green-600">A verification email has been sent. <a href={verifyUrl} className="underline font-medium">Complete verification →</a></p>
      </div>
      <button onClick={() => setShow(false)} className="ml-auto text-green-600 hover:text-green-800 text-sm">✕</button>
    </div>
  );
}
