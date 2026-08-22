/**
 * Client Invitation Routes — the real onboarding entry point.
 *
 * Admin-facing create/list/renew/copy-link/revoke (gated to Admin.Access via
 * platform/rbac/rules.ts) plus three intentionally PUBLIC endpoints — `lookup` and
 * `accept` (no token exists yet for a brand-new customer clicking an email link)
 * and `/oc/invitations/accept` also handles the real returning-customer
 * (multi-client) case. Registered outside `/api/v1/oc/` prefix's tenant-access
 * boundary is not relevant here: these routes take no `:clientId` URL param (the
 * client is resolved server-side from the invitation's own `token_hash` lookup), so
 * tenant-access.ts's boundary does not apply, by design — the token itself IS the
 * authorization for these two specific actions.
 *
 * The authenticated-customer "pending invitations" surface (Path B — an existing
 * AskABD account discovering and accepting an invitation with no link at all) lives
 * in operations-center-routes.ts alongside `/oc/me`, since it is keyed off the
 * caller's own verified org_context, not an invitation token.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { InvitationService } from '../services/invitation-service.js';
import { getAuth } from '../middleware/auth.js';

export async function invitationRoutes(server: FastifyInstance): Promise<void> {
  const invitationService = new InvitationService();

  // ─── Admin-facing (authenticated, Admin.Access — see platform/rbac/rules.ts) ────

  server.post('/oc/clients/:clientId/invitations', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId } = req.params as { clientId: string };
    const body = req.body as { email?: string; orgContext?: string };
    if (!body.email || !body.orgContext) {
      return reply.status(400).send({ error: { code: 'missing_fields', message: 'email and orgContext are required' } });
    }
    const auth = getAuth(req);
    const result = await invitationService.createInvitation({ clientId, orgContext: body.orgContext, email: body.email, invitedBy: auth?.userId ?? null });
    if (!result.ok) {
      const status = result.error.code === 'client_not_found' ? 404
        : result.error.code === 'invalid_email' ? 400
        : result.error.code === 'already_a_member' ? 409
        : 400;
      return reply.status(status).send({ error: result.error });
    }
    // 201 only for a genuinely brand-new row; a reused/renewed existing invitation
    // is a 200 — never claim "created" for something that already existed.
    reply.status(result.value.created ? 201 : 200).send({ invitation: result.value.invitation, reused: !result.value.created });
  });

  server.get('/oc/clients/:clientId/invitations', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    const invitations = await invitationService.listForClient(clientId);
    return { invitations };
  });

  /** Renew — rotates the token AND re-sends the real email. Used when an
   *  invitation has genuinely expired (or staff wants to force a fresh link). */
  server.post('/oc/invitations/:id/renew', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const auth = getAuth(req);
    const result = await invitationService.renewInvitation(id, auth?.userId ?? null, { sendEmail: true });
    if (!result.ok) {
      const status = result.error.code === 'invitation_not_found' ? 404 : 409;
      return reply.status(status).send({ error: result.error });
    }
    reply.send({ invitation: result.value });
  });

  /** Copy Link — rotates the token but does NOT send another email; the raw
   *  accept URL is returned once for staff to copy and hand over directly. */
  server.post('/oc/invitations/:id/link', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const auth = getAuth(req);
    const result = await invitationService.renewInvitation(id, auth?.userId ?? null, { sendEmail: false });
    if (!result.ok) {
      const status = result.error.code === 'invitation_not_found' ? 404 : 409;
      return reply.status(status).send({ error: result.error });
    }
    reply.send({ invitation: result.value });
  });

  /** Deprecated alias, kept for compatibility — identical to /renew (rotate +
   *  email). New UI uses /renew or /link; do not add new callers of this path. */
  server.post('/oc/invitations/:id/resend', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const auth = getAuth(req);
    const result = await invitationService.renewInvitation(id, auth?.userId ?? null, { sendEmail: true });
    if (!result.ok) {
      const status = result.error.code === 'invitation_not_found' ? 404 : 409;
      return reply.status(status).send({ error: result.error });
    }
    reply.send({ invitation: result.value });
  });

  server.post('/oc/invitations/:id/revoke', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const auth = getAuth(req);
    const result = await invitationService.revokeInvitation(id, auth?.userId ?? null);
    if (!result.ok) {
      const status = result.error.code === 'invitation_not_found' ? 404 : 409;
      return reply.status(status).send({ error: result.error });
    }
    reply.send(result.value);
  });

  /** Real, known org_context suggestions for the create-invitation form — never a
   *  fabricated list, drawn from actual prior mappings + invitations. Lets staff
   *  pick a previously-used customer organization instead of typing blind, while
   *  still allowing a genuinely new org_context to be typed (a free-form field
   *  backed by a <datalist>, not a rigid enum — a brand-new customer organization
   *  is a legitimate, common case this must not block). */
  server.get('/oc/org-contexts', async () => {
    const result = await invitationService.knownOrgContexts();
    return { orgContexts: result };
  });

  // ─── Public — no token exists yet for a brand-new customer ──────────────────────

  server.get('/oc/invitations/lookup', async (req: FastifyRequest, reply: FastifyReply) => {
    const { token } = req.query as { token?: string };
    if (!token) return reply.status(400).send({ error: { code: 'missing_token', message: 'token is required' } });
    const result = await invitationService.lookupByToken(token);
    if (!result.ok) return reply.status(404).send({ error: result.error });
    return result.value;
  });

  server.post('/oc/invitations/accept', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { token?: string; credential?: string; mfaCode?: string };
    if (!body.token || !body.credential) {
      return reply.status(400).send({ error: { code: 'missing_fields', message: 'token and credential are required' } });
    }
    const result = await invitationService.acceptInvitation(body.token, body.credential, { ip: req.ip }, body.mfaCode);
    if (!result.ok) {
      const status = result.error.code === 'invitation_invalid' ? 404
        : result.error.code === 'identity_conflict' ? 409
        : result.error.code === 'mfa_required' ? 401
        : result.error.code === 'credential_rejected' ? 400
        : result.error.code === 'auto_login_failed' ? 202 // account WAS created — not a failure
        : 502;
      return reply.status(status).send({ error: result.error });
    }
    reply.send(result.value);
  });
}
