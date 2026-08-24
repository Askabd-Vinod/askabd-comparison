/**
 * Raw request body capture — required for real webhook signature verification.
 *
 * Fastify's default JSON content-type parser deserializes the request body and
 * discards the original bytes. An HMAC signature computed by a real webhook
 * sender (e.g. a Jira Automation rule, or a relay in front of it — see
 * jira-integration-service.ts's `verifyWebhookRequest`) is computed over the
 * EXACT bytes it sent, not over `JSON.stringify(parsedBody)` — key ordering,
 * whitespace, and unicode-escaping can differ between the two even for
 * semantically-identical JSON, which would make a correctly-signed real
 * request fail verification. This module replaces the built-in JSON parser
 * with one that behaves identically (same parsing, same error shape/status on
 * malformed JSON) but additionally stashes the raw `Buffer` on the request via
 * `getRawBody()`, for the one real caller that needs byte-exact access
 * (`POST /oc/jira/webhook`). Every other route is unaffected — `request.body`
 * still contains the identical parsed object it always did.
 */
import { FastifyInstance, FastifyRequest } from 'fastify';

export function registerRawBodyCapture(server: FastifyInstance): void {
  server.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body: Buffer, done) => {
    (req as any).rawBody = body;
    if (body.length === 0) {
      // Match Fastify's default behavior for an empty JSON body: undefined, not an error.
      done(null, undefined);
      return;
    }
    try {
      const json = JSON.parse(body.toString('utf8'));
      done(null, json);
    } catch (err) {
      const parseError = err as Error & { statusCode?: number };
      parseError.statusCode = 400;
      done(parseError, undefined);
    }
  });
}

/** The exact raw request body bytes, if this request's content-type was application/json. */
export function getRawBody(request: FastifyRequest): Buffer | null {
  return (request as any).rawBody ?? null;
}
