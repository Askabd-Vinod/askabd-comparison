/**
 * setup-playwright-test-staff — creates (idempotently) a dedicated,
 * clearly-marked DEVELOPMENT/TEST staff account for automated Playwright
 * evidence runs. Never touches a real human's credentials.
 *
 * Uses ONLY real, legitimate, already-existing application flows — no
 * shortcut, no bypass, no fabricated auth:
 *
 *   1. Real registration against the real, running askabd-identity
 *      service (`POST /v1/identities`) — the exact same call
 *      `InvitationService.acceptInvitation` already makes for real
 *      customers, reused here unmodified via a plain fetch (this script
 *      is not part of the app, so it calls the same real HTTP endpoint
 *      directly rather than importing InvitationService, which is
 *      customer/client-invitation shaped, not staff-shaped).
 *   2. Real email verification (`POST /v1/identities/:id/verify`).
 *   3. Real credential set (`POST /v1/identities/:id/credential/store`)
 *      with a password this script GENERATES itself via
 *      `node:crypto.randomBytes` — never a real human's password, never
 *      extracted from anywhere.
 *   4. Real role grant via `StaffRoleService.grantRole` (this repo's own,
 *      unmodified, already-tested service — the actual, real, DB-backed
 *      source of AskABD roles, since real askabd-identity tokens carry
 *      no `roles` claim at all).
 *
 * The resulting account logs in through the exact same real
 * `/v1/auth/login` flow and real `/staff/login` UI a genuine staff
 * member uses — indistinguishable from a real session at the protocol
 * level, but it is a dedicated, disposable, clearly-named fixture with a
 * password only this script (and whoever reads its local, gitignored
 * output file) ever knows.
 *
 * Idempotent: re-running this script reuses the existing test account
 * (verified via a real login attempt) rather than creating a duplicate
 * or silently failing.
 */
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { StaffRoleService } from '../src/services/staff-role-service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const CREDENTIALS_DIR = path.join(REPO_ROOT, 'scripts', 'playwright-evidence', '.auth');
const CREDENTIALS_PATH = path.join(CREDENTIALS_DIR, 'test-staff-credentials.json');

const IDENTITY_URL = process.env.IDENTITY_URL || 'http://localhost:3100';
const ORG_CONTEXT = 'askabd-internal'; // the real org every genuine staff account uses
const IDENTIFIER = 'playwright-e2e-test@askabd-dev.local'; // clearly marked, non-routable domain
const ROLE = 'super_admin'; // this app's own real, documented role vocabulary

function generatePassword(): string {
  // A real, strong, randomly-generated password — never a human's real
  // credential, never reused across runs beyond what's cached locally.
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

  // Idempotency check: if a credentials file already exists, verify it
  // still genuinely logs in against the real, running identity service
  // before reusing it — never trust a stale file blindly.
  if (fs.existsSync(CREDENTIALS_PATH)) {
    const existing = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    const stillWorks = await verifyLoginWorks(existing.password);
    if (stillWorks) {
      console.log(`Existing Playwright test-staff account (${IDENTIFIER}) still works — reusing it. Nothing created.`);
      return;
    }
    console.log('Existing credentials file found but login failed (account may have been removed or the identity DB reset) — provisioning a fresh account.');
  }

  const password = generatePassword();

  console.log(`Registering a real, dedicated test-staff identity: ${IDENTIFIER} (org: ${ORG_CONTEXT})`);
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
    // Already exists from a prior run whose credentials file was lost —
    // real login is the only honest way to confirm it's genuinely ours
    // (askabd-identity exposes no lookup-by-identifier endpoint).
    throw new Error(
      `A real identity already exists for ${IDENTIFIER} but no working local credentials file was found. ` +
      `Manual cleanup required (delete the real identity fixture from the identity database) before re-running this script.`,
    );
  } else {
    throw new Error(`Real identity registration failed: HTTP ${registerRes.status}`);
  }

  const roleService = new StaffRoleService();
  const granted = await roleService.grantRole({ identityId, role: ROLE, grantedBy: 'playwright-test-setup' });
  if (!granted.ok) throw new Error(`Real role grant failed: ${granted.error.message}`);
  console.log(`Real, DB-backed "${ROLE}" role granted via StaffRoleService (staff_role_assignment) — the actual, real source of AskABD roles.`);

  const loginOk = await verifyLoginWorks(password);
  if (!loginOk) throw new Error('Real end-to-end login verification failed immediately after setup — something is wrong; not writing a credentials file for a broken account.');

  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify({
    note: 'DEVELOPMENT/TEST ACCOUNT ONLY — never a real human staff member. Generated by setup-playwright-test-staff.ts. Never commit this file (already gitignored via scripts/playwright-evidence/.auth/).',
    orgContext: ORG_CONTEXT, identifier: IDENTIFIER, password, role: ROLE, identityId,
    createdAt: new Date().toISOString(),
  }, null, 2));
  console.log(`Real, working, dedicated test-staff account provisioned and verified end to end. Credentials written to a local, gitignored file: ${path.relative(REPO_ROOT, CREDENTIALS_PATH)}`);
}

main().catch((e) => {
  console.error('setup-playwright-test-staff FAILED:', e.message);
  process.exit(1);
});
