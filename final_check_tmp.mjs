import pg from 'pg';
const compPool = new pg.Pool({ connectionString: 'postgresql://comp_user:comp_local_pass@localhost:5442/comparison' });
const idPool = new pg.Pool({ connectionString: 'postgresql://identity_user:identity_local_pass@localhost:5532/identity' });

const clients = await compPool.query('SELECT id, name FROM oc_clients');
console.log('oc_clients:', JSON.stringify(clients.rows));
const mappings = await compPool.query('SELECT count(*) FROM client_identity_mapping');
console.log('client_identity_mapping count:', mappings.rows[0].count);
const invites = await compPool.query("SELECT count(*) FROM oc_invitations WHERE status = 'invited'");
console.log('pending invitations:', invites.rows[0].count);
const identities = await idPool.query('SELECT identifier, org_context FROM identity');
console.log('identities:', JSON.stringify(identities.rows));
const mfa = await idPool.query('SELECT count(*) FROM mfa_method');
console.log('mfa_method rows (should be 0 — no fixture identities remain):', mfa.rows[0].count);
const contacts = await compPool.query('SELECT count(*) FROM oc_contacts');
console.log('oc_contacts:', contacts.rows[0].count);
const notes = await compPool.query('SELECT count(*) FROM oc_client_notes');
console.log('oc_client_notes:', notes.rows[0].count);
const tasks = await compPool.query('SELECT count(*) FROM oc_client_tasks');
console.log('oc_client_tasks:', tasks.rows[0].count);

await compPool.end();
await idPool.end();
