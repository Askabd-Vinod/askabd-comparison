/**
 * Client ↔ Identity-Organization Mapping Service
 *
 * The real, database-backed answer to "which askabd-comparison client(s) is this
 * authenticated identity's organization entitled to see?" — see migration
 * 024_client_identity_mapping.sql for the full rationale and schema.
 *
 * This is the ONLY place client-scope resolution happens. Callers (tenant-access.ts)
 * pass the org_context read from a verified JWT claim and get back the server-resolved
 * set of authorized client IDs — never the other way around. A client ID supplied by a
 * request (URL param, body, query) is only ever checked for MEMBERSHIP in this
 * server-resolved set; it never expands or overrides it.
 */
import type { DbClient } from '../db/connection.js';
import { getPool } from '../db/connection.js';

export interface ClientIdentityMapping {
  id: string;
  clientId: string;
  orgContext: string;
  status: 'active' | 'revoked';
  createdAt: string;
  createdBy: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
}

export type MappingResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } };

interface MappingRow {
  id: string;
  client_id: string;
  org_context: string;
  status: 'active' | 'revoked';
  created_at: Date;
  created_by: string | null;
  revoked_at: Date | null;
  revoked_by: string | null;
}

function toMapping(row: MappingRow): ClientIdentityMapping {
  return {
    id: row.id,
    clientId: row.client_id,
    orgContext: row.org_context,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    createdBy: row.created_by,
    revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null,
    revokedBy: row.revoked_by,
  };
}

export class ClientIdentityMappingService {
  constructor(private readonly db: DbClient = getPool()) {}

  /**
   * The core authorization primitive: resolve the full set of client IDs this
   * org_context is currently, actively authorized to access. Never trusts any
   * client-supplied value — the org_context itself must already have come from a
   * verified JWT claim (request.auth.tenantId) before this is called.
   */
  async resolveAuthorizedClientIds(orgContext: string): Promise<string[]> {
    // Case-insensitive comparison (2026-08-20, closing a real edge case found
    // during the org_context normalization audit): askabd-identity's login now
    // always issues a token carrying an identity's CANONICAL, as-first-stored
    // org_context regardless of what the user typed (see auth-service.ts's
    // findIdentity doc). That alone fixes the common case. The one remaining
    // gap: two different staff members could type the same real organization
    // in different casing across two separate invitations
    // (invitation-service.ts stores org_context exactly as staff typed it, by
    // design — see its own docs on why org_context is never silently
    // rewritten). Comparing case-insensitively here — a read-only change,
    // never touching what's actually stored — closes that gap without any
    // data migration or risk to the write path.
    const result = await this.db.query<{ client_id: string }>(
      `SELECT client_id FROM client_identity_mapping WHERE LOWER(org_context) = LOWER($1) AND status = 'active'`,
      [orgContext],
    );
    return result.rows.map((r) => r.client_id);
  }

  /** True only if this (orgContext, clientId) pair has an active mapping —
   *  case-insensitive on org_context, see resolveAuthorizedClientIds's doc. */
  async isAuthorized(orgContext: string, clientId: string): Promise<boolean> {
    const result = await this.db.query<{ id: string }>(
      `SELECT id FROM client_identity_mapping WHERE LOWER(org_context) = LOWER($1) AND client_id = $2 AND status = 'active'`,
      [orgContext, clientId],
    );
    return result.rows.length > 0;
  }

  /**
   * Creates (or reactivates a previously-revoked) mapping. `createdBy` must be a real
   * identity ID (the acting admin's `sub` claim) — never fabricated, never defaulted to
   * a placeholder string for a real request; only truly system/migration-originated
   * mappings may omit it.
   */
  async createMapping(input: { clientId: string; orgContext: string; createdBy: string | null }): Promise<MappingResult<ClientIdentityMapping>> {
    const clientExists = await this.db.query<{ id: string }>('SELECT id FROM oc_clients WHERE id = $1', [input.clientId]);
    if (clientExists.rows.length === 0) {
      return { ok: false, error: { code: 'client_not_found', message: `No client with id ${input.clientId}` } };
    }

    const result = await this.db.query<MappingRow>(
      `INSERT INTO client_identity_mapping (client_id, org_context, status, created_by)
       VALUES ($1, $2, 'active', $3)
       ON CONFLICT (client_id, org_context)
       DO UPDATE SET status = 'active', revoked_at = NULL, revoked_by = NULL, created_by = EXCLUDED.created_by
       RETURNING *`,
      [input.clientId, input.orgContext, input.createdBy],
    );
    const mapping = toMapping(result.rows[0]!);

    await this.db.query(
      `INSERT INTO oc_audit_log (entity_type, entity_id, entity_name, action, actor, details)
       VALUES ('client_identity_mapping', $1, $2, 'created', $3, $4)`,
      [mapping.id, `${input.orgContext} -> ${input.clientId}`, input.createdBy ?? 'system',
       JSON.stringify({ clientId: input.clientId, orgContext: input.orgContext })],
    );

    return { ok: true, value: mapping };
  }

  /** Idempotent — revoking an already-revoked or nonexistent mapping is a safe no-op, reported honestly. */
  async revokeMapping(input: { clientId: string; orgContext: string; revokedBy: string | null }): Promise<MappingResult<{ alreadyRevoked: boolean }>> {
    const existing = await this.db.query<MappingRow>(
      `SELECT * FROM client_identity_mapping WHERE client_id = $1 AND org_context = $2`,
      [input.clientId, input.orgContext],
    );
    if (existing.rows.length === 0) {
      return { ok: false, error: { code: 'mapping_not_found', message: 'No such mapping exists' } };
    }
    if (existing.rows[0]!.status === 'revoked') {
      return { ok: true, value: { alreadyRevoked: true } };
    }

    const result = await this.db.query<MappingRow>(
      `UPDATE client_identity_mapping SET status = 'revoked', revoked_at = NOW(), revoked_by = $3
       WHERE client_id = $1 AND org_context = $2 RETURNING *`,
      [input.clientId, input.orgContext, input.revokedBy],
    );
    const mapping = toMapping(result.rows[0]!);

    await this.db.query(
      `INSERT INTO oc_audit_log (entity_type, entity_id, entity_name, action, actor, details)
       VALUES ('client_identity_mapping', $1, $2, 'revoked', $3, $4)`,
      [mapping.id, `${input.orgContext} -> ${input.clientId}`, input.revokedBy ?? 'system',
       JSON.stringify({ clientId: input.clientId, orgContext: input.orgContext })],
    );

    return { ok: true, value: { alreadyRevoked: false } };
  }

  async listMappingsForOrg(orgContext: string): Promise<ClientIdentityMapping[]> {
    const result = await this.db.query<MappingRow>(
      `SELECT * FROM client_identity_mapping WHERE org_context = $1 ORDER BY created_at DESC`,
      [orgContext],
    );
    return result.rows.map(toMapping);
  }

  async listMappingsForClient(clientId: string): Promise<ClientIdentityMapping[]> {
    const result = await this.db.query<MappingRow>(
      `SELECT * FROM client_identity_mapping WHERE client_id = $1 ORDER BY created_at DESC`,
      [clientId],
    );
    return result.rows.map(toMapping);
  }
}
