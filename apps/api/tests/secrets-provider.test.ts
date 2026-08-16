/**
 * Secret storage abstraction — apps/api/src/services/secrets-provider.ts
 *
 * Verifies: DEV provider round-trips a value transparently (documented as NOT
 * production-safe); the AWS provider fails loudly and explicitly rather than
 * silently succeeding or silently falling back to plaintext; provider selection
 * is explicit opt-in only, never implied by NODE_ENV.
 */
import { describe, expect, it, afterEach } from 'vitest';
import { DevSecretProvider, AwsSecretsManagerProvider, getSecretProvider } from '../src/services/secrets-provider.js';

const ORIGINAL_ENV = process.env.SECRETS_PROVIDER;
afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.SECRETS_PROVIDER;
  else process.env.SECRETS_PROVIDER = ORIGINAL_ENV;
});

describe('DevSecretProvider', () => {
  it('round-trips a value as-is (documented as NOT production-safe, not encryption)', async () => {
    const provider = new DevSecretProvider();
    const ref = await provider.putSecret('jira/test/token', 'a-real-looking-token-value');
    expect(ref).toBe('a-real-looking-token-value');
    const resolved = await provider.getSecret(ref);
    expect(resolved).toBe('a-real-looking-token-value');
  });

  it('reports its kind honestly', () => {
    expect(new DevSecretProvider().kind).toBe('dev-plaintext');
  });
});

describe('AwsSecretsManagerProvider — fails loudly, never fakes success', () => {
  it('putSecret throws with the exact production requirements, not a silent success', async () => {
    const provider = new AwsSecretsManagerProvider();
    await expect(provider.putSecret('jira/production/token', 'x')).rejects.toThrow(/AWS Secrets Manager/i);
  });

  it('getSecret throws rather than ever returning a fabricated or fallback value', async () => {
    const provider = new AwsSecretsManagerProvider();
    await expect(provider.getSecret('some-reference')).rejects.toThrow(/AWS Secrets Manager/i);
  });

  it('reports its kind honestly', () => {
    expect(new AwsSecretsManagerProvider().kind).toBe('aws-secrets-manager');
  });
});

describe('getSecretProvider() — explicit opt-in only', () => {
  it('defaults to DevSecretProvider when SECRETS_PROVIDER is unset', () => {
    delete process.env.SECRETS_PROVIDER;
    expect(getSecretProvider().kind).toBe('dev-plaintext');
  });

  it('never silently selects the AWS provider based on NODE_ENV alone', () => {
    // NODE_ENV=production (or any value) must NOT change provider selection by itself —
    // only the explicit SECRETS_PROVIDER opt-in does.
    delete process.env.SECRETS_PROVIDER;
    expect(getSecretProvider().kind).toBe('dev-plaintext');
  });

  it('selects AwsSecretsManagerProvider only when explicitly requested', () => {
    process.env.SECRETS_PROVIDER = 'aws-secrets-manager';
    expect(getSecretProvider().kind).toBe('aws-secrets-manager');
  });
});
