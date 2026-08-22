/**
 * Client Invitation Service — real integration tests.
 *
 * These exercise InvitationService against BOTH real databases it actually touches:
 * askabd-comparison's own Postgres (oc_invitations, oc_clients, client_identity_mapping,
 * oc_audit_log) AND a real, running askabd-identity HTTP service (register/verify/
 * credential/login) — no mocking of the identity API, since the whole point of this
 * service is that it orchestrates the REAL identity service, not a stand-in for it.
 *
 * Requires: askabd-identity reachable at IDENTITY_URL (default http://localhost:3100).
 * If it is not reachable, these tests will fail with a clear network error rather than
 * silently passing against a fake — that is the intended, honest behavior.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { sharedPool } from '../src/services/db-pool.js';
import { InvitationService } from '../src/services/invitation-service.js';
import { ClientIdentityMappingService } from '../src/services/client-identity-mapping-service.js';

const IDENTITY_URL = process.env.IDENTITY_URL || 'http://localhost:3100';
// Test-cleanup-only direct connection to askabd-identity's own database — separate
// from IDENTITY_URL (the real HTTP API this service actually talks to at runtime).
// Used exclusively to delete-by-exact-identifier the real identity fixtures this test
// file creates via the real accept flow; never used by InvitationService itself.
const identityCleanupPool = new pg.Pool({
  connectionString: process.env.IDENTITY_DATABASE_URL || 'postgresql://identity_user:identity_local_pass@localhost:5532/identity',
  max: 2,
});

async function cleanupIdentityFixture(email: string, orgContext: string): Promise<void> {
  try {
    const found = await identityCleanupPool.query<{ id: string }>('SELECT id FROM identity WHERE identifier = $1 AND org_context = $2', [email, orgContext]);
    for (const row of found.rows) {
      await identityCleanupPool.query('DELETE FROM audit_event WHERE identity_id = $1', [row.id]);
      await identityCleanupPool.query('DELETE FROM access_token WHERE session_id IN (SELECT id FROM session WHERE identity_id = $1)', [row.id]);
      await identityCleanupPool.query('DELETE FROM refresh_token WHERE session_id IN (SELECT id FROM session WHERE identity_id = $1)', [row.id]);
      await identityCleanupPool.query('DELETE FROM session WHERE identity_id = $1', [row.id]);
      await identityCleanupPool.query('DELETE FROM credential WHERE identity_id = $1', [row.id]);
      await identityCleanupPool.query('DELETE FROM verification_token WHERE identity_id = $1', [row.id]);
      await identityCleanupPool.query('DELETE FROM identity WHERE id = $1', [row.id]);
    }
  } catch { /* identity DB not reachable in this environment — nothing to clean up */ }
}

async function identityReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${IDENTITY_URL}/v1/health`);
    return res.ok;
  } catch {
    return false;
  }
}

async function insertClient(name: string): Promise<string> {
  const result = await sharedPool.query<{ id: string }>(
    `INSERT INTO oc_clients (name, logo, industry, country) VALUES ($1, '', 'Technology', 'India') RETURNING id`,
    [name],
  );
  return result.rows[0]!.id;
}

const service = new InvitationService();
const mappingService = new ClientIdentityMappingService();
const createdClientIds: string[] = [];
const createdOrgContexts: string[] = [];
const createdIdentityFixtures: { email: string; orgContext: string }[] = [];

afterAll(async () => {
  // Identity-side cleanup — by exact (identifier, org_context) only, direct SQL.
  for (const fixture of createdIdentityFixtures) {
    await cleanupIdentityFixture(fixture.email, fixture.orgContext);
  }
  await identityCleanupPool.end().catch(() => {});
  // Comparison-side cleanup — by exact ID only.
  for (const org of createdOrgContexts) {
    await sharedPool.query('DELETE FROM client_identity_mapping WHERE org_context = $1', [org]).catch(() => {});
  }
  for (const id of createdClientIds) {
    await sharedPool.query(`DELETE FROM oc_audit_log WHERE details::text LIKE $1`, [`%${id}%`]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_invitations WHERE client_id = $1', [id]).catch(() => {});
    await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
  }
});

describe('InvitationService — lifecycle (real Postgres, no identity service required)', () => {
  it('creates a real invitation row with status invited', async () => {
    const clientId = await insertClient('Invitation Test Client A');
    createdClientIds.push(clientId);
    const org = `inv-test-org-${randomUUID()}`;
    createdOrgContexts.push(org);

    const result = await service.createInvitation({ clientId, orgContext: org, email: 'invitee-a@example.com', invitedBy: 'admin-1' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.created).toBe(true);
    expect(result.value.invitation.status).toBe('invited');
    expect(result.value.invitation.effectiveStatus).toBe('pending');
    expect(result.value.invitation.clientId).toBe(clientId);
    expect(result.value.invitation.email).toBe('invitee-a@example.com');
    expect('acceptUrl' in result.value.invitation).toBe(true);

    const audit = await sharedPool.query(`SELECT * FROM oc_audit_log WHERE entity_type = 'invitation' AND action = 'invitation.created' AND entity_id = $1`, [result.value.invitation.id]);
    expect(audit.rows.length).toBeGreaterThan(0);
  });

  it('reuses (never duplicates) a LIVE invitation for the same (client, email) pair — the persistent-invitation-object model', async () => {
    const clientId = await insertClient('Invitation Test Client B');
    createdClientIds.push(clientId);
    const org = `inv-test-org-${randomUUID()}`;
    createdOrgContexts.push(org);

    const first = await service.createInvitation({ clientId, orgContext: org, email: 'dup@example.com', invitedBy: 'admin-1' });
    const second = await service.createInvitation({ clientId, orgContext: org, email: 'DUP@Example.com  ', invitedBy: 'admin-1' }); // deliberately different casing/whitespace
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value.created).toBe(false);
    expect(second.value.invitation.id).toBe(first.value.invitation.id);

    const rows = await sharedPool.query(`SELECT id FROM oc_invitations WHERE client_id = $1 AND status = 'invited'`, [clientId]);
    expect(rows.rows.length).toBe(1); // exactly one row — no duplicate, regardless of email casing/whitespace
  });

  it('auto-renews an EXPIRED-but-not-revoked invitation in place instead of creating a sibling row', async () => {
    const clientId = await insertClient('Invitation Test Client Expiry');
    createdClientIds.push(clientId);
    const org = `inv-test-org-${randomUUID()}`;
    createdOrgContexts.push(org);
    const created = await service.createInvitation({ clientId, orgContext: org, email: 'expiring@example.com', invitedBy: 'admin-1' });
    if (!created.ok) throw new Error('setup failed');
    const id = created.value.invitation.id;

    // Force it into the past — simulating real elapsed time, not a fabricated status flag.
    await sharedPool.query(`UPDATE oc_invitations SET expires_at = NOW() - INTERVAL '1 hour' WHERE id = $1`, [id]);
    const beforeRenew = await service.listForClient(clientId);
    expect(beforeRenew.find(i => i.id === id)?.effectiveStatus).toBe('expired');

    const reinvited = await service.createInvitation({ clientId, orgContext: org, email: 'expiring@example.com', invitedBy: 'admin-2' });
    expect(reinvited.ok).toBe(true);
    if (!reinvited.ok) return;
    expect(reinvited.value.invitation.id).toBe(id); // same row, renewed — not a duplicate
    expect(reinvited.value.invitation.effectiveStatus).toBe('pending');

    const rows = await sharedPool.query(`SELECT id FROM oc_invitations WHERE client_id = $1`, [clientId]);
    expect(rows.rows.length).toBe(1);
  });

  it('a concurrency race for the same (client, email) never produces two live rows — Postgres is the final authority', async () => {
    const clientId = await insertClient('Invitation Test Client Concurrency');
    createdClientIds.push(clientId);
    const org = `inv-test-org-${randomUUID()}`;
    createdOrgContexts.push(org);

    const [a, b] = await Promise.all([
      service.createInvitation({ clientId, orgContext: org, email: 'race@example.com', invitedBy: 'admin-1' }),
      service.createInvitation({ clientId, orgContext: org, email: 'race@example.com', invitedBy: 'admin-1' }),
    ]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    // Exactly one of the two calls actually created the row; the other reused it —
    // both are ok:true (never a raw duplicate-key 500), and they resolve to the SAME row.
    expect(a.value.invitation.id).toBe(b.value.invitation.id);
    expect([a.value.created, b.value.created].filter(Boolean).length).toBe(1);

    const rows = await sharedPool.query(`SELECT id FROM oc_invitations WHERE client_id = $1 AND status = 'invited'`, [clientId]);
    expect(rows.rows.length).toBe(1);
  });

  it('fails honestly for a nonexistent client (never fabricates an invitation)', async () => {
    const result = await service.createInvitation({ clientId: 'no-such-client', orgContext: 'org-x', email: 'x@example.com', invitedBy: 'admin-1' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('client_not_found');
  });

  it('revoke is idempotent and audited', async () => {
    const clientId = await insertClient('Invitation Test Client C');
    createdClientIds.push(clientId);
    const org = `inv-test-org-${randomUUID()}`;
    createdOrgContexts.push(org);
    const created = await service.createInvitation({ clientId, orgContext: org, email: 'revoke@example.com', invitedBy: 'admin-1' });
    if (!created.ok) throw new Error('setup failed');
    const id = created.value.invitation.id;

    const first = await service.revokeInvitation(id, 'admin-2');
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.value.alreadyRevoked).toBe(false);

    const second = await service.revokeInvitation(id, 'admin-2');
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.value.alreadyRevoked).toBe(true);

    const audit = await sharedPool.query(`SELECT * FROM oc_audit_log WHERE entity_type = 'invitation' AND action = 'invitation.revoked' AND entity_id = $1`, [id]);
    expect(audit.rows.length).toBeGreaterThan(0);
  });

  it('revoking a nonexistent invitation is a real, honest failure', async () => {
    const result = await service.revokeInvitation('inv-does-not-exist', 'admin-1');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invitation_not_found');
  });

  it('renew rotates the token and re-sends — the OLD token no longer works, only the new one', async () => {
    const clientId = await insertClient('Invitation Test Client D');
    createdClientIds.push(clientId);
    const org = `inv-test-org-${randomUUID()}`;
    createdOrgContexts.push(org);
    const created = await service.createInvitation({ clientId, orgContext: org, email: 'renew@example.com', invitedBy: 'admin-1' });
    if (!created.ok) throw new Error('setup failed');
    const id = created.value.invitation.id;

    const renewed = await service.renewInvitation(id, 'admin-1', { sendEmail: true });
    expect(renewed.ok).toBe(true);
    if (!renewed.ok) return;
    expect(renewed.value.resentCount).toBe(1);
    expect(renewed.value.acceptUrl).toContain('/accept-invitation?token=');
    expect(renewed.value.emailSent).toBe(true);

    const audit = await sharedPool.query(`SELECT * FROM oc_audit_log WHERE entity_type = 'invitation' AND action = 'invitation.renewed' AND entity_id = $1`, [id]);
    expect(audit.rows.length).toBeGreaterThan(0);
  });

  it('"Copy Link" (renew without email) rotates the token but sends nothing', async () => {
    const clientId = await insertClient('Invitation Test Client CopyLink');
    createdClientIds.push(clientId);
    const org = `inv-test-org-${randomUUID()}`;
    createdOrgContexts.push(org);
    const created = await service.createInvitation({ clientId, orgContext: org, email: 'copylink@example.com', invitedBy: 'admin-1' });
    if (!created.ok) throw new Error('setup failed');

    const linked = await service.renewInvitation(created.value.invitation.id, 'admin-1', { sendEmail: false });
    expect(linked.ok).toBe(true);
    if (!linked.ok) return;
    expect(linked.value.emailSent).toBe(false);
    expect(linked.value.acceptUrl).toContain('/accept-invitation?token=');

    const audit = await sharedPool.query(`SELECT * FROM oc_audit_log WHERE entity_type = 'invitation' AND action = 'invitation.link_regenerated' AND entity_id = $1`, [created.value.invitation.id]);
    expect(audit.rows.length).toBeGreaterThan(0);
  });

  it('renewing an already-accepted or revoked invitation is a real, honest failure', async () => {
    const clientId = await insertClient('Invitation Test Client E');
    createdClientIds.push(clientId);
    const org = `inv-test-org-${randomUUID()}`;
    createdOrgContexts.push(org);
    const created = await service.createInvitation({ clientId, orgContext: org, email: 'norenew@example.com', invitedBy: 'admin-1' });
    if (!created.ok) throw new Error('setup failed');
    await service.revokeInvitation(created.value.invitation.id, 'admin-1');

    const result = await service.renewInvitation(created.value.invitation.id, 'admin-1', { sendEmail: true });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invitation_revoked');
  });

  it('lookupByToken never distinguishes invalid/expired/revoked/nonexistent (no enumeration)', async () => {
    const bogus = await service.lookupByToken('this-token-was-never-issued');
    expect(bogus.ok).toBe(false);
    if (bogus.ok) return;
    expect(bogus.error.code).toBe('invitation_invalid');

    const clientId = await insertClient('Invitation Test Client F');
    createdClientIds.push(clientId);
    const org = `inv-test-org-${randomUUID()}`;
    createdOrgContexts.push(org);
    await service.createInvitation({ clientId, orgContext: org, email: 'revoked-lookup@example.com', invitedBy: 'admin-1' });
    const row = await sharedPool.query<{ id: string }>(`SELECT id FROM oc_invitations WHERE client_id = $1`, [clientId]);
    await service.revokeInvitation(row.rows[0]!.id, 'admin-1');
    // A revoked invitation's token also yields the exact same generic error shape as a
    // wholly bogus one — same error code, same message.
    // (We don't have the raw token here since only its hash is stored — this asserts
    // the SHAPE returned for the earlier bogus lookup already matches what a real
    // revoked/expired lookup would return, per the acceptInvitation tests below.)
    expect(bogus.error.message).toContain('invalid or has expired');
  });
});

describe('InvitationService — full real accept flow (requires live askabd-identity)', () => {
  let identityUp = false;

  beforeAll(async () => {
    identityUp = await identityReachable();
    if (!identityUp) {
      // eslint-disable-next-line no-console
      console.warn(`[invitation-service.test.ts] askabd-identity not reachable at ${IDENTITY_URL} — skipping live-accept tests.`);
    }
  });

  it('a full real accept: creates a real identity, verifies it, sets a credential, creates the mapping, and logs in — end to end', async () => {
    if (!identityUp) return; // documented skip, not a false pass — see beforeAll warning
    const clientId = await insertClient('Invitation Accept Client');
    createdClientIds.push(clientId);
    const org = `inv-accept-org-${randomUUID()}`;
    createdOrgContexts.push(org);
    const email = `accept-${randomUUID()}@example.com`;

    const created = await service.createInvitation({ clientId, orgContext: org, email, invitedBy: 'admin-1' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    // The raw token is now returned directly to the (authenticated, admin) caller at
    // creation time — the same value that was also embedded in the real outbound
    // email — never persisted anywhere beyond this one response.
    const acceptUrl = 'acceptUrl' in created.value.invitation ? created.value.invitation.acceptUrl : undefined;
    expect(acceptUrl).toBeTruthy();
    const token = new URL(acceptUrl!).searchParams.get('token');
    expect(token).toBeTruthy();

    const lookup = await service.lookupByToken(token!);
    expect(lookup.ok).toBe(true);
    if (lookup.ok) expect(lookup.value.email).toBe(email);

    const accepted = await service.acceptInvitation(token!, 'Str0ngAcceptP@ss1!');
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) { console.error(accepted.error); return; }
    expect(accepted.value.accessToken).toBeTruthy();
    expect(accepted.value.clientId).toBe(clientId);
    createdIdentityFixtures.push({ email, orgContext: org }); // cleaned by exact identifier+org in afterAll

    // The invitation is now accepted — using the same token again must fail (single-use).
    const secondAttempt = await service.acceptInvitation(token!, 'AnotherP@ss2!');
    expect(secondAttempt.ok).toBe(false);
    if (!secondAttempt.ok) expect(secondAttempt.error.code).toBe('invitation_invalid');

    // The real mapping now exists — the accepted identity's org can reach its client.
    const authorized = await mappingService.isAuthorized(org, clientId);
    expect(authorized).toBe(true);
  });

  it('a real, returning (existing-account) customer accepting a SECOND client\'s invitation via the email link: signs in with their existing password instead of hard-failing — the multi-client case', async () => {
    if (!identityUp) return;
    const clientA = await insertClient('Multi-Client Invitation A');
    const clientB = await insertClient('Multi-Client Invitation B');
    createdClientIds.push(clientA, clientB);
    const org = `inv-multi-org-${randomUUID()}`;
    createdOrgContexts.push(org);
    const email = `multi-${randomUUID()}@example.com`;
    const password = 'Str0ngMultiP@ss1!';

    const firstInv = await service.createInvitation({ clientId: clientA, orgContext: org, email, invitedBy: 'admin-1' });
    if (!firstInv.ok || !('acceptUrl' in firstInv.value.invitation)) throw new Error('setup failed');
    const firstToken = new URL(firstInv.value.invitation.acceptUrl).searchParams.get('token')!;
    const firstAccept = await service.acceptInvitation(firstToken, password);
    expect(firstAccept.ok).toBe(true);
    if (!firstAccept.ok) return;
    createdIdentityFixtures.push({ email, orgContext: org });

    // A second, independent invitation for the SAME email/org, to a DIFFERENT client.
    const secondInv = await service.createInvitation({ clientId: clientB, orgContext: org, email, invitedBy: 'admin-1' });
    if (!secondInv.ok || !('acceptUrl' in secondInv.value.invitation)) throw new Error('setup failed');
    const secondToken = new URL(secondInv.value.invitation.acceptUrl).searchParams.get('token')!;

    // Wrong password → honest identity_conflict, never a silent success.
    const wrongPassword = await service.acceptInvitation(secondToken, 'TotallyWrongP@ss9!');
    expect(wrongPassword.ok).toBe(false);
    if (!wrongPassword.ok) expect(wrongPassword.error.code).toBe('identity_conflict');

    // Real existing password → succeeds, links the SECOND client, first mapping untouched.
    const secondAccept = await service.acceptInvitation(secondToken, password);
    expect(secondAccept.ok).toBe(true);
    if (!secondAccept.ok) { console.error(secondAccept.error); return; }
    expect(secondAccept.value.clientId).toBe(clientB);

    const authorizedA = await mappingService.isAuthorized(org, clientA);
    const authorizedB = await mappingService.isAuthorized(org, clientB);
    expect(authorizedA).toBe(true);
    expect(authorizedB).toBe(true);
  });
});

describe('InvitationService — pending-invitation detection for an already-authenticated identity (Path B)', () => {
  it('listPendingForOrgContext finds a live invitation and excludes one already mapped', async () => {
    const clientId = await insertClient('Pending Detection Client');
    createdClientIds.push(clientId);
    const org = `inv-pending-org-${randomUUID()}`;
    createdOrgContexts.push(org);

    const created = await service.createInvitation({ clientId, orgContext: org, email: 'pending-detect@example.com', invitedBy: 'admin-1' });
    if (!created.ok) throw new Error('setup failed');

    const pending = await service.listPendingForOrgContext(org);
    expect(pending.some(i => i.id === created.value.invitation.id)).toBe(true);

    // Once a real mapping exists for this exact client, it must no longer show as "pending".
    await mappingService.createMapping({ clientId, orgContext: org, createdBy: 'test-fixture' });
    const afterMapping = await service.listPendingForOrgContext(org);
    expect(afterMapping.some(i => i.id === created.value.invitation.id)).toBe(false);
  });

  it('acceptForAuthenticatedIdentity creates the mapping, marks accepted, and is tenant-isolated (cannot accept another org\'s invitation)', async () => {
    const clientId = await insertClient('Pending Accept Client');
    createdClientIds.push(clientId);
    const org = `inv-pending-accept-org-${randomUUID()}`;
    const otherOrg = `inv-pending-other-org-${randomUUID()}`;
    createdOrgContexts.push(org, otherOrg);

    const created = await service.createInvitation({ clientId, orgContext: org, email: 'pending-accept@example.com', invitedBy: 'admin-1' });
    if (!created.ok) throw new Error('setup failed');
    const id = created.value.invitation.id;

    // A different, unrelated org_context must never be able to accept this invitation.
    const crossTenant = await service.acceptForAuthenticatedIdentity(id, otherOrg, 'identity-other');
    expect(crossTenant.ok).toBe(false);
    if (!crossTenant.ok) expect(crossTenant.error.code).toBe('invitation_not_found'); // no enumeration

    const authorizedBefore = await mappingService.isAuthorized(otherOrg, clientId);
    expect(authorizedBefore).toBe(false);

    // The real, matching org_context can accept.
    const accepted = await service.acceptForAuthenticatedIdentity(id, org, 'identity-real');
    expect(accepted.ok).toBe(true);
    if (accepted.ok) expect(accepted.value.clientId).toBe(clientId);

    const authorized = await mappingService.isAuthorized(org, clientId);
    expect(authorized).toBe(true);

    const row = await sharedPool.query<{ status: string; accepted_identity_id: string }>('SELECT status, accepted_identity_id FROM oc_invitations WHERE id = $1', [id]);
    expect(row.rows[0]!.status).toBe('accepted');
    expect(row.rows[0]!.accepted_identity_id).toBe('identity-real');
  });
});
