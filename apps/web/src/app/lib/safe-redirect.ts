/**
 * Validates a `?next=` redirect parameter so a login page (or the auth guard
 * that produced it) can only ever send a user to a safe, internal, relative
 * path — never to an external host, a protocol-relative URL, or a
 * javascript:/data:/vbscript:/file: scheme smuggled in via encoding.
 *
 * This exists because `next` is attacker-controllable: anyone can craft a link
 * like `/staff/login?next=https://evil.example/phish` and send it to a real
 * staff member. Without validation, a successful login would silently redirect
 * them off AskABD entirely.
 */

const DANGEROUS_SCHEME_RE = /(javascript|data|vbscript|file):/i;

export function sanitizeNextPath(raw: string | null | undefined, fallback = '/'): string {
  if (typeof raw !== 'string' || raw.length === 0) return fallback;

  let value: string;
  try {
    // Query params arrive already-decoded via URLSearchParams in the browser,
    // but decode defensively in case this is ever called on a raw query
    // string — a double-encoded external URL should not slip through.
    value = decodeURIComponent(raw);
  } catch {
    return fallback;
  }

  if (!value.startsWith('/')) return fallback; // must be a path, not a scheme/host
  if (value.startsWith('//')) return fallback; // protocol-relative ("//evil.com")
  if (value.includes('\\')) return fallback; // backslash tricks some browsers normalize to "//"
  if (value.includes('://')) return fallback; // an absolute URL smuggled in as a "path"
  if (DANGEROUS_SCHEME_RE.test(value)) return fallback; // javascript:/data:/vbscript:/file: anywhere
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(value)) return fallback; // control characters (encoded newlines, etc.)

  return value;
}

/**
 * The staff console and the customer portal are two separate authorization
 * domains sharing the same identity service (see
 * docs/staff-authentication-architecture.md). A `next` value is only honored
 * if it actually belongs to the surface the login just authenticated into —
 * otherwise a crafted `next` could bounce a customer toward a staff-only route
 * (where the server-side RBAC check would 403 them, but there's no reason to
 * even attempt it) or vice versa. When the surface doesn't match, the caller
 * falls back to its own real, resolved default instead.
 */
export function sanitizeNextForSurface(raw: string | null | undefined, surface: 'staff' | 'customer', fallback: string): string {
  const safe = sanitizeNextPath(raw, fallback);
  if (safe === fallback) return safe;

  const isAuthPath = safe === '/login' || safe === '/staff/login' || safe.startsWith('/login/') || safe.startsWith('/staff/login/') || safe.startsWith('/accept-invitation');
  if (isAuthPath) return fallback; // never bounce straight back into an auth page

  if (surface === 'customer') {
    return safe.startsWith('/client-portal/') ? safe : fallback;
  }
  // surface === 'staff': anything else internal and non-auth is a legitimate
  // console route (Dashboard, Clients, Platform, etc.).
  return safe.startsWith('/client-portal/') ? fallback : safe;
}
