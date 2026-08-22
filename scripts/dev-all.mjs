#!/usr/bin/env node
/**
 * Single-command local dev bring-up: brings up the Docker-backed
 * dependencies (Postgres x2, Mailpit), then starts the three real Node
 * processes (identity, API, web) as child processes, waits for each to
 * report healthy, and reports failures clearly instead of leaving the user
 * guessing why a page won't load.
 *
 * Assumes the sibling-repo layout this project actually uses:
 *   <parent>/askabd-comparison   (this repo)
 *   <parent>/askabd-identity
 *
 * Usage: npm run dev:all   (from the askabd-comparison repo root)
 */
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IDENTITY_ROOT = path.resolve(REPO_ROOT, '..', 'askabd-identity');

function log(prefix, msg) {
  const color = { docker: '\x1b[36m', identity: '\x1b[35m', api: '\x1b[33m', web: '\x1b[32m', health: '\x1b[90m' }[prefix] || '';
  console.log(`${color}[${prefix}]\x1b[0m ${msg}`);
}

function tcpWait(host, port, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    (function attempt() {
      const socket = new net.Socket();
      socket.setTimeout(1000);
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      const fail = () => {
        socket.destroy();
        if (Date.now() > deadline) { log('health', `timed out waiting for ${label} (${host}:${port})`); resolve(false); }
        else setTimeout(attempt, 500);
      };
      socket.once('timeout', fail);
      socket.once('error', fail);
      socket.connect(port, host);
    })();
  });
}

function httpWaitOk(url, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    (function attempt() {
      const req = http.get(url, { timeout: 1500 }, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) resolve(true);
        else retry();
      });
      req.on('timeout', () => { req.destroy(); retry(); });
      req.on('error', retry);
      function retry() {
        if (Date.now() > deadline) { log('health', `timed out waiting for ${label} (${url})`); resolve(false); }
        else setTimeout(attempt, 700);
      }
    })();
  });
}

function spawnDev(name, cwd, cmd, args) {
  log(name, `starting: ${cmd} ${args.join(' ')} (cwd=${cwd})`);
  const child = spawn(cmd, args, { cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (d) => process.stdout.write(`[${name}] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`[${name}] ${d}`));
  child.on('exit', (code) => log(name, `process exited with code ${code}`));
  return child;
}

async function main() {
  if (!fs.existsSync(IDENTITY_ROOT)) {
    log('health', `askabd-identity not found at ${IDENTITY_ROOT} — cannot start identity or verify auth end-to-end. Continuing with API + web only.`);
  }

  // 1. Docker-backed dependencies.
  try {
    log('docker', 'bringing up comparison-postgres + mailpit (docker compose up -d)...');
    await execFileAsync('docker', ['compose', 'up', '-d'], { cwd: REPO_ROOT });
  } catch (err) {
    log('docker', `docker compose up -d failed in ${REPO_ROOT}: ${err.message}`);
  }
  if (fs.existsSync(IDENTITY_ROOT)) {
    try {
      log('docker', 'bringing up identity-postgres (docker compose up -d)...');
      await execFileAsync('docker', ['compose', 'up', '-d'], { cwd: IDENTITY_ROOT });
    } catch (err) {
      log('docker', `docker compose up -d failed in ${IDENTITY_ROOT}: ${err.message}`);
    }
  }

  const compPgUp = await tcpWait('localhost', 5442, 30000, 'comparison Postgres');
  const identPgUp = fs.existsSync(IDENTITY_ROOT) ? await tcpWait('localhost', 5532, 30000, 'identity Postgres') : false;
  if (!compPgUp) log('docker', 'comparison Postgres did not come up — API will fail to start cleanly.');
  if (fs.existsSync(IDENTITY_ROOT) && !identPgUp) log('docker', 'identity Postgres did not come up — identity service will fail to start cleanly.');

  // 2. Real Node processes.
  const children = [];
  if (fs.existsSync(IDENTITY_ROOT)) {
    children.push(spawnDev('identity', IDENTITY_ROOT, 'npm', ['run', 'dev']));
    await httpWaitOk('http://localhost:3100/v1/health', 20000, 'identity service');
  }
  children.push(spawnDev('api', path.join(REPO_ROOT, 'apps', 'api'), 'npm', ['run', 'dev']));
  await httpWaitOk('http://localhost:4200/health', 20000, 'comparison API');
  children.push(spawnDev('web', path.join(REPO_ROOT, 'apps', 'web'), 'npm', ['run', 'dev']));
  await httpWaitOk('http://localhost:3001', 30000, 'web dev server');

  log('health', 'startup sequence complete — run `npm run health` in a second terminal for a full report.');
  log('health', 'Web:      http://localhost:3001');
  log('health', 'Staff:    http://localhost:3001/staff/login');
  log('health', 'Customer: http://localhost:3001/login');

  const shutdown = () => { for (const c of children) c.kill(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
