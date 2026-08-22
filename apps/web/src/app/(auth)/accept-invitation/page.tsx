'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { setSession } from '../../lib/session';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

type LookupState =
  | { status: 'loading' }
  | { status: 'invalid' }
  | { status: 'ready'; clientName: string; email: string };

function decodeExpiryMs(jwt: string): number {
  try {
    const payloadSegment = jwt.split('.')[1];
    if (!payloadSegment) return Date.now() + 60_000;
    const base64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof window !== 'undefined' ? window.atob(base64) : Buffer.from(base64, 'base64').toString('utf8');
    const payload = JSON.parse(json) as { exp?: number };
    return payload.exp ? payload.exp * 1000 : Date.now() + 60_000;
  } catch {
    return Date.now() + 60_000;
  }
}

const CARD = 'w-full max-w-sm bg-white rounded-xl border border-gray-200 p-8 shadow-lg';
const INPUT = 'w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500';

/**
 * Accept a real client invitation. Public route — a brand-new customer has no token
 * yet — matches server.ts's publicRoutes for GET /api/v1/oc/invitations/lookup and
 * POST /api/v1/oc/invitations/accept.
 *
 * Two real, legitimate outcomes, both handled by this ONE form:
 *
 *  1. New customer: the password field is the password they're CHOOSING. The real
 *     accept call creates a real askabd-identity identity, verifies it, sets the
 *     chosen password, creates the real client_identity_mapping row, and logs the
 *     customer straight in.
 *
 *  2. Returning customer accepting a SECOND (or Nth) client's invitation with the
 *     same email — a real, legitimate multi-client case (see invitation-service.ts's
 *     acceptInvitation). The backend detects the identity already exists and instead
 *     attempts a real sign-in with whatever the invitee just typed, treated as their
 *     EXISTING password. If that fails, the server returns `identity_conflict` and
 *     this page relabels the form in place (no separate "mode") so the customer knows
 *     to type their real existing password instead of inventing a new one. If MFA is
 *     enabled on that existing account, the server returns `mfa_required` and this
 *     page shows a real 6-digit code prompt, exactly like the normal login flow.
 */
function AcceptInvitationInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [lookup, setLookup] = useState<LookupState>({ status: 'loading' });
  const [credential, setCredential] = useState('');
  const [confirmCredential, setConfirmCredential] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mode, setMode] = useState<'new' | 'existing' | 'mfa'>('new');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) { setLookup({ status: 'invalid' }); return; }
    fetch(`${API}/api/v1/oc/invitations/lookup?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) { setLookup({ status: 'invalid' }); return; }
        const body = await res.json() as { clientName: string; email: string };
        setLookup({ status: 'ready', clientName: body.clientName, email: body.email });
      })
      .catch(() => setLookup({ status: 'invalid' }));
  }, [token]);

  async function submitAccept(codeOverride?: string) {
    setError(null);
    if (mode === 'new' && credential !== confirmCredential) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/v1/oc/invitations/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, credential, mfaCode: codeOverride }),
      });
      const body = await res.json();

      if (res.status === 202) {
        // Account was genuinely created — auto-login just didn't happen. Real, honest
        // partial success — send them to the normal login page rather than pretending.
        router.push('/login');
        return;
      }
      if (res.status === 401 && body?.error?.code === 'mfa_required') {
        // The password (their real existing one) was accepted — only the second
        // factor remains. A real, distinct state, not an error to alarm over.
        setMode('mfa');
        setError(null);
        setSubmitting(false);
        return;
      }
      if (!res.ok) {
        if (body?.error?.code === 'identity_conflict') {
          // A real account already exists for this email — relabel in place rather
          // than a dead-end. The customer's own next attempt should be their real
          // existing password, not a new one.
          setMode('existing');
          setConfirmCredential('');
        }
        setError(body?.error?.message || 'Could not accept this invitation.');
        setSubmitting(false);
        return;
      }

      setSession({ accessToken: body.accessToken, refreshToken: body.refreshToken, sessionId: body.sessionId, orgContext: body.orgContext, expiresAt: decodeExpiryMs(body.accessToken) });
      router.push(`/client-portal/${body.clientId}`);
    } catch {
      setError('Could not reach the server. Please try again.');
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submitAccept();
  }

  async function handleMfaSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submitAccept(mfaCode.trim());
  }

  if (lookup.status === 'loading') {
    return <p className="text-sm text-gray-500">Checking your invitation…</p>;
  }

  if (lookup.status === 'invalid') {
    return (
      <div className={`${CARD} text-center`}>
        <h1 className="text-lg font-bold text-gray-900 mb-2">Invitation not valid</h1>
        <p className="text-sm text-gray-500 max-w-xs mx-auto">
          This invitation link is invalid or has expired. Contact your AskABD account manager for a new one.
        </p>
        <p className="mt-4">
          <a href="/login" className="text-sm text-indigo-600 hover:text-indigo-800">Already have an AskABD account? Sign in →</a>
        </p>
      </div>
    );
  }

  if (mode === 'mfa') {
    return (
      <div className={CARD}>
        <form onSubmit={handleMfaSubmit}>
          <h1 className="text-xl font-bold text-gray-900 mb-1">Enter your verification code</h1>
          <p className="text-sm text-gray-500 mb-6">
            Open your authenticator app and enter the current 6-digit code to finish linking <strong>{lookup.clientName}</strong> to your account.
          </p>

          <label htmlFor="accept-mfa-code" className="block text-xs font-medium text-gray-600 mb-1">Verification code</label>
          <input
            id="accept-mfa-code"
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            className={`${INPUT} text-center tracking-[0.3em] font-mono`}
          />

          {error && (
            <div role="alert" className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || mfaCode.length !== 6}
            className="w-full mt-5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold text-sm py-2.5 rounded-md transition"
          >
            {submitting ? 'Verifying…' : 'Verify & accept invitation'}
          </button>
        </form>
        <button
          type="button"
          onClick={() => { setMode('existing'); setMfaCode(''); setError(null); }}
          className="mt-3 text-[11px] text-gray-400 hover:text-gray-600 mx-auto block"
        >
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div className={CARD}>
      <form onSubmit={handleSubmit}>
        <h1 className="text-xl font-bold text-gray-900 mb-1">Welcome to AskABD</h1>
        {mode === 'existing' ? (
          <p className="text-sm text-gray-500 mb-6">
            An AskABD account already exists for <strong>{lookup.email}</strong>. Enter your existing password to link
            <strong> {lookup.clientName}</strong> to your account.
          </p>
        ) : (
          <p className="text-sm text-gray-500 mb-6">
            You&apos;ve been invited to <strong>{lookup.clientName}</strong>&apos;s workspace as <strong>{lookup.email}</strong>. Choose a password to finish setting up your account.
          </p>
        )}

        <label htmlFor="accept-password" className="block text-xs font-medium text-gray-600 mb-1">
          {mode === 'existing' ? 'Your existing AskABD password' : 'Password'}
        </label>
        <input id="accept-password" value={credential} onChange={(e) => setCredential(e.target.value)} type="password" required autoComplete={mode === 'existing' ? 'current-password' : 'new-password'} className={INPUT} />

        {mode === 'new' && (
          <>
            <label htmlFor="accept-confirm-password" className="block text-xs font-medium text-gray-600 mt-4 mb-1">Confirm password</label>
            <input id="accept-confirm-password" value={confirmCredential} onChange={(e) => setConfirmCredential(e.target.value)} type="password" required autoComplete="new-password" className={INPUT} />
          </>
        )}

        {error && (
          <div role="alert" className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full mt-5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold text-sm py-2.5 rounded-md transition"
        >
          {submitting ? 'Setting up your account…' : mode === 'existing' ? 'Sign in & accept invitation' : 'Accept invitation & sign in'}
        </button>
      </form>

      {mode === 'new' && (
        <p className="text-[11px] text-gray-400 mt-4 text-center">
          Already have an AskABD account? <button type="button" onClick={() => { setMode('existing'); setError(null); }} className="text-indigo-600 hover:text-indigo-800 underline">Sign in instead</button>
        </p>
      )}
      {mode === 'existing' && (
        <p className="text-[11px] text-gray-400 mt-4 text-center">
          Setting this up for the first time? <button type="button" onClick={() => { setMode('new'); setError(null); }} className="text-indigo-600 hover:text-indigo-800 underline">Create a new password instead</button>
        </p>
      )}
    </div>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">Loading…</p>}>
      <AcceptInvitationInner />
    </Suspense>
  );
}
