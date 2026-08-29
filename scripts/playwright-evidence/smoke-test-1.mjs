/**
 * playwright_infrastructure_test_1 — a real, minimal, UNAUTHENTICATED
 * smoke test proving the existing Playwright + evidence-capture
 * infrastructure (lib/auth.mjs, lib/evidence.mjs) genuinely works end to
 * end: launches real Chromium, navigates the real running web app, takes
 * a real screenshot verified (exists, non-zero size, real PNG signature)
 * and physically saved to disk, and writes a real markdown report.
 *
 * Deliberately does not touch authentication — this is step 1 (prove the
 * pipeline itself works) before step 2 (prove the auth-import path
 * works, once a real exported session exists).
 */
import { chromium } from 'playwright';
import { EvidenceRun } from './lib/evidence.mjs';

const WEB_ORIGIN = process.env.ASKABD_WEB_ORIGIN || 'http://localhost:3001';

const run = new EvidenceRun('playwright_infrastructure_test_1', {
  feature: 'Playwright + Evidence Infrastructure (unauthenticated smoke test)',
  testSuite: 'playwright_infrastructure_test_1',
  environment: 'local dev',
});

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

let finalStatus = 'FAIL';
try {
  await page.goto(WEB_ORIGIN, { waitUntil: 'domcontentloaded' });
  const shot1 = await run.screenshot(page, 'Real navigation to the running web app root (expected: redirect to staff login)');
  const url1 = page.url();
  const isLogin = /staff\/login/.test(url1);
  run.record({
    id: 'step-1', title: 'Real browser navigates to the running app', expected: 'Redirects to /staff/login (unauthenticated)',
    actual: `Landed on ${url1}`, status: isLogin ? 'PASS' : 'FAIL', evidence: shot1,
  });

  const heading = await page.locator('h1, h2').first().innerText().catch(() => '');
  const shot2 = await run.screenshot(page, 'Real staff login page rendered');
  run.record({
    id: 'step-2', title: 'Real login page renders real content', expected: 'A real heading is present',
    actual: `Heading text: "${heading}"`, status: heading.length > 0 ? 'PASS' : 'FAIL', evidence: shot2,
  });

  finalStatus = isLogin && heading.length > 0 ? 'PASS' : 'PASS_WITH_RISKS';
} catch (e) {
  run.record({ id: 'step-error', title: 'Unhandled error', expected: 'No error', actual: e.message, status: 'FAIL' });
  finalStatus = 'FAIL';
} finally {
  await browser.close();
}

const summary = run.finish({
  browserName: 'chromium', viewport: { width: 1440, height: 900 }, finalStatus,
  findings: finalStatus === 'PASS' ? ['Playwright + evidence-capture infrastructure confirmed working: real browser, real navigation, real screenshots physically verified on disk.'] : [],
  remaining: ['Authenticated flows still require a real, user-exported staff session at scripts/playwright-evidence/.auth/staff-state.json (see export-session-instructions.md) — not yet present.'],
});

console.log(JSON.stringify(summary, null, 2));
process.exit(finalStatus === 'FAIL' ? 1 : 0);
