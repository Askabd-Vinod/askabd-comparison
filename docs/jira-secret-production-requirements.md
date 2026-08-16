# Jira Token — Production Secret Storage Requirement

**Status: NOT READY. Do not configure real Jira credentials in any environment where this
document's requirements aren't satisfied and verified.**

## Current state (DEV/local, honest, not fabricated)

- Token storage/retrieval goes through the `SecretProvider` abstraction (`apps/api/src/services/secrets-provider.ts`).
- The active provider is `DevSecretProvider` — it stores whatever value it's given, unmodified. This is a **test/local credential handling mechanism**, not encryption, not a vault, not production-safe.
- Net effect today: the token sits in plaintext in `oc_jira_integrations.auth_token_encrypted`. The column name is legacy and misleading — it does not perform encryption.
- What's already correctly protected regardless of storage: the token is never returned by `GET /oc/jira/config` (always masked as `••••••••`), never sent to the frontend in any other form, and never logged (verified by test).

## What's required before this is production-ready

1. **AWS Secrets Manager integration**, using the same account/region already scaffolded (unapplied) at `infra/aws/modules/secrets/main.tf`.
2. **Secret name**, matching the existing Terraform module's naming convention: `askabd/${environment}/jira-token` (e.g. `askabd/production/jira-token`).
3. **IAM permissions** for the API's execution role: `secretsmanager:GetSecretValue` and `secretsmanager:PutSecretValue`, scoped to `arn:aws:secretsmanager:*:*:secret:askabd/${environment}/jira-token*` — not a wildcard across all secrets.
4. **Environment variables** on the API service: `SECRETS_PROVIDER=aws-secrets-manager`, `AWS_REGION=<region>`.
5. **Dependency**: add `@aws-sdk/client-secrets-manager` to `apps/api/package.json` and implement `AwsSecretsManagerProvider.putSecret`/`getSecret` in `secrets-provider.ts` using `PutSecretValueCommand`/`GetSecretValueCommand`. The class and its call sites already exist and are wired in — only the AWS SDK calls themselves are unimplemented (they currently throw with this exact checklist in the error message, so misconfiguration fails loudly rather than silently).
6. **Rotation**: configure a Secrets Manager rotation schedule (or a documented manual rotation runbook) for the Jira API token, consistent with whatever policy governs the other secrets in that module (`database-url`, `jwt-secret`, `scheduler-auth-token`).
7. **Verification command** (run after deployment, before enabling real Jira credentials):
   ```bash
   aws secretsmanager get-secret-value --secret-id askabd/production/jira-token --query SecretString --output text
   ```
   This must succeed and return the expected value — if it fails, the API's `AwsSecretsManagerProvider` will fail identically (by design, not coincidentally).

## What must NOT be done to close this out

- No hardcoded encryption key, in source or in an env var, without a real key-management system behind it.
- No storing the encryption key in the same database as the encrypted value.
- No pretending `DevSecretProvider` is "encryption" in documentation or status pages.
- No marking Jira integration "production ready" without running the verification command above against real infrastructure and recording the result.

## Sign-off criteria

- [ ] `@aws-sdk/client-secrets-manager` installed and `AwsSecretsManagerProvider` implemented
- [ ] Terraform `infra/aws/modules/secrets/` applied, including a `jira-token` secret resource
- [ ] IAM role permissions scoped and verified
- [ ] `SECRETS_PROVIDER=aws-secrets-manager` set in the target environment
- [ ] Verification command above run successfully against that environment
- [ ] A real Jira health check (`POST /oc/jira/test` equivalent) passes end-to-end against a real Jira instance

Until every box above is checked, this integration is **NOT READY** — do not represent it otherwise on any dashboard or in any report.
