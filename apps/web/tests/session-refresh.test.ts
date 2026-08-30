/**
 * Session renewal — the real fix for "the authenticated session gets interrupted
 * while I'm actively using the app" (found live during manual UAT 2026-08-20): the
 * access token askabd-identity issues is short-lived (≤15 min) and this app
 * previously never renewed it at all. These tests exercise the renewal logic
 * directly (proactive renewal near expiry, reactive renewal-then-retry-once on a
 * real 401, concurrent-call deduplication, and fail-closed behavior on a genuine
 * renewal failure) against a real in-memory `window`/`fetch` stand-in — this repo's
 * vitest config runs in a plain Node environment (see vitest.config.ts), not jsdom,
 * so a minimal fake is set up here rather than pulling in a new dependency.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';

function base64url(json: object): string {
  return Buffer.from(JSON.stringify(json)).toString('base64url');
}

/** A syntactically-real JWT shape (header.payload.signature) — the signature
 *  segment is never verified client-side (see session.ts's decodeExpiryMs doc),
 *  only the payload's `exp` claim is read, so a fake signature is fine here. */
function fakeJwt(expSecondsFromNow: number): string {
  const header = base64url({ alg: 'EdDSA', typ: 'JWT' });
  const payload = base64url({ sub: 'identity-1', exp: Math.floor(Date.now() / 1000) + expSecondsFromNow });
  return `${header}.${payload}.fake-signature`;
}

function installFakeBrowser() {
  const store = new Map<string, string>();
  (globalThis as any).window = {
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    },
    atob: (b64: string) => Buffer.from(b64, 'base64').toString('binary'),
    location: { protocol: 'http:' },
  };
  (globalThis as any).document = { cookie: '' };
  return store;
}

describe('session.ts — renewal architecture', () => {
  beforeEach(() => {
    installFakeBrowser();
    vi.resetModules();
  });

  it('login() decodes the real access token exp claim into session.expiresAt', async () => {
    const { login, getSession } = await import('../src/app/lib/session');
    const accessToken = fakeJwt(900); // 15 minutes — matches the real platform ceiling
    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/v1/auth/login')) {
        return new Response(JSON.stringify({ accessToken, refreshToken: 'rt_1', sessionId: 'sess_1' }), { status: 200 });
      }
      if (url.includes('/oc/me')) {
        return new Response(JSON.stringify({ authorizedClientIds: ['client-1'], crossClientAccess: false }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as any;

    const result = await login('org-1', 'user@example.com', 'password');
    expect(result.ok).toBe(true);
    const session = getSession();
    expect(session).not.toBeNull();
    expect(session!.accessToken).toBe(accessToken);
    // Within a couple seconds of the real 900s claim — proves it's read from the
    // token, not a hardcoded guess.
    expect(session!.expiresAt).toBeGreaterThan(Date.now() + 895_000);
    expect(session!.expiresAt).toBeLessThanOrEqual(Date.now() + 900_000);
  });

  it('authFetch proactively renews a token that is at/near expiry BEFORE attaching it', async () => {
    const { setSession, authFetch } = await import('../src/app/lib/session');
    setSession({ accessToken: 'old-token', refreshToken: 'old-refresh', sessionId: 'sess_1', orgContext: 'org-1', expiresAt: Date.now() + 5_000 }); // 5s left — inside the renew buffer

    const newAccessToken = fakeJwt(900);
    const calls: string[] = [];
    let apiAuthHeader: string | null = null;
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(url);
      if (url.includes('/tokens/refresh')) {
        return new Response(JSON.stringify({ accessToken: newAccessToken, refreshToken: 'new-refresh' }), { status: 200 });
      }
      // The real API call — must carry the RENEWED token, never the stale one.
      apiAuthHeader = init?.headers instanceof Headers ? init.headers.get('Authorization') : null;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as any;

    await authFetch('/api/v1/oc/me');
    expect(calls.some((u) => u.includes('/tokens/refresh'))).toBe(true);
    expect(apiAuthHeader).toBe(`Bearer ${newAccessToken}`);
  });

  it('authFetch reactively renews-then-retries exactly ONCE on a real 401, never loops', async () => {
    const { setSession, authFetch } = await import('../src/app/lib/session');
    setSession({ accessToken: 'expiring-soon-but-not-yet', refreshToken: 'old-refresh', sessionId: 'sess_1', orgContext: 'org-1', expiresAt: Date.now() + 600_000 }); // not near expiry — proactive check won't fire

    const newAccessToken = fakeJwt(900);
    let apiCallCount = 0;
    let refreshCallCount = 0;
    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/tokens/refresh')) {
        refreshCallCount++;
        return new Response(JSON.stringify({ accessToken: newAccessToken, refreshToken: 'new-refresh' }), { status: 200 });
      }
      apiCallCount++;
      // First call: server independently decides the token is invalid (e.g. revoked
      // moments ago) — 401 despite the client thinking it still had time left.
      if (apiCallCount === 1) return new Response('', { status: 401 });
      // Retried call, now carrying the renewed token: succeeds.
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as any;

    const res = await authFetch('/api/v1/oc/me');
    expect(res.status).toBe(200);
    expect(apiCallCount).toBe(2); // original + exactly one retry, never more
    expect(refreshCallCount).toBe(1);
  });

  it('a genuinely failed renewal (expired/revoked refresh token) clears the session and does not loop', async () => {
    const { setSession, authFetch, getSession } = await import('../src/app/lib/session');
    setSession({ accessToken: 'dead-token', refreshToken: 'dead-refresh', sessionId: 'sess_1', orgContext: 'org-1', expiresAt: Date.now() + 600_000 });

    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/tokens/refresh')) {
        return new Response(JSON.stringify({ error: { code: 'token_expired' } }), { status: 401 });
      }
      return new Response('', { status: 401 }); // every API call fails while the token is dead
    }) as any;

    const res = await authFetch('/api/v1/oc/me');
    expect(res.status).toBe(401); // final, honest failure — caller decides to sign out / redirect
    expect(getSession()).toBeNull(); // session was cleared, not left in a stale, half-valid state
  });

  it('a transient 5xx from /tokens/refresh does NOT clear the session (real bug found and fixed, Batch 3 2026-08-30)', async () => {
    // Real, live-reproduced defect: askabd-identity's TokenService.refresh
    // hit a genuine, transient Postgres connection-pool failure ("Connection
    // terminated due to connection timeout") and returned a real 500 — the
    // refresh token itself was never rejected, but the OLD code treated any
    // non-ok response (including this one) exactly like a definitive 401/403
    // rejection, evicting a perfectly valid session over an infrastructure
    // hiccup. Only a real 401/403 may clear the session now.
    const { setSession, refreshSession, getSession } = await import('../src/app/lib/session');
    const original = { accessToken: 'still-valid-token', refreshToken: 'still-valid-refresh', sessionId: 'sess_1', orgContext: 'org-1', expiresAt: Date.now() + 5_000 };
    setSession(original);

    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/tokens/refresh')) {
        return new Response(JSON.stringify({ error: { message: 'Connection terminated due to connection timeout' } }), { status: 500 });
      }
      throw new Error('unexpected');
    }) as any;

    const result = await refreshSession();
    expect(result).toBeNull(); // this specific attempt honestly failed
    expect(getSession()).not.toBeNull(); // but the session survives — a later retry can still succeed
    expect(getSession()!.accessToken).toBe('still-valid-token'); // untouched, not partially cleared
  });

  it('a real 401/403 from /tokens/refresh DOES clear the session (genuine rejection, not a transient error)', async () => {
    const { setSession, refreshSession, getSession } = await import('../src/app/lib/session');
    setSession({ accessToken: 'dead-token', refreshToken: 'dead-refresh', sessionId: 'sess_1', orgContext: 'org-1', expiresAt: Date.now() + 5_000 });

    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/tokens/refresh')) {
        return new Response(JSON.stringify({ error: { code: 'token_expired' } }), { status: 401 });
      }
      throw new Error('unexpected');
    }) as any;

    const result = await refreshSession();
    expect(result).toBeNull();
    expect(getSession()).toBeNull(); // a genuine rejection still clears the session, unlike the 5xx case above
  });

  it('refreshSession deduplicates concurrent callers into exactly ONE network request', async () => {
    const { setSession, refreshSession } = await import('../src/app/lib/session');
    setSession({ accessToken: 'old-token', refreshToken: 'old-refresh', sessionId: 'sess_1', orgContext: 'org-1', expiresAt: Date.now() + 5_000 });

    let refreshCallCount = 0;
    const newAccessToken = fakeJwt(900);
    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/tokens/refresh')) {
        refreshCallCount++;
        await new Promise((r) => setTimeout(r, 20)); // simulate real network latency
        return new Response(JSON.stringify({ accessToken: newAccessToken, refreshToken: 'new-refresh' }), { status: 200 });
      }
      throw new Error('unexpected');
    }) as any;

    // Five "simultaneous" callers — e.g. five parallel authFetch calls all noticing
    // the same near-expiry token at once (exactly the real client-portal page's
    // Promise.all of many endpoints).
    const results = await Promise.all([refreshSession(), refreshSession(), refreshSession(), refreshSession(), refreshSession()]);
    expect(refreshCallCount).toBe(1); // rotation is single-use — a second concurrent
    // rotation attempt would otherwise fail with a real (and here, spurious) reuse
    // rejection; deduping to one real request is what prevents that.
    for (const r of results) expect(r?.accessToken).toBe(newAccessToken);
  });
});
