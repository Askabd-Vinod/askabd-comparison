import { cookies } from 'next/headers';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

/**
 * The real, root-cause fix for a live bug found during this pass's auth-routing
 * verification: every `(app)/**` staff-console page that fetches data is an async
 * Server Component (57 of them) calling this helper with NO Authorization header —
 * because the staff session lives in browser `sessionStorage`
 * (lib/staff-session.ts), which a Node-side Server Component cannot read at all.
 *
 * This was invisible while the API ran with `devBypass` active (no JWKS_URL
 * configured — see apps/api/src/middleware/auth.ts's devBypass formula), because
 * every unauthenticated request was silently treated as a synthetic admin
 * identity. The moment JWKS_URL was correctly configured for real verification
 * (restoring the security posture this session already built and documented),
 * every one of these 401'd, and `apiSafe`'s fallback silently rendered "0
 * clients" — a real client existed the whole time. That is exactly the kind of
 * fabricated-looking empty state this platform's own standing rule forbids:
 * the emptiness was caused by a broken fetch, not by real data absence.
 *
 * Fix: `staff-session.ts` also writes the staff access token into a same-site,
 * JS-readable (non-httpOnly — it's set by client JS, not a server response, so it
 * cannot be httpOnly) session cookie scoped to THIS app's own origin, cleared on
 * logout. Server Components read it here via `next/headers` and forward it as a
 * real Authorization header. This is additive — sessionStorage remains the
 * primary session store for client components (`authFetch`/`staffFetch`); the
 * cookie exists only so server-rendered pages can present the same authenticated
 * view a client-rendered page would. Not a full cookie-based BFF migration (the
 * documented, larger, deliberate future step — see lib/session.ts) — just enough
 * to stop server components from silently rendering as an unauthenticated guest.
 */
const STAFF_TOKEN_COOKIE = 'askabd_staff_token';

async function authHeaders(opts?: RequestInit): Promise<HeadersInit | undefined> {
  const existing = new Headers(opts?.headers);
  if (existing.has('Authorization')) return existing;
  try {
    const store = await cookies();
    const token = store.get(STAFF_TOKEN_COOKIE)?.value;
    if (token) existing.set('Authorization', `Bearer ${token}`);
  } catch {
    // cookies() throws outside a request context (e.g. during certain build-time
    // static analysis) — fall through with whatever headers were already passed.
  }
  return existing;
}

export async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const headers = await authHeaders(opts);
  const res = await fetch(`${API}${path}`, { cache: 'no-store', ...opts, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.error?.message || res.statusText, body?.error);
  }
  return res.json() as Promise<T>;
}

export async function apiSafe<T>(path: string, fallback: T, opts?: RequestInit): Promise<T> {
  try { return await api<T>(path, opts); } catch { return fallback; }
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public error?: any) { super(message); }
}
