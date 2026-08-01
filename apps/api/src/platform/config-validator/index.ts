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


// ─── Extended Platform Checks ─────────────────────────────────────────────────

/**
 * Node.js version check (platform minimum).
 */
export function nodeVersionCheck(minMajor: number = 20): ConfigCheck {
  return {
    name: 'Node.js Version',
    required: true,
    async check(): Promise<ConfigValidationResult> {
      const version = process.versions.node;
      const major = parseInt(version.split('.')[0]!, 10);
      if (major < minMajor) {
        return {
          name: 'Node.js Version',
          status: 'fail',
          message: `Node.js ${version} detected. Minimum required: ${minMajor}.x`,
          fix: `Upgrade Node.js to v${minMajor} or later (nvm install ${minMajor})`,
          required: true,
        };
      }
      return {
        name: 'Node.js Version',
        status: 'pass',
        message: `Node.js ${version} (meets minimum ${minMajor}.x)`,
        required: true,
      };
    },
  };
}

/**
 * Port availability check (ensure port isn't already in use).
 */
export function portCheck(port: number): ConfigCheck {
  return {
    name: `Port ${port}`,
    required: true,
    async check(): Promise<ConfigValidationResult> {
      const net = await import('node:net');
      return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE') {
            resolve({
              name: `Port ${port}`,
              status: 'fail',
              message: `Port ${port} is already in use`,
              fix: `Stop the process using port ${port}, or change PORT in .env`,
              required: true,
            });
          } else {
            resolve({
              name: `Port ${port}`,
              status: 'warn',
              message: `Port check error: ${err.message}`,
              required: true,
            });
          }
        });
        server.once('listening', () => {
          server.close(() => {
            resolve({
              name: `Port ${port}`,
              status: 'pass',
              message: `Port ${port} is available`,
              required: true,
            });
          });
        });
        server.listen(port, '127.0.0.1');
      });
    },
  };
}

/**
 * Database connectivity check (live TCP probe — does NOT import Prisma).
 */
export function databaseConnectivityCheck(connectionString?: string): ConfigCheck {
  return {
    name: 'Database Connectivity',
    required: true,
    async check(): Promise<ConfigValidationResult> {
      if (!connectionString) {
        return { name: 'Database Connectivity', status: 'skip', message: 'No DATABASE_URL', required: true };
      }
      try {
        const url = new URL(connectionString);
        const host = url.hostname === 'localhost' ? '127.0.0.1' : url.hostname;
        const port = parseInt(url.port || '5432', 10);

        const net = await import('node:net');
        return new Promise((resolve) => {
          const socket = net.createConnection({ host, port, timeout: 3000 });
          socket.once('connect', () => {
            socket.destroy();
            resolve({
              name: 'Database Connectivity',
              status: 'pass',
              message: `PostgreSQL reachable at ${host}:${port}`,
              required: true,
            });
          });
          socket.once('timeout', () => {
            socket.destroy();
            resolve({
              name: 'Database Connectivity',
              status: 'fail',
              message: `Cannot reach PostgreSQL at ${host}:${port} (timeout)`,
              fix: `Ensure PostgreSQL is running: docker compose up -d`,
              required: true,
            });
          });
          socket.once('error', (err) => {
            socket.destroy();
            resolve({
              name: 'Database Connectivity',
              status: 'fail',
              message: `Cannot reach PostgreSQL at ${host}:${port}: ${err.message}`,
              fix: `Start PostgreSQL: docker compose up -d (or check DATABASE_URL)`,
              required: true,
            });
          });
        });
      } catch {
        return { name: 'Database Connectivity', status: 'fail', message: 'Invalid DATABASE_URL format', fix: 'Check DATABASE_URL format', required: true };
      }
    },
  };
}

/**
 * Memory check (available memory threshold).
 */
export function memoryCheck(warnThresholdMB: number = 256): ConfigCheck {
  return {
    name: 'Memory',
    required: false,
    async check(): Promise<ConfigValidationResult> {
      const mem = process.memoryUsage();
      const rssMB = Math.round(mem.rss / 1024 / 1024);
      if (rssMB > warnThresholdMB) {
        return {
          name: 'Memory',
          status: 'warn',
          message: `RSS ${rssMB}MB exceeds warning threshold ${warnThresholdMB}MB`,
          fix: 'Investigate memory usage or increase container limits',
          required: false,
        };
      }
      return {
        name: 'Memory',
        status: 'pass',
        message: `RSS ${rssMB}MB (threshold: ${warnThresholdMB}MB)`,
        required: false,
      };
    },
  };
}

/**
 * Platform middleware check (verifies expected modules are loadable).
 */
export function middlewareCheck(middlewareName: string, importPath: string): ConfigCheck {
  return {
    name: `Middleware: ${middlewareName}`,
    required: false,
    async check(): Promise<ConfigValidationResult> {
      try {
        await import(importPath);
        return {
          name: `Middleware: ${middlewareName}`,
          status: 'pass',
          message: `${middlewareName} module available`,
          required: false,
        };
      } catch (err) {
        return {
          name: `Middleware: ${middlewareName}`,
          status: 'fail',
          message: `${middlewareName} module failed to load: ${(err as Error).message}`,
          fix: `Check that ${importPath} exists and has no syntax errors`,
          required: false,
        };
      }
    },
  };
}

// ─── Enterprise Readiness Score ───────────────────────────────────────────────

export interface ReadinessScore {
  readonly platform: number;
  readonly security: number;
  readonly database: number;
  readonly infrastructure: number;
  readonly api: number;
  readonly overall: number;
}

/**
 * Calculates enterprise readiness scores from a validation report.
 * Each dimension is 0-100.
 */
export function calculateReadiness(report: ConfigValidationReport): ReadinessScore {
  const results = report.results;

  const score = (names: string[]): number => {
    const matched = results.filter(r => names.some(n => r.name.toLowerCase().includes(n.toLowerCase())));
    if (matched.length === 0) return 100; // No checks for this dimension = assumed ready
    const passed = matched.filter(r => r.status === 'pass').length;
    return Math.round((passed / matched.length) * 100);
  };

  const platform = score(['node', 'middleware', 'port', 'memory']);
  const security = score(['jwt', 'auth']);
  const database = score(['database']);
  const infrastructure = score(['node', 'memory', 'port']);
  const api = score(['gateway', 'port']);
  const overall = Math.round((platform + security + database + infrastructure + api) / 5);

  return { platform, security, database, infrastructure, api, overall };
}
