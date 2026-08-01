import { z } from 'zod';
import { loadConfig, isProduction, isDevelopment } from '@askabd/shared-configuration';
import { isOk } from '@askabd/shared-result';

/**
 * Application configuration loaded via @askabd/shared-configuration.
 * Validated against a Zod schema, frozen, and fail-fast on invalid config.
 */
const AppConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4200),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().default('postgresql://comp_user:comp_local_pass@localhost:5442/comparison'),
  GATEWAY_URL: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.string().default('info'),
});

const result = loadConfig(AppConfigSchema, { envFile: '.env' });

if (!isOk(result)) {
  console.error('Configuration validation failed:', result.error.message);
  process.exit(1);
}

export const config = result.value;
export { isProduction, isDevelopment };
