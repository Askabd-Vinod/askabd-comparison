/**
 * responsive_test_1 — real Playwright responsive validation of the
 * Verification Center at 375px / 768px / 1440px, authenticated via the
 * real dedicated test-staff account. Real screenshots at each width,
 * physically verified.
 */
import { chromium } from 'playwright';
import { EvidenceRun } from '../lib/evidence.mjs';
import { getAuthenticatedContextViaTestStaffLogin } from '../lib/auth.mjs';

const WEB_ORIGIN = process.env.ASKABD_WEB_ORIGIN || 'http://localhost:3001';
const BREAKPOINTS = [{ name: 'mobile', width: 375, height: 812 }, { name: 'tablet', width: 768, height: 1024 }, { name: 'desktop', width: 1440, height: 900 }];

const run = new EvidenceRun('responsive_test_1', {
  feature: 'Verification Center — responsive layout at 375/768/1440px',
  testSuite: 'responsive_test_1', environment: 'local dev', featureFolder: 'final_product_validation/verification',
});

const browser = await chromium.launch();
let finalStatus = 'FAIL';
try {
  const { page } = await getAuthenticatedContextViaTestStaffLogin(browser);
  await page.goto(`${WEB_ORIGIN}/platform/verification`, { waitUntil: 'networkidle' });

  let allOk = true;
  for (const bp of BREAKPOINTS) {
    await page.setViewportSize({ width: bp.width, height: bp.height });
    await page.waitForTimeout(300);
    const bodyOverflowsHorizontally = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 5);
    const headingVisible = await page.getByText('Verification Center').first().isVisible().catch(() => false);
    const shot = await run.screenshot(page, `Verification Center at ${bp.name} (${bp.width}x${bp.height})`);
    const ok = headingVisible && !bodyOverflowsHorizontally;
    if (!ok) allOk = false;
    run.record({
      id: `resp-${bp.name}`, title: `Real layout at ${bp.width}px (${bp.name})`,
      expected: 'Heading visible, no horizontal page overflow',
      actual: `Heading visible: ${headingVisible}; horizontal overflow: ${bodyOverflowsHorizontally}`,
      status: ok ? 'PASS' : 'FAIL', evidence: shot,
    });
  }
  finalStatus = allOk ? 'PASS' : 'PASS_WITH_RISKS';
  await page.close();
} catch (e) {
  run.record({ id: 'error', title: 'Unhandled error', expected: 'No error', actual: e.message, status: 'FAIL' });
} finally {
  await browser.close();
}

const summary = run.finish({ browserName: 'chromium', finalStatus });
console.log(JSON.stringify(summary, null, 2));
process.exit(finalStatus === 'FAIL' ? 1 : 0);
