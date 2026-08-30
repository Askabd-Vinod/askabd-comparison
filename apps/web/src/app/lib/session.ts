/**
 * Real client session handling — talks to the real askabd-identity service directly
 * for authentication, then to this app's own /api/v1/oc/me to discover which client(s)
 * the authenticated identity's organization is actually authorized to see (resolved
 * server-side from client_identity_mapping — see api/src/services/client-identity-mapping-service.ts).
 *
 * Honest, documented interim limitation: the access/refresh tokens are held in
 * sessionStorage (cleared when the tab closes), not an httpOnly cookie via a real
 * backend-for-frontend. A BFF that never exposes the token to page JS at all is the
 * stronger production posture and is NOT implemented here — this app's client-side
 * code calls askabd-identity (localhost:3100) and the comparison API (localhost:4200)
 * directly, cross-origin from the web app's own origin (localhost:3001); an httpOnly
 * cookie set by 3001 would never automatically be sent to 3100/4200 without a much
 * larger same-origin-proxy (BFF) rewrite of every direct fetch call in this app — see
 * docs/identity-real-contract.md's "Phase 6" note for the explicit tracking of that
 * gap. What THIS pass fixes for real, without that larger rewrite: the token
 * askabd-identity actually issues is short-lived (≤15 min, see
 * askabd-identity/src/config/security.ts's ACCESS_TOKEN_MAX_LIFETIME_SEC) and this
 * app previously never renewed it — every active user was silently kicked out
 * mid-session the moment the access token expired, with no recovery. That is now a
 * real, tested, production-correct rotation flow (see refreshSession below).
 */

const IDENTITY_URL = process.env.NEXT_PUBLIC_IDENTITY_URL || 'http://localhost:3100';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

const STORAGE_KEY = 'askabd_session_v1';

export interface Session {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  orgContext: string;
  /** ms since epoch — decoded from the access token's own `exp` claim at the moment
   *  it was issued/rotated. Used purely for client-side renewal scheduling, never for
   *  an authorization decision (the server independently verifies the token on every
   *  request regardless of what this says). */
  expiresAt: number;
}

/** Reads the `exp` claim out of a JWT without verifying its signature — safe here
 *  because this is only ever called on a token this browser just received directly
 *  from askabd-identity over HTTPS/localhost, used purely to schedule a client-side
 *  renewal timer, never to make a trust decision (the server re-verifies every call). */
function decodeExpiryMs(jwt: string): number {
  try {
    const payloadSegment = jwt.split('.')[1];
    if (!payloadSegment) return Date.now() + 60_000;
    const base64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof window !== 'undefined' ? window.atob(base64) : Buffer.from(base64, 'base64').toString('utf8');
    const payload = JSON.parse(json) as { exp?: number };
    return payload.exp ? payload.exp * 1000 : Date.now() + 60_000;
  } catch {
    return Date.now() + 60_000; // fail safe to "renew soon" rather than crash
  }
}

/** How long before real expiry to proactively renew — generous enough that a slow
 *  network request never races the token's own expiry, small enough to not renew
 *  needlessly often for a 15-minute-lifetime token. */
const RENEW_BEFORE_EXPIRY_MS = 60_000;

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as Session; } catch { return null; }
}

export function setSession(session: Session): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}

export interface LoginResult {
  ok: true;
  session: Session;
  authorizedClientIds: string[];
  crossClientAccess: boolean;
}
export interface MfaRequiredResult {
  ok: false;
  kind: 'mfa-required';
  message: string;
}
export type LoginErrorKind =
  | 'invalid-credentials'
  | 'rate-limited'
  | 'network-unavailable'
  | 'backend-unavailable'
  | 'access-unresolved';
export interface LoginError {
  ok: false;
  kind: LoginErrorKind;
  message: string;
}

function toSession(body: { accessToken: string; refreshToken: string; sessionId: string }, orgContext: string): Session {
  return { accessToken: body.accessToken, refreshToken: body.refreshToken, sessionId: body.sessionId, orgContext, expiresAt: decodeExpiryMs(body.accessToken) };
}

/**
 * Real login: calls askabd-identity's real /v1/auth/login (EdDSA-signed token,
 * verified by this app's own middleware via the real JWKS endpoint — no shortcuts).
 * `orgContext` is the identity organization the user is a member of — asked explicitly
 * rather than guessed, since askabd-identity's real login contract requires an
 * X-Org-Context header and nothing in either service currently infers it from an email
 * address alone (see docs/askabd-tenant-model.md).
 *
 * `mfaCode`: when the identity has real MFA enabled, a first call (no mfaCode) returns
 * `mfa-required`; the caller re-submits with the real 6-digit TOTP code, verified by
 * askabd-identity's real MfaService.challenge() (real replay prevention, real ±1-step
 * drift tolerance — see mfa-service.ts). Rate-limited by the same per-identifier limiter
 * as password attempts (auth-service.ts's Step 1 runs before MFA is ever checked).
 */
export async function login(orgContext: string, identifier: string, credential: string, mfaCode?: string): Promise<LoginResult | LoginError | MfaRequiredResult> {
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
    // A real, distinct outcome: credentials were right but the MFA code was wrong/expired/reused.
    // The identity/password step already succeeded — only the second factor failed — so this is
    // reported distinctly from a plain invalid-credentials failure.
    if (mfaCode && body?.error?.code === 'invalid_mfa_code') {
      return { ok: false, kind: 'invalid-credentials', message: 'That code is incorrect or has expired. Please try again.' };
    }
    return { ok: false, kind: 'invalid-credentials', message: body?.error?.message || 'Invalid credentials.' };
  }

  const body = await loginRes.json() as { type?: string; accessToken: string; refreshToken: string; sessionId: string };

  if (body.type === 'mfa_required') {
    return { ok: false, kind: 'mfa-required', message: 'Enter the 6-digit code from your authenticator app.' };
  }

  const session: Session = toSession(body, orgContext);

  // Discover what this identity is actually authorized to see — resolved server-side,
  // never assumed by the frontend.
  let meRes: Response;
  try {
    meRes = await fetch(`${API}/api/v1/oc/me`, { headers: { Authorization: `Bearer ${session.accessToken}` } });
  } catch {
    return { ok: false, kind: 'network-unavailable', message: 'Signed in, but could not reach AskABD to determine your access. Please try again.' };
  }
  if (!meRes.ok) {
    return { ok: false, kind: 'access-unresolved', message: 'Signed in, but could not determine your client access. Please try again.' };
  }
  const me = await meRes.json() as { authorizedClientIds: string[]; crossClientAccess: boolean };

  setSession(session);
  return { ok: true, session, authorizedClientIds: me.authorizedClientIds, crossClientAccess: me.crossClientAccess };
}

export async function logout(): Promise<void> {
  const session = getSession();
  if (session) {
    try {
      await fetch(`${IDENTITY_URL}/v1/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Org-Context': session.orgContext },
        body: JSON.stringify({ sessionId: session.sessionId }),
      });
    } catch { /* best-effort — session is cleared locally regardless */ }
  }
  clearSession();
}

/**
 * Real session renewal — rotates the refresh token (askabd-identity's
 * TokenService.refresh(): reuse detection, a fresh access+refresh pair, same
 * session id) and persists the result. Concurrency-safe: if several callers
 * (parallel authFetch calls that all hit an expired token at once) call this
 * within the same tick, they share ONE in-flight network request rather than each
 * racing to rotate the refresh token — rotation is single-use, so a second
 * concurrent rotation attempt would otherwise fail with a real (and here,
 * spurious) token_reuse rejection.
 *
 * Returns the renewed session on success. On genuine failure (refresh token
 * expired/revoked/reused — a real terminal outcome, not a transient network blip)
 * clears the session and returns null; the caller is responsible for redirecting
 * to the appropriate login page with the user's intended destination preserved.
 */
let refreshInFlight: Promise<Session | null> | null = null;

export async function refreshSession(): Promise<Session | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const current = getSession();
    if (!current) return null;
    try {
      const res = await fetch(`${IDENTITY_URL}/v1/tokens/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Org-Context': current.orgContext },
        body: JSON.stringify({ refreshToken: current.refreshToken, sessionId: current.sessionId }),
      });
      if (!res.ok) {
        // Real bug found and fixed (Batch 3 Playwright coverage
        // completion, 2026-08-30): ANY non-ok response — including a
        // transient 5xx — used to evict the session outright, identical
        // to a definitive 401/403 rejection. Reproduced live via a real
        // identity-service error: `TokenService.refresh`'s own Postgres
        // pool connection was terminated unexpectedly mid-request
        // (`pg-pool`'s real "Connection terminated due to connection
        // timeout" error) — a genuine, transient infrastructure hiccup,
        // not an invalid or expired refresh token. The refresh token was
        // never actually rejected; evicting the session over it forced a
        // full re-login for no real reason. Only a real 401/403 (the
        // token itself was genuinely rejected) is a terminal failure now
        // — any other non-ok status is treated the same as the network-
        // exception case below: a transient blip, session kept in place,
        // next renewal attempt tries again.
        if (res.status === 401 || res.status === 403) clearSession();
        return null;
      }
      const body = await res.json() as { accessToken: string; refreshToken: string };
      const renewed: Session = { accessToken: body.accessToken, refreshToken: body.refreshToken, sessionId: current.sessionId, orgContext: current.orgContext, expiresAt: decodeExpiryMs(body.accessToken) };
      setSession(renewed);
      return renewed;
    } catch {
      // A network hiccup is NOT a terminal failure — keep the (soon-to-expire)
      // session in place rather than evicting a user over a transient blip; the
      // next scheduled renewal attempt or the next 401-triggered retry will try again.
      return null;
    }
  })();
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

/**
 * Fetch wrapper for the comparison API that attaches the real session's Authorization
 * header — proactively renewing first if the current token is at or near expiry, and
 * reactively renewing-then-retrying ONCE if the server still returns 401 (e.g. the
 * token expired between the proactive check and the server actually processing the
 * request). Never loops more than once — a 401 on the retried request is treated as
 * a genuine, terminal session failure and returned as-is for the caller to handle
 * (typically: sign the user out and send them to login with `next` preserved).
 */
export async function authFetch(path: string, opts?: RequestInit): Promise<Response> {
  let session = getSession();
  if (session && session.expiresAt - Date.now() < RENEW_BEFORE_EXPIRY_MS) {
    session = await refreshSession();
  }
  const headers = new Headers(opts?.headers);
  if (session) headers.set('Authorization', `Bearer ${session.accessToken}`);
  const res = await fetch(`${API}${path}`, { ...opts, headers, cache: 'no-store' });

  if (res.status === 401 && session) {
    const renewed = await refreshSession();
    if (renewed) {
      const retryHeaders = new Headers(opts?.headers);
      retryHeaders.set('Authorization', `Bearer ${renewed.accessToken}`);
      return fetch(`${API}${path}`, { ...opts, headers: retryHeaders, cache: 'no-store' });
    }
  }
  return res;
}
