#!/usr/bin/env node
/**
 * Real, evidence-based local development health check — no fabricated "all
 * good" output. Checks every dependency the platform actually needs to run
 * locally, in the order a request would actually need them, and reports the
 * real result of each check (reachable/unreachable, with the real error).
 *
 * Usage: npm run health   (from the repo root)
 */
import net from 'node:net';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const CHECKS = [];
let anyFailed = false;

function record(name, ok, detail) {
  CHECKS.push({ name, ok, detail });
  if (!ok) anyFailed = true;
}

function tcpCheck(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (ok) => { socket.destroy(); resolve(ok); };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

function httpGet(url, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ ok: res.statusCode !== undefined && res.statusCode < 500, status: res.statusCode, body }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: null, body: 'timeout' }); });
    req.on('error', (err) => resolve({ ok: false, status: null, body: String(err.message || err) }));
  });
}

async function main() {
  // 1. Docker containers this project depends on.
  try {
    const { stdout } = await execFileAsync('docker', ['ps', '--format', '{{.Names}}\t{{.Status}}']);
    const lines = stdout.trim().split('\n').filter(Boolean);
    const wanted = ['identity-postgres', 'comparison-postgres', 'askabd-mailpit'];
    for (const name of wanted) {
      const match = lines.find((l) => l.toLowerCase().includes(name.toLowerCase()) || l.split('\t')[0]?.includes(name.split('-')[0]));
      const row = lines.find((l) => l.startsWith(name)) || lines.find((l) => l.includes(name));
      record(`Docker: ${name}`, !!row, row ? row.split('\t')[1] : 'container not found in `docker ps` output');
    }
  } catch (err) {
    record('Docker daemon', false, `docker CLI unavailable or not running: ${err.message}`);
  }

  // 2. Postgres ports actually reachable (independent of container name matching above).
  record('PostgreSQL — comparison DB (localhost:5442)', await tcpCheck('localhost', 5442), 'apps/api/.env DATABASE_URL points here');
  record('PostgreSQL — identity DB (localhost:5532)', await tcpCheck('localhost', 5532), 'askabd-identity DB');

  // 3. Mailpit
  record('Mailpit SMTP (localhost:1025)', await tcpCheck('localhost', 1025), 'used by invitation emails in dev');

  // 4. Identity service
  const identity = await httpGet('http://localhost:3100/v1/health');
  record('Identity service (localhost:3100)', identity.ok, identity.ok ? `HTTP ${identity.status}` : identity.body);
  const jwks = await httpGet('http://localhost:3100/.well-known/jwks.json');
  record('Identity JWKS endpoint', jwks.ok, jwks.ok ? `HTTP ${jwks.status}` : jwks.body);

  // 5. Comparison API
  const api = await httpGet('http://localhost:4200/health');
  record('Comparison API (localhost:4200)', api.ok, api.ok ? `HTTP ${api.status}` : api.body);
  const apiReady = await httpGet('http://localhost:4200/ready');
  record('Comparison API — DB-backed readiness (/ready)', apiReady.ok, apiReady.ok ? `HTTP ${apiReady.status}: ${apiReady.body.slice(0, 200)}` : apiReady.body);

  // 6. Web dev server
  const web = await httpGet('http://localhost:3001/staff/login');
  record('Web dev server (localhost:3001)', web.ok, web.ok ? `HTTP ${web.status}` : web.body);

  console.log('\nAskABD local development health check\n' + '='.repeat(42));
  for (const c of CHECKS) {
    console.log(`${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
  }
  console.log('='.repeat(42));
  if (anyFailed) {
    console.log('\nOne or more dependencies are NOT reachable. See ✗ rows above.');
    console.log('Start missing pieces with:\n  npm run dev:all   (from the repo root)\n');
    process.exit(1);
  } else {
    console.log('\nAll checked dependencies are reachable.\n');
  }
}

main();
