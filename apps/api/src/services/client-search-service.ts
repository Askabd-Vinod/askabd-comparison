/**
 * Client-scoped search — real, tenant-scoped search WITHIN one client's
 * workspace (Part 3, 2026-08-20 master UAT pass). Distinct from the existing
 * `/oc/search` (cross-client, staff-only, Admin.Access-gated) — this is the
 * "too many modules, I need to find one thing in THIS client" search the
 * lifecycle nav bar's own size makes necessary.
 *
 * Every result is a real row from a real table this platform already
 * maintains — never a fabricated/mock result, and never a table this client
 * doesn't actually have visibility into for the requesting scope.
 */
import type { DbClient } from '../db/connection.js';
import { getPool } from '../db/connection.js';

export interface SearchResult {
  id: string;
  name: string;
  type: string;   // 'requirement' | 'service' | 'connector' | 'problem' | 'gap' | ...
  status: string | null;
  module: string; // the client-workspace tab this result lives under
  url: string;    // where clicking this result should navigate
}

const dbPool = () => getPool();

async function safeQuery(db: DbClient, sql: string, params: unknown[]): Promise<any[]> {
  try {
    const res = await db.query(sql, params);
    return res.rows;
  } catch {
    return []; // a missing/renamed table must never break the whole search — degrade silently per-category
  }
}

/**
 * `scope: 'staff'` searches everything a staff member managing this client can
 * see (internal + customer-visible). `scope: 'customer'` searches only what a
 * customer session is ever shown elsewhere in the portal — the exact same
 * `visibility = 'customer'` filter CRM's own portal routes already use, never
 * a broader set a customer's own browser could otherwise infer exists.
 */
export async function searchClientWorkspace(clientId: string, query: string, scope: 'staff' | 'customer'): Promise<{ query: string; results: SearchResult[]; total: number }> {
  const q = query.trim();
  if (q.length < 2) return { query: q, results: [], total: 0 };
  const like = `%${q}%`;
  const db = dbPool();
  const base = scope === 'customer' ? `/client-portal/${clientId}` : `/clients/${clientId}`;

  const queries: Promise<SearchResult[]>[] = [];

  // Requirements — real, catalog-backed (requirements-service.ts)
  queries.push(safeQuery(db,
    `SELECT requirement_key, requirement_name, status, service_id FROM oc_client_service_requirements WHERE client_id = $1 AND requirement_name ILIKE $2 LIMIT 10`,
    [clientId, like],
  ).then(rows => rows.map(r => ({ id: r.requirement_key, name: r.requirement_name, type: 'requirement', status: r.status, module: 'Lifecycle', url: `${base}/lifecycle` }))));

  // Services (from the real capability catalog, scoped to this client's real enablement)
  queries.push(safeQuery(db,
    `SELECT c.id, c.name, COALESCE(cs.status, 'not_confirmed') AS status
     FROM oc_capabilities c LEFT JOIN oc_client_services cs ON cs.service_id = c.id AND cs.client_id = $1
     WHERE c.name ILIKE $2 LIMIT 10`,
    [clientId, like],
  ).then(rows => rows.map(r => ({ id: r.id, name: r.name, type: 'service', status: r.status, module: 'Services', url: `${base}/services` }))));

  // Connectors
  queries.push(safeQuery(db,
    `SELECT id, provider, status FROM oc_connectors WHERE client_id = $1 AND provider ILIKE $2 LIMIT 10`,
    [clientId, like],
  ).then(rows => rows.map(r => ({ id: r.id, name: r.provider, type: 'connector', status: r.status, module: 'Connectors', url: `${base}/connectors` }))));

  // Problems / Gaps (staff-only detail — problem/gap universe is an internal analysis surface)
  if (scope === 'staff') {
    queries.push(safeQuery(db,
      `SELECT id, title, status FROM oc_problems WHERE client_id = $1 AND title ILIKE $2 LIMIT 10`,
      [clientId, like],
    ).then(rows => rows.map(r => ({ id: r.id, name: r.title, type: 'problem', status: r.status, module: 'Problem Universe', url: `${base}/problems` }))));

    queries.push(safeQuery(db,
      `SELECT id, title, status FROM oc_gaps WHERE client_id = $1 AND title ILIKE $2 LIMIT 10`,
      [clientId, like],
    ).then(rows => rows.map(r => ({ id: r.id, name: r.title, type: 'gap', status: r.status, module: 'Gap Analysis', url: `${base}/gaps` }))));

    queries.push(safeQuery(db,
      `SELECT id, title, status FROM oc_incidents WHERE client_id = $1 AND title ILIKE $2 LIMIT 10`,
      [clientId, like],
    ).then(rows => rows.map(r => ({ id: r.id, name: r.title, type: 'incident', status: r.status, module: 'Incidents', url: `${base}/incidents` }))));
  }

  // Migrations
  queries.push(safeQuery(db,
    `SELECT id, source_schema, target_schema, status FROM oc_migration_runs WHERE client_id = $1 AND (source_schema ILIKE $2 OR target_schema ILIKE $2) LIMIT 10`,
    [clientId, like],
  ).then(rows => rows.map(r => ({ id: r.id, name: `${r.source_schema} → ${r.target_schema}`, type: 'migration', status: r.status, module: 'Migrations', url: `${base}/migrations` }))));

  // CRM — Contacts / Notes / Tasks. Customer scope only sees visibility='customer' rows,
  // matching crm-service.ts's own listCustomerVisible* filter exactly (never a
  // client-side filter the browser could bypass).
  const visClause = scope === 'customer' ? `AND visibility = 'customer'` : '';
  queries.push(safeQuery(db,
    `SELECT id, name, status FROM oc_contacts WHERE client_id = $1 AND name ILIKE $2 ${visClause} LIMIT 10`,
    [clientId, like],
  ).then(rows => rows.map(r => ({ id: r.id, name: r.name, type: 'contact', status: r.status, module: scope === 'customer' ? 'Team & Notes' : 'Contacts', url: scope === 'customer' ? `${base}` : `${base}/contacts` }))));

  queries.push(safeQuery(db,
    `SELECT id, body FROM oc_client_notes WHERE client_id = $1 AND body ILIKE $2 AND archived_at IS NULL ${visClause} LIMIT 10`,
    [clientId, like],
  ).then(rows => rows.map(r => ({ id: r.id, name: r.body.slice(0, 60), type: 'note', status: null, module: scope === 'customer' ? 'Team & Notes' : 'Notes', url: scope === 'customer' ? `${base}` : `${base}/notes` }))));

  queries.push(safeQuery(db,
    `SELECT id, title, status FROM oc_client_tasks WHERE client_id = $1 AND title ILIKE $2 ${visClause} LIMIT 10`,
    [clientId, like],
  ).then(rows => rows.map(r => ({ id: r.id, name: r.title, type: 'task', status: r.status, module: scope === 'customer' ? 'Team & Notes' : 'Tasks', url: scope === 'customer' ? `${base}` : `${base}/tasks` }))));

  // Client Requests (service/connector/support requests — the real requests
  // feature this same pass added)
  queries.push(safeQuery(db,
    `SELECT id, COALESCE(target_label, target_key, description) AS name, status FROM oc_client_requests WHERE client_id = $1 AND (target_label ILIKE $2 OR target_key ILIKE $2 OR description ILIKE $2) LIMIT 10`,
    [clientId, like],
  ).then(rows => rows.map(r => ({ id: r.id, name: r.name, type: 'request', status: r.status, module: 'Requests', url: `${base}` }))));

  const settled = await Promise.all(queries);
  const results = settled.flat();
  return { query: q, results, total: results.length };
}
