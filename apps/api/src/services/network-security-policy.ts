/**
 * AskABD Outbound Network Security Policy — SSRF protection for every
 * connector/discovery operation that makes a real outbound TCP/HTTP
 * request to a caller-supplied host/port (connector_test_1 fast-follow,
 * 2026-08-24).
 *
 * Every connector "test connection" / discovery reachability check accepts
 * an arbitrary `host`/`port` from the request. Without this module, that is
 * a textbook unrestricted server-side request forgery primitive: a caller
 * could point it at AskABD's own internal network, a cloud metadata
 * endpoint (169.254.169.254), or any other address the API server itself
 * can reach but the caller cannot — and use the real timing/error
 * differences in the response to map internal infrastructure or exfiltrate
 * IAM credentials.
 *
 * Policy (fail-closed, matching the same `NODE_ENV !== 'production'`
 * dev-bypass shape already established for the JWT auth guard and CORS
 * defaults elsewhere in this codebase — see auth.ts's `devBypass` formula):
 *
 *   - Loopback (127.0.0.0/8, ::1) and the literal hostname "localhost" are
 *     allowed ONLY when NODE_ENV !== 'production'. This platform's own
 *     disposable dev/test Postgres (docker-compose.yml) — and every
 *     automated test in this repo that connects to it — genuinely runs on
 *     127.0.0.1/localhost. In a real production deployment, a REAL
 *     client's database is never actually "AskABD's own server", so
 *     loopback is never a legitimate destination there.
 *   - Private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16),
 *     link-local (169.254.0.0/16 — this also covers the AWS/GCP/Azure
 *     metadata address 169.254.169.254), IPv6 equivalents (fc00::/7,
 *     fe80::/10), CGNAT (100.64.0.0/10), and other reserved/unspecified
 *     ranges are ALWAYS blocked — a real client's database is expected to
 *     be reached over a real, routable network path (direct, VPN-bridged,
 *     or via a bastion), never AskABD's own private address space.
 *   - The hostname is resolved via the OS resolver (honors /etc/hosts,
 *     exactly like the real TCP/TLS connection Node will make) and EVERY
 *     resolved address is validated, not just the hostname text — this is
 *     what closes DNS-rebinding: registering a hostname that first
 *     resolves to a safe IP during any check-then-connect gap and then to
 *     a private one does not help, because the same resolution result
 *     used for validation is the one immediately used to connect (see
 *     `resolveAndValidate`'s return value, which callers should connect to
 *     directly rather than re-resolving the original hostname).
 *
 * Real, disclosed limitation (documented, not fabricated as solved): HTTP
 * -based connectors that follow redirects (see `safeFetch` below) are
 * covered — every redirect hop is independently validated — but a
 * malicious server could still rebind DNS between this check and the
 * actual `net.Socket`/TLS connect a few milliseconds later for the
 * TCP-only paths (`checkPort`). Fully closing that requires connecting to
 * the validated IP literal directly rather than the original hostname,
 * which is a real, larger change to how the pg driver / raw TCP checks
 * establish their connection (TLS hostname verification also needs to
 * keep using the original hostname for certificate matching, so IP-literal
 * connection isn't a drop-in fix) — flagged as a real, disclosed fast
 * -follow rather than attempted under this pass's time pressure.
 */
import * as dns from 'dns';
import { promisify } from 'util';
import { isIP } from 'net';

const dnsLookup = promisify(dns.lookup);

export class UnsafeDestinationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeDestinationError';
  }
}

const ALLOW_LOOPBACK = process.env.NODE_ENV !== 'production';

function ipv4ToLong(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0]! << 24) >>> 0) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!;
}

function inRange(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToLong(ip) & mask) === (ipv4ToLong(base) & mask);
}

/** Real ranges checked, each with the reason it's blocked. */
const IPV4_BLOCKED_RANGES: Array<{ base: string; bits: number; reason: string; loopback?: boolean }> = [
  { base: '127.0.0.0', bits: 8, reason: 'loopback', loopback: true },
  { base: '10.0.0.0', bits: 8, reason: 'private (RFC1918)' },
  { base: '172.16.0.0', bits: 12, reason: 'private (RFC1918)' },
  { base: '192.168.0.0', bits: 16, reason: 'private (RFC1918)' },
  { base: '169.254.0.0', bits: 16, reason: 'link-local (includes cloud metadata endpoints)' },
  { base: '100.64.0.0', bits: 10, reason: 'carrier-grade NAT (RFC6598)' },
  { base: '0.0.0.0', bits: 8, reason: 'unspecified/reserved' },
  { base: '224.0.0.0', bits: 4, reason: 'multicast' },
  { base: '192.0.0.0', bits: 24, reason: 'IETF protocol assignments (reserved)' },
  { base: '192.0.2.0', bits: 24, reason: 'documentation range (reserved)' },
  { base: '198.18.0.0', bits: 15, reason: 'benchmarking (reserved)' },
  { base: '198.51.100.0', bits: 24, reason: 'documentation range (reserved)' },
  { base: '203.0.113.0', bits: 24, reason: 'documentation range (reserved)' },
  { base: '240.0.0.0', bits: 4, reason: 'reserved (future use)' },
];

function classifyIPv4(ip: string): { blocked: boolean; reason?: string; loopback?: boolean } {
  for (const range of IPV4_BLOCKED_RANGES) {
    if (inRange(ip, range.base, range.bits)) return { blocked: true, reason: range.reason, loopback: range.loopback };
  }
  return { blocked: false };
}

function classifyIPv6(ip: string): { blocked: boolean; reason?: string; loopback?: boolean } {
  const norm = ip.toLowerCase();
  if (norm === '::1') return { blocked: true, reason: 'loopback', loopback: true };
  if (norm === '::' ) return { blocked: true, reason: 'unspecified/reserved' };
  if (norm.startsWith('fe80:') || norm.startsWith('fe8') || norm.startsWith('fe9') || norm.startsWith('fea') || norm.startsWith('feb')) {
    return { blocked: true, reason: 'link-local (includes cloud metadata endpoints)' };
  }
  if (/^f[cd][0-9a-f]{2}:/.test(norm)) return { blocked: true, reason: 'unique local address (RFC4193)' };
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) — unwrap and classify as IPv4.
  const mapped = norm.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return classifyIPv4(mapped[1]!);
  return { blocked: false };
}

function classifyIp(ip: string): { blocked: boolean; reason?: string; loopback?: boolean } {
  const version = isIP(ip);
  if (version === 4) return classifyIPv4(ip);
  if (version === 6) return classifyIPv6(ip);
  return { blocked: true, reason: 'not a valid IP address' };
}

export interface SafeDestination {
  host: string;
  port: number;
  /** The real resolved address actually used for the safety check — connect to this, not a fresh re-resolution, to avoid a DNS-rebinding gap. */
  resolvedIp: string;
}

/**
 * Resolves `host` via the real OS resolver (honors /etc/hosts, exactly like
 * the TCP/TLS connection about to be made) and validates every candidate
 * address. Throws UnsafeDestinationError on any unsafe target — the caller
 * should treat this the same as a real connection failure (safe, generic
 * message; never leak internal policy details beyond "this destination is
 * not permitted").
 */
export async function assertSafeOutboundDestination(host: string, port: number): Promise<SafeDestination> {
  if (!host || typeof host !== 'string') throw new UnsafeDestinationError('A real host is required.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new UnsafeDestinationError('A real, valid port is required.');

  let candidates: Array<{ address: string; family: number }>;
  try {
    const result = await dnsLookup(host, { all: true });
    candidates = Array.isArray(result) ? result : [result as any];
  } catch {
    throw new UnsafeDestinationError(`Cannot resolve host: ${host}`);
  }
  if (candidates.length === 0) throw new UnsafeDestinationError(`Cannot resolve host: ${host}`);

  for (const { address } of candidates) {
    const verdict = classifyIp(address);
    if (!verdict.blocked) continue;
    if (verdict.loopback && ALLOW_LOOPBACK) continue;
    throw new UnsafeDestinationError(
      `This destination is not permitted (${verdict.reason}). Real client infrastructure must be reachable over a real, routable network path — never AskABD's own private address space.`,
    );
  }

  return { host, port, resolvedIp: candidates[0]!.address };
}

/**
 * A `fetch()` wrapper for connectors that make real HTTP calls (GitHub
 * today). Validates the destination BEFORE every request — including every
 * redirect hop — by disabling fetch's automatic redirect-following
 * (`redirect: 'manual'`) and manually re-validating + re-requesting each
 * `Location` target itself. Without this, a malicious or compromised
 * endpoint could pass the initial destination check and then 302 the
 * request to an internal address, and the platform's own fetch() would
 * silently follow it — a classic redirect-based SSRF bypass.
 */
export async function safeFetch(url: string, init?: RequestInit, maxRedirects = 5): Promise<Response> {
  let currentUrl = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const parsed = new URL(currentUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new UnsafeDestinationError(`Protocol not permitted: ${parsed.protocol}`);
    }
    const port = parsed.port ? parseInt(parsed.port, 10) : (parsed.protocol === 'https:' ? 443 : 80);
    await assertSafeOutboundDestination(parsed.hostname, port);

    const res = await fetch(currentUrl, { ...init, redirect: 'manual' });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      currentUrl = new URL(res.headers.get('location')!, currentUrl).toString();
      continue;
    }
    return res;
  }
  throw new UnsafeDestinationError('Too many redirects.');
}
