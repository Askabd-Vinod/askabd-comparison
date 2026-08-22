'use client';

import { useState } from 'react';

const IDENTITY_URL = process.env.NEXT_PUBLIC_IDENTITY_URL || 'http://localhost:3100';

/**
 * Real password-recovery request page — calls askabd-identity's real
 * POST /v1/credential/reset/request, which now genuinely sends a real reset
 * email via Mailpit locally (see askabd-identity/src/services/email-service.ts,
 * wired into credential-manager.ts's issueResetToken this pass). Deliberately
 * shows the exact same honest, non-disclosing success message regardless of
 * whether the account exists (R5.6 in askabd-identity) — the backend itself
 * never reveals this, so the UI must not either.
 */
export default function ForgotPasswordPage() {
  const [orgContext, setOrgContext] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus('submitting');
    try {
      const res = await fetch(`${IDENTITY_URL}/v1/credential/reset/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Org-Context': orgContext.trim() },
        body: JSON.stringify({ identifier: identifier.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error?.message || 'Could not process this request. Please try again.');
        setStatus('idle');
        return;
      }
      setStatus('done');
    } catch {
      setError('Could not reach the identity service. Please try again.');
      setStatus('idle');
    }
  }

  if (status === 'done') {
    return (
      <div className="w-full max-w-sm bg-white rounded-xl border border-gray-200 p-8 shadow-lg text-center">
        <h1 className="text-lg font-bold text-gray-900 mb-2">Check your email</h1>
        <p className="text-sm text-gray-500">
          If an account exists for that organization and email, a password reset link has been sent. The link expires shortly, so use it soon.
        </p>
        {/* Previously hardcoded to /staff/login only, even though this page's
            own pre-submit footer (and reset-password's equivalent success
            screen) correctly serves both audiences — found during the
            2026-08-22 global UX audit. A customer requesting a reset was
            offered no path back to their own sign-in page. */}
        <p className="mt-6 text-xs">
          <a href="/staff/login" className="text-indigo-600 hover:underline">Staff sign in</a> · <a href="/login" className="text-indigo-600 hover:underline">Customer sign in</a>
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm bg-white rounded-xl border border-gray-200 p-8 shadow-lg">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Reset your password</h1>
      <p className="text-sm text-gray-500 mb-6">Enter your organization and email and we&apos;ll send you a reset link, if an account exists.</p>

      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="fp-org" className="block text-xs font-medium text-gray-600 mb-1">Organization</label>
        <input
          id="fp-org" value={orgContext} onChange={(e) => setOrgContext(e.target.value)} required
          placeholder="your-organization-id" autoComplete="organization"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
        <p className="text-[10px] text-gray-400 mt-1 mb-4">The organization ID you use to sign in — the same one on your login screen.</p>
        <label htmlFor="fp-email" className="block text-xs font-medium text-gray-600 mb-1">Email</label>
        <input
          id="fp-email" value={identifier} onChange={(e) => setIdentifier(e.target.value)} type="email" required
          placeholder="you@company.com" autoComplete="email"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />

        {error && (
          <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">{error}</div>
        )}

        <button
          type="submit" disabled={status === 'submitting'}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold text-sm py-2.5 rounded-md transition"
        >
          {status === 'submitting' ? 'Sending…' : 'Send reset link'}
        </button>
      </form>

      <p className="text-[11px] text-gray-400 mt-5 text-center">
        <a href="/staff/login" className="text-indigo-600 hover:underline">Staff sign in</a> · <a href="/login" className="text-indigo-600 hover:underline">Customer sign in</a>
      </p>
    </div>
  );
}
