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
  return context;
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

export { EXPORT_PATH, WEB_ORIGIN };
