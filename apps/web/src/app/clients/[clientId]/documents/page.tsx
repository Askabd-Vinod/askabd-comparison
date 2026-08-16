import { CapabilityPlaceholder } from '../capability-placeholder';
import { mockClients } from '../../../lib/mock-clients';
import { DocumentsView } from './documents-view';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientDocumentsPage({ params }: PageProps) {
  const { clientId } = await params;
  const client = mockClients.find(c => c.id === clientId);
  if (!client) return <CapabilityPlaceholder title="Documents" description="Documents management for this client." />;

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

  return <DocumentsView documents={documents} clientId={clientId} clientName={client.name} />;
}
