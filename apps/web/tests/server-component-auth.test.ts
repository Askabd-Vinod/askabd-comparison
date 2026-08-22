/**
 * Regression guard for a real, live-verified bug: apps/web/src/app/lib/api.ts
 * (used by 57 `(app)/**` Server Component pages) fetched the API with NO
 * Authorization header at all. This was invisible while the API ran in
 * devBypass mode; once JWKS_URL was correctly configured (closing that
 * unintended bypass), every one of those pages started 401'ing and silently
 * rendering "0 clients" for a real, existing client — a fabricated-looking
 * empty state caused by a broken fetch, not real data absence. Verified fixed
 * live in the browser (staff dashboard, /clients, /engineering all showed the
 * real client and real defects after the fix). This test is a lightweight
 * static guard against someone reverting the fix, not a substitute for that
 * live verification — a true integration test would need a Next.js server
 * request context (`next/headers`) that a plain vitest run doesn't have.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(__dirname, '../src/app/lib/api.ts'), 'utf8');

describe('server-component API helper attaches real auth', () => {
  it('reads the staff session cookie via next/headers', () => {
    expect(src).toContain("from 'next/headers'");
    expect(src).toMatch(/cookies\(\)/);
  });

  it('attaches an Authorization header before fetching', () => {
    expect(src).toMatch(/Authorization/);
    expect(src).toMatch(/headers/);
  });

  it('does not fetch with a hardcoded empty header set (the original bug)', () => {
    // The original code called fetch(url, { cache: 'no-store', ...opts }) with
    // no headers key at all — this guards against that exact shape reappearing.
    expect(src).not.toMatch(/fetch\(`\$\{API\}\$\{path\}`,\s*\{\s*cache: 'no-store',\s*\.\.\.opts\s*\}\)/);
  });
});
