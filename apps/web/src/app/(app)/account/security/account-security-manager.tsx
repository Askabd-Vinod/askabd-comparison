'use client';
import { useEffect, useState } from 'react';
import { getStaffSession, refreshStaffSession, RENEW_BEFORE_EXPIRY_MS, type StaffSession } from '../../../lib/staff-session';
import { Action } from '../../../components/button';

const IDENTITY_URL = process.env.NEXT_PUBLIC_IDENTITY_URL || 'http://localhost:3100';

type MfaStatus = 'loading' | 'none' | 'pending' | 'active' | 'no-session';

/**
 * Real bug found live during the 2026-08-21 MFA UAT pass: every call in this
 * component used a raw `fetch()` with whatever access token `getStaffSession()`
 * happened to return at that instant — unlike `staffFetch` (used everywhere
 * else in the app), it never proactively renewed a near-expiry token and never
 * retried once on a 401. Reproduced live: with ~78s left on a real token (past
 * the same 60s renewal threshold `staffFetch` uses), `POST .../mfa/enroll`
 * failed outright with a real `invalid_token` 401 — exactly the kind of
 * mid-task interruption a user reads a QR code and types their first TOTP
 * code during, i.e. likely to happen in real MFA enrollment, not an edge
 * case. This mirrors `authFetch`/`staffFetch`'s exact policy (see
 * lib/session.ts, lib/staff-session.ts) for the identity-service calls this
 * component makes directly (MFA endpoints live on askabd-identity, not the
 * comparison API `staffFetch` targets).
 */
async function identityFetch(path: string, opts?: RequestInit): Promise<{ res: Response; session: StaffSession | null }> {
  let session = getStaffSession();
  if (session && session.expiresAt - Date.now() < RENEW_BEFORE_EXPIRY_MS) {
    session = await refreshStaffSession();
  }
  const headers = new Headers(opts?.headers);
  if (session) {
    headers.set('Authorization', `Bearer ${session.accessToken}`);
    headers.set('X-Org-Context', session.orgContext);
  }
  const res = await fetch(`${IDENTITY_URL}${path}`, { ...opts, headers });
  if (res.status === 401 && session) {
    const renewed = await refreshStaffSession();
    if (renewed) {
      const retryHeaders = new Headers(opts?.headers);
      retryHeaders.set('Authorization', `Bearer ${renewed.accessToken}`);
      retryHeaders.set('X-Org-Context', renewed.orgContext);
      return { res: await fetch(`${IDENTITY_URL}${path}`, { ...opts, headers: retryHeaders }), session: renewed };
    }
  }
  return { res, session };
}

export function AccountSecurityManager() {
  const [status, setStatus] = useState<MfaStatus>('loading');
  const [secret, setSecret] = useState<string | null>(null);
  const [provisioningUri, setProvisioningUri] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const session = typeof window !== 'undefined' ? getStaffSession() : null;

  async function refreshStatus() {
    const s = getStaffSession();
    if (!s) { setStatus('no-session'); return; }
    try {
      const { res } = await identityFetch(`/v1/identities/${s.identityId}/mfa/status`);
      if (!res.ok) { setStatus('no-session'); return; }
      const body = await res.json() as { status: 'none' | 'pending' | 'active' };
      setStatus(body.status);
    } catch {
      setStatus('no-session');
    }
  }

  useEffect(() => { refreshStatus(); }, []);

  async function handleEnroll() {
    if (!session) return;
    setBusy(true); setError(null);
    try {
      const { res } = await identityFetch(`/v1/identities/${session.identityId}/mfa/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json();
      if (!res.ok) { setError(body?.error?.message || 'Could not start enrollment.'); return; }
      setSecret(body.secret);
      setProvisioningUri(body.provisioningUri);
      setStatus('pending');
    } catch {
      setError('Could not reach the identity service.');
    } finally {
      setBusy(false);
    }
  }

  async function handleActivate(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setBusy(true); setError(null);
    try {
      const { res } = await identityFetch(`/v1/identities/${session.identityId}/mfa/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error?.message || 'Invalid code. Please try again.');
        return;
      }
      setStatus('active');
      setSecret(null);
      setProvisioningUri(null);
      setCode('');
    } catch {
      setError('Could not reach the identity service.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setBusy(true); setError(null);
    try {
      const { res } = await identityFetch(`/v1/identities/${session.identityId}/mfa/disable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error?.message || 'Invalid code — two-factor authentication remains active.');
        return;
      }
      setStatus('none');
      setCode('');
    } catch {
      setError('Could not reach the identity service.');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'loading') return <p className="text-sm text-gray-400">Loading…</p>;
  if (status === 'no-session') return <p className="text-sm text-gray-400">Sign in to manage your account security.</p>;

  return (
    <div className="bg-white rounded-xl border p-6">
      {status === 'none' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-gray-900">Two-factor authentication</p>
              <p className="text-xs text-gray-500 mt-0.5">Not enabled. Add a real authenticator app (TOTP) for a second sign-in factor.</p>
            </div>
            <span className="text-[10px] font-bold px-2 py-1 rounded bg-gray-100 text-gray-500">OFF</span>
          </div>
          <Action variant="primary" onClick={handleEnroll} loading={busy}>Enable two-factor authentication</Action>
        </>
      )}

      {status === 'pending' && (
        <>
          <p className="text-sm font-semibold text-gray-900 mb-1">Set up your authenticator app</p>
          <p className="text-xs text-gray-500 mb-4">Add this account to Google Authenticator, 1Password, or any TOTP app using the code below, then enter the 6-digit code it shows.</p>
          {secret && (
            <div className="bg-gray-50 border rounded-md p-3 mb-4">
              <p className="text-[10px] text-gray-500 mb-1">Manual entry code</p>
              <p className="font-mono text-sm tracking-wider break-all">{secret}</p>
              {provisioningUri && <p className="text-[10px] text-gray-400 mt-2 break-all">{provisioningUri}</p>}
            </div>
          )}
          <form onSubmit={handleActivate}>
            <label htmlFor="mfa-activate-code" className="block text-xs font-medium text-gray-600 mb-1">6-digit code</label>
            <input
              id="mfa-activate-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric" placeholder="123456"
              className="w-full max-w-[200px] border border-gray-300 rounded-md px-3 py-2 text-sm mb-3 tracking-[0.3em] text-center font-mono"
            />
            {error && <div role="alert" className="mb-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
            <div className="flex gap-2">
              <Action type="submit" variant="primary" loading={busy} disabled={code.length !== 6}>Activate</Action>
              <Action type="button" variant="secondary" onClick={() => { setStatus('none'); setSecret(null); setProvisioningUri(null); setCode(''); setError(null); }}>Cancel</Action>
            </div>
          </form>
        </>
      )}

      {status === 'active' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-gray-900">Two-factor authentication</p>
              <p className="text-xs text-gray-500 mt-0.5">Active. A code from your authenticator app is required at every sign-in.</p>
            </div>
            <span className="text-[10px] font-bold px-2 py-1 rounded bg-green-100 text-green-700">ON</span>
          </div>
          <form onSubmit={handleDisable}>
            <label htmlFor="mfa-disable-code" className="block text-xs font-medium text-gray-600 mb-1">Enter a current code to disable</label>
            <input
              id="mfa-disable-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric" placeholder="123456"
              className="w-full max-w-[200px] border border-gray-300 rounded-md px-3 py-2 text-sm mb-3 tracking-[0.3em] text-center font-mono"
            />
            {error && <div role="alert" className="mb-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
            <Action type="submit" variant="destructive" loading={busy} disabled={code.length !== 6}>Disable two-factor authentication</Action>
          </form>
        </>
      )}
    </div>
  );
}
