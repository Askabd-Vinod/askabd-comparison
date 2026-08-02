declare module '@askabd/shared-diagnostics' {
  export type Severity = 'low' | 'medium' | 'high' | 'critical';
  export type Priority = 'p0' | 'p1' | 'p2' | 'p3' | 'p4';
  export interface UserDiagnostic { readonly whatHappened: string; readonly whyItHappened: string; readonly whatIsMissing: string; readonly howToFix: string; readonly example?: string | undefined; readonly alternativeSolution?: string | undefined; }
  export interface DeveloperDiagnostic { readonly rootCause: string; readonly technicalDetails: string; readonly codeLocation?: string | undefined; readonly dependencies?: readonly string[] | undefined; readonly suggestedImplementation?: string | undefined; }
  export interface AdminDiagnostic { readonly infrastructureImpact: string; readonly configurationImpact: string; readonly deploymentImpact: string; readonly monitoringImpact: string; }
  export interface ArchitectDiagnostic { readonly platformImpact: string; readonly reuseOpportunity: string; readonly futureModulesAffected: readonly string[]; readonly sharedPackageOpportunity?: string | undefined; }
  export interface DiagnosticReport { readonly id: string; readonly timestamp: string; readonly problem: string; readonly rootCause: string; readonly whyItHappened: string; readonly businessImpact: string; readonly technicalImpact: string; readonly operationalImpact: string; readonly affectedRepository?: string | undefined; readonly affectedModule?: string | undefined; readonly affectedService?: string | undefined; readonly affectedApi?: string | undefined; readonly severity: Severity; readonly priority: Priority; readonly productionRisk: Severity; readonly recommendedFix: string; readonly alternativeFix?: string | undefined; readonly autoFixAvailable: boolean; readonly estimatedEffort: string; readonly userView: UserDiagnostic; readonly developerView: DeveloperDiagnostic; readonly adminView: AdminDiagnostic; readonly architectView: ArchitectDiagnostic; }
  export interface DiagnosticContext { readonly service: string; readonly operation: string; readonly module?: string; readonly repository?: string; }
  export function createDiagnostic(error: Error | { code?: string; message: string }, context: DiagnosticContext): DiagnosticReport;
}

declare module '@askabd/shared-feature-flags' {
  export interface FeatureFlag { readonly id: string; readonly name: string; readonly description: string; readonly module: string; readonly enabled: boolean; readonly rules?: readonly FeatureFlagRule[]; readonly activateAfter?: string; readonly deactivateBefore?: string; }
  export interface FeatureFlagRule { readonly description?: string; readonly environments?: readonly string[]; readonly tenants?: readonly string[]; readonly organizations?: readonly string[]; readonly users?: readonly string[]; readonly roles?: readonly string[]; readonly percentage?: number; readonly enabled: boolean; }
  export interface FeatureFlagContext { readonly environment: string; readonly tenantId?: string; readonly organizationId?: string; readonly userId?: string; readonly roles?: readonly string[]; }
  export class FeatureFlagEngine { isEnabled(flagId: string, context: FeatureFlagContext): boolean; getAllFlags(context: FeatureFlagContext): Record<string, boolean>; register(flag: FeatureFlag): void; update(flagId: string, update: Partial<Omit<FeatureFlag, 'id'>>): void; list(): readonly FeatureFlag[]; }
  export function getFeatureFlags(defaults?: readonly FeatureFlag[]): FeatureFlagEngine;
  export function isFeatureEnabled(flagId: string, context: FeatureFlagContext): boolean;
}

declare module '@askabd/shared-monitoring' {
  export interface MetricsSummary { readonly timestamp: string; readonly service: string; readonly uptime: number; readonly requests: any; readonly latency: any; readonly errors: any; readonly resources: any; }
  export class MetricsCollector { record(method: string, statusCode: number, durationMs: number): void; getSummary(service: string): MetricsSummary; reset(): void; recordValidationError(): void; recordDatabaseError(): void; recordUnhandledError(): void; }
  export function getMetrics(): MetricsCollector;
}

declare module '@askabd/shared-audit' {
  export interface AuditEntry { readonly id: string; readonly timestamp: string; readonly userId: string; readonly tenantId: string; readonly operation: string; readonly resource: string; readonly service: string; readonly success: boolean; readonly severity: 'info' | 'warning' | 'critical'; readonly category: 'data' | 'auth' | 'admin' | 'system' | 'security'; [key: string]: any; }
  export interface AuditConfig { service: string; repository?: string; capturePayloads?: boolean; maxPayloadSize?: number; excludePaths?: readonly string[]; }
  export interface AuditSink { write(entry: AuditEntry): void | Promise<void>; }
  export function registerAuditEngine(server: any, userConfig?: Partial<AuditConfig>, sink?: AuditSink): void;
  export function createAuditEntry(partial: Partial<AuditEntry> & Pick<AuditEntry, 'userId' | 'tenantId' | 'operation' | 'resource' | 'success' | 'service'>): AuditEntry;
}


declare module '@askabd/shared-authorization' {
  export type Permission = string;
  export type Role = string;
  export interface RoleDefinition { readonly id: Role; readonly name: string; readonly description: string; readonly permissions: readonly Permission[]; readonly inherits?: readonly Role[] | undefined; readonly priority: number; }
  export interface PermissionDefinition { readonly id: Permission; readonly resource: string; readonly action: string; readonly description: string; readonly category: string; }
  export interface AuthorizationContext { readonly userId: string; readonly tenantId: string; readonly roles: readonly Role[]; readonly permissions: readonly Permission[]; readonly directGrants?: readonly Permission[] | undefined; }
  export interface AuthorizationDecision { readonly allowed: boolean; readonly permission: Permission; readonly grantedBy?: Role | 'direct' | undefined; readonly reason?: string | undefined; }
  export interface RouteRule { readonly method: string | '*'; readonly path: string; readonly permissions: readonly Permission[]; readonly roles?: readonly Role[] | undefined; readonly authenticatedOnly?: boolean | undefined; }
  export function resolvePermissions(roles: readonly Role[], roleMap: ReadonlyMap<string, RoleDefinition>): Set<Permission>;
  export function hasPermission(effectivePermissions: ReadonlySet<Permission>, required: Permission): boolean;
  export function authorize(context: AuthorizationContext, requiredPermission: Permission): AuthorizationDecision;
  export function authorizeAny(context: AuthorizationContext, permissions: readonly Permission[]): AuthorizationDecision;
  export function authorizeAll(context: AuthorizationContext, permissions: readonly Permission[]): AuthorizationDecision;
  export function buildAuthorizationContext(userId: string, tenantId: string, roles: readonly Role[], roleMap: ReadonlyMap<string, RoleDefinition>, directGrants?: readonly Permission[]): AuthorizationContext;
}
