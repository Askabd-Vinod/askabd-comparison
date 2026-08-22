/**
 * The `next` redirect parameter is attacker-controllable (anyone can craft
 * `/staff/login?next=https://evil.example`). These tests prove the sanitizer
 * actually rejects every open-redirect shape the auth routing brief called
 * out by name, and that legitimate internal paths still pass through.
 */
import { describe, expect, it } from 'vitest';
import { sanitizeNextPath, sanitizeNextForSurface } from '../src/app/lib/safe-redirect';

describe('sanitizeNextPath', () => {
  it('accepts a genuine internal relative path', () => {
    expect(sanitizeNextPath('/clients', '/')).toBe('/clients');
    expect(sanitizeNextPath('/clients/abc-123/incidents', '/')).toBe('/clients/abc-123/incidents');
  });

  it('accepts an internal path carrying a query string', () => {
    expect(sanitizeNextPath('/search?q=hello', '/')).toBe('/search?q=hello');
  });

  it('falls back on empty/missing input', () => {
    expect(sanitizeNextPath(null, '/dashboard')).toBe('/dashboard');
    expect(sanitizeNextPath(undefined, '/dashboard')).toBe('/dashboard');
    expect(sanitizeNextPath('', '/dashboard')).toBe('/dashboard');
  });

  it('rejects an absolute external URL', () => {
    expect(sanitizeNextPath('https://evil.example/phish', '/')).toBe('/');
    expect(sanitizeNextPath('http://evil.example', '/')).toBe('/');
  });

  it('rejects a protocol-relative URL', () => {
    expect(sanitizeNextPath('//evil.example', '/')).toBe('/');
    expect(sanitizeNextPath('///evil.example', '/')).toBe('/');
  });

  it('rejects a javascript: scheme, with or without a leading slash', () => {
    expect(sanitizeNextPath('javascript:alert(1)', '/')).toBe('/');
    expect(sanitizeNextPath('/javascript:alert(1)', '/')).toBe('/');
  });

  it('rejects a data: scheme', () => {
    expect(sanitizeNextPath('data:text/html,<script>alert(1)</script>', '/')).toBe('/');
  });

  it('rejects a backslash-trick protocol-relative URL', () => {
    expect(sanitizeNextPath('/\\evil.example', '/')).toBe('/');
    expect(sanitizeNextPath('\\\\evil.example', '/')).toBe('/');
  });

  it('rejects an absolute URL smuggled in behind a leading slash', () => {
    expect(sanitizeNextPath('/https://evil.example', '/')).toBe('/');
  });

  it('rejects a percent-encoded protocol-relative URL', () => {
    expect(sanitizeNextPath('/%2F%2Fevil.example', '/')).toBe('/');
  });

  it('rejects control characters (encoded newline/CR smuggling)', () => {
    expect(sanitizeNextPath('/clients%0d%0aSet-Cookie:x', '/')).toBe('/');
  });

  it('rejects a bare relative path with no leading slash', () => {
    expect(sanitizeNextPath('clients', '/')).toBe('/');
    expect(sanitizeNextPath('evil.example', '/')).toBe('/');
  });
});

describe('sanitizeNextForSurface', () => {
  it('staff surface accepts a real console route', () => {
    expect(sanitizeNextForSurface('/clients', 'staff', '/clients')).toBe('/clients');
    expect(sanitizeNextForSurface('/platform/commercial', 'staff', '/clients')).toBe('/platform/commercial');
  });

  it('staff surface never bounces back into an auth page', () => {
    expect(sanitizeNextForSurface('/staff/login', 'staff', '/clients')).toBe('/clients');
    expect(sanitizeNextForSurface('/login', 'staff', '/clients')).toBe('/clients');
  });

  it('staff surface rejects a customer-portal path (wrong domain)', () => {
    expect(sanitizeNextForSurface('/client-portal/abc-123', 'staff', '/clients')).toBe('/clients');
  });

  it('customer surface only accepts its own client-portal paths', () => {
    expect(sanitizeNextForSurface('/client-portal/abc-123', 'customer', '/client-portal/default')).toBe('/client-portal/abc-123');
    expect(sanitizeNextForSurface('/clients', 'customer', '/client-portal/default')).toBe('/client-portal/default');
    expect(sanitizeNextForSurface('/platform', 'customer', '/client-portal/default')).toBe('/client-portal/default');
  });

  it('customer surface rejects an external URL exactly like the base sanitizer', () => {
    expect(sanitizeNextForSurface('https://evil.example', 'customer', '/client-portal/default')).toBe('/client-portal/default');
  });
});
