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

export const config = result.value;
export { isProduction, isDevelopment };
