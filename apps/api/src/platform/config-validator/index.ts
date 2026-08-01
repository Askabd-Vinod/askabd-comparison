/**
 * AskABD Platform — Configuration Validation Engine
 *
 * On startup, validates all required external dependencies and returns
 * friendly diagnostics instead of cryptic startup failures.
 *
 * Designed for extraction to @askabd/shared-config-validator.
 *
 * Validates:
 * - Database connectivity
 * - JWT configuration (secret or JWKS URL)
 * - External service URLs
 * - Required environment variables
 * - Storage connectivity (when applicable)
 *
 * Returns human-readable diagnostics with fix instructions.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ValidationStatus = 'pass' | 'fail' | 'warn' | 'skip';

export interface ConfigValidationResult {
  readonly name: string;
  readonly status: ValidationStatus;
  readonly message: string;
  readonly fix?: string;
  readonly required: boolean;
  readonly durationMs?: number;
}

export interface ConfigValidationReport {
  readonly timestamp: string;
  readonly service: string;
  readonly environment: string;
  readonly overallStatus: 'ready' | 'degraded' | 'failed';
  readonly results: readonly ConfigValidationResult[];
  readonly summary: {
    readonly total: number;
    readonly passed: number;
    readonly failed: number;
    readonly warnings: number;
    readonly skipped: number;
  };
}

export interface ConfigCheck {
  readonly name: string;
  readonly required: boolean;
  check(): Promise<ConfigValidationResult>;
}

// ─── Built-in Checks ──────────────────────────────────────────────────────────

/**
 * Creates a database connectivity check.
 */
export function databaseCheck(connectionString?: string): ConfigCheck {
  return {
    name: 'Database',
    required: true,
    async check(): Promise<ConfigValidationResult> {
      if (!connectionString) {
        return {
          name: 'Database',
          status: 'fail',
          message: 'DATABASE_URL not configured',
          fix: 'Set DATABASE_URL environment variable to a valid PostgreSQL connection string',
          required: true,
        };
      }
      // Validate URL format
      try {
        new URL(connectionString);
      } catch {
        return {
          name: 'Database',
          status: 'fail',
          message: 'DATABASE_URL is not a valid URL',
          fix: 'Ensure DATABASE_URL follows format: postgresql://user:pass@host:port/dbname',
          required: true,
        };
      }
      // Connectivity check handled by caller (Prisma)
      return {
        name: 'Database',
        status: 'pass',
        message: 'DATABASE_URL configured and valid format',
        required: true,
      };
    },
  };
}

/**
 * Creates a JWT configuration check.
 */
export function jwtCheck(): ConfigCheck {
  return {
    name: 'JWT Configuration',
    required: false, // Not required in dev mode
    async check(): Promise<ConfigValidationResult> {
      const hasSecret = !!process.env.JWT_SECRET;
      const hasJwks = !!process.env.JWKS_URL;
      const env = process.env.NODE_ENV ?? 'development';

      if (env === 'production' && !hasSecret && !hasJwks) {
        return {
          name: 'JWT Configuration',
          status: 'fail',
          message: 'No JWT verification configured for production',
          fix: 'Set JWT_SECRET (for symmetric) or JWKS_URL (for asymmetric/identity service)',
          required: true,
        };
      }

      if (!hasSecret && !hasJwks) {
        return {
          name: 'JWT Configuration',
          status: 'warn',
          message: 'No JWT configured — dev bypass active',
          fix: 'Set JWT_SECRET or JWKS_URL to enable real authentication',
          required: false,
        };
      }

      return {
        name: 'JWT Configuration',
        status: 'pass',
        message: hasJwks ? 'JWKS endpoint configured' : 'JWT secret configured',
        required: false,
      };
    },
  };
}

/**
 * Creates an environment variable presence check.
 */
export function envVarCheck(varName: string, required: boolean = true): ConfigCheck {
  return {
    name: `Env: ${varName}`,
    required,
    async check(): Promise<ConfigValidationResult> {
      const value = process.env[varName];
      if (!value) {
        return {
          name: `Env: ${varName}`,
          status: required ? 'fail' : 'warn',
          message: `${varName} is not set`,
          fix: `Set ${varName} in .env file or environment`,
          required,
        };
      }
      return {
        name: `Env: ${varName}`,
        status: 'pass',
        message: `${varName} is configured`,
        required,
      };
    },
  };
}

/**
 * Creates a URL reachability check.
 */
export function urlCheck(name: string, url: string | undefined, required: boolean): ConfigCheck {
  return {
    name,
    required,
    async check(): Promise<ConfigValidationResult> {
      if (!url) {
        return {
          name,
          status: required ? 'fail' : 'skip',
          message: `${name} URL not configured`,
          fix: `Configure the ${name} URL`,
          required,
        };
      }
      // Just validate URL format — don't make network calls at startup
      try {
        new URL(url);
        return { name, status: 'pass', message: `${name} URL format valid: ${url}`, required };
      } catch {
        return {
          name,
          status: 'fail',
          message: `${name} URL format invalid: ${url}`,
          fix: 'Ensure the URL is a valid format (https://...)',
          required,
        };
      }
    },
  };
}

// ─── Validation Runner ────────────────────────────────────────────────────────

/**
 * Runs all configuration checks and returns a comprehensive report.
 */
export async function validateConfiguration(
  service: string,
  environment: string,
  checks: readonly ConfigCheck[],
): Promise<ConfigValidationReport> {
  const results: ConfigValidationResult[] = [];

  for (const check of checks) {
    const start = Date.now();
    try {
      const result = await check.check();
      results.push({ ...result, durationMs: Date.now() - start });
    } catch (err) {
      results.push({
        name: check.name,
        status: 'fail',
        message: `Check threw error: ${(err as Error).message}`,
        fix: 'Investigate the configuration check implementation',
        required: check.required,
        durationMs: Date.now() - start,
      });
    }
  }

  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const warnings = results.filter(r => r.status === 'warn').length;
  const skipped = results.filter(r => r.status === 'skip').length;

  const requiredFailed = results.filter(r => r.status === 'fail' && r.required).length;
  const overallStatus: 'ready' | 'degraded' | 'failed' =
    requiredFailed > 0 ? 'failed' :
    warnings > 0 || failed > 0 ? 'degraded' : 'ready';

  return {
    timestamp: new Date().toISOString(),
    service,
    environment,
    overallStatus,
    results,
    summary: { total: results.length, passed, failed, warnings, skipped },
  };
}
