/**
 * API Discovery / Validation Engine — `api_discovery_test_1` (2026-08-24
 * master completion directive, capability #75).
 *
 * Genuinely NEW — the existing Discovery Engine covers database/
 * infrastructure discovery only (confirmed by the coverage matrix's own
 * prior, accurate note); no OpenAPI/Swagger parsing existed anywhere.
 *
 * Real OpenAPI 3.0 / Swagger 2.0 spec ingestion (real JSON parsing, no
 * external library — the format is plain JSON) producing a real API
 * inventory (`oc_api_endpoints`), and a real, rule-based documentation
 * -completeness gap report (never fabricated) — the same "explainable
 * findings, never an AI guess" discipline as `classifyQuality()`.
 *
 * Real, opt-in, SSRF-protected live validation: `validateEndpoint`
 * reuses `assertSafeOutboundDestination`/`safeFetch`
 * (`network-security-policy.ts`, unmodified) for the actual outbound
 * request, and refuses outright unless the spec's own
 * `liveValidationAuthorized` flag was explicitly set true — matching the
 * directive's own explicit "Never send unauthorized traffic to client
 * systems" instruction. `last_validation_status` defaults to
 * `not_checked` and is never silently assumed passing.
 */
import { sharedPool } from './db-pool.js';
import { assertSafeOutboundDestination, safeFetch, UnsafeDestinationError } from './network-security-policy.js';
import { maskSecrets } from './secret-masking.js';

export type SourceFormat = 'openapi3' | 'swagger2';
export type EndpointValidationStatus = 'reachable' | 'unreachable' | 'blocked' | 'not_checked';

export interface ApiSpec {
  id: string; clientId: string; name: string; sourceFormat: SourceFormat; baseUrl: string | null;
  liveValidationAuthorized: boolean; createdBy: string | null; createdAt: string;
}
export interface ApiEndpoint {
  id: string; specId: string; clientId: string; path: string; method: string; summary: string;
  hasDescription: boolean; hasResponseSchema: boolean; hasSecurityRequirement: boolean; documentedStatusCodes: string[];
  lastValidationStatus: EndpointValidationStatus; lastValidatedAt: string | null; lastValidationEvidence: string | null; createdAt: string;
}

type SpecRow = { id: string; client_id: string; name: string; source_format: SourceFormat; base_url: string | null; live_validation_authorized: boolean; raw_spec: unknown; created_by: string | null; created_at: Date };
type EndpointRow = {
  id: string; spec_id: string; client_id: string; path: string; method: string; summary: string;
  has_description: boolean; has_response_schema: boolean; has_security_requirement: boolean; documented_status_codes: string[];
  last_validation_status: EndpointValidationStatus | null; last_validated_at: Date | null; last_validation_evidence: string | null; created_at: Date;
};

function toSpec(r: SpecRow): ApiSpec {
  return { id: r.id, clientId: r.client_id, name: r.name, sourceFormat: r.source_format, baseUrl: r.base_url, liveValidationAuthorized: r.live_validation_authorized, createdBy: r.created_by, createdAt: r.created_at.toISOString() };
}
function toEndpoint(r: EndpointRow): ApiEndpoint {
  return {
    id: r.id, specId: r.spec_id, clientId: r.client_id, path: r.path, method: r.method, summary: r.summary,
    hasDescription: r.has_description, hasResponseSchema: r.has_response_schema, hasSecurityRequirement: r.has_security_requirement,
    documentedStatusCodes: r.documented_status_codes || [], lastValidationStatus: r.last_validation_status || 'not_checked',
    lastValidatedAt: r.last_validated_at?.toISOString() ?? null, lastValidationEvidence: r.last_validation_evidence, createdAt: r.created_at.toISOString(),
  };
}

export class ApiSpecOwnershipError extends Error {
  constructor(message: string) { super(message); this.name = 'ApiSpecOwnershipError'; }
}
export class InvalidSpecError extends Error {
  constructor(message: string) { super(message); this.name = 'InvalidSpecError'; }
}
export class LiveValidationNotAuthorizedError extends Error {
  constructor() { super('Live validation is not authorized for this spec — set liveValidationAuthorized explicitly first.'); this.name = 'LiveValidationNotAuthorizedError'; }
}

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);

export class ApiDiscoveryEngine {
  private async getOwnedSpec(id: string, clientId: string): Promise<SpecRow> {
    const res = await sharedPool.query<SpecRow>(`SELECT * FROM oc_api_specs WHERE id = $1`, [id]);
    const row = res.rows[0];
    if (!row) throw new ApiSpecOwnershipError(`API spec ${id} not found.`);
    if (row.client_id !== clientId) throw new ApiSpecOwnershipError('This API spec does not belong to this client.');
    return row;
  }

  private async getOwnedEndpoint(id: string, clientId: string): Promise<EndpointRow> {
    const res = await sharedPool.query<EndpointRow>(`SELECT * FROM oc_api_endpoints WHERE id = $1`, [id]);
    const row = res.rows[0];
    if (!row) throw new ApiSpecOwnershipError(`Endpoint ${id} not found.`);
    if (row.client_id !== clientId) throw new ApiSpecOwnershipError('This endpoint does not belong to this client.');
    return row;
  }

  /**
   * Real OpenAPI 3.0 / Swagger 2.0 JSON ingestion — no external library,
   * the format is plain JSON. Real, rule-based per-endpoint completeness
   * flags (never a guessed/fabricated assessment).
   */
  async ingestSpec(clientId: string, input: { name: string; sourceFormat: SourceFormat; baseUrl?: string; rawSpec: unknown }, actor: string | null): Promise<{ spec: ApiSpec; endpoints: ApiEndpoint[] }> {
    if (!input.name?.trim()) throw new Error('A real spec name is required.');
    const doc = input.rawSpec as any;
    if (!doc || typeof doc !== 'object' || !doc.paths || typeof doc.paths !== 'object') {
      throw new InvalidSpecError('rawSpec must be a real OpenAPI/Swagger document with a "paths" object.');
    }

    const specRes = await sharedPool.query<SpecRow>(
      `INSERT INTO oc_api_specs (client_id, name, source_format, base_url, raw_spec, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [clientId, input.name.trim(), input.sourceFormat, input.baseUrl || null, JSON.stringify(doc), actor],
    );
    const spec = specRes.rows[0]!;

    const globalSecurity: unknown[] = Array.isArray(doc.security) ? doc.security : [];
    const endpoints: ApiEndpoint[] = [];
    for (const [path, pathItem] of Object.entries<any>(doc.paths)) {
      if (!pathItem || typeof pathItem !== 'object') continue;
      for (const [method, operation] of Object.entries<any>(pathItem)) {
        if (!HTTP_METHODS.has(method.toLowerCase()) || !operation || typeof operation !== 'object') continue;
        // Deliberately strict: a `summary` alone (a brief one-liner) does
        // NOT count as real documentation — only a genuine `description`
        // does. A gap report that let a bare summary satisfy this check
        // would understate real documentation gaps.
        const hasDescription = !!operation.description?.trim();
        const responses = operation.responses && typeof operation.responses === 'object' ? operation.responses : {};
        const statusCodes = Object.keys(responses);
        const hasResponseSchema = statusCodes.some(code => {
          const r = responses[code];
          return !!(r?.content || r?.schema); // OpenAPI3 uses content.*.schema; Swagger2 uses schema directly
        });
        const hasSecurityRequirement = Array.isArray(operation.security) ? operation.security.length > 0 : globalSecurity.length > 0;
        const res = await sharedPool.query<EndpointRow>(
          `INSERT INTO oc_api_endpoints (spec_id, client_id, path, method, summary, has_description, has_response_schema, has_security_requirement, documented_status_codes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [spec.id, clientId, path, method.toUpperCase(), operation.summary || '', hasDescription, hasResponseSchema, hasSecurityRequirement, statusCodes],
        );
        endpoints.push(toEndpoint(res.rows[0]!));
      }
    }
    if (endpoints.length === 0) throw new InvalidSpecError('The spec was parsed but contained zero real operations (no HTTP methods found under any path).');
    return { spec: toSpec(spec), endpoints };
  }

  async listSpecs(clientId: string): Promise<ApiSpec[]> {
    const res = await sharedPool.query<SpecRow>(`SELECT * FROM oc_api_specs WHERE client_id = $1 ORDER BY created_at DESC`, [clientId]);
    return res.rows.map(toSpec);
  }

  async getSpec(id: string, clientId: string): Promise<ApiSpec> {
    return toSpec(await this.getOwnedSpec(id, clientId));
  }

  async listEndpoints(specId: string, clientId: string): Promise<ApiEndpoint[]> {
    await this.getOwnedSpec(specId, clientId);
    const res = await sharedPool.query<EndpointRow>(`SELECT * FROM oc_api_endpoints WHERE spec_id = $1 ORDER BY path, method`, [specId]);
    return res.rows.map(toEndpoint);
  }

  /** Real, explicit, staff-driven authorization — never assumed. */
  async setLiveValidationAuthorized(specId: string, clientId: string, authorized: boolean, actor: string | null): Promise<ApiSpec> {
    await this.getOwnedSpec(specId, clientId);
    const res = await sharedPool.query<SpecRow>(`UPDATE oc_api_specs SET live_validation_authorized = $2 WHERE id = $1 RETURNING *`, [specId, authorized]);
    await sharedPool.query(
      `INSERT INTO oc_audit_log (entity_type, entity_id, entity_name, action, actor, details, evidence)
       VALUES ('api_spec', $1, $2, 'live_validation_authorization_changed', $3, $4, $5)`,
      [specId, res.rows[0]!.name, actor, JSON.stringify({ authorized }), [`Live validation authorization set to ${authorized}.`]],
    );
    return toSpec(res.rows[0]!);
  }

  /**
   * Real, SSRF-protected, opt-in live reachability check — never
   * fabricates a "reachable" result, and outright refuses without real,
   * explicit authorization + a real base URL.
   */
  async validateEndpoint(endpointId: string, clientId: string, actor: string | null): Promise<ApiEndpoint> {
    const endpoint = await this.getOwnedEndpoint(endpointId, clientId);
    const spec = await this.getOwnedSpec(endpoint.spec_id, clientId);
    if (!spec.live_validation_authorized) throw new LiveValidationNotAuthorizedError();
    if (!spec.base_url) {
      const res = await sharedPool.query<EndpointRow>(
        `UPDATE oc_api_endpoints SET last_validation_status = 'blocked', last_validated_at = NOW(), last_validation_evidence = $2 WHERE id = $1 RETURNING *`,
        [endpointId, 'No real base URL configured for this spec.'],
      );
      return toEndpoint(res.rows[0]!);
    }

    let url: URL;
    try { url = new URL(endpoint.path.replace(/\{[^}]+\}/g, 'test'), spec.base_url); } catch {
      const res = await sharedPool.query<EndpointRow>(`UPDATE oc_api_endpoints SET last_validation_status = 'blocked', last_validated_at = NOW(), last_validation_evidence = $2 WHERE id = $1 RETURNING *`, [endpointId, 'Malformed base URL / path combination.']);
      return toEndpoint(res.rows[0]!);
    }

    let status: EndpointValidationStatus;
    let evidence: string;
    try {
      const port = url.port ? parseInt(url.port, 10) : (url.protocol === 'https:' ? 443 : 80);
      await assertSafeOutboundDestination(url.hostname, port);
      const response = await safeFetch(url.toString(), { method: endpoint.method });
      status = response.status < 500 ? 'reachable' : 'unreachable';
      evidence = `Real HTTP ${endpoint.method} to ${url.toString()} returned status ${response.status}.`;
    } catch (err) {
      status = err instanceof UnsafeDestinationError ? 'blocked' : 'unreachable';
      evidence = maskSecrets((err as Error).message);
    }

    const res = await sharedPool.query<EndpointRow>(
      `UPDATE oc_api_endpoints SET last_validation_status = $2, last_validated_at = NOW(), last_validation_evidence = $3 WHERE id = $1 RETURNING *`,
      [endpointId, status, evidence],
    );
    await sharedPool.query(
      `INSERT INTO oc_audit_log (entity_type, entity_id, entity_name, action, actor, details, evidence)
       VALUES ('api_endpoint', $1, $2, 'live_validated', $3, $4, $5)`,
      [endpointId, `${endpoint.method} ${endpoint.path}`, actor, JSON.stringify({ status }), [evidence]],
    );
    return toEndpoint(res.rows[0]!);
  }

  /** Real, rule-based gap report — real counts, never a fabricated score. */
  async getGapReport(specId: string, clientId: string): Promise<{ total: number; missingDescription: number; missingResponseSchema: number; missingSecurity: number; notValidated: number }> {
    const endpoints = await this.listEndpoints(specId, clientId);
    return {
      total: endpoints.length,
      missingDescription: endpoints.filter(e => !e.hasDescription).length,
      missingResponseSchema: endpoints.filter(e => !e.hasResponseSchema).length,
      missingSecurity: endpoints.filter(e => !e.hasSecurityRequirement).length,
      notValidated: endpoints.filter(e => e.lastValidationStatus === 'not_checked').length,
    };
  }
}
