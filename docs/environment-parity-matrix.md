# AskABD Environment Parity Matrix

## Date: 2026-08-16

| Configuration | DEV | TEST | STAGING | PRODUCTION | Required | Secret | Default | Fail-Fast |
|---|---|---|---|---|---|---|---|---|
| NODE_ENV | development | test | staging | production | ✅ | No | development | ✅ (exit 1 on check fail) |
| PORT | 4200 | 4200 | 4200 | 4200 | ✅ | No | 4200 | No |
| HOST | 0.0.0.0 | 0.0.0.0 | 0.0.0.0 | 0.0.0.0 | ✅ | No | 0.0.0.0 | No |
| DATABASE_URL | localhost:5442 | localhost:5442 | RDS endpoint | RDS endpoint | ✅ | ✅ | DEV default | ✅ (DB init fails) |
| JWT_SECRET | optional | optional | required | required | STAGING+ | ✅ | none | ✅ (config check) |
| CORS_ORIGIN | * | * | domain list | domain list | ✅ | No | * | No |
| SMTP_HOST | not set (Mailpit) | not set | smtp.provider.com | ses/smtp | STAGING+ | No | localhost fallback | No |
| SMTP_PORT | 1025 (Mailpit) | 1025 | 587 | 587/465 | With SMTP_HOST | No | 1025 | No |
| SMTP_USER | not set | not set | configured | configured | STAGING+ | ✅ | none | No |
| SMTP_PASS | not set | not set | configured | configured | STAGING+ | ✅ | none | No |
| STORAGE_PROVIDER | local | local | s3 | s3 | ✅ | No | local | No |
| S3_BUCKET | — | — | staging bucket | prod bucket | With s3 | No | none | No |
| S3_REGION | — | — | region | region | With s3 | No | us-east-1 | No |
| LOG_LEVEL | info | info | info | warn | ✅ | No | info | No |
| EMAIL_PROVIDER | mailpit | mailpit | smtp | ses | ✅ | No | mailpit | No |

## DEV-Only Behaviors (NEVER in production)

| Behavior | Guard | Evidence |
|---|---|---|
| OTP demo bypass (123456) | `config.NODE_ENV !== 'production'` | operations-center-routes.ts |
| Auth middleware dev bypass | `config.NODE_ENV !== 'production'` | middleware/auth.ts |
| RBAC dev bypass | `devBypass: config.NODE_ENV !== 'production'` | server.ts |
| Config check non-fatal | `config.NODE_ENV === 'production'` → exit(1) | index.ts |

## Production Requirements

1. DATABASE_URL must point to RDS (never localhost)
2. JWT_SECRET must be set (min 32 chars)
3. CORS_ORIGIN must be explicit domain list (not *)
4. SMTP must be configured (SES or external SMTP)
5. STORAGE_PROVIDER should be s3 with proper bucket
6. No DEV defaults may be silently accepted in production
