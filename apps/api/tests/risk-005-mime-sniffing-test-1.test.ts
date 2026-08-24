/**
 * risk_005_mime_sniffing_test_1 — the real fix for RISK-005
 * (docs/security-risk-register.md): both real document-upload routes
 * (`operations-center-routes.ts`'s onboarding-requirement documents,
 * `discovery-intake-routes.ts`'s discovery-source documents) trusted the
 * multipart part's own client-supplied `Content-Type` header for their MIME
 * allowlist check — trivially spoofable, giving the allowlist a false sense
 * of enforcement. `services/mime-sniff.ts` (new, shared by both routes) adds
 * real magic-byte content sniffing.
 *
 * Two layers of proof:
 *   1. Unit tests against `sniffMimeType` directly — real magic bytes for
 *      every covered type (PDF, PNG, JPEG, DOCX-as-ZIP, TXT, CSV), real
 *      rejections for mismatched/spoofed content, and the disclosed
 *      text/CSV limitation made explicit (no NUL byte, not a match against
 *      any binary signature — the strongest check possible without a
 *      dedicated encoding detector).
 *   2. A live, end-to-end spoofing attempt against BOTH real routes: a
 *      genuine PNG's real magic bytes uploaded with a claimed
 *      `Content-Type: text/plain` (an attacker trying to disguise a binary
 *      payload as an innocuous text file) — confirmed rejected by both.
 */
import Fastify from 'fastify';
import { describe, expect, it, afterAll } from 'vitest';
import * as jose from 'jose';
import { randomUUID } from 'node:crypto';
import { registerAuthMiddleware } from '../src/middleware/auth.js';
import { registerAuthorizationMiddleware, registerTenantAccessMiddleware, COMPARISON_API_RULES } from '../src/platform/rbac/index.js';
import { operationsCenterRoutes } from '../src/routes/operations-center-routes.js';
import { discoveryIntakeRoutes } from '../src/routes/discovery-intake-routes.js';
import { OperationsCenterService } from '../src/services/operations-center-service.js';
import { getStorageProvider } from '../src/services/storage/index.js';
import { sharedPool } from '../src/services/db-pool.js';
import { sniffMimeType } from '../src/services/mime-sniff.js';

// A real PNG file signature (8-byte magic) + a little real chunk data —
// genuine bytes, not a placeholder.
const REAL_PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
const REAL_PDF_BYTES = Buffer.from('%PDF-1.4\n%real-pdf-header-bytes');
const REAL_JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const REAL_ZIP_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]); // DOCX is a ZIP
const REAL_TEXT_BYTES = Buffer.from('This is genuine plain text content, no binary signature anywhere.');
const NOT_A_REAL_ANYTHING = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]); // contains a NUL byte

describe('sniffMimeType — real magic-byte checks (unit)', () => {
  it('a genuine PDF, correctly claimed, is accepted', () => {
    expect(sniffMimeType('application/pdf', REAL_PDF_BYTES)).toBe(true);
  });
  it('a genuine PNG, correctly claimed, is accepted', () => {
    expect(sniffMimeType('image/png', REAL_PNG_BYTES)).toBe(true);
  });
  it('a genuine JPEG, correctly claimed, is accepted', () => {
    expect(sniffMimeType('image/jpeg', REAL_JPEG_BYTES)).toBe(true);
  });
  it('a genuine ZIP (DOCX real-world shape), correctly claimed, is accepted', () => {
    expect(sniffMimeType('application/vnd.openxmlformats-officedocument.wordprocessingml.document', REAL_ZIP_BYTES)).toBe(true);
  });
  it('genuine plain text, correctly claimed, is accepted', () => {
    expect(sniffMimeType('text/plain', REAL_TEXT_BYTES)).toBe(true);
    expect(sniffMimeType('text/csv', REAL_TEXT_BYTES)).toBe(true);
  });

  it('a real PNG falsely claimed as PDF is rejected — the actual spoofing scenario this fix closes', () => {
    expect(sniffMimeType('application/pdf', REAL_PNG_BYTES)).toBe(false);
  });
  it('a real PNG falsely claimed as text/plain is rejected', () => {
    expect(sniffMimeType('text/plain', REAL_PNG_BYTES)).toBe(false);
  });
  it('a real JPEG falsely claimed as PNG is rejected', () => {
    expect(sniffMimeType('image/png', REAL_JPEG_BYTES)).toBe(false);
  });
  it('a real ZIP falsely claimed as PDF is rejected', () => {
    expect(sniffMimeType('application/pdf', REAL_ZIP_BYTES)).toBe(false);
  });
  it('non-text binary garbage (contains a NUL byte) falsely claimed as text/plain is rejected', () => {
    expect(sniffMimeType('text/plain', NOT_A_REAL_ANYTHING)).toBe(false);
  });
  it('an unrecognized claimed MIME type is never trusted, regardless of content', () => {
    expect(sniffMimeType('application/x-sh', REAL_TEXT_BYTES)).toBe(false);
  });
});

const SECRET = 'test-secret-value-not-a-real-secret';
function signToken(claims: Record<string, unknown>) {
  return new jose.SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuer('askabd-identity').setIssuedAt().setExpirationTime('5m').sign(new TextEncoder().encode(SECRET));
}
const adminToken = () => signToken({ sub: 'admin-1', org: 'org-x', roles: ['admin'] });

function minimalClient(name: string) {
  return {
    name, logo: '', industry: 'Technology', country: 'India', timezone: 'UTC',
    businessSize: 'Medium', supportModel: 'Managed', criticality: 'standard',
    primaryContact: 'test@example.com', departments: [], capabilities: [], processes: [],
    applications: [], techApps: [], techServices: [], techApis: [], techDatabases: [],
    techServers: [], techCloud: [], techInfrastructure: [], environments: {}, monitoring: {},
    enabledServices: [],
  };
}

function buildMultipartBody(fieldName: string, fileName: string, mimeType: string, content: Buffer): { body: Buffer; contentType: string } {
  const boundary = `----testboundary${randomUUID().replace(/-/g, '')}`;
  const parts: Buffer[] = [
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ];
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

const cleanupClientIds: string[] = [];
afterAll(async () => {
  for (const id of cleanupClientIds) await sharedPool.query('DELETE FROM oc_clients WHERE id = $1', [id]).catch(() => {});
});

async function makeClient(name: string) {
  const ocService = new OperationsCenterService();
  const client = await ocService.createClient(minimalClient(name));
  cleanupClientIds.push(client.id);
  return client.id;
}

describe('Live end-to-end spoofing attempt — a real PNG disguised as text/plain, against both real upload routes', () => {
  it('discovery-intake-routes.ts document upload rejects it (400), no source row created', async () => {
    const app = Fastify();
    const multipart = await import('@fastify/multipart');
    await app.register(multipart.default, { limits: { fileSize: 20 * 1024 * 1024 } });
    registerAuthMiddleware(app, { publicRoutes: [], devBypass: false, jwtSecret: SECRET, issuer: 'askabd-identity' });
    registerAuthorizationMiddleware(app, { rules: COMPARISON_API_RULES, defaultPolicy: 'authenticated', devBypass: false });
    registerTenantAccessMiddleware(app, { pathPrefix: '/api/v1/oc/', devBypass: false });
    await app.register(discoveryIntakeRoutes, { prefix: '/api/v1' });
    await app.ready();

    const clientId = await makeClient(`RISK-005 Discovery Spoof Test ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const { body, contentType } = buildMultipartBody('file', 'totally-a-text-file.txt', 'text/plain', REAL_PNG_BYTES);

    const res = await app.inject({ method: 'POST', url: `/api/v1/oc/clients/${clientId}/discovery-sources/document`, headers: { authorization: `Bearer ${admin}`, 'content-type': contentType }, payload: body });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('does not match the declared type');

    const list = await app.inject({ method: 'GET', url: `/api/v1/oc/clients/${clientId}/discovery-sources`, headers: { authorization: `Bearer ${admin}` } });
    expect(list.json().sources).toHaveLength(0); // no partial/orphan row left behind
    await app.close();
  });

  it('operations-center-routes.ts onboarding-requirement document upload rejects it (400), no document row created', async () => {
    const app = Fastify();
    const multipart = await import('@fastify/multipart');
    await app.register(multipart.default, { limits: { fileSize: 20 * 1024 * 1024 } });
    registerAuthMiddleware(app, { publicRoutes: [], devBypass: false, jwtSecret: SECRET, issuer: 'askabd-identity' });
    registerAuthorizationMiddleware(app, { rules: COMPARISON_API_RULES, defaultPolicy: 'authenticated', devBypass: false });
    registerTenantAccessMiddleware(app, { pathPrefix: '/api/v1/oc/', devBypass: false });
    await app.register(operationsCenterRoutes, { prefix: '/api/v1' });
    await app.ready();

    const clientId = await makeClient(`RISK-005 OC Spoof Test ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const { body, contentType } = buildMultipartBody('file', 'totally-a-text-file.txt', 'text/plain', REAL_PNG_BYTES);

    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/client-services/${clientId}/security-validation/requirements/security_contact/documents`,
      headers: { authorization: `Bearer ${admin}`, 'content-type': contentType }, payload: body,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('does not match the declared type');

    const docs = await sharedPool.query("SELECT count(*) FROM oc_client_service_documents WHERE client_id = $1", [clientId]);
    expect(Number(docs.rows[0].count)).toBe(0); // no partial/orphan row left behind
    await app.close();
  });

  it('a real, genuine text file (correctly claimed) is still accepted end-to-end — the fix does not break real uploads', async () => {
    const app = Fastify();
    const multipart = await import('@fastify/multipart');
    await app.register(multipart.default, { limits: { fileSize: 20 * 1024 * 1024 } });
    registerAuthMiddleware(app, { publicRoutes: [], devBypass: false, jwtSecret: SECRET, issuer: 'askabd-identity' });
    registerAuthorizationMiddleware(app, { rules: COMPARISON_API_RULES, defaultPolicy: 'authenticated', devBypass: false });
    registerTenantAccessMiddleware(app, { pathPrefix: '/api/v1/oc/', devBypass: false });
    await app.register(operationsCenterRoutes, { prefix: '/api/v1' });
    await app.ready();

    const clientId = await makeClient(`RISK-005 OC Genuine Test ${randomUUID().slice(0, 8)}`);
    const admin = await adminToken();
    const { body, contentType } = buildMultipartBody('file', 'real-notes.txt', 'text/plain', REAL_TEXT_BYTES);

    const res = await app.inject({
      method: 'POST', url: `/api/v1/oc/client-services/${clientId}/security-validation/requirements/security_contact/documents`,
      headers: { authorization: `Bearer ${admin}`, 'content-type': contentType }, payload: body,
    });
    expect(res.statusCode).toBe(201);
    const storageRef = res.json().storage_reference as string | undefined;
    if (storageRef) await Promise.resolve(getStorageProvider().delete(storageRef)).catch(() => {});
    await app.close();
  });
});
