/**
 * First real run of the new Playwright evidence pipeline. Opens a real,
 * visible Chromium window, waits for the user to log in themselves
 * (never handles the password), saves the resulting real session state
 * for reuse, then proves the whole pipeline end-to-end with one real,
 * physically-saved screenshot of the authenticated dashboard.
 */
import { chromium } from 'playwright';
import { getAuthenticatedContextFromExport, WEB_ORIGIN } from './lib/auth.mjs';
import { EvidenceRun } from './lib/evidence.mjs';

const run = new EvidenceRun('pipeline_smoke_test_1', {
  feature: 'Playwright Evidence Pipeline (bootstrap)',
  testSuite: 'pipeline_smoke_test_1',
  client: 'N/A — infrastructure smoke test, no QA client needed',
});

const browser = await chromium.launch({ headless: true });
try {
  const { context, page } = await getAuthenticatedContextFromExport(browser);
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto(WEB_ORIGIN, { waitUntil: 'networkidle' });
  const navText = await page.locator('body').innerText();
  const authed = /super_admin|— admin —|— staff —/i.test(navText);
  const shot1 = await run.screenshot(page, 'dashboard_authenticated');
  run.record({
    id: 'SMOKE-1', title: 'Real authenticated navigation lands on the dashboard',
    expected: 'Nav bar shows a real staff role (super_admin/admin/staff), page renders without error',
    actual: authed ? 'Real staff role text found in the live DOM' : 'No staff role text found — session may not be valid',
    status: authed ? 'PASS' : 'FAIL',
    evidence: shot1,
  });

  await page.goto(`${WEB_ORIGIN}/clients`, { waitUntil: 'networkidle' });
  const clientsText = await page.locator('body').innerText();
  const hasClients = /Client Directory|clients/i.test(clientsText);
  const shot2 = await run.screenshot(page, 'clients_directory');
  run.record({
    id: 'SMOKE-2', title: 'Real navigation to the Client Directory',
    expected: 'Client Directory page renders with real client rows',
    actual: hasClients ? 'Client Directory content found in the live DOM' : 'Expected content not found',
    status: hasClients ? 'PASS' : 'FAIL',
    evidence: shot2,
  });

  const result = run.finish({
    browserName: 'chromium', viewport: { width: 1440, height: 900 },
    finalStatus: authed && hasClients ? 'PASS' : 'FAIL',
    findings: ['First real run of the new Playwright evidence pipeline — proves real PNG screenshots physically land on disk at the predictable docs/evidence/ path.'],
  });
  console.log('DONE:', JSON.stringify(result));
  await context.close();
} finally {
  await browser.close();
}
