/**
 * AskABD Platform — Enterprise Diagnostics Engine
 *
 * Every failure automatically generates a multi-audience diagnostic report.
 * Designed for extraction to @askabd/shared-diagnostics.
 *
 * Audiences:
 * - Business User: What happened, why, how to fix
 * - Developer: Root cause, code location, dependencies
 * - Administrator: Infrastructure and configuration impact
 * - Architect: Platform impact, reuse opportunity
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type Priority = 'p0' | 'p1' | 'p2' | 'p3' | 'p4';

export interface DiagnosticReport {
  /** Unique diagnostic ID */
  readonly id: string;
  /** ISO timestamp */
  readonly timestamp: string;

  // Problem Definition
  readonly problem: string;
  readonly rootCause: string;
  readonly whyItHappened: string;

  // Impact Assessment
  readonly businessImpact: string;
  readonly technicalImpact: string;
  readonly operationalImpact: string;

  // Location
  readonly affectedRepository?: string;
  readonly affectedModule?: string;
  readonly affectedService?: string;
  readonly affectedApi?: string;
  readonly affectedTables?: readonly string[];
  readonly affectedConfiguration?: readonly string[];
  readonly affectedDocumentation?: readonly string[];
  readonly affectedBusinessRules?: readonly string[];

  // Classification
  readonly severity: Severity;
  readonly priority: Priority;
  readonly productionRisk: Severity;

  // Resolution
  readonly recommendedFix: string;
  readonly alternativeFix?: string;
  readonly autoFixAvailable: boolean;
  readonly estimatedEffort: string;
  readonly referenceDocumentation?: string;

  // Audience Views
  readonly userView: UserDiagnostic;
  readonly developerView: DeveloperDiagnostic;
  readonly adminView: AdminDiagnostic;
  readonly architectView: ArchitectDiagnostic;
}

export interface UserDiagnostic {
  readonly whatHappened: string;
  readonly whyItHappened: string;
  readonly whatIsMissing: string;
  readonly howToFix: string;
  readonly example?: string;
  readonly alternativeSolution?: string;
}

export interface DeveloperDiagnostic {
  readonly rootCause: string;
  readonly technicalDetails: string;
  readonly codeLocation?: string;
  readonly dependencies?: readonly string[];
  readonly suggestedImplementation?: string;
}

export interface AdminDiagnostic {
  readonly infrastructureImpact: string;
  readonly configurationImpact: string;
  readonly deploymentImpact: string;
  readonly monitoringImpact: string;
}

export interface ArchitectDiagnostic {
  readonly platformImpact: string;
  readonly reuseOpportunity: string;
  readonly futureModulesAffected: readonly string[];
  readonly sharedPackageOpportunity?: string;
}

// ─── Diagnostic Builder ───────────────────────────────────────────────────────

/**
 * Creates a diagnostic report from an error context.
 */
export function createDiagnostic(
  error: Error | { code?: string; message: string },
  context: {
    service: string;
    operation: string;
    module?: string;
    repository?: string;
  },
): DiagnosticReport {
  const code = 'code' in error ? (error.code ?? 'UNKNOWN') : 'UNKNOWN';
  const analysis = analyzeProblem(code, error.message, context);

  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),

    problem: analysis.problem,
    rootCause: analysis.rootCause,
    whyItHappened: analysis.whyItHappened,

    businessImpact: analysis.businessImpact,
    technicalImpact: analysis.technicalImpact,
    operationalImpact: analysis.operationalImpact,

    affectedRepository: context.repository ?? 'askabd-comparison',
    affectedModule: context.module,
    affectedService: context.service,
    affectedApi: context.operation,

    severity: analysis.severity,
    priority: analysis.priority,
    productionRisk: analysis.productionRisk,

    recommendedFix: analysis.recommendedFix,
    alternativeFix: analysis.alternativeFix,
    autoFixAvailable: analysis.autoFixAvailable,
    estimatedEffort: analysis.estimatedEffort,

    userView: {
      whatHappened: analysis.problem,
      whyItHappened: analysis.whyItHappened,
      whatIsMissing: analysis.whatIsMissing,
      howToFix: analysis.userFix,
      alternativeSolution: analysis.alternativeFix,
    },
    developerView: {
      rootCause: analysis.rootCause,
      technicalDetails: `Error code: ${code}. Message: ${error.message}`,
      codeLocation: `${context.service}/${context.operation}`,
      dependencies: analysis.dependencies,
      suggestedImplementation: analysis.suggestedImplementation,
    },
    adminView: {
      infrastructureImpact: analysis.infrastructureImpact,
      configurationImpact: analysis.configurationImpact,
      deploymentImpact: analysis.deploymentImpact,
      monitoringImpact: 'Monitor error rate for this operation',
    },
    architectView: {
      platformImpact: analysis.platformImpact,
      reuseOpportunity: analysis.reuseOpportunity,
      futureModulesAffected: analysis.futureModulesAffected,
      sharedPackageOpportunity: analysis.sharedPackageOpportunity,
    },
  };
}

// ─── Problem Analysis ─────────────────────────────────────────────────────────

interface ProblemAnalysis {
  problem: string;
  rootCause: string;
  whyItHappened: string;
  whatIsMissing: string;
  userFix: string;
  businessImpact: string;
  technicalImpact: string;
  operationalImpact: string;
  infrastructureImpact: string;
  configurationImpact: string;
  deploymentImpact: string;
  platformImpact: string;
  reuseOpportunity: string;
  futureModulesAffected: string[];
  sharedPackageOpportunity?: string;
  dependencies?: string[];
  suggestedImplementation?: string;
  severity: Severity;
  priority: Priority;
  productionRisk: Severity;
  recommendedFix: string;
  alternativeFix?: string;
  autoFixAvailable: boolean;
  estimatedEffort: string;
}

function analyzeProblem(
  code: string,
  message: string,
  context: { service: string; operation: string },
): ProblemAnalysis {
  // Prisma errors
  if (code.startsWith('P')) {
    return analyzePrismaError(code, message, context);
  }

  // Authentication/Authorization
  if (code.includes('AUTH') || message.toLowerCase().includes('unauthorized')) {
    return analyzeAuthError(code, message, context);
  }

  // Validation
  if (code.includes('VALIDATION') || message.toLowerCase().includes('validation')) {
    return analyzeValidationError(code, message, context);
  }

  // Default: unknown error
  return analyzeGenericError(code, message, context);
}

function analyzePrismaError(code: string, message: string, context: { service: string; operation: string }): ProblemAnalysis {
  const base: ProblemAnalysis = {
    problem: `Database operation failed in ${context.service}`,
    rootCause: `Prisma error ${code}: ${message}`,
    whyItHappened: 'A database constraint or connectivity issue occurred',
    whatIsMissing: 'Valid data or database connectivity',
    userFix: 'Please check your input and try again',
    businessImpact: 'Operation could not be completed',
    technicalImpact: 'Database operation rejected',
    operationalImpact: 'Service partially degraded',
    infrastructureImpact: code === 'P1001' ? 'Database unreachable' : 'None',
    configurationImpact: 'None',
    deploymentImpact: 'None',
    platformImpact: 'Comparison service affected',
    reuseOpportunity: 'Shared error handler for Prisma codes',
    futureModulesAffected: ['identity', 'workflow'],
    sharedPackageOpportunity: '@askabd/shared-database-errors',
    severity: code === 'P1001' ? 'critical' : 'medium',
    priority: code === 'P1001' ? 'p1' : 'p2',
    productionRisk: code === 'P1001' ? 'critical' : 'low',
    recommendedFix: 'Check database connectivity and data constraints',
    autoFixAvailable: false,
    estimatedEffort: '15 minutes',
  };

  switch (code) {
    case 'P2002':
      base.problem = 'Duplicate resource detected';
      base.rootCause = 'Unique constraint violation';
      base.userFix = 'A resource with this identifier already exists. Use a different name or update the existing one.';
      break;
    case 'P2025':
      base.problem = 'Resource not found';
      base.rootCause = 'Referenced record does not exist';
      base.userFix = 'The resource you are trying to access has been deleted or never existed.';
      break;
    case 'P1001':
      base.problem = 'Database connection failed';
      base.rootCause = 'Cannot reach database server';
      base.userFix = 'The service is experiencing connectivity issues. Please try again in a moment.';
      break;
  }

  return base;
}

function analyzeAuthError(_code: string, _message: string, context: { service: string; operation: string }): ProblemAnalysis {
  return {
    problem: `Authentication/Authorization failed in ${context.operation}`,
    rootCause: 'Invalid or missing credentials',
    whyItHappened: 'The request lacks valid authentication or sufficient permissions',
    whatIsMissing: 'Valid JWT token or required permissions',
    userFix: 'Please sign in again or contact your administrator for access',
    businessImpact: 'User cannot access the requested resource',
    technicalImpact: 'Request rejected at middleware layer',
    operationalImpact: 'None — security working as expected',
    infrastructureImpact: 'None',
    configurationImpact: 'Check JWT_SECRET and JWKS_URL configuration',
    deploymentImpact: 'None',
    platformImpact: 'Identity service integration point',
    reuseOpportunity: '@askabd/shared-auth middleware',
    futureModulesAffected: ['identity', 'workflow', 'assessment'],
    sharedPackageOpportunity: '@askabd/shared-authorization',
    severity: 'low',
    priority: 'p3',
    productionRisk: 'low',
    recommendedFix: 'Verify token validity and user permissions',
    autoFixAvailable: false,
    estimatedEffort: '5 minutes',
  };
}

function analyzeValidationError(_code: string, message: string, context: { service: string; operation: string }): ProblemAnalysis {
  return {
    problem: `Input validation failed in ${context.operation}`,
    rootCause: `Invalid input: ${message}`,
    whyItHappened: 'The request payload does not meet the required schema',
    whatIsMissing: 'Valid input data matching the API contract',
    userFix: 'Please check the required fields and data formats',
    businessImpact: 'Operation cannot proceed with invalid data',
    technicalImpact: 'Request rejected before reaching service layer',
    operationalImpact: 'None',
    infrastructureImpact: 'None',
    configurationImpact: 'None',
    deploymentImpact: 'None',
    platformImpact: 'None',
    reuseOpportunity: '@askabd/shared-validation handles this',
    futureModulesAffected: [],
    severity: 'low',
    priority: 'p4',
    productionRisk: 'low',
    recommendedFix: 'Fix the input payload to match the expected schema',
    autoFixAvailable: false,
    estimatedEffort: '5 minutes',
  };
}

function analyzeGenericError(_code: string, message: string, context: { service: string; operation: string }): ProblemAnalysis {
  return {
    problem: `Unexpected error in ${context.service}/${context.operation}`,
    rootCause: message,
    whyItHappened: 'An unhandled condition occurred',
    whatIsMissing: 'Error handling for this specific case',
    userFix: 'Please try again. If the problem persists, contact support.',
    businessImpact: 'Operation failed — may need retry',
    technicalImpact: 'Unhandled error path requires investigation',
    operationalImpact: 'Service stability may be affected if recurring',
    infrastructureImpact: 'Monitor for cascading failures',
    configurationImpact: 'Review service configuration',
    deploymentImpact: 'May need hotfix if recurring',
    platformImpact: 'Potential shared error handling gap',
    reuseOpportunity: 'Add to shared error catalog',
    futureModulesAffected: ['all services using same pattern'],
    sharedPackageOpportunity: '@askabd/shared-errors (extend)',
    severity: 'high',
    priority: 'p2',
    productionRisk: 'medium',
    recommendedFix: 'Investigate root cause and add specific error handling',
    autoFixAvailable: false,
    estimatedEffort: '1 hour',
  };
}
