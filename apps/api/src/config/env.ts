import { z } from 'zod';
import { loadConfig, isProduction, isDevelopment } from '@askabd/shared-configuration';
import { isOk } from '@askabd/shared-result';

/**
 * Application configuration loaded via @askabd/shared-configuration.
 * Validated against a Zod schema, frozen, and fail-fast on invalid config.
 *
 * AWS-ready: supports RDS, S3, SES, Secrets Manager configuration.
 * DEV defaults allow local development without any AWS credentials.
 */
const AppConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4200),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().default('postgresql://comp_user:comp_local_pass@localhost:5442/comparison'),
  GATEWAY_URL: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.string().default('info'),
  // CORS
  CORS_ORIGIN: z.string().default('*'),
  // Storage
  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  DOCUMENT_STORAGE_PATH: z.string().optional(),
  // Email
  EMAIL_PROVIDER: z.enum(['mailpit', 'smtp', 'ses']).default('mailpit'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SES_REGION: z.string().optional(),
  SES_DOMAIN: z.string().default('askabd.com'),
  // Security
  JWT_SECRET: z.string().optional(),
  JWKS_URL: z.string().optional(),
  // Expected JWT issuer — matches askabd-identity's real, hardcoded issuer claim
  // (src/services/token-service.ts: .setIssuer('askabd-identity')). Configurable rather
  // than hardcoded in the middleware so a non-default identity deployment can override it.
  JWT_ISSUER: z.string().default('askabd-identity'),
  // Expected JWT audience. Only enforced when set (see middleware/auth.ts — jose skips
  // the `aud` check entirely when this is undefined). Matches askabd-identity's
  // TOKEN_AUDIENCE default ('askabd-platform') when both services use their defaults.
  JWT_AUDIENCE: z.string().optional(),
  // Scheduler
  SCHEDULER_AUTH_TOKEN: z.string().optional(),
});

const result = loadConfig(AppConfigSchema, { envFile: '.env' });

if (!isOk(result)) {
  console.error('Configuration validation failed:', result.error.message);
  process.exit(1);
}

/**
 * RISK-004 fix (docs/security-risk-register.md): server.ts combines
 * `credentials: true` with a reflect-any-Origin CORS policy whenever
 * CORS_ORIGIN is `'*'` (its own schema default above, when the env var is
 * unset) — the textbook risky CORS combination. `deploy/PRODUCTION.md`'s own
 * go-live checklist already requires "CORS_ORIGIN restricted to actual
 * frontend domain"; this makes that requirement impossible to silently skip
 * rather than merely documented. Same fail-fast shape already used for
 * invalid config just above — not a new mechanism.
 *
 * A pure, exported function (rather than an inline check) so this exact
 * validation logic can be unit-tested directly, without spawning a real
 * subprocess or reloading this module with different env vars.
 */
export function validateProductionCorsOrigin(nodeEnv: string | undefined, corsOrigin: string | undefined): string | null {
  // Mirrors server.ts's own `config.CORS_ORIGIN ?? '*'` read — an unset
  // CORS_ORIGIN is exactly as dangerous in production as an explicit '*'.
  const effectiveOrigin = corsOrigin ?? '*';
  if (nodeEnv === 'production' && effectiveOrigin === '*') {
    return (
      'Configuration validation failed: CORS_ORIGIN must be set to the real frontend domain(s) in production — ' +
      'refusing to start with the wildcard default, which would combine with credentials:true in server.ts ' +
      '(reflect-any-Origin + credentials is the textbook risky CORS combination). ' +
      'Set CORS_ORIGIN to a comma-separated list of allowed origins, e.g. https://app.askabd.com.'
    );
  }
  return null;
}

export const config = result.value;

// config.NODE_ENV/CORS_ORIGIN are typed `string | undefined` despite the Zod
// schema's own `.default(...)` above (a pre-existing looseness in how
// @askabd/shared-configuration's loadConfig types its output) — the function
// itself defaults a missing CORS_ORIGIN to '*' internally, matching
// server.ts's own identical `config.CORS_ORIGIN ?? '*'` read.
const corsError = validateProductionCorsOrigin(config.NODE_ENV, config.CORS_ORIGIN);
if (corsError) {
  console.error(corsError);
  process.exit(1);
}

export { isProduction, isDevelopment };
