/**
 * Real AskABD staff session handling — deliberately separate from
 * `session.ts` (the customer session). Customer and internal-staff sessions are two
 * different security domains and must never be conflated or attached to the wrong
 * surface's requests — see docs/staff-authentication-architecture.md.
 *
 * Same real askabd-identity login underneath (no second authentication system) —
 * the distinction from a customer login is entirely server-side: after logging in,
 * this module calls the real `/api/v1/oc/me` and only accepts the session as a STAFF
 * session if the resolved roles are non-empty (i.e. the identity has at least one
 * real `staff_role_assignment` row — see services/staff-role-service.ts). An identity
 * with zero grants (every real customer, by construction) is refused here, even
 * though the underlying askabd-identity login itself succeeded.
 *
 * Session renewal architecture (2026-08-20): see session.ts's top-of-file doc for the
 * full rationale — this module implements the identical short-lived-access-token +
 * rotating-refresh-token renewal flow for the staff domain, including keeping the
 * SSR-readable cookie (see below) in sync on every rotation, not just at login.
 */

const IDENTITY_URL = process.env.NEXT_PUBLIC_IDENTITY_URL || 'http://localhost:3100';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

const STORAGE_KEY = 'askabd_staff_session_v1';

export interface StaffSession {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  orgContext: string;
  identityId: string;
  /** The work email typed at login — kept alongside identityId so the UI can show a
   *  real human-readable identity instead of the raw internal identity UUID.
   *  Found during the 2026-08-22 global UX audit: the nav bar's avatar tooltip was
   *  showing the literal identityId (e.g. "8d320034-e98e-4e11-8e95-26e75befb70b") to
   *  the signed-in staff member instead of their own email. */
  email: string;
  roles: string[];
  /** ms since epoch, decoded from the access token's own `exp` claim — see
   *  session.ts's decodeExpiryMs doc for why this is safe without verification. */
  expiresAt: number;
}

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

export const RENEW_BEFORE_EXPIRY_MS = 60_000;

const TOKEN_COOKIE = 'askabd_staff_token';

/**
 * `sessionStorage` remains the primary session store for client-side code
 * (`staffFetch`, the fetch interceptor in staff-auth-guard.tsx). This
 * additional, same-site session cookie exists ONLY so that this app's own
 * Server Components — which cannot read `sessionStorage` at all — can present
 * the same authenticated view instead of silently rendering as a logged-out
 * guest (see lib/api.ts for the real bug this fixes). Not httpOnly: it is set
 * by client JS after a real login response, not by a server `Set-Cookie`
 * header, so httpOnly is not achievable without a larger BFF-style redesign —
 * documented here as the deliberate interim tradeoff, matching the same
 * honesty standard as the sessionStorage-only limitation already documented
 * in lib/session.ts. `secure` is added only on an https origin so local
 * plain-http dev keeps working. Rewritten on every renewal (not just login) so
 * a Server Component rendered mid-session never reads a stale, expired token.
 */
function writeCookie(name: string, value: string): void {
  if (typeof document === 'undefined') return;
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax${secure}`;
}
function clearCookie(name: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; path=/; Max-Age=0; SameSite=Lax`;
}

export function getStaffSession(): StaffSession | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as StaffSession; } catch { return null; }
}

export function setStaffSession(session: StaffSession): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  writeCookie(TOKEN_COOKIE, session.accessToken);
}

export function clearStaffSession(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(STORAGE_KEY);
  clearCookie(TOKEN_COOKIE);
}

export type StaffLoginErrorKind =
  | 'invalid-credentials'
  | 'rate-limited'
  | 'network-unavailable'
  | 'backend-unavailable'
  | 'unauthorized'
  | 'access-unresolved';
export interface StaffLoginResult { ok: true; session: StaffSession }
export interface StaffMfaRequiredResult { ok: false; kind: 'mfa-required'; message: string }
export interface StaffLoginError { ok: false; kind: StaffLoginErrorKind; message: string }

/**
 * `mfaCode`: see session.ts's `login()` doc — identical real MFA challenge
 * flow, reused here for the staff sign-in domain.
 */
export async function staffLogin(orgContext: string, identifier: string, credential: string, mfaCode?: string): Promise<StaffLoginResult | StaffLoginError | StaffMfaRequiredResult> {
  let loginRes: Response;
  try {
    loginRes = await fetch(`${IDENTITY_URL}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Org-Context': orgContext },
      body: JSON.stringify({ identifier, credential, mfaCode }),
    });
  } catch {
    return { ok: false, kind: 'network-unavailable', message: 'Could not reach the identity service. Check your connection and try again.' };
  }

  if (!loginRes.ok) {
    const body = await loginRes.json().catch(() => ({}));
    const category = body?.error?.category as string | undefined;
    if (category === 'rate_limited') {
      const retrySec = body?.error?.retryAfterMs ? Math.ceil(body.error.retryAfterMs / 1000) : undefined;
      return { ok: false, kind: 'rate-limited', message: retrySec ? `Too many attempts. Try again in ${retrySec}s.` : 'Too many attempts. Please wait and try again.' };
    }
    if (loginRes.status >= 500) {
      return { ok: false, kind: 'backend-unavailable', message: 'The identity service is temporarily unavailable. Please try again shortly.' };
    }
    if (mfaCode && body?.error?.code === 'invalid_mfa_code') {
      return { ok: false, kind: 'invalid-credentials', message: 'That code is incorrect or has expired. Please try again.' };
    }
    return { ok: false, kind: 'invalid-credentials', message: body?.error?.message || 'Invalid credentials.' };
  }

  const body = await loginRes.json() as { type?: string; accessToken: string; refreshToken: string; sessionId: string };

  if (body.type === 'mfa_required') {
    return { ok: false, kind: 'mfa-required', message: 'Enter the 6-digit code from your authenticator app.' };
  }

  // The real, server-side staff determination — never inferred client-side.
  let meRes: Response;
  try {
    meRes = await fetch(`${API}/api/v1/oc/me`, { headers: { Authorization: `Bearer ${body.accessToken}` } });
  } catch {
    return { ok: false, kind: 'network-unavailable', message: 'Signed in, but could not reach AskABD to determine your access. Please try again.' };
  }
  if (!meRes.ok) {
    return { ok: false, kind: 'access-unresolved', message: 'Signed in, but could not determine your access level. Please try again.' };
  }
  const me = await meRes.json() as { userId: string; roles: string[] };
  if (!me.roles || me.roles.length === 0) {
    return { ok: false, kind: 'unauthorized', message: 'This account is not authorized for AskABD staff access. If you are a client, use the client sign-in page instead.' };
  }

  const session: StaffSession = { accessToken: body.accessToken, refreshToken: body.refreshToken, sessionId: body.sessionId, orgContext, identityId: me.userId, email: identifier, roles: me.roles, expiresAt: decodeExpiryMs(body.accessToken) };
  setStaffSession(session);
  return { ok: true, session };
}

export async function staffLogout(): Promise<void> {
  const session = getStaffSession();
  if (session) {
    try {
      await fetch(`${IDENTITY_URL}/v1/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Org-Context': session.orgContext },
        body: JSON.stringify({ sessionId: session.sessionId }),
      });
    } catch { /* best-effort — session is cleared locally regardless */ }
  }
  clearStaffSession();
}

/** See session.ts's refreshSession doc — identical rotation + concurrency-dedup
 *  logic, plus keeping the SSR cookie in sync on every successful rotation. */
let refreshInFlight: Promise<StaffSession | null> | null = null;

export async function refreshStaffSession(): Promise<StaffSession | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const current = getStaffSession();
    if (!current) return null;
    try {
      const res = await fetch(`${IDENTITY_URL}/v1/tokens/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Org-Context': current.orgContext },
        body: JSON.stringify({ refreshToken: current.refreshToken, sessionId: current.sessionId }),
      });
      if (!res.ok) {
        clearStaffSession();
        return null;
      }
      const body = await res.json() as { accessToken: string; refreshToken: string };
      const renewed: StaffSession = { ...current, accessToken: body.accessToken, refreshToken: body.refreshToken, expiresAt: decodeExpiryMs(body.accessToken) };
      setStaffSession(renewed);
      return renewed;
    } catch {
      return null; // transient network issue — not a terminal failure, try again later
    }
  })();
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

/** Fetch wrapper for the internal console — attaches the real staff session's token,
 *  proactively renewing near expiry and reactively renewing-then-retrying ONCE on a
 *  401 (see session.ts's authFetch doc — identical policy for the staff domain). */
export async function staffFetch(path: string, opts?: RequestInit): Promise<Response> {
  let session = getStaffSession();
  if (session && session.expiresAt - Date.now() < RENEW_BEFORE_EXPIRY_MS) {
    session = await refreshStaffSession();
  }
  const headers = new Headers(opts?.headers);
  if (session) headers.set('Authorization', `Bearer ${session.accessToken}`);
  const res = await fetch(`${API}${path}`, { ...opts, headers, cache: 'no-store' });

  if (res.status === 401 && session) {
    const renewed = await refreshStaffSession();
    if (renewed) {
      const retryHeaders = new Headers(opts?.headers);
      retryHeaders.set('Authorization', `Bearer ${renewed.accessToken}`);
      return fetch(`${API}${path}`, { ...opts, headers: retryHeaders, cache: 'no-store' });
    }
  }
  return res;
}
