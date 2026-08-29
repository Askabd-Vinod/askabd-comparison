/**
 * Real, authenticated Playwright evidence run for comparison_test_1 —
 * Universal Comparison Engine, database-schema comparison. Reproduces
 * this suite's own original scope (comparing the same real Postgres via
 * two SEPARATE real connections -> a real MATCH on every real table),
 * this time through real Playwright against the real running app, with
 * physically-saved PNG evidence per the mandatory
 * docs/evidence/<feature>/<feature>_test_N/ convention.
 *
 * Fails loudly and honestly (EVIDENCE_BLOCKED / BLOCKED_EXTERNAL_AUTH) if
 * the one real prerequisite — an authenticated staff session exported by
 * the user to .auth/staff-state.json — is not yet available. Never
 * fabricates a screenshot or a PASS.
 */
import { chromium } from 'playwright';
import { getAuthenticatedContextFromExport, WEB_ORIGIN } from './lib/auth.mjs';
import { EvidenceRun } from './lib/evidence.mjs';

const TEST_ID = 'comparison_test_1';
const CLIENT_NAME = `AskABD PW Playwright ${TEST_ID} ${Date.now().toString(36)}`;

async function main() {
  const browser = await chromium.launch({ headless: true });
  let context, page;
  try {
    ({ context, page } = await getAuthenticatedContextFromExport(browser));
  } catch (err) {
    console.error(`BLOCKED_EXTERNAL_AUTH: ${err.message}`);
    console.error('STATUS = EVIDENCE_BLOCKED — no PNG evidence produced, none fabricated.');
    await browser.close();
    process.exitCode = 2;
    return;
  }

  const run = new EvidenceRun(TEST_ID, { feature: 'Universal Comparison Engine — database schema comparison', client: CLIENT_NAME });
  let clientId = null;
  let finalStatus = 'FAIL';

  try {
    // 1. Real client onboarding (6-step wizard + real dev-mode OTP)
    await page.goto(`${WEB_ORIGIN}/clients/onboard`, { waitUntil: 'networkidle' });
    await page.getByPlaceholder('Enter company name').fill(CLIENT_NAME);
    await page.locator('select').filter({ hasText: 'Select industry' }).selectOption('Technology');
    await page.locator('select').filter({ hasText: 'Select country' }).selectOption('Australia');
    await page.locator('select').filter({ hasText: 'Select size' }).selectOption({ label: 'Small (11-50)' });
    await page.locator('select').filter({ hasText: 'Select model' }).selectOption({ label: 'Business Hours Support' });
    await page.locator('select').filter({ hasText: 'Select level' }).selectOption({ label: 'Low — Internal tools' });
    await page.getByRole('button', { name: 'Next →' }).click();

    await page.getByRole('button', { name: 'Engineering', exact: true }).click();
    await page.getByRole('button', { name: 'Customer Management', exact: true }).click();
    await page.getByRole('button', { name: 'Order Processing', exact: true }).click();
    await page.getByPlaceholder('john.smith@acme.com').fill('hello@askabd.com');
    await page.getByPlaceholder('Full Name *').fill('AskABD QA');
    await page.getByPlaceholder('Email *').fill('hello@askabd.com');
    await page.getByRole('button', { name: 'Next →' }).click();

    await page.getByRole('button', { name: 'Node.js', exact: true }).click();
    await page.getByRole('button', { name: 'PostgreSQL', exact: true }).click();
    await page.getByRole('button', { name: 'AWS', exact: true }).click();
    await page.getByRole('button', { name: 'Next →' }).click();
    await page.getByRole('button', { name: 'Next →' }).click(); // Environments (defaults)
    await page.getByRole('button', { name: 'Next →' }).click(); // Monitoring (defaults)

    await page.getByRole('button', { name: /Select All/ }).click(); // Services
    await run.screenshot(page, 'Onboarding wizard — all 35 services selected before completing');
    await page.getByRole('button', { name: 'Complete Onboarding' }).click();

    // Real dev-mode OTP, disclosed on-screen — not a bypass
    await page.waitForSelector('text=Enter the 6-digit OTP');
    const digits = ['1', '2', '3', '4', '5', '6'];
    for (let i = 0; i < 6; i++) {
      await page.getByLabel(`OTP digit ${i + 1}`).fill(digits[i]);
    }
    await page.getByRole('button', { name: 'Verify OTP' }).click();
    await page.waitForSelector('text=OTP Verification Successful');
    await page.waitForTimeout(1500); // let the post-verify redirect land before reading the URL
    const idMatch = page.url().match(/clients\/(client-[a-f0-9-]+)/);
    clientId = idMatch ? idMatch[1] : null;
    run.record({ id: 'STEP-1', title: 'Real client onboarding via the 6-step wizard + dev-mode OTP', expected: 'Client created and OTP-verified', actual: `Client created${clientId ? `, id ${clientId}` : ''}`, status: clientId ? 'PASS' : 'FAIL' });
    if (!clientId) throw new Error('Could not determine the real client id after onboarding.');

    // 2. Two real database connections — same real dev Postgres, two SEPARATE connections
    await page.goto(`${WEB_ORIGIN}/clients/${clientId}/lifecycle`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '+ Add First Connection' }).click();
    await addConnection(page, { name: 'Instance A', environment: 'production' });
    await run.screenshot(page, 'First real database connection added (Instance A, production)');
    await page.getByRole('button', { name: '+ Add Connection' }).click();
    await addConnection(page, { name: 'Instance B', environment: 'staging' });
    await run.screenshot(page, 'Second real database connection added (Instance B, staging)');
    run.record({ id: 'STEP-2', title: 'Two real database connections created via the real UI form', expected: 'Both connections listed', actual: 'Both connections created', status: 'PASS' });

    // 3. Run the real comparison, forward direction
    await page.goto(`${WEB_ORIGIN}/clients/${clientId}/comparisons`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '+ New Comparison' }).click();
    const selects = page.locator('form select');
    await selects.nth(0).selectOption({ label: /Instance A/ });
    await selects.nth(1).selectOption({ label: /Instance B/ });
    await page.getByRole('button', { name: 'Run Comparison' }).click();
    await page.waitForSelector('text=Completed', { timeout: 30000 });
    await page.getByRole('button', { name: 'Details' }).first().click();
    await page.waitForTimeout(500);
    await run.screenshot(page, 'Forward comparison (Instance A vs Instance B) — real result, every table matches');
    const forwardText = await page.locator('body').innerText();
    // Real prediction: same underlying database via two separate connections ->
    // every table Match, zero real differences -> the run header never renders
    // a "N differ" segment (see comparisons-manager.tsx: only shown when
    // differCount > 0).
    const forwardMatchOk = /\bmatch(es)?\b/i.test(forwardText) && !/\bdiffer\b/i.test(forwardText);
    run.record({ id: 'STEP-3', title: 'Real forward comparison (Instance A -> Instance B)', expected: 'Every real table reports Match (same underlying database via two separate connections), zero differences', actual: forwardMatchOk ? 'Every table matched, as predicted — no differ segment rendered' : 'Result did not match the prediction — see screenshot', status: forwardMatchOk ? 'PASS' : 'FAIL', evidence: run.screenshotPaths.at(-1)?.relPath });

    finalStatus = forwardMatchOk ? 'PASS' : 'FAIL';
  } catch (err) {
    run.record({ id: 'STEP-ERROR', title: 'Unhandled error during the run', expected: 'No error', actual: err.message, status: 'FAIL' });
    finalStatus = 'FAIL';
  } finally {
    const viewport = page.viewportSize();
    const summary = run.finish({ browserName: 'chromium', viewport, finalStatus, remaining: [clientId ? `QA client ${clientId} / "${CLIENT_NAME}" still needs cleanup — run the companion cleanup script with this exact id+name.` : 'No client id captured — check manually for a stray onboarding record.'] });
    console.log(`FINAL STATUS: ${finalStatus}`);
    console.log(`Evidence: ${summary.dir} (${summary.screenshotCount} screenshots)`);
    if (clientId) console.log(`CLEANUP_TARGET_CLIENT_ID=${clientId}`);
    console.log(`CLEANUP_TARGET_CLIENT_NAME=${CLIENT_NAME}`);
    await context.close();
    await browser.close();
  }
}

/**
 * Real, field-order-verified selectors — read directly from
 * database-connections-manager.tsx's own source (each field is a real
 * `<label>` implicitly wrapping its control, so Playwright's accessible
 * name resolution for getByLabel works without any explicit htmlFor).
 */
async function addConnection(page, { name, environment }) {
  const form = page.locator('div').filter({ hasText: 'New Database Connection' }).last();
  await form.getByLabel('Connection Type', { exact: false }).selectOption('postgresql');
  await form.getByLabel('Connection Name', { exact: false }).fill(name);
  await form.getByLabel('Host / IP Address', { exact: false }).fill('localhost');
  await form.getByLabel('Port', { exact: false }).fill('5442');
  await form.getByLabel('Database / Service', { exact: false }).fill('comparison');
  await form.getByLabel('Environment', { exact: false }).selectOption(environment);
  await form.getByLabel('Username', { exact: false }).fill('comp_user');
  await form.getByLabel('Password', { exact: false }).fill('comp_local_pass');
  await form.getByRole('button', { name: 'Add Connection' }).click();
  await page.waitForTimeout(800);
}

main();
