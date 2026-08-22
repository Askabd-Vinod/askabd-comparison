/**
 * Document Generation Engine routes (migration 046, document-generation-engine.ts).
 * Staff-managed, same RBAC precedent as every other capability this
 * session. One customer-portal read route for customer_visible documents,
 * matching CRM/Business-Requirements/Gap-Analysis's established pattern.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { DocumentGenerationEngine, type ExportFormat } from '../services/document-generation-engine.js';
import { getAuth } from '../middleware/auth.js';

const EXPORT_FORMATS: ExportFormat[] = ['html', 'markdown'];

export async function documentGenerationRoutes(server: FastifyInstance): Promise<void> {
  const engine = new DocumentGenerationEngine();

  // ─── Templates ──────────────────────────────────────────────────────────
  server.get('/oc/document-templates', async () => {
    return { templates: await engine.listTemplates() };
  });

  server.get('/oc/document-templates/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const template = await engine.getTemplate(id);
    if (!template) return reply.status(404).send({ error: { code: 'not_found', message: 'Template not found' } });
    reply.send({ template });
  });

  server.post('/oc/document-templates', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { documentType?: string; name?: string; description?: string; sections?: unknown[]; approvalRequired?: boolean };
    if (!body.documentType || !body.name) {
      return reply.status(400).send({ error: { code: 'missing_fields', message: 'documentType and name are required' } });
    }
    if (!Array.isArray(body.sections) || body.sections.length === 0) {
      return reply.status(400).send({ error: { code: 'missing_fields', message: 'At least one section is required' } });
    }
    try {
      const template = await engine.createTemplate({ documentType: body.documentType, name: body.name, description: body.description, sections: body.sections as any, approvalRequired: body.approvalRequired });
      reply.status(201).send({ template });
    } catch (err) {
      reply.status(400).send({ error: { code: 'invalid_template', message: (err as Error).message } });
    }
  });

  // ─── Documents ──────────────────────────────────────────────────────────
  server.get('/oc/clients/:clientId/documents', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    return { documents: await engine.listDocuments(clientId) };
  });

  server.post('/oc/clients/:clientId/documents', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clientId } = req.params as { clientId: string };
    const body = req.body as { templateId?: string; title?: string };
    if (!body.templateId) return reply.status(400).send({ error: { code: 'missing_fields', message: 'templateId is required' } });
    const actor = getAuth(req)?.userId ?? null;
    try {
      const document = await engine.generateDocument(clientId, body.templateId, actor, body.title);
      reply.status(201).send({ document });
    } catch (err) {
      const status = (err as Error).message.includes('not found') ? 404 : 400;
      reply.status(status).send({ error: { code: 'generation_failed', message: (err as Error).message } });
    }
  });

  server.get('/oc/documents/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const document = await engine.getDocument(id);
    if (!document) return reply.status(404).send({ error: { code: 'not_found', message: 'Document not found' } });
    reply.send({ document });
  });

  server.get('/oc/documents/:id/history', async (req: FastifyRequest) => {
    const { id } = req.params as { id: string };
    return { history: await engine.getDocumentHistory(id) };
  });

  server.get('/oc/documents/:id/quality-check', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const result = await engine.getQualityCheck(id);
    reply.send(result);
  });

  server.post('/oc/documents/:id/regenerate', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const actor = getAuth(req)?.userId ?? null;
    try {
      const document = await engine.regenerateContent(id, actor);
      reply.send({ document });
    } catch (err) {
      const status = (err as Error).message.includes('not found') ? 404 : 400;
      reply.status(status).send({ error: { code: 'regeneration_failed', message: (err as Error).message } });
    }
  });

  server.post('/oc/documents/:id/submit-for-approval', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const actor = getAuth(req)?.userId ?? null;
    try {
      const document = await engine.submitForApproval(id, actor);
      reply.send({ document });
    } catch (err) {
      const status = (err as Error).message.includes('not found') ? 404 : 400;
      reply.status(status).send({ error: { code: 'submit_failed', message: (err as Error).message } });
    }
  });

  server.post('/oc/documents/:id/decide-approval', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { decision?: 'approve' | 'reject' | 'request_changes'; note?: string };
    if (!body.decision || !['approve', 'reject', 'request_changes'].includes(body.decision)) {
      return reply.status(400).send({ error: { code: 'invalid_decision', message: "decision must be 'approve', 'reject', or 'request_changes'" } });
    }
    const actor = getAuth(req)?.userId ?? null;
    try {
      const document = await engine.decideApproval(id, body.decision, actor, body.note);
      reply.send({ document });
    } catch (err) {
      const status = (err as Error).message.includes('not found') ? 404 : 400;
      reply.status(status).send({ error: { code: 'decision_failed', message: (err as Error).message } });
    }
  });

  server.post('/oc/documents/:id/archive', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const actor = getAuth(req)?.userId ?? null;
    const document = await engine.archiveDocument(id, actor);
    if (!document) return reply.status(404).send({ error: { code: 'not_found', message: 'Document not found' } });
    reply.send({ document });
  });

  server.post('/oc/documents/:id/customer-visibility', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { visible } = req.body as { visible?: boolean };
    if (typeof visible !== 'boolean') return reply.status(400).send({ error: { code: 'invalid_field', message: 'visible must be a boolean' } });
    const actor = getAuth(req)?.userId ?? null;
    const document = await engine.setCustomerVisibility(id, visible, actor);
    if (!document) return reply.status(404).send({ error: { code: 'not_found', message: 'Document not found' } });
    reply.send({ document });
  });

  server.get('/oc/documents/:id/export', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { format } = req.query as { format?: string };
    if (!format || !EXPORT_FORMATS.includes(format as ExportFormat)) {
      return reply.status(400).send({ error: { code: 'invalid_format', message: `format must be one of ${EXPORT_FORMATS.join(', ')} (pdf/docx are NOT SUPPORTED YET)` } });
    }
    try {
      const exported = await engine.exportDocument(id, format as ExportFormat);
      reply.header('Content-Type', format === 'html' ? 'text/html' : 'text/markdown').send(exported);
    } catch (err) {
      const status = (err as Error).message.includes('not found') ? 404 : 400;
      reply.status(status).send({ error: { code: 'export_failed', message: (err as Error).message } });
    }
  });

  // ─── Customer portal ────────────────────────────────────────────────────
  server.get('/oc/portal/:clientId/documents', async (req: FastifyRequest) => {
    const { clientId } = req.params as { clientId: string };
    return { documents: await engine.listCustomerVisibleDocuments(clientId) };
  });
}
