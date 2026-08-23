/**
 * Real, reusable evidence-capture helper for the Master Autonomous Build
 * directive's mandatory screenshot requirement — physically saves
 * numbered PNGs to docs/evidence/<feature_test_id>/screenshots/, plus a
 * real test-report.md and test-results.json in the same folder. No
 * fabricated success: every step is recorded with its real, observed
 * outcome, and a step is only ever marked passed if its own real
 * assertion/observation actually held.
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const EVIDENCE_ROOT = path.join(REPO_ROOT, 'docs', 'evidence');

export class EvidenceRun {
  constructor(featureTestId, { feature, testSuite, client, environment = 'local dev' } = {}) {
    this.featureTestId = featureTestId;
    this.dir = path.join(EVIDENCE_ROOT, featureTestId);
    this.screenshotsDir = path.join(this.dir, 'screenshots');
    fs.mkdirSync(this.screenshotsDir, { recursive: true });
    this.seq = 0;
    this.steps = [];
    this.meta = { feature, testSuite: testSuite || featureTestId, client, environment, startedAt: new Date().toISOString() };
  }

  /** Real, physically-saved PNG — fails loudly if the file doesn't actually land on disk. */
  async screenshot(page, description) {
    this.seq += 1;
    const slug = description.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
    const fileName = `${String(this.seq).padStart(3, '0')}_${slug}.png`;
    const filePath = path.join(this.screenshotsDir, fileName);
    await page.screenshot({ path: filePath, fullPage: true });
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
      throw new Error(`Screenshot ${fileName} was not actually written to disk — real evidence failure, not proceeding as if it succeeded.`);
    }
    return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
  }

  /** Records one real, observed test step — status is whatever the caller genuinely observed, never assumed PASS. */
  record({ id, title, expected, actual, status, evidence, notes }) {
    this.steps.push({ id, title, expected, actual, status, evidence: evidence || null, notes: notes || null, at: new Date().toISOString() });
  }

  finish({ browserName, viewport, finalStatus, findings = [], remaining = [] } = {}) {
    this.meta.finishedAt = new Date().toISOString();
    this.meta.browserName = browserName;
    this.meta.viewport = viewport;
    const total = this.steps.length;
    const passed = this.steps.filter(s => s.status === 'PASS').length;
    const failed = this.steps.filter(s => s.status === 'FAIL').length;
    const blocked = this.steps.filter(s => s.status === 'BLOCKED').length;

    const results = { ...this.meta, finalStatus, total, passed, failed, blocked, steps: this.steps, findings, remaining };
    fs.writeFileSync(path.join(this.dir, 'test-results.json'), JSON.stringify(results, null, 2));

    const md = [
      `# ${this.meta.testSuite} — real Playwright evidence`,
      '',
      `**Feature**: ${this.meta.feature || this.featureTestId}`,
      `**Client**: ${this.meta.client || 'N/A'}`,
      `**Environment**: ${this.meta.environment} · **Browser**: ${browserName || 'N/A'} · **Viewport**: ${viewport ? `${viewport.width}x${viewport.height}` : 'N/A'}`,
      `**Started**: ${this.meta.startedAt} · **Finished**: ${this.meta.finishedAt}`,
      '',
      `## Summary`,
      '',
      `| TOTAL | PASSED | FAILED | BLOCKED | PASS RATE |`,
      `|---|---|---|---|---|`,
      `| ${total} | ${passed} | ${failed} | ${blocked} | ${total > 0 ? Math.round((passed / total) * 100) : 0}% |`,
      '',
      `## Steps`,
      '',
      ...this.steps.map(s => [
        `### ${s.id} — ${s.title} — **${s.status}**`,
        `- Expected: ${s.expected}`,
        `- Actual: ${s.actual}`,
        s.evidence ? `- Evidence: \`${s.evidence}\`` : null,
        s.notes ? `- Notes: ${s.notes}` : null,
        '',
      ].filter(Boolean).join('\n')),
      findings.length > 0 ? ['## Findings', '', ...findings.map(f => `- ${f}`), ''].join('\n') : '',
      remaining.length > 0 ? ['## Remaining', '', ...remaining.map(r => `- ${r}`), ''].join('\n') : '',
      `## FINAL STATUS: ${finalStatus}`,
      '',
    ].filter(Boolean).join('\n');
    fs.writeFileSync(path.join(this.dir, 'test-report.md'), md);

    return { dir: path.relative(REPO_ROOT, this.dir).replace(/\\/g, '/'), total, passed, failed, blocked };
  }
}
