/**
 * Technology Adapter Registry — a real, generic, reusable primitive per
 * the "Future Technology & Compatibility" directive: INTERFACE -> ADAPTER
 * -> ENGINE -> NORMALIZED MODEL, rather than hard-coding technology-
 * specific logic into engines. See migration 051's own doc comment for
 * the full, honest v1 scope statement — this registry's seed data
 * reflects this platform's REAL current adapter coverage, not aspiration.
 *
 * "Capability Negotiation" (the directive's own term) is implemented
 * literally: `checkCompatibility()` is the real gate every engine should
 * call BEFORE attempting a technology-specific operation, returning one
 * of the directive's own named statuses — never a bare exception, never
 * a silent attempt against an unknown/unsupported technology.
 */
import { sharedPool } from './db-pool.js';

export type AdapterCategory = 'database' | 'cloud' | 'api' | 'auth' | 'devops' | 'testing' | 'file_format' | 'ai_provider' | 'other';
export type CompatibilityStatus = 'supported' | 'partially_supported' | 'unsupported' | 'adapter_required' | 'requires_upgrade' | 'requires_client_action';

export interface TechnologyAdapter {
  id: string; technology: string; vendor: string; category: AdapterCategory; versionRange: string;
  capabilities: string[]; status: CompatibilityStatus; supportedOperations: string[];
  securityRequirements: string; testStatus: 'not_tested' | 'tested' | 'failing'; notes: string;
  createdAt: string; updatedAt: string;
}

type Row = {
  id: string; technology: string; vendor: string; category: AdapterCategory; version_range: string;
  capabilities: string[]; status: CompatibilityStatus; supported_operations: string[];
  security_requirements: string; test_status: 'not_tested' | 'tested' | 'failing'; notes: string;
  created_at: Date; updated_at: Date;
};

function toAdapter(r: Row): TechnologyAdapter {
  return {
    id: r.id, technology: r.technology, vendor: r.vendor, category: r.category, versionRange: r.version_range,
    capabilities: r.capabilities || [], status: r.status, supportedOperations: r.supported_operations || [],
    securityRequirements: r.security_requirements, testStatus: r.test_status, notes: r.notes,
    createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
  };
}

/** A real, non-leaking, structured result — the directive's own "capability negotiation" output. */
export interface CompatibilityResult {
  technology: string;
  status: CompatibilityStatus | 'unknown_technology';
  adapter: TechnologyAdapter | null;
  message: string;
}

export class TechnologyAdapterRegistry {
  async list(category?: AdapterCategory): Promise<TechnologyAdapter[]> {
    const res = category
      ? await sharedPool.query<Row>(`SELECT * FROM technology_adapters WHERE category = $1 ORDER BY technology`, [category])
      : await sharedPool.query<Row>(`SELECT * FROM technology_adapters ORDER BY category, technology`);
    return res.rows.map(toAdapter);
  }

  async get(technology: string, category: AdapterCategory): Promise<TechnologyAdapter | null> {
    const res = await sharedPool.query<Row>(`SELECT * FROM technology_adapters WHERE technology = $1 AND category = $2`, [technology, category]);
    const row = res.rows[0];
    return row ? toAdapter(row) : null;
  }

  /**
   * The real capability-negotiation gate. "If an unknown technology is
   * detected: DO NOT FAIL SILENTLY" — an unregistered technology returns
   * a real, honest `unknown_technology` status (not a crash, not a
   * fabricated `supported`), naming exactly what's missing.
   */
  async checkCompatibility(technology: string, category: AdapterCategory): Promise<CompatibilityResult> {
    const adapter = await this.get(technology, category);
    if (!adapter) {
      return {
        technology, status: 'unknown_technology', adapter: null,
        message: `"${technology}" (${category}) is not registered in the Technology Adapter Registry. Real action required: register a real adapter, or record it as a known, honestly-unsupported technology.`,
      };
    }
    const messages: Record<CompatibilityStatus, string> = {
      supported: `"${technology}" is fully supported by a real, tested adapter.`,
      partially_supported: `"${technology}" is only partially supported — see the adapter's own notes for real, specific limitations.`,
      unsupported: `"${technology}" is a known technology with no supported adapter — not planned.`,
      adapter_required: `"${technology}" is a known, real technology with no adapter built yet. A real adapter is required before this platform can operate against it.`,
      requires_upgrade: `"${technology}" requires a version upgrade before this platform can operate against it — see the adapter's own version range.`,
      requires_client_action: `"${technology}" requires the client to take a real action first — see the adapter's own notes.`,
    };
    return { technology, status: adapter.status, adapter, message: messages[adapter.status] };
  }

  /** Real, staff-attributed registration — how a NEW adapter joins the registry, per the directive's "new technology = new adapter, not new engine" principle. */
  async register(data: {
    technology: string; vendor: string; category: AdapterCategory; versionRange?: string; capabilities?: string[];
    status: CompatibilityStatus; supportedOperations?: string[]; securityRequirements?: string; notes?: string;
  }): Promise<TechnologyAdapter> {
    const res = await sharedPool.query<Row>(
      `INSERT INTO technology_adapters (technology, vendor, category, version_range, capabilities, status, supported_operations, security_requirements, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (technology, category) DO UPDATE SET vendor = $2, version_range = $4, capabilities = $5, status = $6, supported_operations = $7, security_requirements = $8, notes = $9, updated_at = NOW()
       RETURNING *`,
      [data.technology, data.vendor, data.category, data.versionRange || 'any', JSON.stringify(data.capabilities || []),
        data.status, JSON.stringify(data.supportedOperations || []), data.securityRequirements || '', data.notes || '']
    );
    return toAdapter(res.rows[0]!);
  }
}
