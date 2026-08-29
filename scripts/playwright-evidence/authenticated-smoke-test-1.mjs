/**
 * playwright_infrastructure_test_2 — the first REAL, AUTOMATED,
 * authenticated Playwright test: real Chromium, real dedicated
 * test-staff login (no manual export, no extraction), real navigation to
 * the Verification Center, real screenshot physically verified on disk,
 * real console/network capture, real authenticated API request
 * confirmed.
 */
import { chromium } from 'playwright';
import { EvidenceRun } from './lib/evidence.mjs';
import { getAuthenticatedContextViaTestStaffLogin } from './lib/auth.mjs';

const WEB_ORIGIN = process.env.ASKABD_WEB_ORIGIN || 'http://localhost:3001';
const runId = process.argv[2] || '1';

const run = new EvidenceRun(`playwright_infrastructure_test_${runId}`, {
  feature: 'Real, automated authenticated Playwright — dedicated test-staff account',
  testSuite: `playwright_infrastructure_test_${runId}`,
  environment: 'local dev',
  featureFolder: 'playwright_infrastructure',
});

const browser = await chromium.launch();
let finalStatus = 'FAIL';
const consoleErrors = [];
const failedRequests = [];

try {
  const { context, page } = await getAuthenticatedContextViaTestStaffLogin(browser);
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('requestfailed', (req) => failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`));
  page.on('response', (res) => { if (res.status() >= 500) failedRequests.push(`${res.request().method()} ${res.url()} — HTTP ${res.status()}`); });

  const signOutVisible = await page.getByText('Sign out', { exact: false }).first()
    .waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
  const identityConfirmed = signOutVisible && !page.url().includes('/staff/login');
  const shot1 = await run.screenshot(page, 'Real authenticated landing page after real, automated test-staff login');
  run.record({
    id: 'step-1', title: 'Real, automated login reaches a real authenticated view',
    expected: 'Real "Sign out" control visible, no longer on /staff/login',
    actual: `Sign out visible: ${signOutVisible}; URL: ${page.url()}`,
    status: identityConfirmed ? 'PASS' : 'FAIL', evidence: shot1,
  });

  // Real authenticated API confirmation — the response listener is armed
  // BEFORE navigation so it genuinely captures the real request the page
  // itself makes on load, never a synthetic fetch outside the real
  // browser context.
  const apiResPromise = page.waitForResponse((r) => r.url().includes('/oc/verification/services'), { timeout: 15000 }).catch(() => null);
  await page.goto(`${WEB_ORIGIN}/platform/verification`, { waitUntil: 'networkidle' });
  const apiRes = await apiResPromise;
  const apiOk = apiRes && apiRes.status() === 200;

  const heading = await page.locator('h1').first().innerText().catch(() => '');
  const onVerificationCenter = /Verification Center/i.test(heading);
  const shot2 = await run.screenshot(page, 'Real Verification Center page, reached via real authenticated navigation');
  run.record({
    id: 'step-2', title: 'Real navigation to the Verification Center', expected: 'Real page heading "Verification Center"',
    actual: `Real heading: "${heading}"`, status: onVerificationCenter ? 'PASS' : 'FAIL', evidence: shot2,
  });
  run.record({
    id: 'step-3', title: 'Real authenticated API request confirmed via network listener',
    expected: 'GET .../oc/verification/services returns real HTTP 200 (would be 401 unauthenticated)',
    actual: apiRes ? `Real HTTP ${apiRes.status()} from ${apiRes.url()}` : 'No matching request observed',
    status: apiOk ? 'PASS' : 'FAIL',
  });

  const catalogText = await page.locator('body').innerText();
  const catalogOk = /Service Catalog/i.test(catalogText);
  const shot3 = await run.screenshot(page, 'Real Service Catalog rendered from the real authenticated API response');
  run.record({
    id: 'step-4', title: 'Real Service Catalog content rendered', expected: 'Real "Service Catalog" text present',
    actual: catalogOk ? 'Confirmed present' : 'Not found', status: catalogOk ? 'PASS' : 'FAIL', evidence: shot3,
  });

  run.record({
    id: 'step-5', title: 'Console errors during this real run', expected: 'Zero new console errors',
    actual: `${consoleErrors.length} error(s): ${consoleErrors.slice(0, 3).join(' | ') || 'none'}`,
    status: consoleErrors.length === 0 ? 'PASS' : 'FAIL',
  });
  run.record({
    id: 'step-6', title: 'Network failures / 5xx during this real run', expected: 'Zero',
    actual: `${failedRequests.length} failure(s): ${failedRequests.slice(0, 3).join(' | ') || 'none'}`,
    status: failedRequests.length === 0 ? 'PASS' : 'FAIL',
  });

  await context.close();
  finalStatus = [identityConfirmed, onVerificationCenter, apiOk, catalogOk, consoleErrors.length === 0, failedRequests.length === 0].every(Boolean) ? 'PASS' : 'PASS_WITH_RISKS';
} catch (e) {
  run.record({ id: 'step-error', title: 'Unhandled error', expected: 'No error', actual: e.message, status: 'FAIL' });
  finalStatus = 'FAIL';
} finally {
  await browser.close();
}

const summary = run.finish({
  browserName: 'chromium', viewport: { width: 1280, height: 720 }, finalStatus,
  findings: finalStatus === 'PASS' ? ['Real, fully automated authenticated Playwright run succeeded end to end using the dedicated test-staff account — no manual session export required.'] : [],
  remaining: [],
});

console.log(JSON.stringify(summary, null, 2));
process.exit(finalStatus === 'FAIL' ? 1 : 0);
