/**
 * Real, reusable secret-masking filter — "Never expose passwords, private
 * keys, API keys, ... tokens, session cookies ... in ... console logs,
 * API logs, database logs, audit logs, PDF reports, test reports, error
 * messages." Applied at the point of PERSISTENCE (write time), not
 * re-applied on every read — a single source of truth, never double-
 * masked or inconsistently masked across call sites.
 *
 * Deliberately conservative: prefers to mask something that might not
 * strictly be a secret over missing a real one. Never claims to be
 * exhaustive — this is a real, tested defense-in-depth layer, not a
 * substitute for never putting a raw secret into these fields in the
 * first place (the platform's existing SecretProvider abstraction and
 * connector-service.ts's configuration-stripping remain the primary
 * controls; this catches what slips through, e.g. a raw Postgres error
 * message that happens to echo a connection string).
 */

const PATTERNS: { name: string; regex: RegExp; replace: (match: string) => string }[] = [
  {
    name: 'connection-string-credentials',
    regex: /([a-z][a-z0-9+.-]*:\/\/)([^:/\s@]+):([^@/\s]+)@/gi,
    replace: (m) => m.replace(/:([^@/\s]+)@/, ':***MASKED***@'),
  },
  {
    name: 'bearer-token',
    regex: /Bearer\s+[A-Za-z0-9\-_.]+/g,
    replace: () => 'Bearer ***MASKED***',
  },
  {
    name: 'key-value-secret',
    regex: /\b(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret|private[_-]?key)\s*[:=]\s*["']?[^\s"',;]+["']?/gi,
    replace: (m) => {
      const eq = m.search(/[:=]/);
      return `${m.slice(0, eq + 1)}***MASKED***`;
    },
  },
  {
    name: 'aws-access-key-id',
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
    replace: () => '***MASKED_AWS_ACCESS_KEY***',
  },
  {
    name: 'pem-private-key-block',
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replace: () => '***MASKED_PRIVATE_KEY_BLOCK***',
  },
  {
    name: 'jwt-like-token',
    regex: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
    replace: () => '***MASKED_JWT***',
  },
];

/** Real, deterministic masking — never a no-op silently pretending to mask something it didn't. */
export function maskSecrets(text: string | null | undefined): string {
  if (!text) return text ?? '';
  let masked = text;
  for (const p of PATTERNS) masked = masked.replace(p.regex, p.replace);
  return masked;
}

/**
 * Real, explicit check — used by tests and by callers that want to know
 * whether masking actually changed anything. Deliberately does NOT call
 * `.test()` on the shared, global-flagged PATTERNS regexes directly — a
 * `g`-flag regex's `.test()` is stateful (`lastIndex` persists across
 * calls), which would make repeated calls against different strings
 * silently give wrong answers. Comparing the masked output to the
 * original is stateless and correct.
 */
export function containsLikelySecret(text: string | null | undefined): boolean {
  if (!text) return false;
  return maskSecrets(text) !== text;
}
