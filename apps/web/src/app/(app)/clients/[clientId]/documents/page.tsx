import { mockClients } from '../../../../lib/mock-clients';
import { apiSafe } from '../../../../lib/api';
import { DocumentsView } from './documents-view';
import { DocumentGenerationView, type DocumentTemplate, type GeneratedDocument } from './document-generation-view';
import { DemoDataBanner } from '../../../../components/demo-data-banner';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientDocumentsPage({ params }: PageProps) {
  const { clientId } = await params;
  const client = mockClients.find(c => c.id === clientId);
  if (!client) {
    // Real client — real Document Generation Engine (migration 046,
    // roadmap Phase 3), replacing what was previously a hardcoded
    // placeholder. The mock/demo branch below is untouched.
    const { templates } = await apiSafe<{ templates: DocumentTemplate[] }>('/api/v1/oc/document-templates', { templates: [] });
    const { documents } = await apiSafe<{ documents: GeneratedDocument[] }>(`/api/v1/oc/clients/${clientId}/documents`, { documents: [] });
    return <DocumentGenerationView clientId={clientId} initialTemplates={templates} initialDocuments={documents} />;
  }

  const documents = [
    { id: 'doc-1', title: 'Service Level Agreement', category: 'Contracts', status: 'active', updated: '2026-07-01', owner: 'hello@askabd.com', version: '2.1' },
    { id: 'doc-2', title: 'Architecture Overview', category: 'Architecture', status: 'published', updated: '2026-06-15', owner: 'hello@askabd.com', version: '3.0' },
    { id: 'doc-3', title: 'Deployment Runbook', category: 'Runbooks', status: 'published', updated: '2026-07-20', owner: 'ops@askabd.com', version: '1.4' },
    { id: 'doc-4', title: 'Security Assessment Report', category: 'Assessments', status: 'published', updated: '2026-06-30', owner: 'hello@askabd.com', version: '1.0' },
    { id: 'doc-5', title: 'Disaster Recovery Plan', category: 'Policies', status: 'draft', updated: '2026-08-01', owner: 'ops@askabd.com', version: '0.9' },
    { id: 'doc-6', title: 'Incident Response Procedure', category: 'Runbooks', status: 'published', updated: '2026-05-10', owner: 'ops@askabd.com', version: '2.0' },
    { id: 'doc-7', title: 'Business Requirements Document', category: 'Business', status: 'published', updated: '2026-04-20', owner: client.primaryContact, version: '1.2' },
    { id: 'doc-8', title: 'Monthly Operations Report', category: 'Reports', status: 'published', updated: '2026-08-01', owner: 'hello@askabd.com', version: '8.0' },
    { id: 'doc-9', title: 'Invoice — August 2026', category: 'Invoices', status: 'active', updated: '2026-08-01', owner: 'hello@askabd.com', version: '1.0' },
    { id: 'doc-10', title: 'Invoice — July 2026', category: 'Invoices', status: 'published', updated: '2026-07-01', owner: 'hello@askabd.com', version: '1.0' },
  ];

  return <><DemoDataBanner /><DocumentsView documents={documents} clientId={clientId} clientName={client.name} /></>;
}
