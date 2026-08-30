/**
 * Real bug found and fixed (Batch 3 Playwright coverage completion,
 * 2026-08-30) — `staff-session.ts`'s `refreshStaffSession()` had the
 * identical defect as `session.ts`'s `refreshSession()` (see
 * `session-refresh.test.ts` for the full real-world reproduction via a
 * live `askabd-identity` Postgres connection-pool failure): any non-ok
 * response from `/v1/tokens/refresh` — including a transient 5xx —
 * evicted the staff session exactly like a genuine 401/403 rejection.
 * These two tests mirror `session-refresh.test.ts`'s equivalent pair for
 * the staff-session module specifically.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';

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

describe('staff-session.ts — refreshStaffSession resilience', () => {
  beforeEach(() => {
    installFakeBrowser();
    vi.resetModules();
  });

  it('a transient 5xx from /tokens/refresh does NOT clear the staff session', async () => {
    const { setStaffSession, refreshStaffSession, getStaffSession } = await import('../src/app/lib/staff-session');
    setStaffSession({ accessToken: 'still-valid', refreshToken: 'still-valid-refresh', identityId: 'id-1', sessionId: 'sess_1', orgContext: 'askabd-internal', expiresAt: Date.now() + 5_000 } as any);

    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/tokens/refresh')) {
        return new Response(JSON.stringify({ error: { message: 'Connection terminated due to connection timeout' } }), { status: 500 });
      }
      throw new Error('unexpected');
    }) as any;

    const result = await refreshStaffSession();
    expect(result).toBeNull();
    expect(getStaffSession()).not.toBeNull();
    expect(getStaffSession()!.accessToken).toBe('still-valid');
  });

  it('a real 401/403 from /tokens/refresh DOES clear the staff session', async () => {
    const { setStaffSession, refreshStaffSession, getStaffSession } = await import('../src/app/lib/staff-session');
    setStaffSession({ accessToken: 'dead', refreshToken: 'dead-refresh', identityId: 'id-1', sessionId: 'sess_1', orgContext: 'askabd-internal', expiresAt: Date.now() + 5_000 } as any);

    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/tokens/refresh')) {
        return new Response(JSON.stringify({ error: { code: 'token_expired' } }), { status: 401 });
      }
      throw new Error('unexpected');
    }) as any;

    const result = await refreshStaffSession();
    expect(result).toBeNull();
    expect(getStaffSession()).toBeNull();
  });
});
