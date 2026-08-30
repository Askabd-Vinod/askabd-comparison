/**
 * setup-playwright-test-staff-auditor — Batch 3 (RBAC matrix) addition.
 * Creates (idempotently) a SECOND dedicated, clearly-marked
 * DEVELOPMENT/TEST staff account, identical in every respect to
 * `setup-playwright-test-staff.ts` (same real registration/verify/
 * credential/role-grant flow against the real, running identity
 * service), except granted the real, DB-backed `auditor` role instead
 * of `super_admin`.
 *
 * Why: `auditor` (per `apps/api/src/platform/rbac/roles.ts`) has
 * `Audit.Read`/`Audit.Export` but NOT `Admin.Access` — the real
 * permission every release-readiness signoff route requires. This gives
 * Batch 3 a real, two-account RBAC matrix: the existing super_admin
 * test-staff account for ALLOWED cases, this auditor account for a real,
 * independently-provable DENIED case — not a simulated one.
 *
 * Same standing rules as the original script: never a real human's
 * password, never extracted from a live session, gitignored output,
 * idempotent (verifies via a real login before reusing).
 */
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { StaffRoleService } from '../src/services/staff-role-service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const CREDENTIALS_DIR = path.join(REPO_ROOT, 'scripts', 'playwright-evidence', '.auth');
const CREDENTIALS_PATH = path.join(CREDENTIALS_DIR, 'test-staff-auditor-credentials.json');

const IDENTITY_URL = process.env.IDENTITY_URL || 'http://localhost:3100';
const ORG_CONTEXT = 'askabd-internal';
const IDENTIFIER = 'playwright-e2e-test-auditor@askabd-dev.local'; // clearly marked, non-routable domain
const ROLE = 'auditor'; // this app's own real, documented role vocabulary — deliberately lacks Admin.Access

function generatePassword(): string {
  return `Pw${randomBytes(18).toString('base64url')}!1`;
}

async function identityFetch(pathSuffix: string, init: RequestInit & { orgContext?: string } = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (init.orgContext) headers.set('X-Org-Context', init.orgContext);
  return fetch(`${IDENTITY_URL}${pathSuffix}`, { ...init, headers });
}

async function verifyLoginWorks(password: string): Promise<boolean> {
  try {
    const res = await identityFetch('/v1/auth/login', {
      method: 'POST', orgContext: ORG_CONTEXT,
      body: JSON.stringify({ identifier: IDENTIFIER, credential: password }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  fs.mkdirSync(CREDENTIALS_DIR, { recursive: true });

  if (fs.existsSync(CREDENTIALS_PATH)) {
    const existing = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    const stillWorks = await verifyLoginWorks(existing.password);
    if (stillWorks) {
      console.log(`Existing Playwright test-staff-auditor account (${IDENTIFIER}) still works — reusing it. Nothing created.`);
      return;
    }
    console.log('Existing auditor credentials file found but login failed — provisioning a fresh account.');
  }

  const password = generatePassword();

  console.log(`Registering a real, dedicated test-staff-auditor identity: ${IDENTIFIER} (org: ${ORG_CONTEXT})`);
  const registerRes = await identityFetch('/v1/identities', {
    method: 'POST', orgContext: ORG_CONTEXT,
    body: JSON.stringify({ identifier: IDENTIFIER, identityType: 'human_user' }),
  });

  let identityId: string;
  if (registerRes.status === 201) {
    const body = await registerRes.json() as { identity: { id: string }; verificationToken: string };
    identityId = body.identity.id;
    const verifyRes = await identityFetch(`/v1/identities/${identityId}/verify`, {
      method: 'POST', body: JSON.stringify({ token: body.verificationToken }),
    });
    if (!verifyRes.ok) throw new Error(`Real identity verification failed: HTTP ${verifyRes.status}`);
    console.log('Real identity registered and verified.');

    const credRes = await identityFetch(`/v1/identities/${identityId}/credential/store`, {
      method: 'POST', orgContext: ORG_CONTEXT,
      body: JSON.stringify({ credential: password }),
    });
    if (!credRes.ok) {
      const err = await credRes.json().catch(() => ({}));
      throw new Error(`Real credential set failed: ${JSON.stringify(err)}`);
    }
    console.log('Real credential set on the real identity service.');
  } else if (registerRes.status === 400 || registerRes.status === 409) {
    throw new Error(
      `A real identity already exists for ${IDENTIFIER} but no working local credentials file was found. ` +
      `Manual cleanup required before re-running this script.`,
    );
  } else {
    throw new Error(`Real identity registration failed: HTTP ${registerRes.status}`);
  }

  const roleService = new StaffRoleService();
  const granted = await roleService.grantRole({ identityId, role: ROLE, grantedBy: 'playwright-test-setup-auditor' });
  if (!granted.ok) throw new Error(`Real role grant failed: ${granted.error.message}`);
  console.log(`Real, DB-backed "${ROLE}" role granted via StaffRoleService (staff_role_assignment).`);

  const loginOk = await verifyLoginWorks(password);
  if (!loginOk) throw new Error('Real end-to-end login verification failed immediately after setup — not writing a credentials file for a broken account.');

  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify({
    note: 'DEVELOPMENT/TEST ACCOUNT ONLY — never a real human staff member. auditor role (no Admin.Access) — used for real RBAC-denial proof in Batch 3. Generated by setup-playwright-test-staff-auditor.ts. Never commit this file (gitignored via scripts/playwright-evidence/.auth/).',
    orgContext: ORG_CONTEXT, identifier: IDENTIFIER, password, role: ROLE, identityId,
    createdAt: new Date().toISOString(),
  }, null, 2));
  console.log(`Real, working, dedicated test-staff-auditor account provisioned and verified end to end: ${path.relative(REPO_ROOT, CREDENTIALS_PATH)}`);
}

main().catch((e) => {
  console.error('setup-playwright-test-staff-auditor FAILED:', e.message);
  process.exit(1);
});
