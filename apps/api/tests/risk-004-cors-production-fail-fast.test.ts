/**
 * risk_004_cors_production_fail_fast_test_1 — the real fix for RISK-004
 * (docs/security-risk-register.md): `server.ts` combines `credentials: true`
 * with a reflect-any-Origin CORS policy whenever `CORS_ORIGIN` is `'*'` —
 * the textbook risky CORS combination. `config/env.ts` now refuses to start
 * in production with that combination, matching this file's own existing
 * fail-fast pattern for other invalid config, and matching
 * `deploy/PRODUCTION.md`'s own go-live checklist requirement that
 * CORS_ORIGIN be restricted to the real frontend domain.
 *
 * Tests the exported, pure `validateProductionCorsOrigin` function directly
 * — real logic, no subprocess spawning or module-reload tricks needed.
 */
import { describe, expect, it } from 'vitest';
import { validateProductionCorsOrigin } from '../src/config/env.js';

describe('validateProductionCorsOrigin — RISK-004 real fix', () => {
  it('production + explicit wildcard CORS_ORIGIN is refused', () => {
    const err = validateProductionCorsOrigin('production', '*');
    expect(err).not.toBeNull();
    expect(err).toContain('CORS_ORIGIN must be set');
  });

  it('production + unset (undefined) CORS_ORIGIN is refused — exactly as dangerous as an explicit wildcard', () => {
    const err = validateProductionCorsOrigin('production', undefined);
    expect(err).not.toBeNull();
  });

  it('production + a real, restricted origin is allowed', () => {
    const err = validateProductionCorsOrigin('production', 'https://app.askabd.com');
    expect(err).toBeNull();
  });

  it('production + a real, comma-separated multi-origin list is allowed', () => {
    const err = validateProductionCorsOrigin('production', 'https://app.askabd.com,https://staff.askabd.com');
    expect(err).toBeNull();
  });

  it('development + wildcard CORS_ORIGIN is allowed — dev-only convenience, unchanged', () => {
    const err = validateProductionCorsOrigin('development', '*');
    expect(err).toBeNull();
  });

  it('test + wildcard CORS_ORIGIN is allowed — this repo\'s own test suite runs with NODE_ENV=test and no CORS_ORIGIN set', () => {
    const err = validateProductionCorsOrigin('test', '*');
    expect(err).toBeNull();
  });

  it('an unset NODE_ENV (undefined) is never treated as production', () => {
    const err = validateProductionCorsOrigin(undefined, '*');
    expect(err).toBeNull();
  });
});
