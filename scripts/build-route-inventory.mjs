#!/usr/bin/env node
/**
 * build-route-inventory.mjs — Phase 1 of the Playwright Coverage
 * Completion directive: a REAL, mechanically-derived inventory of every
 * user-facing Next.js route, built by scanning the actual page.tsx files
 * (and same-directory client components they render) for structural
 * signals — not guessed, not copied from docs.
 *
 * For each route.tsx we record: the route path, its role bucket
 * (client-facing internal / staff-internal / client-portal / auth /
 * platform-admin), and counts of buttons, forms, inputs, selects, links,
 * fetch/API call sites, upload/download indicators, tabs, and modals —
 * found by scanning the page file itself plus every .tsx file that lives
 * in the same directory (the typical pattern in this codebase: a
 * `page.tsx` server component + a co-located `*-grid.tsx` /
 * `*-panel.tsx` / `*-form.tsx` client component holding the real
 * interactivity).
 *
 * Output: docs/final-validation/route-inventory.json (machine-readable)
 * and a human-readable docs/final-validation/route-inventory.md summary.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';

const WEB_APP_ROOT = join(process.cwd(), 'apps/web/src/app');
const OUT_JSON = join(process.cwd(), 'docs/final-validation/route-inventory.json');
const OUT_MD = join(process.cwd(), 'docs/final-validation/route-inventory.md');

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (entry === 'page.tsx') acc.push(full);
  }
  return acc;
}

function routeFromPath(pagePath) {
  let rel = relative(WEB_APP_ROOT, dirname(pagePath)).replace(/\\/g, '/');
  // Strip Next.js route-group segments like (app), (auth), (portal)
  rel = rel.split('/').filter((seg) => !(seg.startsWith('(') && seg.endsWith(')'))).join('/');
  return '/' + rel;
}

function roleBucket(routePath, pagePath) {
  if (pagePath.includes('\\(portal)\\') || pagePath.includes('/(portal)/')) return 'client-portal (customer-facing)';
  if (pagePath.includes('\\(auth)\\') || pagePath.includes('/(auth)/')) return 'auth (unauthenticated)';
  if (routePath.startsWith('/platform')) return 'staff — platform/admin';
  if (routePath.startsWith('/clients/') && routePath !== '/clients') return 'staff — client-scoped workflow';
  return 'staff — internal operations';
}

function scanDirFiles(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'));
  let combined = '';
  for (const f of files) {
    try { combined += '\n' + readFileSync(join(dir, f), 'utf8'); } catch { /* ignore */ }
  }
  return { files, combined };
}

function count(re, text) {
  const m = text.match(re);
  return m ? m.length : 0;
}

function extractButtonLabels(text) {
  const labels = new Set();
  // <button ...>Label</button> or <Button ...>Label</Button>
  const btnRe = /<(?:button|Button)\b[^>]*>([^<{]{1,60})</g;
  let m;
  while ((m = btnRe.exec(text))) {
    const label = m[1].trim();
    if (label) labels.add(label);
  }
  // onClick handlers with aria-label
  const ariaRe = /aria-label=["']([^"']{1,60})["'][^>]*onClick/g;
  while ((m = ariaRe.exec(text))) labels.add(m[1].trim());
  return [...labels].slice(0, 40);
}

const pages = walk(WEB_APP_ROOT);
const inventory = [];

for (const pagePath of pages) {
  const routePath = routeFromPath(pagePath);
  const dir = dirname(pagePath);
  const { files, combined } = scanDirFiles(dir);

  const buttons = count(/<(?:button|Button)\b/g, combined);
  const forms = count(/<form\b/gi, combined) + count(/useForm\(/g, combined);
  const inputs = count(/<input\b/gi, combined);
  const selects = count(/<select\b/gi, combined) + count(/<Select\b/g, combined);
  const links = count(/<Link\b/g, combined) + count(/<a\s+href/gi, combined);
  const fetchCalls = count(/fetch\(/g, combined) + count(/apiSafe[<(]/g, combined) + count(/apiFetch[<(]/g, combined) + count(/apiClient\./g, combined);
  const downloads = count(/download=/gi, combined) + count(/\/download\b/g, combined) + count(/\.pdf['"`]/g, combined) + count(/\.csv['"`]/g, combined) + count(/\.docx['"`]/g, combined);
  const uploads = count(/type=["']file["']/g, combined) + count(/<input[^>]*type=\{["']file/g, combined);
  const tabs = count(/role=["']tab["']/g, combined) + count(/<Tabs\b/g, combined);
  const modals = count(/<Modal\b/g, combined) + count(/<Dialog\b/g, combined) + count(/isOpen/g, combined);
  const realtime = count(/EventSource\(/g, combined) + count(/WebSocket\(/g, combined) + count(/setInterval\(/g, combined) + count(/polling/gi, combined);
  const mutations = count(/method:\s*['"]POST['"]/g, combined) + count(/method:\s*['"]PUT['"]/g, combined) + count(/method:\s*['"]PATCH['"]/g, combined) + count(/method:\s*['"]DELETE['"]/g, combined);

  inventory.push({
    route: routePath,
    role: roleBucket(routePath, pagePath),
    sourceFiles: files,
    signals: {
      buttons, forms, inputs, selects, links, fetchCalls, downloads, uploads, tabs, modals, realtime, mutations,
    },
    buttonLabels: extractButtonLabels(combined),
    isDynamic: routePath.includes('['),
  });
}

inventory.sort((a, b) => a.route.localeCompare(b.route));

writeFileSync(OUT_JSON, JSON.stringify({ generatedAt: new Date().toISOString(), totalRoutes: inventory.length, routes: inventory }, null, 2));

// Human-readable summary
let md = `# Route Inventory (mechanically generated)\n\nGenerated ${new Date().toISOString()} by scanning \`apps/web/src/app\` directly — every \`page.tsx\` plus co-located client components in its directory. This is a structural scan (regex over real source), not a manual claim.\n\n`;
md += `**Total routes: ${inventory.length}**\n\n`;
const byRole = {};
for (const r of inventory) { (byRole[r.role] ||= []).push(r); }
for (const [role, routes] of Object.entries(byRole)) {
  md += `## ${role} (${routes.length})\n\n`;
  md += `| Route | Buttons | Forms | Inputs | Fetch/API | Downloads | Uploads | Mutations | Realtime signals |\n`;
  md += `|---|---|---|---|---|---|---|---|---|\n`;
  for (const r of routes) {
    const s = r.signals;
    md += `| \`${r.route}\` | ${s.buttons} | ${s.forms} | ${s.inputs} | ${s.fetchCalls} | ${s.downloads} | ${s.uploads} | ${s.mutations} | ${s.realtime} |\n`;
  }
  md += '\n';
}
writeFileSync(OUT_MD, md);

console.log(`Wrote ${inventory.length} routes to ${OUT_JSON} and ${OUT_MD}`);
