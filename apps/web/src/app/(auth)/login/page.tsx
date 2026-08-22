'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { login, authFetch } from '../../lib/session';
import { sanitizeNextForSurface } from '../../lib/safe-redirect';

/**
 * Real client login — calls askabd-identity's real /v1/auth/login (EdDSA-signed
 * token), then this app's /api/v1/oc/me to discover which client(s) the session is
 * actually authorized to see (server-resolved, never guessed).
 *
 * The "Organization" field is real, not decorative: askabd-identity's login contract
 * requires an X-Org-Context header (org_context is the authenticated identity's own
 * organization — see docs/askabd-tenant-model.md), and nothing in either service
 * currently infers it from an email address alone. This is NOT a client ID — the
 * customer never chooses or types which client workspace they want; that is resolved
 * entirely server-side from `client_identity_mapping` after login (see below).
 *
 * Lives in the `(auth)` route group, so its only ancestor layout is the minimal
 * `(auth)/layout.tsx` — no staff NavBar, no StaffAuthGuard, ever.
 */
type MultiClient = { id: string; name: string };
interface PendingInvitation {
  id: string;
  clientId: string;
  clientName?: string;
  orgContext: string;
  email: string;
  createdAt: string;
  expiresAt: string;
}

function LoginForm() {
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
  const [noWorkspace, setNoWorkspace] = useState(false);
  const [multiClients, setMultiClients] = useState<MultiClient[] | null>(null);
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[] | null>(null);
  const [authorizedClientIds, setAuthorizedClientIds] = useState<string[]>([]);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const sessionExpired = searchParams.get('expired') === '1';

  async function loadPendingInvitations(): Promise<PendingInvitation[]> {
    try {
      const res = await authFetch('/api/v1/oc/me/pending-invitations');
      if (!res.ok) return [];
      const body = await res.json() as { invitations: PendingInvitation[] };
      return body.invitations ?? [];
    } catch {
      return [];
    }
  }

  async function acceptPendingInvitation(id: string) {
    setAcceptingId(id);
    setAcceptError(null);
    try {
      const res = await authFetch(`/api/v1/oc/me/pending-invitations/${id}/accept`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) {
        setAcceptError(body?.error?.message || 'Could not accept this invitation.');
        setAcceptingId(null);
        return;
      }
      setPendingInvitations((prev) => (prev ?? []).filter((i) => i.id !== id));
      setAuthorizedClientIds((prev) => (prev.includes(body.clientId) ? prev : [...prev, body.clientId]));
      setAcceptingId(null);
    } catch {
      setAcceptError('Could not reach AskABD. Please try again.');
      setAcceptingId(null);
    }
  }

  async function resolveClientNames(ids: string[]): Promise<MultiClient[]> {
    return Promise.all(
      ids.map(async (id) => {
        try {
          const res = await authFetch(`/api/v1/oc/clients/${id}`);
          if (!res.ok) return { id, name: id };
          const body = await res.json() as { client?: { name?: string } };
          return { id, name: body.client?.name || id };
        } catch {
          return { id, name: id };
        }
      })
    );
  }

  async function continueToWorkspace() {
    if (authorizedClientIds.length === 0) return;
    if (authorizedClientIds.length === 1) {
      router.push(sanitizeNextForSurface(searchParams.get('next'), 'customer', `/client-portal/${authorizedClientIds[0]}`));
      return;
    }
    setPendingInvitations(null);
    setMultiClients(await resolveClientNames(authorizedClientIds));
  }

  async function submitLogin(code?: string) {
    setError(null);
    setNoWorkspace(false);
    setMultiClients(null);
    setPendingInvitations(null);
    setStatus('submitting');
    const result = await login(orgContext.trim(), identifier.trim(), credential, code);

    if (!result.ok) {
      setStatus('idle');
      if (result.kind === 'mfa-required') {
        setMfaRequired(true);
        setError(null);
        return;
      }
      // askabd-identity deliberately returns the same generic "invalid
      // credentials" message for a wrong MFA code as for a wrong password (no
      // disclosure of which factor failed — the same principle already used
      // for plain login). Re-contextualized here: we already know the
      // password was accepted (that's how we reached the code screen), so
      // "invalid or expired code" is the honest, specific thing to say.
      setError(code ? 'That code is invalid or has expired. Please try again.' : result.message);
      return;
    }

    // A staff-capable identity signed in through the customer-facing page. Customer
    // and staff are two separate authorization domains sharing one identity service —
    // this session is a real, valid customer session, but it must never be used to
    // reach the internal console (that requires a real staff session established via
    // /staff/login, which independently re-verifies the staff_role_assignment grant).
    if (result.crossClientAccess) {
      setStatus('idle');
      setError('This account has AskABD staff access. Please use the staff sign-in page instead.');
      return;
    }

    setAuthorizedClientIds(result.authorizedClientIds);

    // Detect real, pending invitations for this authenticated identity BEFORE
    // deciding where to land — an existing account signing in normally (no email
    // link at all) is a legitimate way to discover and accept an invitation
    // (Path B). The customer must explicitly accept; nothing is auto-granted
    // merely because they are now authenticated.
    const pending = await loadPendingInvitations();
    if (pending.length > 0) {
      setStatus('idle');
      setPendingInvitations(pending);
      return;
    }

    if (result.authorizedClientIds.length === 0) {
      setStatus('idle');
      setNoWorkspace(true);
      return;
    }

    if (result.authorizedClientIds.length === 1) {
      const dest = sanitizeNextForSurface(searchParams.get('next'), 'customer', `/client-portal/${result.authorizedClientIds[0]}`);
      router.push(dest);
      return;
    }

    // Multiple real mappings — a genuine selector, not an assumption about which one
    // the user wants. Exception: if `next` (sanitized) points at a SPECIFIC workspace
    // this identity is genuinely authorized for (e.g. a session expired mid-visit to
    // that exact client and they just re-authenticated), honor it directly rather than
    // making them re-pick a workspace they were already looking at — "return them to
    // the page they were originally accessing" still holds even in the multi-client case.
    const nextDest = sanitizeNextForSurface(searchParams.get('next'), 'customer', '');
    const nextClientId = nextDest.match(/^\/client-portal\/([^/]+)/)?.[1];
    if (nextClientId && result.authorizedClientIds.includes(nextClientId)) {
      router.push(nextDest);
      return;
    }

    // Names are resolved server-side per ID (never fabricated).
    const resolved = await resolveClientNames(result.authorizedClientIds);
    setStatus('idle');
    setMultiClients(resolved);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Real, safe format validation (2026-08-20) — catches genuinely malformed
    // input BEFORE hitting the network, with a specific, useful message. This
    // is a format check only (never "this account doesn't exist" or "this
    // organization isn't registered") — it discloses nothing about whether
    // the value is real, only whether it's well-formed, so it doesn't weaken
    // the deliberate non-disclosure design of the actual authentication
    // failure path below.
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
          <label htmlFor="cust-mfa-code" className="block text-xs font-medium text-gray-600 mb-1">Verification code</label>
          <input
            id="cust-mfa-code"
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

  if (pendingInvitations) {
    return (
      <div className="w-full max-w-md bg-white rounded-xl border border-gray-200 p-8 shadow-lg">
        <h1 className="text-lg font-bold text-gray-900 mb-1">
          {pendingInvitations.length === 1 ? 'You have a pending invitation' : 'You have pending invitations'}
        </h1>
        <p className="text-sm text-gray-500 mb-5">
          Review each invitation below. Accepting grants access only to that specific workspace — nothing else.
        </p>

        {acceptError && (
          <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">{acceptError}</div>
        )}

        {pendingInvitations.length === 0 ? (
          <div className="text-center py-6 text-sm text-gray-400">All invitations reviewed.</div>
        ) : (
          <ul className="space-y-3 mb-5">
            {pendingInvitations.map((inv) => (
              <li key={inv.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {/* Previously fell back to the raw internal clientId if
                        clientName was ever missing from the API response —
                        found during the 2026-08-22 global UX audit. A
                        customer should never see an internal ID. */}
                    <p className="text-sm font-semibold text-gray-900 truncate">{inv.clientName || 'A workspace'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Organization: {inv.orgContext}</p>
                    <p className="text-xs text-gray-500">Invited email: {inv.email}</p>
                    <p className="text-[11px] text-gray-400 mt-1">Expires {new Date(inv.expiresAt).toLocaleDateString()}</p>
                  </div>
                  <button
                    onClick={() => acceptPendingInvitation(inv.id)}
                    disabled={acceptingId === inv.id}
                    className="shrink-0 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-xs font-semibold px-3 py-2 rounded-md whitespace-nowrap"
                  >
                    {acceptingId === inv.id ? 'Accepting…' : 'Accept Invitation'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {authorizedClientIds.length > 0 ? (
          <button
            onClick={continueToWorkspace}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-semibold py-2.5 rounded-md transition"
          >
            {pendingInvitations.length > 0 ? 'Skip for now — continue to my workspace' : 'Continue to my workspace'}
          </button>
        ) : pendingInvitations.length === 0 ? (
          <p className="text-sm text-gray-500 text-center">
            Your organization is not yet authorized to access any client workspace. Contact your AskABD account manager.
          </p>
        ) : null}
      </div>
    );
  }

  if (noWorkspace) {
    return (
      <div className="w-full max-w-sm bg-white rounded-xl border border-gray-200 p-8 shadow-lg text-center">
        <h1 className="text-lg font-bold text-gray-900 mb-2">Your workspace has not been assigned yet</h1>
        <p className="text-sm text-gray-500">
          You are signed in, but your organization is not yet authorized to access any client workspace. Contact your AskABD account manager.
        </p>
      </div>
    );
  }

  if (multiClients) {
    return (
      <div className="w-full max-w-sm bg-white rounded-xl border border-gray-200 p-8 shadow-lg">
        <h1 className="text-lg font-bold text-gray-900 mb-1">Choose a workspace</h1>
        <p className="text-sm text-gray-500 mb-5">Your account is authorized for more than one AskABD workspace.</p>
        <div className="space-y-2">
          {multiClients.map((c) => (
            <button
              key={c.id}
              onClick={() => router.push(`/client-portal/${c.id}`)}
              className="w-full text-left px-4 py-3 border border-gray-200 rounded-md hover:border-indigo-400 hover:bg-indigo-50 transition text-sm font-medium text-gray-800"
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm bg-white rounded-xl border border-gray-200 p-8 shadow-lg">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Sign in to your AskABD workspace</h1>
      <p className="text-sm text-gray-500 mb-6">Access your AskABD client workspace.</p>

      {sessionExpired && (
        <div role="status" className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800">
          Your session has expired. Please sign in again — you&apos;ll be returned to where you left off.
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="cust-org" className="block text-xs font-medium text-gray-600 mb-1">Organization</label>
        <input
          id="cust-org"
          value={orgContext}
          onChange={(e) => setOrgContext(e.target.value)}
          required
          autoComplete="organization"
          placeholder="your-organization-id"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />

        <label htmlFor="cust-email" className="block text-xs font-medium text-gray-600 mb-1">Email</label>
        <input
          id="cust-email"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          type="email"
          required
          autoComplete="username"
          placeholder="you@company.com"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />

        <label htmlFor="cust-password" className="block text-xs font-medium text-gray-600 mb-1">Password</label>
        <div className="relative mb-1">
          <input
            id="cust-password"
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
        Don&apos;t have an account? <a href="/accept-invitation" className="text-indigo-600 hover:underline">Accept an invitation</a>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-sm text-gray-400">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
