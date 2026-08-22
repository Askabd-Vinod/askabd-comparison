'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const IDENTITY_URL = process.env.NEXT_PUBLIC_IDENTITY_URL || 'http://localhost:3100';

/**
 * Real password-reset confirmation page — calls askabd-identity's real
 * POST /v1/credential/reset/confirm. Surfaces the real, distinct error codes
 * that service already returns (invalid_token / token_expired /
 * token_consumed / credential_breached / complexity failures) rather than a
 * generic "something went wrong" — the backend gives a real reason, so the UI
 * shows it.
 */
function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [orgContext, setOrgContext] = useState('');
  const [credential, setCredential] = useState('');
  const [confirmCredential, setConfirmCredential] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <div className="w-full max-w-sm bg-white rounded-xl border border-gray-200 p-8 shadow-lg text-center">
        <h1 className="text-lg font-bold text-gray-900 mb-2">Invalid reset link</h1>
        <p className="text-sm text-gray-500">This password reset link is missing its token. Request a new one.</p>
        <a href="/forgot-password" className="inline-block mt-6 text-xs text-indigo-600 hover:underline">Request a new link</a>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (credential !== confirmCredential) { setError('Passwords do not match.'); return; }
    if (!orgContext.trim()) { setError('Organization is required.'); return; }
    setStatus('submitting');
    try {
      const res = await fetch(`${IDENTITY_URL}/v1/credential/reset/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Org-Context': orgContext.trim() },
        body: JSON.stringify({ token, newCredential: credential }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const code = body?.error?.code as string | undefined;
        const message =
          code === 'token_expired' ? 'This reset link has expired. Request a new one.' :
          code === 'token_consumed' ? 'This reset link has already been used. Request a new one if you still need to reset your password.' :
          code === 'invalid_token' ? 'This reset link is invalid. Request a new one.' :
          code === 'credential_breached' ? 'That password appears in a known data breach. Choose a different one.' :
          body?.error?.message || 'Could not reset your password. Please try again.';
        setError(message);
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
        <h1 className="text-lg font-bold text-gray-900 mb-2">Password reset</h1>
        <p className="text-sm text-gray-500 mb-6">Your password has been changed. Sign in with your new password.</p>
        <button onClick={() => router.push('/staff/login')} className="text-xs text-indigo-600 hover:underline mr-4">Staff sign in</button>
        <button onClick={() => router.push('/login')} className="text-xs text-indigo-600 hover:underline">Customer sign in</button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm bg-white rounded-xl border border-gray-200 p-8 shadow-lg">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Choose a new password</h1>
      <p className="text-sm text-gray-500 mb-6">Enter your organization and a new password to complete the reset.</p>

      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="rp-org" className="block text-xs font-medium text-gray-600 mb-1">Organization</label>
        <input
          id="rp-org" value={orgContext} onChange={(e) => setOrgContext(e.target.value)} required
          placeholder="your-organization-id" autoComplete="organization"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
        <p className="text-[10px] text-gray-400 mt-1 mb-4">The organization ID you use to sign in — the same one on your login screen.</p>

        <label htmlFor="rp-password" className="block text-xs font-medium text-gray-600 mb-1">New password</label>
        <div className="relative mb-4">
          <input
            id="rp-password" value={credential} onChange={(e) => setCredential(e.target.value)}
            type={showPassword ? 'text' : 'password'} required autoComplete="new-password"
            className="w-full border border-gray-300 rounded-md px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <button
            type="button" onClick={() => setShowPassword(v => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700 px-1"
            aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>

        <label htmlFor="rp-confirm" className="block text-xs font-medium text-gray-600 mb-1">Confirm new password</label>
        <input
          id="rp-confirm" value={confirmCredential} onChange={(e) => setConfirmCredential(e.target.value)}
          type={showPassword ? 'text' : 'password'} required autoComplete="new-password"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />

        {error && (
          <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">{error}</div>
        )}

        <button
          type="submit" disabled={status === 'submitting'}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold text-sm py-2.5 rounded-md transition"
        >
          {status === 'submitting' ? 'Resetting…' : 'Reset password'}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="text-sm text-gray-400">Loading…</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
