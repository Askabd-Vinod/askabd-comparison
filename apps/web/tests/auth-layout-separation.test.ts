/**
 * Real regression guard for the routing/layout architecture fix.
 *
 * The original bug: `/staff/login` rendered inside the full authenticated
 * console shell (NavBar with Dashboard/Clients/Platform links, StaffAuthGuard,
 * AICopilot, footer) because the single root `app/layout.tsx` rendered that
 * shell unconditionally for every route. The fix is route-group layout
 * separation, not CSS hiding — these tests read the actual layout source
 * files and assert the separation structurally, so a future edit that
 * accidentally reintroduces the shell into an auth/portal layout (or removes
 * it from the app shell) fails a test instead of shipping silently.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const APP_DIR = resolve(__dirname, '../src/app');
const read = (rel: string) => readFileSync(resolve(APP_DIR, rel), 'utf8');

// Matches actual JSX usage (e.g. `<NavBar`) — deliberately NOT a bare
// substring match, since these files' own doc comments name the components
// they're explaining the absence of.
const usesComponent = (src: string, name: string) => new RegExp(`<${name}\\b`).test(src);

describe('route-group layout separation', () => {
  it('the root layout is minimal — no shell chrome, no auth guard', () => {
    const src = read('layout.tsx');
    expect(usesComponent(src, 'NavBar')).toBe(false);
    expect(usesComponent(src, 'StaffAuthGuard')).toBe(false);
    expect(usesComponent(src, 'AICopilot')).toBe(false);
  });

  it('the (auth) layout renders no staff console chrome', () => {
    const src = read('(auth)/layout.tsx');
    expect(usesComponent(src, 'NavBar')).toBe(false);
    expect(usesComponent(src, 'StaffAuthGuard')).toBe(false);
    expect(usesComponent(src, 'AICopilot')).toBe(false);
  });

  it('the (portal) layout renders no staff console chrome', () => {
    const src = read('(portal)/layout.tsx');
    expect(usesComponent(src, 'NavBar')).toBe(false);
    expect(usesComponent(src, 'StaffAuthGuard')).toBe(false);
    expect(usesComponent(src, 'AICopilot')).toBe(false);
  });

  it('the (app) layout is the one and only place the staff shell renders', () => {
    const src = read('(app)/layout.tsx');
    expect(usesComponent(src, 'NavBar')).toBe(true);
    expect(usesComponent(src, 'StaffAuthGuard')).toBe(true);
    expect(usesComponent(src, 'AICopilot')).toBe(true);
  });

  it('staff login, customer login, and invitation-accept pages live under (auth), not the app shell', () => {
    // A throw here means the file isn't where the route-group migration put it —
    // i.e. it would be back under the old top-level path and inherit the app shell.
    expect(() => read('(auth)/staff/login/page.tsx')).not.toThrow();
    expect(() => read('(auth)/login/page.tsx')).not.toThrow();
    expect(() => read('(auth)/accept-invitation/page.tsx')).not.toThrow();
  });

  it('the client portal pages live under (portal), not the app shell', () => {
    expect(() => read('(portal)/client-portal/[clientId]/page.tsx')).not.toThrow();
  });

  it('forgot-password and reset-password pages live under (auth), not the app shell', () => {
    expect(() => read('(auth)/forgot-password/page.tsx')).not.toThrow();
    expect(() => read('(auth)/reset-password/page.tsx')).not.toThrow();
    const forgot = read('(auth)/forgot-password/page.tsx');
    const reset = read('(auth)/reset-password/page.tsx');
    expect(usesComponent(forgot, 'NavBar')).toBe(false);
    expect(usesComponent(reset, 'NavBar')).toBe(false);
  });

  it('staff and customer login pages carry the exact required copy', () => {
    const staff = read('(auth)/staff/login/page.tsx');
    expect(staff).toContain('AskABD Staff Sign In');
    expect(staff).toContain('Sign in to the AskABD Enterprise Operations Centre.');
    expect(staff).toContain('Staff accounts are provisioned by AskABD administrators.');
    expect(staff).not.toMatch(/create (a |an )?(staff )?account/i);
    expect(staff).not.toMatch(/sign up/i);

    const customer = read('(auth)/login/page.tsx');
    expect(customer).toContain('Sign in to your AskABD workspace');
    expect(customer).toContain('Accept an invitation');
  });
});
