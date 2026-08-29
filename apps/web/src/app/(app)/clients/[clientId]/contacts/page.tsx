import { mockClients } from '../../../../lib/mock-clients';
import { apiSafe } from '../../../../lib/api';
import { ContactsManager, type Contact } from './contacts-manager';

interface PageProps { params: Promise<{ clientId: string }> }

export default async function ClientContactsPage({ params }: PageProps) {
  const { clientId } = await params;
  const mockClient = mockClients.find(c => c.id === clientId);

  // Real clients get real, database-backed contacts (migration 030,
  // crm-service.ts) — never the fabricated, identical-for-every-client
  // sample list this page used to show for every client, mock or real.
  if (!mockClient) {
    const { contacts } = await apiSafe<{ contacts: Contact[] }>(`/api/v1/oc/clients/${clientId}/contacts`, { contacts: [] });
    return (
      <div>
        <h2 className="font-semibold text-lg mb-1">Contacts</h2>
        <p className="text-xs text-gray-500 mb-6">Real, database-backed client contacts. Staff-managed.</p>
        <ContactsManager clientId={clientId} initialContacts={contacts} />
      </div>
    );
  }

  // ─── Demo/sample dataset only — never shown for a real client ───────────
  const contacts = [
    { name: mockClient.primaryContact.split('@')[0].replace('.', ' ').replace(/\b\w/g, l => l.toUpperCase()), role: 'Business Owner', email: mockClient.primaryContact, phone: '+61 400 000 001', availability: 'Business Hours', type: 'executive' },
    { name: 'Technical Lead', role: 'Technical Owner', email: `tech.lead@${mockClient.primaryContact.split('@')[1]}`, phone: '+61 400 000 002', availability: 'Business Hours', type: 'technical' },
    { name: 'Project Manager', role: 'Project Manager', email: `pm@${mockClient.primaryContact.split('@')[1]}`, phone: '+61 400 000 003', availability: 'Business Hours', type: 'management' },
    { name: 'AskABD Account Manager', role: 'AskABD Lead', email: 'hello@askabd.com', phone: '+61 400 000 100', availability: '24/7', type: 'askabd' },
    { name: 'AskABD Operations', role: 'AskABD Ops', email: 'ops@askabd.com', phone: '+61 400 000 101', availability: '24/7', type: 'askabd' },
  ];
  const escalation = [
    { level: 'L1', contact: 'ops@askabd.com', response: '15 minutes', scope: 'All incidents' },
    { level: 'L2', contact: 'hello@askabd.com', response: '30 minutes', scope: 'Major/Critical incidents' },
    { level: 'L3', contact: `${mockClient.primaryContact} + hello@askabd.com`, response: '1 hour', scope: 'Critical with business impact' },
  ];

  return (
    <div>
      <h2 className="font-semibold text-lg mb-1">Contacts & Escalation</h2>
      <p className="text-xs text-gray-500 mb-6">Client contacts, AskABD team, and escalation matrix</p>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {contacts.map((contact, i) => (
          <div key={i} className="bg-white rounded-xl border p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{contact.name}</span>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${contact.type === 'askabd' ? 'bg-purple-100 text-purple-700' : contact.type === 'executive' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{contact.type}</span>
            </div>
            <div className="space-y-1 text-xs text-gray-600">
              <p>{contact.role}</p>
              <p className="text-purple-600">{contact.email}</p>
              <p>{contact.phone}</p>
              <p className="text-gray-400">Available: {contact.availability}</p>
            </div>
          </div>
        ))}
      </div>
      <section className="bg-white rounded-xl border p-5">
        <h3 className="font-semibold mb-4">Escalation Matrix</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left px-5 py-3">Level</th>
                <th className="text-left px-4 py-3">Contact</th>
                <th className="text-left px-4 py-3">Response Time</th>
                <th className="text-left px-4 py-3">Scope</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {escalation.map(esc => (
                <tr key={esc.level} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-bold text-xs">{esc.level}</td>
                  <td className="px-4 py-3 text-xs text-purple-600">{esc.contact}</td>
                  <td className="px-4 py-3 text-xs">{esc.response}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{esc.scope}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
