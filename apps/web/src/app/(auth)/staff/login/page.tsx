'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { staffLogin } from '../../../lib/staff-session';
import { sanitizeNextForSurface } from '../../../lib/safe-redirect';

/**
 * AskABD internal staff sign-in — a genuinely separate security domain from the
 * customer `/login` page, even though both call the same real askabd-identity
 * `/v1/auth/login` underneath (no second authentication system — see
 * docs/staff-authentication-architecture.md). The distinction is entirely
 * server-side: this page only accepts the session if `staffLogin()`'s real
 * `/api/v1/oc/me` check confirms the identity holds at least one real
 * `staff_role_assignment` grant.
 *
 * Lives in the `(auth)` route group — its nearest layout is `(auth)/layout.tsx`,
 * a minimal AskABD-branded shell with no staff NavBar, no StaffAuthGuard, no
 * console chrome of any kind. That is what makes "no shell flash on this page"
 * a structural guarantee rather than something a CSS rule could regress.
 */
function StaffLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [orgContext, setOrgContext] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [credential, setCredential] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'submitting'>('idle');
  const sessionExpired = searchParams.get('expired') === '1';

  async function submitLogin(code?: string) {
    setError(null);
    setStatus('submitting');
    const result = await staffLogin(orgContext.trim(), identifier.trim(), credential, code);
    if (!result.ok) {
      setStatus('idle');
      if (result.kind === 'mfa-required') {
        setMfaRequired(true);
        setError(null);
        return;
      }
      // askabd-identity deliberately returns the same generic error for a
      // wrong MFA code as for a wrong password (no disclosure of which factor
      // failed). Re-contextualized here since we already know the password
      // was accepted — this is genuinely about the code, not the password.
      setError(code ? 'That code is invalid or has expired. Please try again.' : result.message);
      return;
    }
    const dest = sanitizeNextForSurface(searchParams.get('next'), 'staff', '/clients');
    router.push(dest);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Real, safe format validation (2026-08-20) — see the customer login
    // page's identical check for the full rationale: format-only, never
    // discloses whether the value is real, so it doesn't weaken the
    // deliberate non-disclosure design of the actual authentication failure
    // path below.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9 ._-]{0,254}$/.test(orgContext.trim())) {
      setError('Organization format is invalid.');
      return;
    }
    await submitLogin();
  }

  async function handleMfaSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submitLogin(mfaCode.trim());
  }

  if (mfaRequired) {
    return (
      <div className="w-full max-w-sm bg-white rounded-xl border border-gray-200 p-8 shadow-lg">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Enter your verification code</h1>
        <p className="text-sm text-gray-500 mb-6">Open your authenticator app and enter the current 6-digit code.</p>
        <form onSubmit={handleMfaSubmit} noValidate>
          <label htmlFor="staff-mfa-code" className="block text-xs font-medium text-gray-600 mb-1">Verification code</label>
          <input
            id="staff-mfa-code"
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-4 tracking-[0.3em] text-center font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          {error && (
            <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">{error}</div>
          )}
          <button
            type="submit"
            disabled={status === 'submitting' || mfaCode.length !== 6}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold text-sm py-2.5 rounded-md transition"
          >
            {status === 'submitting' ? 'Verifying…' : 'Verify'}
          </button>
        </form>
        <button
          type="button"
          onClick={() => { setMfaRequired(false); setMfaCode(''); setError(null); }}
          className="mt-4 text-[11px] text-gray-400 hover:text-gray-600 mx-auto block"
        >
          ← Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm bg-white rounded-xl border border-gray-200 p-8 shadow-lg">
      <h1 className="text-xl font-bold text-gray-900 mb-1">AskABD Staff Sign In</h1>
      <p className="text-sm text-gray-500 mb-6">Sign in to the AskABD Enterprise Operations Centre.</p>

      {sessionExpired && (
        <div role="status" className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800">
          Your session has expired. Please sign in again — you&apos;ll be returned to where you left off.
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="staff-org" className="block text-xs font-medium text-gray-600 mb-1">Organization</label>
        <input
          id="staff-org"
          value={orgContext}
          onChange={(e) => setOrgContext(e.target.value)}
          required
          autoComplete="organization"
          placeholder="e.g. askabd-internal"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
        <p className="text-[10px] text-gray-400 mt-1 mb-4">Your AskABD staff organization ID — ask your administrator if you don&apos;t know it.</p>

        <label htmlFor="staff-email" className="block text-xs font-medium text-gray-600 mb-1">Work Email</label>
        <input
          id="staff-email"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          type="email"
          required
          autoComplete="username"
          placeholder="you@askabd.com"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />

        <label htmlFor="staff-password" className="block text-xs font-medium text-gray-600 mb-1">Password</label>
        <div className="relative mb-1">
          <input
            id="staff-password"
            value={credential}
            onChange={(e) => setCredential(e.target.value)}
            type={showPassword ? 'text' : 'password'}
            required
            autoComplete="current-password"
            className="w-full border border-gray-300 rounded-md px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700 px-1"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
        <p className="text-[11px] text-gray-400 mb-4">
          <a href="/forgot-password" className="text-indigo-600 hover:underline">Forgot your password?</a>
        </p>

        {error && (
          <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={status === 'submitting'}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold text-sm py-2.5 rounded-md transition"
        >
          {status === 'submitting' ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="text-[11px] text-gray-400 mt-5 text-center">
        Staff accounts are provisioned by AskABD administrators.
      </p>
      <p className="text-[11px] text-gray-400 mt-2 text-center">
        Looking for your client workspace? <a href="/login" className="text-indigo-600 hover:underline">Sign in here</a> instead.
      </p>
    </div>
  );
}

export default function StaffLoginPage() {
  return (
    <Suspense fallback={<div className="text-sm text-gray-400">Loading…</div>}>
      <StaffLoginForm />
    </Suspense>
  );
}
