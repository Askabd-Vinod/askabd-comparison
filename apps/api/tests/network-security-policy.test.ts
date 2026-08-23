/**
 * network-security-policy.ts — real SSRF protection for every connector
 * "test connection" / discovery reachability check (connector_test_1 fast
 * -follow, 2026-08-24). See that module's own doc comment for the full
 * policy. These tests exercise the real module directly — no route/HTTP
 * layer needed for the negative cases, since the policy itself is what
 * must be proven, not any particular caller of it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as http from 'node:http';

// Real DNS-rebinding proof: a hostname that resolves to a private/metadata
// IP must be blocked, not just a literal IP typed into the host field. Node's
// built-in `dns` module can't be spied on directly in ESM (non-configurable
// export), so this mocks it at the module level for one specific test case
// via a shared flag, restored immediately after.
let mockRebindTarget: string | null = null;
vi.mock('node:dns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:dns')>();
  return {
    ...actual,
    lookup: ((host: string, opts: any, cb: any) => {
      const callback = typeof opts === 'function' ? opts : cb;
      if (mockRebindTarget) {
        callback(null, [{ address: mockRebindTarget, family: 4 }]);
        return;
      }
      return (actual.lookup as any)(host, opts, cb);
    }) as any,
  };
});

const { assertSafeOutboundDestination, safeFetch, UnsafeDestinationError } = await import('../src/services/network-security-policy.js');

describe('network-security-policy — real destination validation', () => {
  it('a malformed destination (empty host) is blocked safely, never a crash', async () => {
    await expect(assertSafeOutboundDestination('', 5432)).rejects.toThrow(UnsafeDestinationError);
  });

  it('a malformed destination (invalid port) is blocked safely', async () => {
    await expect(assertSafeOutboundDestination('example.com', 0)).rejects.toThrow(UnsafeDestinationError);
    await expect(assertSafeOutboundDestination('example.com', 70000)).rejects.toThrow(UnsafeDestinationError);
    await expect(assertSafeOutboundDestination('example.com', 1.5)).rejects.toThrow(UnsafeDestinationError);
  });

  it('a cloud metadata address literal (169.254.169.254) is BLOCKED, unconditionally', async () => {
    await expect(assertSafeOutboundDestination('169.254.169.254', 80)).rejects.toThrow(UnsafeDestinationError);
  });

  it('private RFC1918 ranges are BLOCKED, unconditionally', async () => {
    await expect(assertSafeOutboundDestination('10.0.0.1', 5432)).rejects.toThrow(UnsafeDestinationError);
    await expect(assertSafeOutboundDestination('172.16.5.5', 5432)).rejects.toThrow(UnsafeDestinationError);
    await expect(assertSafeOutboundDestination('192.168.1.1', 5432)).rejects.toThrow(UnsafeDestinationError);
  });

  it('IPv6 loopback, link-local, and unique-local addresses are BLOCKED (link-local unconditionally; loopback per env policy)', async () => {
    await expect(assertSafeOutboundDestination('fe80::1', 5432)).rejects.toThrow(UnsafeDestinationError);
    await expect(assertSafeOutboundDestination('fd00::1', 5432)).rejects.toThrow(UnsafeDestinationError);
  });

  it('a real, genuinely resolvable public-shaped hostname is NOT blocked by the policy layer itself (approved-destination path allowed through to the real connection attempt)', async () => {
    // A real DNS name (api.github.com — used by the real GitHub connector)
    // resolves to real, public IPs — the policy must not reject it. Whether
    // the actual TCP connect succeeds from this sandbox is a separate,
    // environment-dependent concern; the destination-validation layer
    // itself must approve it.
    const result = await assertSafeOutboundDestination('api.github.com', 443);
    expect(result.resolvedIp).toBeTruthy();
  });

  it('DNS-rebinding: a hostname that resolves to a private IP is BLOCKED, not just the literal IP text', async () => {
    mockRebindTarget = '169.254.169.254';
    try {
      await expect(assertSafeOutboundDestination('attacker-controlled-rebinding-test.example', 80)).rejects.toThrow(UnsafeDestinationError);
    } finally {
      mockRebindTarget = null;
    }
  });
});

describe('network-security-policy — safeFetch redirect protection', () => {
  let server: http.Server | null = null;
  let port = 0;

  afterEach(async () => {
    if (server) {
      await new Promise<void>(resolve => server!.close(() => resolve()));
      server = null;
    }
  });

  it('a redirect to a private/metadata address is BLOCKED, not silently followed', async () => {
    server = http.createServer((req, res) => {
      res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data/' });
      res.end();
    });
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', () => resolve()));
    port = (server!.address() as any).port;

    await expect(safeFetch(`http://127.0.0.1:${port}/redirect-me`)).rejects.toThrow(UnsafeDestinationError);
  });

  it('a real, non-redirecting request to an approved destination succeeds normally', async () => {
    server = http.createServer((req, res) => { res.writeHead(200); res.end('ok'); });
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', () => resolve()));
    port = (server!.address() as any).port;

    const res = await safeFetch(`http://127.0.0.1:${port}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });
});
