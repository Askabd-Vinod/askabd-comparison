/**
 * Real, reusable evidence-capture helper — physically saves numbered PNGs
 * and a real markdown report under the exact structure the user
 * specified:
 *
 *   docs/evidence/<feature>/<feature>_test_N/
 *     <feature>_test_N.md
 *     <feature>_test_N_01.png
 *     <feature>_test_N_02.png
 *     ...
 *
 * No fabricated success: every screenshot is verified with
 * `fs.existsSync()` + non-zero size + a real PNG-signature check
 * immediately after being written, and every step is recorded with its
 * real, observed outcome — never assumed PASS.
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const EVIDENCE_ROOT = path.join(REPO_ROOT, 'docs', 'evidence');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Derives the parent feature folder from a `<feature>_test_N` id, e.g. "comparison_test_1" -> "comparison". */
function deriveFeatureFolder(featureTestId) {
  const m = featureTestId.match(/^(.+)_test_\d+$/);
  return m ? m[1] : featureTestId;
}

export class EvidenceRun {
  constructor(featureTestId, { feature, testSuite, client, environment = 'local dev', featureFolder } = {}) {
    this.featureTestId = featureTestId;
    this.featureFolder = featureFolder || deriveFeatureFolder(featureTestId);
    this.dir = path.join(EVIDENCE_ROOT, this.featureFolder, featureTestId);
    fs.mkdirSync(this.dir, { recursive: true });
    this.seq = 0;
    this.steps = [];
    this.screenshotPaths = [];
    this.meta = { feature, testSuite: testSuite || featureTestId, client, environment, startedAt: new Date().toISOString() };
  }

  /**
   * Real, physically-saved PNG named `<featureTestId>_NN.png` per the
   * required convention. Verifies existence, non-zero size, and a real
   * PNG file-signature match immediately after writing — throws (never
   * silently "succeeds") if any check fails, per the "NO SCREENSHOT = NO
   * COMPLETE TEST EVIDENCE" rule.
   */
  async screenshot(page, description) {
    this.seq += 1;
    const fileName = `${this.featureTestId}_${String(this.seq).padStart(2, '0')}.png`;
    const filePath = path.join(this.dir, fileName);
    await page.screenshot({ path: filePath, fullPage: true });

    if (!fs.existsSync(filePath)) {
      throw new Error(`EVIDENCE_BLOCKED: screenshot ${fileName} was not written to disk.`);
    }
    const stat = fs.statSync(filePath);
    if (stat.size === 0) {
      throw new Error(`EVIDENCE_BLOCKED: screenshot ${fileName} exists but is zero bytes.`);
    }
    const head = Buffer.alloc(8);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, head, 0, 8, 0);
    fs.closeSync(fd);
    if (!head.equals(PNG_SIGNATURE)) {
      throw new Error(`EVIDENCE_BLOCKED: ${fileName} does not have a valid PNG signature.`);
    }

    const relPath = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
    this.screenshotPaths.push({ fileName, relPath, description, sizeBytes: stat.size });
    return relPath;
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

    const results = { ...this.meta, finalStatus, total, passed, failed, blocked, steps: this.steps, screenshots: this.screenshotPaths, findings, remaining };
    fs.writeFileSync(path.join(this.dir, `${this.featureTestId}.results.json`), JSON.stringify(results, null, 2));

    const md = [
      `# ${this.featureTestId} — real Playwright evidence`,
      '',
      `**Feature**: ${this.meta.feature || this.featureTestId}`,
      `**Client**: ${this.meta.client || 'N/A'}`,
      `**Environment**: ${this.meta.environment} · **Browser**: ${browserName || 'N/A'} · **Viewport**: ${viewport ? `${viewport.width}x${viewport.height}` : 'N/A'}`,
      `**Started**: ${this.meta.startedAt} · **Finished**: ${this.meta.finishedAt}`,
      '',
      `## Screenshots (physically verified: exists, size > 0, real PNG signature)`,
      '',
      ...this.screenshotPaths.map(s => `- \`${s.relPath}\` (${s.sizeBytes} bytes) — ${s.description}`),
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
    fs.writeFileSync(path.join(this.dir, `${this.featureTestId}.md`), md);

    return { dir: path.relative(REPO_ROOT, this.dir).replace(/\\/g, '/'), total, passed, failed, blocked, screenshotCount: this.screenshotPaths.length };
  }
}
