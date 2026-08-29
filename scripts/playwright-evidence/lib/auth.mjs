/**
 * Real staff-session bootstrap for Playwright evidence runs.
 *
 * Never enters or observes a password — the same standing, non-negotiable
 * boundary held all session. Two real auth paths, both avoiding that:
 *
 * 1. `getAuthenticatedContextFromExport()` — the user, on their own real
 *    machine/browser (already logged in), runs a small DevTools snippet
 *    (see export-session-instructions.md) that downloads a JSON file
 *    containing their own real cookies/localStorage/sessionStorage. They
 *    save it to `.auth/staff-state.json` themselves. This script then
 *    loads that file directly into a real Playwright context — it never
 *    logs, prints, or returns the file's contents anywhere; Node reads it
 *    once, feeds it straight into the browser process, and nothing about
 *    its value is ever surfaced back to the orchestrating agent.
 * 2. `getAuthenticatedContext()` — a headed (visible) browser the user
 *    logs into themselves. Kept for completeness, but confirmed this
 *    session NOT to work in this sandboxed shell (`spawn UNKNOWN` — no
 *    interactive desktop/display attached to this process).
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, '..', '.auth');
const EXPORT_PATH = path.join(AUTH_DIR, 'staff-state.json');
const WEB_ORIGIN = process.env.ASKABD_WEB_ORIGIN || 'http://localhost:3001';

async function isRealAuthedView(page) {
  const text = await page.locator('body').innerText().catch(() => '');
  return /super_admin|—\s*admin\s*—|—\s*staff\s*—/i.test(text);
}

/** Path 1 — load a real, user-exported session file. Never logs its contents. */
export async function getAuthenticatedContextFromExport(browser, exportPath = EXPORT_PATH) {
  if (!fs.existsSync(exportPath)) {
    throw new Error(`No exported session found at ${exportPath}. Follow export-session-instructions.md first.`);
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(WEB_ORIGIN, { waitUntil: 'domcontentloaded' });

  const raw = fs.readFileSync(exportPath, 'utf8'); // read once, never logged/returned
  const state = JSON.parse(raw);

  if (Array.isArray(state.cookies) && state.cookies.length > 0) {
    await context.addCookies(state.cookies.map(c => ({ name: c.name, value: c.value, url: WEB_ORIGIN })));
  }
  await page.evaluate((entries) => {
    for (const [k, v] of Object.entries(entries || {})) sessionStorage.setItem(k, v);
  }, state.sessionStorage || {});
  await page.evaluate((entries) => {
    for (const [k, v] of Object.entries(entries || {})) localStorage.setItem(k, v);
  }, state.localStorage || {});

  await page.reload({ waitUntil: 'networkidle' });
  const authed = await isRealAuthedView(page);
  if (!authed) {
    await context.close();
    throw new Error('Imported session did not produce a real authenticated view — it may be expired. Please re-export.');
  }
  console.log('Real, imported staff session verified live against the running app.');
  // Real bug found and fixed (2026-08-29): AskABD's staff session lives in
  // `sessionStorage`, not a cookie — a NEW page/tab never shares it, even
  // within the same browser context (real browser behavior, not a
  // Playwright quirk). Callers that used to do `context.newPage()` after
  // this returned would silently get a logged-out page — this was never
  // caught before because this whole export-based path had never
  // actually been run against a real, valid session until today. Return
  // the SAME page this function already authenticated instead.
  return { context, page };
}

/** Path 2 — headed login. Confirmed NOT viable in this sandboxed shell (kept for a different environment). */
export async function getAuthenticatedContext(browser) {
  console.log('\n=== Opening a real, visible browser window. ===');
  console.log('Please sign in yourself at /staff/login (Organization: askabd-internal, your email, your password).\n');
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${WEB_ORIGIN}/staff/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => /—\s*(super_admin|admin|staff)/i.test(document.body?.innerText || ''),
    { timeout: 10 * 60 * 1000 }
  );
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  await context.storageState({ path: path.join(AUTH_DIR, 'staff-state.playwright.json') });
  return context;
}

/**
 * Path 3 — automated, real login using a dedicated, disposable
 * DEVELOPMENT/TEST staff account (see
 * ../../apps/api/scripts/setup-playwright-test-staff.ts). Reads its
 * password from a local, gitignored credentials file this script itself
 * (or the setup script) generated — never a real human's password, never
 * extracted from a live browser session. Drives the REAL `/staff/login`
 * form exactly as a genuine staff member would, producing a genuine,
 * real EdDSA-signed session from the real, running identity service.
 */
const TEST_STAFF_CREDENTIALS_PATH = path.join(AUTH_DIR, 'test-staff-credentials.json');

export async function getAuthenticatedContextViaTestStaffLogin(browser) {
  if (!fs.existsSync(TEST_STAFF_CREDENTIALS_PATH)) {
    throw new Error(
      `No dedicated test-staff credentials found at ${TEST_STAFF_CREDENTIALS_PATH}. ` +
      `Run: cd apps/api && npx tsx --env-file=.env scripts/setup-playwright-test-staff.ts`,
    );
  }
  const creds = JSON.parse(fs.readFileSync(TEST_STAFF_CREDENTIALS_PATH, 'utf8'));

  const context = await browser.newContext();
  const page = await context.newPage();
  // networkidle, not domcontentloaded — a real, reproducible bug found
  // while building this: clicking before this Next.js page's React
  // hydration finishes lets the click fall through to the browser's own
  // native form submission (a real page reload, no JS handler attached
  // yet) instead of the real client-side login handler, so the identity
  // service is never actually called. Confirmed by watching the real
  // network trace: with domcontentloaded, zero requests to :3100; with
  // networkidle, a real POST /v1/auth/login fires every time.
  await page.goto(`${WEB_ORIGIN}/staff/login`, { waitUntil: 'networkidle' });
  await page.locator('#staff-org').waitFor({ state: 'visible' });

  await page.locator('#staff-org').fill(creds.orgContext);
  await page.locator('#staff-email').fill(creds.identifier);
  await page.locator('#staff-password').fill(creds.password);
  await page.getByRole('button', { name: /sign in/i }).click();

  // Real, robust success check: no longer on /staff/login AND a real
  // "Sign out" control is present — matches what every authenticated
  // staff page genuinely renders, without depending on the exact
  // "email — role" nav string (confirmed via a real run to render
  // differently across pages/viewports than initially assumed).
  // Generous timeout — this dev server compiles routes on demand
  // (observed real variance of ~4s-20s+ for the post-login redirect
  // target's first hit), not a sign of a genuine login failure.
  await page.waitForURL((url) => !url.pathname.includes('/staff/login'), { timeout: 45000 }).catch(async () => {
    const bodyText = await page.locator('body').innerText().catch(() => '');
    throw new Error(`Real test-staff login did not leave /staff/login. Page text: ${bodyText.slice(0, 300)}`);
  });
  // Real bug found and fixed while building this: `locator.isVisible({timeout})`
  // does a single immediate check, NOT a retry-until-timeout poll (unlike
  // `.waitFor()`/`.click()`) — it was returning false because the
  // destination page's own content hadn't mounted yet right after
  // `waitForURL` resolved (URL can change before the new route's
  // component tree renders). `.waitFor({state:'visible'})` genuinely
  // polls and is the correct call here.
  const signedIn = await page.getByText('Sign out', { exact: false }).first()
    .waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
  if (!signedIn) {
    const bodyText = await page.locator('body').innerText().catch(() => '');
    throw new Error(`Real test-staff login left /staff/login but no real "Sign out" control was found — not a genuine authenticated view. Page text: ${bodyText.slice(0, 300)}`);
  }

  console.log('Real, automated test-staff login succeeded — genuine EdDSA-signed session from the real identity service.');
  // Real bug found and fixed: AskABD's staff session lives in
  // `sessionStorage`, not a cookie — real browsers (and Playwright,
  // matching real behavior) never share `sessionStorage` with a NEW
  // page/tab, even within the same browser context. A caller that does
  // `context.newPage()` after this returns gets a genuinely logged-out
  // page. Returning the SAME page this function already authenticated is
  // the only correct way to keep using the real session.
  return { context, page };
}

export { EXPORT_PATH, WEB_ORIGIN, TEST_STAFF_CREDENTIALS_PATH };
