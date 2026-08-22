/**
 * Staff Role Service — the real, database-backed source of "which AskABD roles does
 * this identity have." See migration 026_staff_role_assignment.sql for the full
 * rationale: real askabd-identity tokens carry no `roles` claim, so this table (not
 * the JWT) is the authoritative source for any identity that needs elevated access —
 * exactly the same pattern already proven for client_identity_mapping.
 *
 * An identity with ZERO active rows here is, by definition, not AskABD staff — every
 * real customer identity created via the invitation flow never gets a row here, so
 * they naturally resolve to no elevated roles anywhere this service is consulted.
 */
import type { DbClient } from '../db/connection.js';
import { getPool } from '../db/connection.js';

export interface StaffRoleAssignment {
  id: string;
  identityId: string;
  role: string;
  status: 'active' | 'revoked';
  grantedAt: string;
  grantedBy: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
}

export type StaffRoleResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } };

interface RoleRow {
  id: string;
  identity_id: string;
  role: string;
  status: 'active' | 'revoked';
  granted_at: Date;
  granted_by: string | null;
  revoked_at: Date | null;
  revoked_by: string | null;
}

function toAssignment(row: RoleRow): StaffRoleAssignment {
  return {
    id: row.id,
    identityId: row.identity_id,
    role: row.role,
    status: row.status,
    grantedAt: row.granted_at.toISOString(),
    grantedBy: row.granted_by,
    revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null,
    revokedBy: row.revoked_by,
  };
}

export class StaffRoleService {
  constructor(private readonly db: DbClient = getPool()) {}

  /** The real, server-side source of an identity's roles — never the JWT. */
  async getActiveRoles(identityId: string): Promise<string[]> {
    const result = await this.db.query<{ role: string }>(
      `SELECT role FROM staff_role_assignment WHERE identity_id = $1 AND status = 'active'`,
      [identityId],
    );
    return result.rows.map((r) => r.role);
  }

  /** True only if this identity has ANY active role — the real definition of "is staff." */
  async isStaff(identityId: string): Promise<boolean> {
    const roles = await this.getActiveRoles(identityId);
    return roles.length > 0;
  }

  async grantRole(input: { identityId: string; role: string; grantedBy: string | null }): Promise<StaffRoleResult<StaffRoleAssignment>> {
    const result = await this.db.query<RoleRow>(
      `INSERT INTO staff_role_assignment (identity_id, role, status, granted_by)
       VALUES ($1, $2, 'active', $3)
       ON CONFLICT (identity_id, role)
       DO UPDATE SET status = 'active', revoked_at = NULL, revoked_by = NULL, granted_by = EXCLUDED.granted_by, granted_at = NOW()
       RETURNING *`,
      [input.identityId, input.role, input.grantedBy],
    );
    const assignment = toAssignment(result.rows[0]!);

    await this.audit(assignment.id, 'staff_role.granted', input.grantedBy, { identityId: input.identityId, role: input.role });
    return { ok: true, value: assignment };
  }

  async revokeRole(input: { identityId: string; role: string; revokedBy: string | null }): Promise<StaffRoleResult<{ alreadyRevoked: boolean }>> {
    const existing = await this.db.query<RoleRow>(
      `SELECT * FROM staff_role_assignment WHERE identity_id = $1 AND role = $2`,
      [input.identityId, input.role],
    );
    if (existing.rows.length === 0) {
      return { ok: false, error: { code: 'assignment_not_found', message: 'No such role assignment exists' } };
    }
    if (existing.rows[0]!.status === 'revoked') {
      return { ok: true, value: { alreadyRevoked: true } };
    }

    const result = await this.db.query<RoleRow>(
      `UPDATE staff_role_assignment SET status = 'revoked', revoked_at = NOW(), revoked_by = $3
       WHERE identity_id = $1 AND role = $2 RETURNING *`,
      [input.identityId, input.role, input.revokedBy],
    );
    const assignment = toAssignment(result.rows[0]!);
    await this.audit(assignment.id, 'staff_role.revoked', input.revokedBy, { identityId: input.identityId, role: input.role });
    return { ok: true, value: { alreadyRevoked: false } };
  }

  async listForIdentity(identityId: string): Promise<StaffRoleAssignment[]> {
    const result = await this.db.query<RoleRow>(
      `SELECT * FROM staff_role_assignment WHERE identity_id = $1 ORDER BY granted_at DESC`,
      [identityId],
    );
    return result.rows.map(toAssignment);
  }

  async listAll(): Promise<StaffRoleAssignment[]> {
    const result = await this.db.query<RoleRow>(
      `SELECT * FROM staff_role_assignment ORDER BY granted_at DESC`,
    );
    return result.rows.map(toAssignment);
  }

  private async audit(assignmentId: string, action: string, actor: string | null, details: Record<string, unknown>): Promise<void> {
    await this.db.query(
      `INSERT INTO oc_audit_log (entity_type, entity_id, action, actor, details)
       VALUES ('staff_role_assignment', $1, $2, $3, $4)`,
      [assignmentId, action, actor ?? 'system', JSON.stringify(details)],
    );
  }
}
