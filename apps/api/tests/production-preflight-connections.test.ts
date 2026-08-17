/**
 * Production Preflight — real DNS resolution and real SMTP handshake verification.
 *
 * Verifies the "No False Green" rule: DNS Configuration is no longer marked
 * 'ready_to_connect' merely because a URL string doesn't say "localhost" — it must
 * actually resolve. Email/SMTP is no longer marked ready merely because SMTP_HOST is
 * set — it must pass a real transport.verify() handshake (email-transport.ts, the same
 * transport the real OTP send path uses).
 */
import { describe, expect, it } from 'vitest';
import { ProductionPreflightService } from '../src/services/production-preflight-service.js';

describe('ProductionPreflightService — DNS Configuration (DEP-012)', () => {
  it('reports a real evidence-backed status, never a fabricated "ready" without checking', async () => {
    const service = new ProductionPreflightService();
    const report = await service.runPreflight();
    const all = [...report.blockingItems, ...report.requiredItems, ...report.verifiedItems, ...report.optionalItems, ...report.missingInformation];
    const dns = all.find(i => i.id === 'DEP-012');
    expect(dns).toBeDefined();
    // In this DEV environment API_PUBLIC_URL is unset/localhost, so DNS is honestly not applicable yet —
    // it must never claim 'verified' without ever having actually resolved anything.
    expect(dns!.status).not.toBe('verified');
    expect(['ready_to_connect', 'missing']).toContain(dns!.status);
  });
});

describe('ProductionPreflightService — SMTP/Email Provider (DEP-011)', () => {
  it('performs a real SMTP handshake and reports verified only when it actually succeeds, with evidence', async () => {
    const service = new ProductionPreflightService();
    const report = await service.runPreflight();
    const all = [...report.blockingItems, ...report.requiredItems, ...report.verifiedItems, ...report.optionalItems, ...report.missingInformation];
    const email = all.find(i => i.id === 'DEP-011');
    expect(email).toBeDefined();
    // Mailpit is expected to be running in this dev environment (used by the real OTP send path) —
    // if the handshake genuinely succeeds, status must be 'verified' with real evidence, not just
    // 'ready_to_connect' from an env-var presence check.
    if (email!.status === 'verified') {
      expect(email!.evidence).toBeTruthy();
      expect(email!.evidence).toContain('SMTP verify()');
      expect(email!.verifiedAt).toBeTruthy();
    } else {
      // If Mailpit isn't reachable in this run, it must fail honestly, never claim ready/verified.
      expect(['not_verified', 'failed', 'missing']).toContain(email!.status);
    }
  });
});
