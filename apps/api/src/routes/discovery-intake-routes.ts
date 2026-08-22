/**
 * Universal Discovery — free-text intake routes (migration 042,
 * discovery-intake-service.ts). Staff-managed, same RBAC precedent as CRM
 * and Business Requirements.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { DiscoveryIntakeService, DiscoverySourceNotFoundError, type SourceType, type ExtractionConfidence } from '../services/discovery-intake-service.js';
import { getAuth } from '../middleware/auth.js';

const SOURCE_TYPES: SourceType[] = ['free_text', 'document', 'meeting_notes', 'email', 'other'];
const CONFIDENCE_LEVELS: ExtractionConfidence[] = ['high', 'medium', 'low', 'unverified'];

export async function discoveryIntakeRoutes(server: FastifyInstance): Promise<void> {
  const service = new DiscoveryIntakeService();

  server.get('/oc/clients/:clientId/discovery-sources', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    return { sources: await service.listSources(clientId) };
  });

  server.post('/oc/clients/:clientId/discovery-sources', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId } = req.params as { clientId: string };
    const body = req.body as { sourceType?: string; title?: string; rawContent?: string };
    if (!body.title || !body.title.trim()) {
      return reply.status(400).send({ error: { code: 'missing_fields', message: 'title is required' } });
    }
    if (!body.rawContent || !body.rawContent.trim()) {
      return reply.status(400).send({ error: { code: 'missing_fields', message: 'rawContent is required — a discovery source must have real content' } });
    }
    if (body.sourceType && !SOURCE_TYPES.includes(body.sourceType as SourceType)) {
      return reply.status(400).send({ error: { code: 'invalid_source_type', message: `sourceType must be one of ${SOURCE_TYPES.join(', ')}` } });
    }
    const auth = getAuth(req);
    const source = await service.submitSource(clientId, { sourceType: body.sourceType as SourceType | undefined, title: body.title.trim(), rawContent: body.rawContent }, auth?.userId ?? null);
    reply.status(201).send({ source });
  });

  // Real document/file ingestion (migration 045) — @fastify/multipart is
  // registered globally in server.ts (20MB limit, matching this route's
  // own check in the service layer).
  server.post('/oc/clients/:clientId/discovery-sources/document', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId } = req.params as { clientId: string };
    const data = await (req as any).file();
    if (!data) return reply.status(400).send({ error: { code: 'missing_file', message: 'No file provided' } });

    const chunks: Buffer[] = [];
    for await (const chunk of data.file) chunks.push(chunk as Buffer);
    const buffer = Buffer.concat(chunks);

    const title = (data.fields?.title?.value as string) || data.filename || 'Untitled document';
    const auth = getAuth(req);
    try {
      const source = await service.submitDocument(clientId, { title, fileName: data.filename || 'unnamed', mimeType: data.mimetype || 'application/octet-stream', buffer }, auth?.userId ?? null);
      reply.status(201).send({ source });
    } catch (err) {
      reply.status(400).send({ error: { code: 'invalid_document', message: (err as Error).message } });
    }
  });

  server.get('/oc/discovery-sources/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const source = await service.getSource(id);
    if (!source) return reply.status(404).send({ error: { code: 'not_found', message: 'Discovery source not found' } });
    reply.send({ source });
  });

  server.post('/oc/discovery-sources/:id/review', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const auth = getAuth(req);
    const source = await service.markReviewed(id, auth?.userId ?? null);
    if (!source) return reply.status(404).send({ error: { code: 'not_found', message: 'Discovery source not found' } });
    reply.send({ source });
  });

  server.post('/oc/discovery-sources/:id/archive', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const auth = getAuth(req);
    const source = await service.archiveSource(id, auth?.userId ?? null);
    if (!source) return reply.status(404).send({ error: { code: 'not_found', message: 'Discovery source not found' } });
    reply.send({ source });
  });

  server.get('/oc/discovery-sources/:id/extractions', async (req: FastifyRequest) => {
    const { id } = req.params as { id: string };
    return { extractions: await service.listExtractions(id) };
  });

  server.post('/oc/discovery-sources/:id/extractions', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { fieldName?: string; fieldValue?: string; evidenceQuote?: string; confidence?: string };
    if (!body.fieldName || !body.fieldName.trim()) {
      return reply.status(400).send({ error: { code: 'missing_fields', message: 'fieldName is required' } });
    }
    if (!body.fieldValue || !body.fieldValue.trim()) {
      return reply.status(400).send({ error: { code: 'missing_fields', message: 'fieldValue is required' } });
    }
    if (body.confidence && !CONFIDENCE_LEVELS.includes(body.confidence as ExtractionConfidence)) {
      return reply.status(400).send({ error: { code: 'invalid_confidence', message: `confidence must be one of ${CONFIDENCE_LEVELS.join(', ')}` } });
    }
    const auth = getAuth(req);
    try {
      const extraction = await service.extractField(id, {
        fieldName: body.fieldName, fieldValue: body.fieldValue,
        evidenceQuote: body.evidenceQuote || '', confidence: body.confidence as ExtractionConfidence | undefined,
      }, auth?.userId ?? null);
      reply.status(201).send({ extraction });
    } catch (err) {
      if (err instanceof DiscoverySourceNotFoundError) {
        return reply.status(404).send({ error: { code: 'not_found', message: err.message } });
      }
      return reply.status(400).send({ error: { code: 'invalid_extraction', message: (err as Error).message } });
    }
  });
}
