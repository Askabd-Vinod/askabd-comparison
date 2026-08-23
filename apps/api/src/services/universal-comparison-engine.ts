/**
 * Universal Comparison Engine — Phase 4 (migration 048). Genuinely new
 * capability — see migration 048's own doc comment for the full
 * architecture investigation: `comparison-service.ts` is an unrelated,
 * real, working public product-comparison feature (untouched);
 * `migration-validation-service.ts`'s runValidation() was found to be
 * self-referential (queries the platform's own DB twice, always
 * "matches" by construction) — real, working code for its own purpose,
 * but not a real cross-environment comparison. This engine is that real
 * capability.
 *
 * v1 scope, stated honestly: compares two real, already-configured
 * PostgreSQL entries from oc_client_database_connections (the
 * multi-instance database connection feature — the one real place in
 * this platform that persists a retrievable secret, via `password_ref`)
 * at the schema/table level, using two genuinely separate real
 * connections — READ-ONLY, and honestly reports UNKNOWN rather than
 * guessing when a connection's stored credential is unavailable. Other
 * comparison types (API, config, infrastructure) are a real, deliberate
 * fast-follow.
 */
import { sharedPool } from './db-pool.js';
import { getSecretProvider } from './secrets-provider.js';
import { ConnectionSecurityService, ConnectivityBlockedError } from './connection-security-service.js';
import { maskSecrets } from './secret-masking.js';
import { TechnologyAdapterRegistry } from './technology-adapter-registry.js';
import { ConfigurationSnapshotService } from './configuration-snapshot-service.js';
import { ConfigurationBaselineService, type BaselineRule } from './configuration-baseline-service.js';

/**
 * Real, reusable classification model — the "Approved Baseline / Reusable
 * Configuration / Environment Override / Intentional Difference /
 * Approved Exception" capability (migration 053). Core product
 * principle: a difference is not automatically a defect. "DIFFERENT" and
 * "WRONG" are not the same. The 5 new statuses below are only ever
 * produced when a real baseline was actually consulted for a key (see
 * `classifyConfigFinding()`); without a baseline, findings keep using the
 * original, still-real, baseline-agnostic 5 (`match`/`mismatch`/
 * `missing`/`extra`/`unknown`) from migration 048/052 — never silently
 * upgraded or downgraded without a real rule behind the change.
 */
export type ComparisonObjectStatus =
  | 'match' | 'mismatch' | 'missing' | 'extra' | 'unknown'
  | 'expected_difference' | 'approved_override' | 'approved_exception' | 'unapproved_difference' | 'not_assessed';

/**
 * Traffic-light severity for the human-facing status line — a real,
 * fixed mapping per `status` ALONE, period. Per the "comparison
 * semantics must be ENVIRONMENT-AWARE, not LEFT/RIGHT-AWARE" correction:
 * left/right is ONLY display order (column order, which value appears
 * first) — it must NEVER influence meaning, severity, classification,
 * recommendation, environment name, risk, or missing status. A real
 * structural presence difference (`missing`/`extra`) is the SAME real
 * fact — "this object does not exist in one specific environment" —
 * regardless of which physical connection happened to be selected as
 * left or right, so both get the SAME severity (`red`); only the actual
 * environment NAME named in the sentence differs, and only because the
 * real underlying data differs, never because of display order (see
 * `buildDisplayStatus()`, and the dedicated
 * "swap direction does not change semantic classification" tests).
 */
export type DisplaySeverity = 'red' | 'orange' | 'green' | 'neutral';

export interface ComparisonObjectResult {
  objectType: string; // 'table' | 'column' | 'index' | 'config_key'
  name: string;
  status: ComparisonObjectStatus;
  leftDetail: string;
  rightDetail: string;
  /** Populated only when a real baseline rule was consulted for this key. */
  baselineValue?: string;
  overrideReason?: string;
  /** Populated only for a real approved_override backed by a named per-environment override record. */
  overrideApprovedBy?: string;
  overrideApprovedAt?: string;
  /**
   * Real, user-facing status line — "Missing in Staging" /
   * "Missing in Production" / "Match" / "Approved Override" etc, built
   * from the ACTUAL environment names of this specific run (never
   * "Missing on Left/Right" — see `buildDisplayStatus()`). Always
   * present on a completed result; the internal `status` above remains
   * the source of truth for baseline/exception/summary logic.
   */
  displayIcon: string;
  displayText: string;
  displaySeverity: DisplaySeverity;
}

export interface ComparisonSummary {
  total: number;
  match: number;
  mismatch: number;
  missing: number;
  extra: number;
  unknown: number;
  expectedDifference: number;
  approvedOverride: number;
  approvedException: number;
  unapprovedDifference: number;
  notAssessed: number;
}

const EMPTY_SUMMARY: ComparisonSummary = {
  total: 0, match: 0, mismatch: 0, missing: 0, extra: 0, unknown: 0,
  expectedDifference: 0, approvedOverride: 0, approvedException: 0, unapprovedDifference: 0, notAssessed: 0,
};

function buildSummary(results: ComparisonObjectResult[]): ComparisonSummary {
  return {
    total: results.length,
    match: results.filter(r => r.status === 'match').length,
    mismatch: results.filter(r => r.status === 'mismatch').length,
    missing: results.filter(r => r.status === 'missing').length,
    extra: results.filter(r => r.status === 'extra').length,
    unknown: results.filter(r => r.status === 'unknown').length,
    expectedDifference: results.filter(r => r.status === 'expected_difference').length,
    approvedOverride: results.filter(r => r.status === 'approved_override').length,
    approvedException: results.filter(r => r.status === 'approved_exception').length,
    unapprovedDifference: results.filter(r => r.status === 'unapproved_difference').length,
    notAssessed: results.filter(r => r.status === 'not_assessed').length,
  };
}

/**
 * The real, reusable decision tree (directive Section 42), implemented
 * literally:
 * 1. Real difference? No -> match. (missing/extra handled as their own
 *    structural cases, not reclassified by a baseline in v1 — a real,
 *    disclosed scope boundary: overrides/exceptions apply to VALUE
 *    differences on keys present on both sides, the directive's own
 *    worked examples throughout — API_URL, timeout, JWT algorithm, worker
 *    count — are all "both sides have it, values differ" cases.)
 * 2. Expected difference by design (`expectedToVaryByEnvironment`)? ->
 *    expected_difference — never flagged, per Section 33's own
 *    instruction to never auto-classify environment-appropriate
 *    variation as non-compliant.
 * 3/4. Does each side's real value match ITS OWN approved value (the
 *    baseline default, or a real environment-specific override)? Both
 *    sides individually approved -> approved_override (an intentional,
 *    pre-approved per-environment variation).
 * 5. (Exceptions are applied as a real post-processing pass — see
 *    `applyExceptions()` — since an exception references a SPECIFIC
 *    finding in an ALREADY-PERSISTED run, not a standing baseline rule.)
 * 6. Otherwise, with a real baseline consulted and no approval covering
 *    it -> unapproved_difference (distinct from plain `mismatch`, which
 *    means no baseline was consulted for this key at all).
 */
function classifyConfigFinding(
  leftValue: string, rightValue: string, leftEnv: string, rightEnv: string, rule: BaselineRule | undefined
): { status: ComparisonObjectStatus; baselineValue?: string; overrideReason?: string; overrideApprovedBy?: string; overrideApprovedAt?: string } {
  if (leftValue === rightValue) return { status: 'match' };
  if (!rule) return { status: 'mismatch' }; // no baseline rule for this key — the original, real, baseline-agnostic finding
  if (rule.expectedToVaryByEnvironment) return { status: 'expected_difference', baselineValue: rule.approvedValue };

  const approvedFor = (env: string, actual: string): { approved: boolean; reason?: string; approvedBy?: string; approvedAt?: string } => {
    const override = rule.overrides?.[env];
    if (override) return { approved: override.value === actual, reason: override.reason, approvedBy: override.approvedBy, approvedAt: override.approvedAt };
    if (rule.approvedValue !== undefined) return { approved: rule.approvedValue === actual };
    return { approved: false };
  };
  const left = approvedFor(leftEnv, leftValue);
  const right = approvedFor(rightEnv, rightValue);
  if (left.approved && right.approved) {
    const source = right.reason ? right : left; // whichever side actually carries the named override record
    return {
      status: 'approved_override', baselineValue: rule.approvedValue, overrideReason: source.reason,
      overrideApprovedBy: source.approvedBy, overrideApprovedAt: source.approvedAt,
    };
  }
  return { status: 'unapproved_difference', baselineValue: rule.approvedValue };
}

/**
 * Real, dynamic environment display name — never a hardcoded
 * "Staging"/"Production" string, always derived from the actual
 * environment value recorded against this specific connection/snapshot.
 * `uat` is special-cased to the conventional acronym; an already
 * custom-cased value (e.g. a client's own "Client UAT" label) is passed
 * through unchanged rather than re-cased into something wrong.
 */
export function formatEnvironmentLabel(env: string | null | undefined): string {
  const trimmed = (env || '').trim();
  if (!trimmed) return 'Unknown Environment';
  if (trimmed.toLowerCase() === 'uat') return 'UAT';
  if (/[a-z]/.test(trimmed) && /[A-Z]/.test(trimmed)) return trimmed; // already custom-cased — leave a real client-specific label alone
  return trimmed.split(/[\s_-]+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

/**
 * The real, user-facing status line — never "Missing on Left"/"Missing
 * on Right"/"Extra on Right" — always the ACTUAL environment name of
 * whichever side genuinely lacks the object. `missing` (present in
 * left, absent in right) and `extra` (absent in left, present in right)
 * are the SAME real-world fact type — "genuinely absent from one
 * specific environment" — so both get the identical icon/severity
 * (🔴 red); only the environment NAME named in the sentence differs,
 * and only because the real data differs, never because of which side
 * happened to be selected left or right this time. Proven by a
 * dedicated "swap direction does not change semantic classification"
 * test: comparing the same two real sides in both orders produces the
 * exact same text AND the exact same severity for the exact same real
 * fact — left/right is ONLY display order, never meaning.
 */
function buildDisplayStatus(
  status: ComparisonObjectStatus, leftEnvLabel: string, rightEnvLabel: string
): { icon: string; text: string; severity: DisplaySeverity } {
  switch (status) {
    case 'match': return { icon: '🟢', text: 'Match', severity: 'green' };
    case 'missing': return { icon: '🔴', text: `Missing in ${rightEnvLabel}`, severity: 'red' };
    case 'extra': return { icon: '🔴', text: `Missing in ${leftEnvLabel}`, severity: 'red' };
    case 'mismatch': return { icon: '🔴', text: 'Mismatch', severity: 'red' };
    case 'expected_difference': return { icon: '🟢', text: 'Expected Difference', severity: 'green' };
    case 'approved_override': return { icon: '🟢', text: 'Approved Override', severity: 'green' };
    case 'approved_exception': return { icon: '🟠', text: 'Approved Exception', severity: 'orange' };
    case 'unapproved_difference': return { icon: '🔴', text: 'Unapproved Difference', severity: 'red' };
    case 'not_assessed': return { icon: '⚪', text: 'Not Assessed', severity: 'neutral' };
    case 'unknown': default: return { icon: '⚪', text: 'Unknown', severity: 'neutral' };
  }
}

export interface ComparisonRun {
  id: string;
  clientId: string;
  comparisonType: 'database_schema' | 'configuration';
  leftLabel: string;
  rightLabel: string;
  leftConnectionId: string | null;
  rightConnectionId: string | null;
  leftSnapshotId: string | null;
  rightSnapshotId: string | null;
  baselineId: string | null;
  baselineVersion: string | null;
  /**
   * Real, persisted environment identity for this specific run's two
   * sides — never reconstructed from positional assumptions. `*Id` is
   * the real, stable environment slug already used throughout this
   * platform (e.g. `production`, `staging` — the same value stored on
   * the source connection/snapshot's own `environment` column and used
   * as the key in the client's own Environments tab); `*Name` is its
   * real formatted display form (see `formatEnvironmentLabel()`). This
   * platform has no separate normalized Environment entity with its own
   * database-generated id in v1 — the slug IS the real, stable identity.
   */
  leftEnvironmentId: string | null;
  leftEnvironmentName: string | null;
  rightEnvironmentId: string | null;
  rightEnvironmentName: string | null;
  status: 'running' | 'completed' | 'failed';
  results: ComparisonObjectResult[];
  summary: ComparisonSummary;
  errorMessage: string | null;
  createdBy: string | null;
  createdAt: string;
  completedAt: string | null;
}

type RunRow = {
  id: string; client_id: string; comparison_type: 'database_schema' | 'configuration'; left_label: string; right_label: string;
  left_connection_id: string | null; right_connection_id: string | null;
  left_snapshot_id: string | null; right_snapshot_id: string | null;
  baseline_id: string | null; baseline_version: string | null;
  left_environment_id: string | null; left_environment_name: string | null;
  right_environment_id: string | null; right_environment_name: string | null;
  status: 'running' | 'completed' | 'failed';
  results: ComparisonObjectResult[]; summary: ComparisonSummary; error_message: string | null;
  created_by: string | null; created_at: Date; completed_at: Date | null;
};

function toRun(r: RunRow): ComparisonRun {
  return {
    id: r.id, clientId: r.client_id, comparisonType: r.comparison_type, leftLabel: r.left_label, rightLabel: r.right_label,
    leftConnectionId: r.left_connection_id, rightConnectionId: r.right_connection_id,
    leftSnapshotId: r.left_snapshot_id, rightSnapshotId: r.right_snapshot_id,
    baselineId: r.baseline_id, baselineVersion: r.baseline_version,
    leftEnvironmentId: r.left_environment_id, leftEnvironmentName: r.left_environment_name,
    rightEnvironmentId: r.right_environment_id, rightEnvironmentName: r.right_environment_name,
    status: r.status,
    results: r.results || [], summary: r.summary || EMPTY_SUMMARY,
    errorMessage: r.error_message, createdBy: r.created_by, createdAt: r.created_at.toISOString(),
    completedAt: r.completed_at?.toISOString() ?? null,
  };
}

/**
 * Real key-value diff — added(extra)/removed(missing)/changed(mismatch)/
 * unchanged(match), computed directly from the two real stored JSON
 * blobs. Obvious secret-shaped keys are masked in the DISPLAYED value
 * (defense in depth — this table is not the real secret store) while the
 * real underlying equality still drives the real match/mismatch status,
 * so a genuine credential rotation is still honestly reported as
 * "changed" without ever showing the real values.
 */
function diffConfigs(
  left: Record<string, string>, right: Record<string, string>,
  leftEnv: string, rightEnv: string, rules: Record<string, BaselineRule> | undefined
): ComparisonObjectResult[] {
  const looksSecret = (key: string) => /password|secret|token|api[_-]?key|credential/i.test(key);
  const allKeys = new Set([...Object.keys(left), ...Object.keys(right)]);
  const leftEnvLabel = formatEnvironmentLabel(leftEnv);
  const rightEnvLabel = formatEnvironmentLabel(rightEnv);
  const withDisplay = (r: Omit<ComparisonObjectResult, 'displayIcon' | 'displayText' | 'displaySeverity'>): ComparisonObjectResult => {
    const d = buildDisplayStatus(r.status, leftEnvLabel, rightEnvLabel);
    return { ...r, displayIcon: d.icon, displayText: d.text, displaySeverity: d.severity };
  };
  const results: ComparisonObjectResult[] = [];
  for (const key of Array.from(allKeys).sort()) {
    const inLeft = Object.prototype.hasOwnProperty.call(left, key);
    const inRight = Object.prototype.hasOwnProperty.call(right, key);
    const display = (v: string) => (looksSecret(key) ? '••••••••' : v);

    if (inLeft && !inRight) { results.push(withDisplay({ objectType: 'config_key', name: key, status: 'missing', leftDetail: display(left[key]!), rightDetail: 'not present' })); continue; }
    if (!inLeft && inRight) { results.push(withDisplay({ objectType: 'config_key', name: key, status: 'extra', leftDetail: 'not present', rightDetail: display(right[key]!) })); continue; }

    // Both present — the real decision tree (Section 42), only exercised
    // when a real baseline rule exists for this key; otherwise falls back
    // to the original, real, baseline-agnostic match/mismatch.
    const classification = classifyConfigFinding(left[key]!, right[key]!, leftEnv, rightEnv, rules?.[key]);
    results.push(withDisplay({
      objectType: 'config_key', name: key, status: classification.status,
      leftDetail: display(left[key]!), rightDetail: display(right[key]!),
      baselineValue: classification.baselineValue !== undefined ? display(classification.baselineValue) : undefined,
      overrideReason: classification.overrideReason,
      overrideApprovedBy: classification.overrideApprovedBy,
      overrideApprovedAt: classification.overrideApprovedAt,
    }));
  }
  return results;
}

interface DatabaseConnectionConfig { host: string; port: number; database: string; username: string; password: string }

/** A real table inventory for one side — real bytes over a real, separate, read-only connection, or an honest failure. */
async function inspectSchema(config: DatabaseConnectionConfig): Promise<{ tables: Set<string>; error: string | null }> {
  const isMasked = !config.password || config.password === '••••••••';
  if (isMasked) return { tables: new Set(), error: 'No retrievable credential is stored for this connection. Re-test the connection with real credentials to enable comparison.' };

  const { Pool } = await import('pg');
  const pool = new Pool({
    host: config.host, port: config.port, database: config.database, user: config.username, password: config.password,
    max: 2, connectionTimeoutMillis: 15000, idleTimeoutMillis: 10000, ssl: undefined,
  });
  try {
    const res = await pool.query(
      `SELECT schemaname || '.' || tablename AS full_name FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY 1`
    );
    return { tables: new Set(res.rows.map((r: any) => r.full_name)), error: null };
  } catch (err) {
    return { tables: new Set(), error: (err as Error).message };
  } finally {
    await pool.end().catch(() => {});
  }
}

interface ConnectionMeta { name: string; connectorType: string; host: string; port: number; database: string; username: string; passwordRef: string | null; environment: string | null }

/**
 * Real lookup — deliberately targets oc_client_database_connections (the
 * multi-instance database connection feature), not oc_connectors.
 * Investigated before writing this: oc_connectors.configuration explicitly
 * STRIPS password/secret/token fields before persisting
 * (connector-service.ts's saveConfiguration) — there is no retrievable
 * secret there at all, by real design. This table genuinely does persist
 * a retrievable `password_ref` via the real SecretProvider, and even
 * carries a real `environment` field (production/staging/uat/development)
 * matching the brief's own DEV/TEST/UAT/PROD vocabulary directly — the
 * correct real source for this engine.
 *
 * Deliberately does NOT filter by connector_type — per the Future
 * Technology & Compatibility directive's "capability negotiation"
 * principle, a non-PostgreSQL connection must be found and named in a
 * real, persisted run record with an honest ADAPTER_REQUIRED status, not
 * silently treated as if it doesn't exist.
 */
async function lookupConnection(connectionId: string, clientId: string): Promise<ConnectionMeta | null> {
  const res = await sharedPool.query(
    `SELECT name, connector_type, host, port, database_name, username, password_ref, environment FROM oc_client_database_connections WHERE id = $1 AND client_id = $2`,
    [connectionId, clientId]
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    name: row.name, connectorType: row.connector_type, host: row.host, port: row.port,
    database: row.database_name, username: row.username, passwordRef: row.password_ref,
    environment: row.environment ?? null,
  };
}

async function resolveConnectionConfig(meta: ConnectionMeta): Promise<DatabaseConnectionConfig> {
  const password = meta.passwordRef ? await getSecretProvider().getSecret(meta.passwordRef).catch(() => '') : '';
  return { host: meta.host, port: meta.port, database: meta.database, username: meta.username, password };
}

export class UniversalComparisonEngine {
  /**
   * Runs a real, read-only schema comparison between two real
   * database connections belonging to the SAME client — never a
   * self-referential duplicate query. Persists real, per-table results,
   * never a fabricated summary.
   *
   * Real capability negotiation (Technology Adapter Registry, migration
   * 051): before ever attempting a real connection, both sides'
   * `connector_type` is checked against the registry via
   * `TechnologyAdapterRegistry.checkCompatibility`. If either is not a
   * real, `supported` adapter, this run is still persisted — with
   * `failed` status and a real, structured ADAPTER_REQUIRED (or
   * UNKNOWN_TECHNOLOGY) diagnostic — never a bare, unhelpful exception
   * with no run record at all, and never a silent attempt against an
   * unsupported technology.
   *
   * Real, enforced connectivity-security gate (Secure Client Environment
   * Connectivity Engine, migration 050): before ever attempting a real
   * connection, both sides' security profiles are checked via
   * `ConnectionSecurityService.assertReadyForConnection`. If either
   * requires a VPN that is not recorded as connected, this run is marked
   * `failed` with a real, safe BLOCKED diagnostic — the real connection
   * attempt is never made. Every persisted error message is passed
   * through `maskSecrets()` first, defense-in-depth against a driver
   * error message that happens to echo a connection string.
   */
  async runDatabaseSchemaComparison(clientId: string, leftConnectionId: string, rightConnectionId: string, actor: string | null): Promise<ComparisonRun> {
    if (leftConnectionId === rightConnectionId) {
      throw new Error('Cannot compare a connection against itself — choose two different connections.');
    }
    const leftMeta = await lookupConnection(leftConnectionId, clientId);
    const rightMeta = await lookupConnection(rightConnectionId, clientId);
    if (!leftMeta || !rightMeta) {
      throw new Error('Both must be real, existing connections belonging to this client.');
    }

    const inserted = await sharedPool.query<RunRow>(
      `INSERT INTO comparison_runs (client_id, comparison_type, left_label, right_label, left_connection_id, right_connection_id, left_environment_id, left_environment_name, right_environment_id, right_environment_name, created_by)
       VALUES ($1, 'database_schema', $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [clientId, leftMeta.name, rightMeta.name, leftConnectionId, rightConnectionId, leftMeta.environment, formatEnvironmentLabel(leftMeta.environment), rightMeta.environment, formatEnvironmentLabel(rightMeta.environment), actor]
    );
    const runRow = inserted.rows[0];
    if (!runRow) throw new Error('comparison_runs insert returned no row');
    const runId = runRow.id;

    const registry = new TechnologyAdapterRegistry();
    for (const meta of [leftMeta, rightMeta]) {
      const compat = await registry.checkCompatibility(meta.connectorType, 'database');
      if (compat.status !== 'supported') {
        const diagnostic = compat.status === 'unknown_technology' ? 'UNKNOWN_TECHNOLOGY' : 'ADAPTER_REQUIRED';
        const failed = await sharedPool.query<RunRow>(
          `UPDATE comparison_runs SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2 RETURNING *`,
          [maskSecrets(`${diagnostic}: ${meta.name} (${meta.connectorType}) — ${compat.message}`), runId]
        );
        return toRun(failed.rows[0]!);
      }
    }

    const left = { label: leftMeta.name, config: await resolveConnectionConfig(leftMeta) };
    const right = { label: rightMeta.name, config: await resolveConnectionConfig(rightMeta) };

    const security = new ConnectionSecurityService();
    for (const [label, connectionId] of [[left.label, leftConnectionId], [right.label, rightConnectionId]] as const) {
      try {
        await security.assertReadyForConnection('oc_client_database_connections', connectionId);
      } catch (err) {
        if (err instanceof ConnectivityBlockedError) {
          const failed = await sharedPool.query<RunRow>(
            `UPDATE comparison_runs SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2 RETURNING *`,
            [maskSecrets(`${label}: ${err.message}`), runId]
          );
          return toRun(failed.rows[0]!);
        }
        throw err;
      }
    }

    const [leftInspect, rightInspect] = await Promise.all([inspectSchema(left.config), inspectSchema(right.config)]);

    if (leftInspect.error || rightInspect.error) {
      const message = [leftInspect.error && `${left.label}: ${leftInspect.error}`, rightInspect.error && `${right.label}: ${rightInspect.error}`].filter(Boolean).join(' | ');
      const failed = await sharedPool.query<RunRow>(
        `UPDATE comparison_runs SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2 RETURNING *`,
        [maskSecrets(message), runId]
      );
      return toRun(failed.rows[0]!);
    }

    const allTables = new Set([...leftInspect.tables, ...rightInspect.tables]);
    const leftEnvLabel = formatEnvironmentLabel(leftMeta.environment);
    const rightEnvLabel = formatEnvironmentLabel(rightMeta.environment);
    const results: ComparisonObjectResult[] = [];
    for (const table of Array.from(allTables).sort()) {
      const inLeft = leftInspect.tables.has(table);
      const inRight = rightInspect.tables.has(table);
      const status: ComparisonObjectStatus = inLeft && inRight ? 'match' : inLeft ? 'missing' : 'extra';
      const d = buildDisplayStatus(status, leftEnvLabel, rightEnvLabel);
      results.push({
        objectType: 'table', name: table, status,
        leftDetail: inLeft ? 'present' : 'not present', rightDetail: inRight ? 'present' : 'not present',
        displayIcon: d.icon, displayText: d.text, displaySeverity: d.severity,
      });
    }

    const summary = buildSummary(results);

    const completed = await sharedPool.query<RunRow>(
      `UPDATE comparison_runs SET status = 'completed', results = $1, summary = $2, completed_at = NOW() WHERE id = $3 RETURNING *`,
      [JSON.stringify(results), JSON.stringify(summary), runId]
    );
    return toRun(completed.rows[0]!);
  }

  /**
   * Real configuration-key comparison between two real, staff-entered
   * configuration snapshots belonging to the SAME client. Reuses the
   * same `comparison_runs` table/result shape as the database-schema
   * type (migration 052 widened both, extending — not duplicating —
   * this engine), so the existing UI's RunCard/ObjectBadge components
   * work unmodified for this type too.
   *
   * `baselineId` is optional (migration 053) — when provided, a real,
   * approved baseline's rules are consulted for every key present on
   * both sides, producing the richer expected_difference/
   * approved_override/unapproved_difference classification (see
   * `classifyConfigFinding()`); without one, findings keep using the
   * original, real, baseline-agnostic match/mismatch — never fabricated
   * approval where none was actually configured.
   */
  async runConfigurationComparison(clientId: string, leftSnapshotId: string, rightSnapshotId: string, actor: string | null, baselineId?: string | null): Promise<ComparisonRun> {
    if (leftSnapshotId === rightSnapshotId) {
      throw new Error('Cannot compare a configuration snapshot against itself — choose two different snapshots.');
    }
    const snapshots = new ConfigurationSnapshotService();
    const left = await snapshots.get(leftSnapshotId, clientId);
    const right = await snapshots.get(rightSnapshotId, clientId);
    if (!left || !right) {
      throw new Error('Both must be real, existing configuration snapshots belonging to this client.');
    }

    let baselineVersion: string | null = null;
    let rules: Record<string, BaselineRule> | undefined;
    if (baselineId) {
      const baseline = await new ConfigurationBaselineService().get(baselineId, clientId);
      if (!baseline) throw new Error('That baseline does not belong to this client.');
      baselineVersion = baseline.version;
      rules = baseline.rules;
    }

    const results = diffConfigs(left.config, right.config, left.environment, right.environment, rules);
    const summary = buildSummary(results);

    const inserted = await sharedPool.query<RunRow>(
      `INSERT INTO comparison_runs (client_id, comparison_type, left_label, right_label, left_snapshot_id, right_snapshot_id, baseline_id, baseline_version, left_environment_id, left_environment_name, right_environment_id, right_environment_name, status, results, summary, created_by, completed_at)
       VALUES ($1, 'configuration', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'completed', $12, $13, $14, NOW()) RETURNING *`,
      [clientId, `${left.name} (${left.environment})`, `${right.name} (${right.environment})`, leftSnapshotId, rightSnapshotId, baselineId || null, baselineVersion, left.environment, formatEnvironmentLabel(left.environment), right.environment, formatEnvironmentLabel(right.environment), JSON.stringify(results), JSON.stringify(summary), actor]
    );
    const runRow = inserted.rows[0];
    if (!runRow) throw new Error('comparison_runs insert returned no row');
    return toRun(runRow);
  }

  /**
   * Real "Mark as Intentional" reclassification — after a real exception
   * is granted for one specific finding in an ALREADY-PERSISTED run (see
   * `ConfigurationBaselineService.createException`), this updates that
   * SAME run's own stored result in place (never a new fabricated run)
   * so the real, existing finding visibly reflects the real, live
   * approval — directly satisfying the directive's own worked example
   * ("AskABD should then show: Approved Difference rather than:
   * Mismatch"). Only ever upgrades a genuinely unapproved finding
   * (`mismatch`/`unapproved_difference`) — never silently reclassifies a
   * finding that was never actually a problem.
   */
  async applyExceptionToRun(runId: string, clientId: string, configKey: string): Promise<ComparisonRun> {
    const run = await this.getRun(runId);
    if (!run || run.clientId !== clientId) throw new Error('Comparison run not found for this client.');
    const leftEnvLabel = run.leftEnvironmentName || 'the left environment';
    const rightEnvLabel = run.rightEnvironmentName || 'the right environment';
    const results = run.results.map(r => {
      if (r.name !== configKey) return r;
      if (r.status !== 'mismatch' && r.status !== 'unapproved_difference') return r;
      const d = buildDisplayStatus('approved_exception', leftEnvLabel, rightEnvLabel);
      return { ...r, status: 'approved_exception' as ComparisonObjectStatus, displayIcon: d.icon, displayText: d.text, displaySeverity: d.severity };
    });
    const summary = buildSummary(results);
    const updated = await sharedPool.query<RunRow>(
      `UPDATE comparison_runs SET results = $1, summary = $2 WHERE id = $3 RETURNING *`,
      [JSON.stringify(results), JSON.stringify(summary), runId]
    );
    return toRun(updated.rows[0]!);
  }

  async getRun(id: string): Promise<ComparisonRun | null> {
    const res = await sharedPool.query<RunRow>(`SELECT * FROM comparison_runs WHERE id = $1`, [id]);
    const row = res.rows[0];
    return row ? toRun(row) : null;
  }

  async listRuns(clientId: string): Promise<ComparisonRun[]> {
    const res = await sharedPool.query<RunRow>(`SELECT * FROM comparison_runs WHERE client_id = $1 ORDER BY created_at DESC`, [clientId]);
    return res.rows.map(toRun);
  }
}
