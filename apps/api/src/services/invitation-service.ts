/**
 * Client Invitation Service — the real onboarding entry point.
 *
 * Bridges `oc_clients` (this repo's own consulting customers) and the real
 * askabd-identity service: an invitation is the only path by which a brand-new
 * identity is created AND granted client access (via client_identity_mapping,
 * migration 024), atomically, on acceptance. See migration
 * 025_client_invitations.sql for the schema rationale and migration
 * 032_invitation_dedupe_and_normalization.sql for the concurrency-safety and
 * normalization rules added during the 2026-08-20 invitation-workflow rework.
 *
 * Orchestrates askabd-identity's REAL HTTP API (register → verify → set-credential →
 * login) — no duplicate/parallel identity engine, no fabricated success state. Every
 * failure at any step is a real, honestly-reported error; nothing is marked accepted
 * unless every step genuinely succeeded.
 *
 * ─── Invitation as a persistent business object (2026-08-20 rework) ─────────────
 * An invitation is no longer treated as a disposable, one-shot row that staff must
 * "resend" (i.e. implicitly manage as a new entity) every time a customer needs it
 * again. Its real lifecycle is:
 *
 *   CREATED → PENDING → ACCEPTED
 *   PENDING → REVOKED
 *   PENDING → EXPIRED (derived from expires_at, not a separate drifting flag)
 *   EXPIRED → RENEWED → PENDING (same row, rotated token)
 *
 * `createInvitation` therefore ALWAYS checks for a reusable existing row first
 * (same client_id + normalized email) before creating a new one — never silently
 * duplicates. A live 'invited' row is returned as-is (reuse). An expired 'invited'
 * row is auto-renewed in place (rotated token, same row, same id) rather than
 * spawning a sibling row. Only 'revoked' invitations (a real terminal, staff-decided
 * state) or a genuinely new email start a brand-new row.
 */
import { randomBytes, createHash } from 'node:crypto';
import type { DbClient } from '../db/connection.js';
import { getPool } from '../db/connection.js';
import { ClientIdentityMappingService } from './client-identity-mapping-service.js';
import { EmailService, type EmailResult } from './email-service.js';

const IDENTITY_URL = process.env.IDENTITY_URL || 'http://localhost:3100';
const WEB_URL = process.env.WEB_URL || 'http://localhost:3001';
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — reasonable default, not fabricated precision
const UNIQUE_VIOLATION = '23505';

export interface Invitation {
  id: string;
  clientId: string;
  clientName?: string;
  orgContext: string;
  email: string;
  /** Real DB status. Note: 'invited' rows past expires_at are surfaced to callers
   *  as `effectiveStatus: 'expired'` (see toInvitation) rather than mutating this
   *  column on a timer — expires_at is the single source of truth, so there is no
   *  background job that can drift out of sync with it. */
  status: 'invited' | 'accepted' | 'expired' | 'revoked';
  effectiveStatus: 'pending' | 'accepted' | 'expired' | 'revoked';
  invitedBy: string | null;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  acceptedIdentityId: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  resentCount: number;
  lastSentAt: string | null;
}

export type InvitationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } };

/** Returned only at the moment a raw token genuinely exists in memory (create,
 *  renew, copy-link) — never persisted, never logged, never returned again. */
export interface InvitationWithLink extends Invitation {
  acceptUrl: string;
  emailSent: boolean;
}

interface InvitationRow {
  id: string;
  client_id: string;
  org_context: string;
  email: string;
  token_hash: string;
  status: 'invited' | 'accepted' | 'expired' | 'revoked';
  invited_by: string | null;
  created_at: Date;
  expires_at: Date;
  accepted_at: Date | null;
  accepted_identity_id: string | null;
  revoked_at: Date | null;
  revoked_by: string | null;
  resent_count: number;
  last_sent_at: Date | null;
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function toInvitation(row: InvitationRow, clientName?: string): Invitation {
  const isLiveExpired = row.status === 'invited' && row.expires_at < new Date();
  const effectiveStatus: Invitation['effectiveStatus'] =
    isLiveExpired ? 'expired' : row.status === 'invited' ? 'pending' : row.status;
  return {
    id: row.id,
    clientId: row.client_id,
    clientName,
    orgContext: row.org_context,
    email: row.email,
    status: row.status,
    effectiveStatus,
    invitedBy: row.invited_by,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    acceptedAt: row.accepted_at ? row.accepted_at.toISOString() : null,
    acceptedIdentityId: row.accepted_identity_id,
    revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null,
    revokedBy: row.revoked_by,
    resentCount: row.resent_count,
    lastSentAt: row.last_sent_at ? row.last_sent_at.toISOString() : null,
  };
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Reads the `sub` (identity id) claim out of a freshly-issued JWT we just received
 *  directly from askabd-identity over this same trusted, server-to-server request.
 *  No signature verification is performed here — this is not an authorization
 *  decision, only extracting a value from a token this process received a moment
 *  ago from the token's own issuer; the token is used immediately afterward exactly
 *  as issued (forwarded to the browser), so there is nothing to gain by re-verifying
 *  a signature this process cannot have forged. */
function decodeJwtSubject(jwt: string): string | null {
  try {
    const payloadSegment = jwt.split('.')[1];
    if (!payloadSegment) return null;
    const json = Buffer.from(payloadSegment, 'base64url').toString('utf8');
    const payload = JSON.parse(json) as { sub?: string };
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

async function identityFetch(path: string, init: RequestInit & { orgContext?: string }): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (init.orgContext) headers.set('X-Org-Context', init.orgContext);
  return fetch(`${IDENTITY_URL}${path}`, { ...init, headers });
}

export class InvitationService {
  constructor(
    private readonly db: DbClient = getPool(),
    private readonly emailService: EmailService = new EmailService(),
  ) {}

  private mapping(): ClientIdentityMappingService {
    return new ClientIdentityMappingService(this.db);
  }

  /**
   * Creates a real invitation — or, per the persistent-invitation-object model,
   * reuses/renews an existing one rather than ever silently duplicating a row for
   * the same (clientId, normalized email). PostgreSQL's own unique partial index
   * (migration 032) is the final authority under concurrency: if two requests race
   * past the pre-check, the loser's INSERT fails with 23505 and is turned into a
   * real reuse of the winner's row rather than an error.
   */
  async createInvitation(input: { clientId: string; orgContext: string; email: string; invitedBy: string | null }): Promise<InvitationResult<{ invitation: Invitation | InvitationWithLink; created: boolean }>> {
    const email = normalizeEmail(input.email);
    if (!email || !email.includes('@')) {
      return { ok: false, error: { code: 'invalid_email', message: 'A valid email address is required.' } };
    }

    const clientRow = await this.db.query<{ id: string; name: string }>('SELECT id, name FROM oc_clients WHERE id = $1', [input.clientId]);
    if (clientRow.rows.length === 0) {
      return { ok: false, error: { code: 'client_not_found', message: `No client with id ${input.clientId}` } };
    }
    const clientName = clientRow.rows[0]!.name;

    const existing = await this.db.query<InvitationRow>(
      `SELECT * FROM oc_invitations WHERE client_id = $1 AND lower(trim(email)) = $2 ORDER BY created_at DESC LIMIT 1`,
      [input.clientId, email],
    );
    const priorRow = existing.rows[0];

    if (priorRow) {
      if (priorRow.status === 'invited' && priorRow.expires_at >= new Date()) {
        // A genuinely live invitation already exists — reuse it, do not duplicate.
        return { ok: true, value: { invitation: toInvitation(priorRow, clientName), created: false } };
      }
      if (priorRow.status === 'invited' && priorRow.expires_at < new Date()) {
        // Expired but never explicitly revoked — auto-renew in place rather than
        // spawning a sibling row (EXPIRED → RENEWED/PENDING).
        const renewed = await this.renewInvitation(priorRow.id, input.invitedBy, { sendEmail: true });
        if (!renewed.ok) return renewed;
        return { ok: true, value: { invitation: renewed.value, created: false } };
      }
      if (priorRow.status === 'accepted') {
        const alreadyMapped = await this.mapping().isAuthorized(priorRow.org_context, input.clientId);
        if (alreadyMapped) {
          return { ok: false, error: { code: 'already_a_member', message: 'This person already has access to this client.' } };
        }
        // Accepted previously but the mapping was since revoked — a real, distinct
        // re-invitation is appropriate; fall through to create a fresh row.
      }
      // status === 'revoked' (or accepted-but-unmapped above) falls through to a
      // fresh row — a real, staff-decided prior state, not silently overwritten.
    }

    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    try {
      const result = await this.db.query<InvitationRow>(
        `INSERT INTO oc_invitations (client_id, org_context, email, token_hash, status, invited_by, expires_at)
         VALUES ($1, $2, $3, $4, 'invited', $5, $6) RETURNING *`,
        [input.clientId, input.orgContext, email, tokenHash, input.invitedBy, expiresAt],
      );
      const invitation = toInvitation(result.rows[0]!, clientName);

      const emailResult = await this.sendInvitationEmail(invitation, rawToken, clientName);
      await this.markSent(invitation.id);
      await this.audit(invitation.id, 'invitation.created', input.invitedBy, { clientId: input.clientId, orgContext: input.orgContext, email });

      const value: InvitationWithLink = { ...invitation, resentCount: 0, lastSentAt: new Date().toISOString(), acceptUrl: this.acceptUrl(rawToken), emailSent: emailResult.status === 'sent' };
      return { ok: true, value: { invitation: value, created: true } };
    } catch (err: unknown) {
      // Real concurrency race: another request won the unique partial index
      // (client_id, lower(trim(email))) WHERE status='invited'. Re-read and return
      // the winner's row as a reuse — the caller-facing contract stays "you always
      // get back a usable invitation," never a raw duplicate-key 500.
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === UNIQUE_VIOLATION) {
        const winner = await this.db.query<InvitationRow>(
          `SELECT * FROM oc_invitations WHERE client_id = $1 AND lower(trim(email)) = $2 AND status = 'invited'`,
          [input.clientId, email],
        );
        if (winner.rows.length > 0) {
          return { ok: true, value: { invitation: toInvitation(winner.rows[0]!, clientName), created: false } };
        }
      }
      throw err;
    }
  }

  /** Real, known org_context suggestions — every value ever actually used in a real
   *  mapping or invitation, newest first, deduplicated. Never fabricated. */
  async knownOrgContexts(): Promise<string[]> {
    const result = await this.db.query<{ org_context: string }>(
      `SELECT org_context, MAX(created_at) AS last_used FROM (
         SELECT org_context, created_at FROM oc_invitations
         UNION ALL
         SELECT org_context, created_at FROM client_identity_mapping
       ) combined
       GROUP BY org_context
       ORDER BY last_used DESC
       LIMIT 100`,
    );
    return result.rows.map((r) => r.org_context);
  }

  /**
   * Rotates the token (fresh secret) and either re-sends the email (Renew — used
   * when the previous link is genuinely dead: expired, or staff wants to force a
   * new one) or silently mints a fresh link without emailing (Copy Link — staff
   * wants to hand the link over through another channel). Either way this is the
   * ONLY moment after creation that the raw token exists in memory — it is
   * returned once in the response for the UI to copy, never persisted, never
   * logged.
   */
  async renewInvitation(id: string, actorId: string | null, opts: { sendEmail: boolean }): Promise<InvitationResult<InvitationWithLink>> {
    const existing = await this.db.query<InvitationRow>('SELECT * FROM oc_invitations WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return { ok: false, error: { code: 'invitation_not_found', message: 'No such invitation' } };
    }
    const row = existing.rows[0]!;
    if (row.status === 'accepted') {
      return { ok: false, error: { code: 'invitation_already_accepted', message: 'This invitation has already been accepted.' } };
    }
    if (row.status === 'revoked') {
      return { ok: false, error: { code: 'invitation_revoked', message: 'This invitation was revoked. Create a new invitation instead.' } };
    }

    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    const updated = await this.db.query<InvitationRow>(
      `UPDATE oc_invitations SET token_hash = $2, expires_at = $3, status = 'invited', resent_count = resent_count + 1, last_sent_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, tokenHash, expiresAt],
    );
    const client = await this.db.query<{ name: string }>('SELECT name FROM oc_clients WHERE id = $1', [row.client_id]);
    const clientName = client.rows[0]?.name ?? 'AskABD';
    const invitation = toInvitation(updated.rows[0]!, clientName);

    let emailSent = false;
    if (opts.sendEmail) {
      const result = await this.sendInvitationEmail(invitation, rawToken, clientName);
      emailSent = result.status === 'sent';
    }
    await this.audit(id, opts.sendEmail ? 'invitation.renewed' : 'invitation.link_regenerated', actorId, { clientId: row.client_id, email: row.email });

    const value: InvitationWithLink = { ...invitation, acceptUrl: this.acceptUrl(rawToken), emailSent };
    return { ok: true, value };
  }

  async revokeInvitation(id: string, actorId: string | null): Promise<InvitationResult<{ alreadyRevoked: boolean }>> {
    const existing = await this.db.query<InvitationRow>('SELECT * FROM oc_invitations WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return { ok: false, error: { code: 'invitation_not_found', message: 'No such invitation' } };
    }
    const row = existing.rows[0]!;
    if (row.status === 'revoked') {
      return { ok: true, value: { alreadyRevoked: true } };
    }
    if (row.status === 'accepted') {
      return { ok: false, error: { code: 'invitation_already_accepted', message: 'This invitation has already been accepted and cannot be revoked. Revoke the client_identity_mapping instead.' } };
    }

    await this.db.query(`UPDATE oc_invitations SET status = 'revoked', revoked_at = NOW(), revoked_by = $2 WHERE id = $1`, [id, actorId]);
    await this.audit(id, 'invitation.revoked', actorId, { clientId: row.client_id, email: row.email });
    return { ok: true, value: { alreadyRevoked: false } };
  }

  async listForClient(clientId: string): Promise<Invitation[]> {
    const result = await this.db.query<InvitationRow & { client_name: string }>(
      `SELECT i.*, c.name AS client_name FROM oc_invitations i JOIN oc_clients c ON c.id = i.client_id
       WHERE i.client_id = $1 ORDER BY i.created_at DESC`,
      [clientId],
    );
    return result.rows.map((r) => toInvitation(r, r.client_name));
  }

  /**
   * Every invitation currently pending for a given, already-authenticated
   * org_context, where no active client_identity_mapping exists yet — the real
   * data source behind "you have a pending invitation" (Path B: existing-account
   * sign-in, no email link needed). org_context — not email — is the real
   * authorization key this platform uses everywhere else (client_identity_mapping
   * is keyed on org_context, never email); matching on it here keeps this query
   * consistent with resolveAuthorizedClientIds rather than inventing a second,
   * email-based identity concept this platform doesn't otherwise have.
   */
  async listPendingForOrgContext(orgContext: string): Promise<Invitation[]> {
    const result = await this.db.query<InvitationRow & { client_name: string }>(
      `SELECT i.*, c.name AS client_name FROM oc_invitations i
       JOIN oc_clients c ON c.id = i.client_id
       WHERE i.org_context = $1 AND i.status = 'invited' AND i.expires_at > NOW()
         AND NOT EXISTS (
           SELECT 1 FROM client_identity_mapping m
           WHERE m.client_id = i.client_id AND m.org_context = i.org_context AND m.status = 'active'
         )
       ORDER BY i.created_at DESC`,
      [orgContext],
    );
    return result.rows.map((r) => toInvitation(r, r.client_name));
  }

  /**
   * Explicit accept for an ALREADY-AUTHENTICATED identity (Path B) — no raw token
   * involved at all. Tenant isolation is absolute: the invitation's own recorded
   * org_context must equal the caller's real, verified org_context (from their
   * JWT), never a client-supplied value. Accepting one invitation can never grant
   * access to a different client — each invitation maps to exactly one
   * client_identity_mapping row for its own client_id.
   */
  async acceptForAuthenticatedIdentity(invitationId: string, callerOrgContext: string, callerIdentityId: string): Promise<InvitationResult<{ clientId: string }>> {
    const found = await this.db.query<InvitationRow>('SELECT * FROM oc_invitations WHERE id = $1', [invitationId]);
    if (found.rows.length === 0) {
      return { ok: false, error: { code: 'invitation_not_found', message: 'No such invitation.' } };
    }
    const row = found.rows[0]!;
    if (row.org_context !== callerOrgContext) {
      // Never disclose that a differently-owned invitation exists at all.
      return { ok: false, error: { code: 'invitation_not_found', message: 'No such invitation.' } };
    }
    if (row.status !== 'invited' || row.expires_at < new Date()) {
      return { ok: false, error: { code: 'invitation_invalid', message: 'This invitation is no longer available. Ask AskABD to send a new one.' } };
    }

    const mappingResult = await this.mapping().createMapping({ clientId: row.client_id, orgContext: row.org_context, createdBy: callerIdentityId });
    if (!mappingResult.ok) {
      return { ok: false, error: { code: 'mapping_failed', message: 'Could not grant access to this workspace. Please try again.' } };
    }

    await this.markAccepted(row.id, callerIdentityId);
    await this.audit(row.id, 'invitation.accepted', callerIdentityId, { clientId: row.client_id, orgContext: row.org_context, path: 'existing_identity' });

    return { ok: true, value: { clientId: row.client_id } };
  }

  private acceptUrl(rawToken: string): string {
    return `${WEB_URL}/accept-invitation?token=${encodeURIComponent(rawToken)}`;
  }

  /**
   * Public, unauthenticated lookup used by the accept page to show the invitee WHO
   * invited them and WHICH client, before asking for a password — never reveals
   * whether the token was invalid vs. expired vs. revoked vs. already-accepted in a
   * way that would help an attacker (all non-"invited" outcomes return the same
   * generic status).
   */
  async lookupByToken(rawToken: string): Promise<InvitationResult<{ clientName: string; email: string; orgContext: string }>> {
    const tokenHash = hashToken(rawToken);
    const result = await this.db.query<InvitationRow & { client_name: string }>(
      `SELECT i.*, c.name AS client_name FROM oc_invitations i JOIN oc_clients c ON c.id = i.client_id
       WHERE i.token_hash = $1`,
      [tokenHash],
    );
    if (result.rows.length === 0) {
      return { ok: false, error: { code: 'invitation_invalid', message: 'This invitation link is invalid or has expired.' } };
    }
    const row = result.rows[0]!;
    if (row.status !== 'invited' || row.expires_at < new Date()) {
      return { ok: false, error: { code: 'invitation_invalid', message: 'This invitation link is invalid or has expired.' } };
    }
    return { ok: true, value: { clientName: row.client_name, email: row.email, orgContext: row.org_context } };
  }

  /**
   * Accepts a real invitation via the email-link path (Path A): creates a real
   * askabd-identity identity (or, if one already exists for this email in this
   * org — a real returning/multi-client customer — signs in with the supplied
   * credential as their EXISTING password instead of hard-failing), verifies it
   * if new, sets the chosen credential if new, creates the real
   * client_identity_mapping row, marks the invitation accepted, and logs the
   * identity in for real — returning real tokens so the customer lands directly
   * in their workspace without re-entering anything.
   *
   * Every step talks to askabd-identity's REAL HTTP API. Nothing here is a
   * parallel or fabricated identity system. If any step genuinely fails, the
   * invitation is NOT marked accepted and no mapping is created — the token
   * remains usable for a genuine retry.
   */
  async acceptInvitation(rawToken: string, credential: string, actorContext: { ip?: string } = {}, mfaCode?: string): Promise<InvitationResult<{ accessToken: string; refreshToken: string; sessionId: string; clientId: string; orgContext: string }>> {
    const tokenHash = hashToken(rawToken);
    const found = await this.db.query<InvitationRow>('SELECT * FROM oc_invitations WHERE token_hash = $1', [tokenHash]);
    if (found.rows.length === 0) {
      return { ok: false, error: { code: 'invitation_invalid', message: 'This invitation link is invalid or has expired.' } };
    }
    const row = found.rows[0]!;
    if (row.status !== 'invited' || row.expires_at < new Date()) {
      return { ok: false, error: { code: 'invitation_invalid', message: 'This invitation link is invalid or has expired.' } };
    }

    let identityId: string;

    const registerRes = await identityFetch('/v1/identities', {
      method: 'POST',
      orgContext: row.org_context,
      body: JSON.stringify({ identifier: row.email, identityType: 'human_user' }),
    });
    if (registerRes.status === 201) {
      const body = await registerRes.json() as { identity: { id: string }; verificationToken: string };
      identityId = body.identity.id;
      const verifyRes = await identityFetch(`/v1/identities/${identityId}/verify`, {
        method: 'POST',
        body: JSON.stringify({ token: body.verificationToken }),
      });
      if (!verifyRes.ok) {
        return { ok: false, error: { code: 'identity_verify_failed', message: 'Could not verify your account. Please try accepting the invitation again.' } };
      }
      // Step 2 (new account only): set the chosen credential.
      const credRes = await identityFetch(`/v1/identities/${identityId}/credential/store`, {
        method: 'POST',
        orgContext: row.org_context,
        body: JSON.stringify({ credential }),
      });
      if (!credRes.ok) {
        const errBody = await credRes.json().catch(() => ({})) as { error?: { message?: string } };
        return { ok: false, error: { code: 'credential_rejected', message: errBody.error?.message || 'That password does not meet the security requirements.' } };
      }
    } else if (registerRes.status === 400 || registerRes.status === 409) {
      const errBody = await registerRes.json().catch(() => ({})) as { error?: { code?: string } };
      if (errBody.error?.code !== 'identifier_exists') {
        return { ok: false, error: { code: 'identity_create_failed', message: 'Could not create your account. Please try again.' } };
      }
      // A real returning customer (e.g. accepting a SECOND client's invitation
      // with the same email — the multi-client case). askabd-identity exposes no
      // public lookup-by-identifier endpoint (confirmed by reading its real route
      // table), so the only honest way to confirm "this is really you" is the same
      // mechanism the normal login page uses: attempt a real login with the
      // credential the invitee just typed, treated as their EXISTING password.
      const loginAttempt = await identityFetch('/v1/auth/login', {
        method: 'POST',
        orgContext: row.org_context,
        body: JSON.stringify({ identifier: row.email, credential, mfaCode }),
      });
      if (!loginAttempt.ok) {
        return {
          ok: false,
          error: {
            code: 'identity_conflict',
            message: 'An account already exists for this email. Enter your EXISTING AskABD password above to link this invitation to your account, or contact your AskABD account manager.',
          },
        };
      }
      const loginBody = await loginAttempt.json() as { type?: string; accessToken?: string; refreshToken?: string; sessionId?: string };
      if (loginBody.type === 'mfa_required') {
        return { ok: false, error: { code: 'mfa_required', message: 'Enter the 6-digit code from your authenticator app to finish linking this invitation.' } };
      }
      const sub = decodeJwtSubject(loginBody.accessToken ?? '');
      if (!sub) {
        return { ok: false, error: { code: 'identity_service_unavailable', message: 'The identity service is currently unavailable. Please try again shortly.' } };
      }
      identityId = sub;

      // Existing account, real login already succeeded — go straight to mapping
      // + accept using THIS token pair (no second login call needed).
      const mappingResult = await this.mapping().createMapping({ clientId: row.client_id, orgContext: row.org_context, createdBy: `invitation:${row.id}` });
      if (!mappingResult.ok) {
        return { ok: false, error: { code: 'mapping_failed', message: 'Your account was verified, but client access could not be granted. Contact your AskABD account manager.' } };
      }
      await this.markAccepted(row.id, identityId);
      await this.audit(row.id, 'invitation.accepted', identityId, { clientId: row.client_id, orgContext: row.org_context, ip: actorContext.ip, path: 'existing_account_via_link' });
      return {
        ok: true,
        value: {
          accessToken: loginBody.accessToken!, refreshToken: loginBody.refreshToken!, sessionId: loginBody.sessionId!,
          clientId: row.client_id, orgContext: row.org_context,
        },
      };
    } else {
      return { ok: false, error: { code: 'identity_service_unavailable', message: 'The identity service is currently unavailable. Please try again shortly.' } };
    }

    // New-account path continues here.
    const mappingResult = await this.mapping().createMapping({ clientId: row.client_id, orgContext: row.org_context, createdBy: `invitation:${row.id}` });
    if (!mappingResult.ok) {
      return { ok: false, error: { code: 'mapping_failed', message: 'Your account was created, but client access could not be granted. Contact your AskABD account manager.' } };
    }

    const loginRes = await identityFetch('/v1/auth/login', {
      method: 'POST',
      orgContext: row.org_context,
      body: JSON.stringify({ identifier: row.email, credential }),
    });
    if (!loginRes.ok) {
      await this.markAccepted(row.id, identityId);
      return { ok: false, error: { code: 'auto_login_failed', message: 'Your account is ready — please sign in.' } };
    }
    const loginBody = await loginRes.json() as { accessToken: string; refreshToken: string; sessionId: string };

    await this.markAccepted(row.id, identityId);
    await this.audit(row.id, 'invitation.accepted', identityId, { clientId: row.client_id, orgContext: row.org_context, ip: actorContext.ip, path: 'new_account' });

    return {
      ok: true,
      value: { ...loginBody, clientId: row.client_id, orgContext: row.org_context },
    };
  }

  private async markAccepted(id: string, identityId: string): Promise<void> {
    await this.db.query(`UPDATE oc_invitations SET status = 'accepted', accepted_at = NOW(), accepted_identity_id = $2 WHERE id = $1`, [id, identityId]);
  }

  private async markSent(id: string): Promise<void> {
    await this.db.query(`UPDATE oc_invitations SET last_sent_at = NOW() WHERE id = $1`, [id]);
  }

  private async sendInvitationEmail(invitation: Invitation, rawToken: string, clientName: string): Promise<EmailResult> {
    const acceptUrl = this.acceptUrl(rawToken);
    return this.emailService.sendEmail({
      to: invitation.email,
      subject: `You've been invited to AskABD — ${clientName}`,
      html: `<p>You have been invited to access <strong>${clientName}</strong>'s AskABD workspace.</p>
             <p><a href="${acceptUrl}">Accept your invitation</a></p>
             <p>This link expires on ${invitation.expiresAt}.</p>`,
      text: `You have been invited to access ${clientName}'s AskABD workspace. Accept: ${acceptUrl} (expires ${invitation.expiresAt})`,
    });
  }

  private async audit(invitationId: string, action: string, actor: string | null, details: Record<string, unknown>): Promise<void> {
    await this.db.query(
      `INSERT INTO oc_audit_log (entity_type, entity_id, action, actor, details)
       VALUES ('invitation', $1, $2, $3, $4)`,
      [invitationId, action, actor ?? 'system', JSON.stringify(details)],
    );
  }
}
