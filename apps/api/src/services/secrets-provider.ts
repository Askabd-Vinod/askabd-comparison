/**
 * Secret storage abstraction.
 *
 * Exists to give services (currently: Jira integration) one seam to store/retrieve a
 * credential through, instead of reading/writing the raw value directly — so swapping
 * DEV's placeholder mechanism for a real production secret store is a configuration
 * change, not a rewrite of the calling service.
 *
 * - DevSecretProvider: stores the value as-is. NOT production-safe. Exists only so local
 *   development and tests work without any external dependency. This is what's active by
 *   default (including in this deployment right now) and is exactly what's already
 *   documented as a production security blocker in jira-integration-service.ts.
 * - AwsSecretsManagerProvider: the correctly-shaped production integration point — matches
 *   the naming convention already used by the existing (unapplied) Terraform module at
 *   infra/aws/modules/secrets/main.tf (`askabd/${environment}/...`). It is NOT implemented
 *   against real AWS in this environment (no credentials, no @aws-sdk/client-secrets-manager
 *   dependency installed) — selecting it fails loudly and explicitly rather than silently
 *   falling back to plaintext. See docs/jira-secret-production-requirements.md for the exact
 *   infrastructure required before this can be switched on for real.
 *
 * Provider selection is explicit opt-in only (SECRETS_PROVIDER env var) — it never silently
 * "upgrades" based on NODE_ENV, because an unconfigured AWS provider must fail immediately
 * and obviously, not pretend to work.
 */

export interface SecretProvider {
  readonly kind: 'dev-plaintext' | 'aws-secrets-manager';
  /** Store a secret value; returns an opaque reference to persist instead of the raw value. */
  putSecret(name: string, value: string): Promise<string>;
  /** Resolve a stored reference back to the real secret value, for actual use (e.g. an outbound API call). */
  getSecret(reference: string): Promise<string>;
}

export class DevSecretProvider implements SecretProvider {
  readonly kind = 'dev-plaintext' as const;
  async putSecret(_name: string, value: string): Promise<string> {
    return value; // stored as-is — see the production blocker documented in jira-integration-service.ts
  }
  async getSecret(reference: string): Promise<string> {
    return reference;
  }
}

const AWS_SECRETS_MANAGER_REQUIREMENTS =
  'AWS Secrets Manager integration is not available in this environment: no AWS credentials configured, ' +
  'and the @aws-sdk/client-secrets-manager package is not installed. Required before this can work: ' +
  '(1) install @aws-sdk/client-secrets-manager, (2) AWS_REGION env var, (3) IAM permissions ' +
  'secretsmanager:GetSecretValue + secretsmanager:PutSecretValue scoped to arn:aws:secretsmanager:*:*:secret:askabd/*, ' +
  '(4) apply the existing infra/aws/modules/secrets/ Terraform module. ' +
  'See docs/jira-secret-production-requirements.md for the full checklist.';

export class AwsSecretsManagerProvider implements SecretProvider {
  readonly kind = 'aws-secrets-manager' as const;
  async putSecret(_name: string, _value: string): Promise<string> {
    throw new Error(AWS_SECRETS_MANAGER_REQUIREMENTS);
  }
  async getSecret(_reference: string): Promise<string> {
    throw new Error(AWS_SECRETS_MANAGER_REQUIREMENTS);
  }
}

/**
 * Explicit opt-in only — set SECRETS_PROVIDER=aws-secrets-manager to select the (currently
 * unimplemented-against-real-AWS) production provider. Never chosen implicitly by NODE_ENV.
 */
export function getSecretProvider(): SecretProvider {
  if (process.env.SECRETS_PROVIDER === 'aws-secrets-manager') return new AwsSecretsManagerProvider();
  return new DevSecretProvider();
}
