import Fastify from 'fastify';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { operationsCenterRoutes } from '../src/routes/operations-center-routes.js';
import { sharedPool } from '../src/services/db-pool.js';

const TEST_CLIENT = 'demo-meridian-financial';
const ISOLATION_CLIENT_A = 'stable-0435';
const ISOLATION_CLIENT_B = 'guard-01';

let app: ReturnType<typeof Fastify>;

beforeAll(async () => {
  app = Fastify();
  await app.register(operationsCenterRoutes);
  await app.ready();
  // Pre-clean any leftover test data from previous runs (preserve demo provider records)
  await sharedPool.query("DELETE FROM oc_reconciliation_exceptions WHERE client_id IN ($1,$2,$3) AND run_id IN (SELECT id FROM oc_reconciliation_runs WHERE client_id IN ($1,$2,$3) AND (metadata::text NOT LIKE '%demo%' OR metadata IS NULL))", [TEST_CLIENT, ISOLATION_CLIENT_A, ISOLATION_CLIENT_B]);
  await sharedPool.query("DELETE FROM oc_reconciliation_items WHERE client_id IN ($1,$2,$3) AND run_id IN (SELECT id FROM oc_reconciliation_runs WHERE client_id IN ($1,$2,$3) AND (metadata::text NOT LIKE '%demo%' OR metadata IS NULL))", [TEST_CLIENT, ISOLATION_CLIENT_A, ISOLATION_CLIENT_B]);
  await sharedPool.query("DELETE FROM oc_reconciliation_runs WHERE client_id IN ($1,$2,$3) AND (metadata::text NOT LIKE '%demo%' OR metadata IS NULL)", [TEST_CLIENT, ISOLATION_CLIENT_A, ISOLATION_CLIENT_B]);
  await sharedPool.query("DELETE FROM oc_financial_transactions WHERE client_id IN ($1,$2,$3) AND (provider IS NULL OR provider != 'demo')", [TEST_CLIENT, ISOLATION_CLIENT_A, ISOLATION_CLIENT_B]);
  await sharedPool.query("DELETE FROM oc_payment_methods WHERE client_id IN ($1,$2,$3) AND (provider IS NULL OR provider != 'demo')", [TEST_CLIENT, ISOLATION_CLIENT_A, ISOLATION_CLIENT_B]);
});

afterAll(async () => {
  // Clean up test payment methods and transactions (only manual/test-created, preserve demo)
  await sharedPool.query("DELETE FROM oc_reconciliation_exceptions WHERE client_id IN ($1,$2,$3) AND run_id IN (SELECT id FROM oc_reconciliation_runs WHERE client_id IN ($1,$2,$3) AND metadata::text LIKE '%test%' OR created_at > NOW() - INTERVAL '1 hour')", [TEST_CLIENT, ISOLATION_CLIENT_A, ISOLATION_CLIENT_B]);
  await sharedPool.query("DELETE FROM oc_reconciliation_items WHERE client_id IN ($1,$2,$3) AND run_id IN (SELECT id FROM oc_reconciliation_runs WHERE client_id IN ($1,$2,$3) AND metadata::text LIKE '%test%' OR created_at > NOW() - INTERVAL '1 hour')", [TEST_CLIENT, ISOLATION_CLIENT_A, ISOLATION_CLIENT_B]);
  await sharedPool.query("DELETE FROM oc_reconciliation_runs WHERE client_id IN ($1,$2,$3) AND (metadata::text LIKE '%test%' OR created_at > NOW() - INTERVAL '1 hour')", [TEST_CLIENT, ISOLATION_CLIENT_A, ISOLATION_CLIENT_B]);
  await sharedPool.query("DELETE FROM oc_financial_transactions WHERE client_id IN ($1,$2,$3) AND provider != 'demo'", [TEST_CLIENT, ISOLATION_CLIENT_A, ISOLATION_CLIENT_B]);
  await sharedPool.query("DELETE FROM oc_payment_methods WHERE client_id IN ($1,$2,$3) AND provider != 'demo'", [TEST_CLIENT, ISOLATION_CLIENT_A, ISOLATION_CLIENT_B]);
  await app.close();
});

describe('Payment Methods', () => {
  let paymentMethodId: string;

  it('creates a payment method', async () => {
    const res = await app.inject({
      method: 'POST', url: `/oc/clients/${TEST_CLIENT}/payment-methods`,
      payload: { displayName: 'Company Bank Account', type: 'bank_transfer', provider: 'manual', currency: 'USD', last4: '4567' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);
    expect(res.json().paymentMethod.display_name).toBe('Company Bank Account');
    expect(res.json().paymentMethod.status).toBe('pending');
    paymentMethodId = res.json().paymentMethod.id;
  });

  it('lists payment methods for client', async () => {
    const res = await app.inject({ method: 'GET', url: `/oc/clients/${TEST_CLIENT}/payment-methods` });
    expect(res.statusCode).toBe(200);
    expect(res.json().paymentMethods.length).toBeGreaterThanOrEqual(1);
  });

  it('verifies a payment method (transitions to active)', async () => {
    const res = await app.inject({
      method: 'POST', url: `/oc/payment-methods/${paymentMethodId}/verify`,
      payload: { clientId: TEST_CLIENT },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('sets a payment method as default', async () => {
    const res = await app.inject({
      method: 'POST', url: `/oc/payment-methods/${paymentMethodId}/default`,
      payload: { clientId: TEST_CLIENT },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('disables a payment method', async () => {
    const res = await app.inject({
      method: 'POST', url: `/oc/payment-methods/${paymentMethodId}/disable`,
      payload: { clientId: TEST_CLIENT },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('rejects invalid payment type', async () => {
    const res = await app.inject({
      method: 'POST', url: `/oc/clients/${TEST_CLIENT}/payment-methods`,
      payload: { displayName: 'Invalid', type: 'invalid_type' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('invalid_type');
  });

  it('prevents duplicate payment methods (by provider ID)', async () => {
    const payload = { displayName: 'Dup Test', type: 'credit_card', providerPaymentMethodId: 'pm_unique_123' };
    const r1 = await app.inject({ method: 'POST', url: `/oc/clients/${TEST_CLIENT}/payment-methods`, payload });
    expect(r1.statusCode).toBe(201);
    const r2 = await app.inject({ method: 'POST', url: `/oc/clients/${TEST_CLIENT}/payment-methods`, payload });
    expect(r2.statusCode).toBe(422);
    expect(r2.json().error).toBe('duplicate');
  });

  it('enforces client isolation on payment methods', async () => {
    // Create for client A
    const r = await app.inject({
      method: 'POST', url: `/oc/clients/${ISOLATION_CLIENT_A}/payment-methods`,
      payload: { displayName: 'Private PM', type: 'wire_transfer' },
    });
    const pmId = r.json().paymentMethod.id;

    // Client B cannot see it
    const bList = await app.inject({ method: 'GET', url: `/oc/clients/${ISOLATION_CLIENT_B}/payment-methods` });
    expect(bList.json().paymentMethods.some((p: any) => p.id === pmId)).toBe(false);

    // Client B cannot access it directly
    const bGet = await app.inject({ method: 'GET', url: `/oc/payment-methods/${pmId}?clientId=${ISOLATION_CLIENT_B}` });
    expect(bGet.statusCode).toBe(404);
  });
});

describe('Financial Transactions', () => {
  it('creates a transaction', async () => {
    const res = await app.inject({
      method: 'POST', url: `/oc/clients/${TEST_CLIENT}/transactions`,
      payload: { transactionType: 'payment', amount: 50000, currency: 'USD', reference: 'INV-001' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);
    expect(res.json().transaction.amount).toBe('50000.00');
  });

  it('prevents duplicate transactions (by external ID)', async () => {
    const payload = { transactionType: 'payment', amount: 10000, externalTransactionId: 'ext-txn-unique-123' };
    const r1 = await app.inject({ method: 'POST', url: `/oc/clients/${TEST_CLIENT}/transactions`, payload });
    expect(r1.statusCode).toBe(201);
    const r2 = await app.inject({ method: 'POST', url: `/oc/clients/${TEST_CLIENT}/transactions`, payload });
    expect(r2.statusCode).toBe(422);
    expect(r2.json().error).toBe('duplicate');
  });

  it('lists transactions for client', async () => {
    const res = await app.inject({ method: 'GET', url: `/oc/clients/${TEST_CLIENT}/transactions` });
    expect(res.statusCode).toBe(200);
    expect(res.json().transactions.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects invalid transaction type', async () => {
    const res = await app.inject({
      method: 'POST', url: `/oc/clients/${TEST_CLIENT}/transactions`,
      payload: { transactionType: 'invalid', amount: 100 },
    });
    expect(res.statusCode).toBe(422);
  });
});

describe('Financial Reconciliation', () => {
  let runId: string;

  it('creates a reconciliation run', async () => {
    const res = await app.inject({
      method: 'POST', url: `/oc/clients/${TEST_CLIENT}/reconciliation/run`,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().run).toBeDefined();
    expect(res.json().run.status).toBe('draft');
    runId = res.json().run.id;
  });

  it('executes reconciliation', async () => {
    const res = await app.inject({
      method: 'POST', url: `/oc/reconciliation/${runId}/execute`,
      payload: { clientId: TEST_CLIENT },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(res.json().summary).toBeDefined();
  });

  it('gets reconciliation items', async () => {
    const res = await app.inject({
      method: 'GET', url: `/oc/reconciliation/${runId}/items?clientId=${TEST_CLIENT}`,
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().items)).toBe(true);
  });

  it('gets reconciliation summary', async () => {
    const res = await app.inject({
      method: 'GET', url: `/oc/clients/${TEST_CLIENT}/reconciliation/summary`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().transactions).toBeDefined();
    expect(res.json().reconciliation).toBeDefined();
    expect(res.json().exceptions).toBeDefined();
  });

  it('lists reconciliation runs', async () => {
    const res = await app.inject({
      method: 'GET', url: `/oc/clients/${TEST_CLIENT}/reconciliation`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().runs.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects invalid reconciliation run transition', async () => {
    const res = await app.inject({
      method: 'POST', url: `/oc/reconciliation/${runId}/transition`,
      payload: { clientId: TEST_CLIENT, newStatus: 'draft' },
    });
    // Run is 'completed', cannot go to 'draft'
    expect(res.statusCode).toBe(422);
  });

  it('transitions run from completed to reviewed', async () => {
    const res = await app.inject({
      method: 'POST', url: `/oc/reconciliation/${runId}/transition`,
      payload: { clientId: TEST_CLIENT, newStatus: 'reviewed' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('Reconciliation Exceptions', () => {
  it('lists exceptions for client', async () => {
    const res = await app.inject({
      method: 'GET', url: `/oc/clients/${TEST_CLIENT}/reconciliation/exceptions`,
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().exceptions)).toBe(true);
  });

  it('transitions an exception (if any exist)', async () => {
    // Get open exceptions
    const listRes = await app.inject({
      method: 'GET', url: `/oc/clients/${TEST_CLIENT}/reconciliation/exceptions?status=open`,
    });
    const exceptions = listRes.json().exceptions || [];
    if (exceptions.length === 0) return; // No exceptions to test

    const excId = exceptions[0].id;
    // open → investigating
    const res = await app.inject({
      method: 'POST', url: `/oc/reconciliation/exceptions/${excId}/transition`,
      payload: { clientId: TEST_CLIENT, newStatus: 'investigating', actor: 'test-user' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    // investigating → resolved
    const res2 = await app.inject({
      method: 'POST', url: `/oc/reconciliation/exceptions/${excId}/transition`,
      payload: { clientId: TEST_CLIENT, newStatus: 'resolved', actor: 'test-user', notes: 'Resolved in test' },
    });
    expect(res2.statusCode).toBe(200);
  });

  it('rejects invalid exception transition', async () => {
    // Create a new run with a transaction that will produce an exception
    const txnRes = await app.inject({
      method: 'POST', url: `/oc/clients/${TEST_CLIENT}/transactions`,
      payload: { transactionType: 'payment', amount: 99999, engagementId: 'nonexistent-eng', externalTransactionId: 'exc-test-txn' },
    });
    // Run recon to get fresh exceptions
    const runRes = await app.inject({ method: 'POST', url: `/oc/clients/${TEST_CLIENT}/reconciliation/run` });
    const freshRunId = runRes.json().run.id;
    await app.inject({ method: 'POST', url: `/oc/reconciliation/${freshRunId}/execute`, payload: { clientId: TEST_CLIENT } });

    const excRes = await app.inject({ method: 'GET', url: `/oc/clients/${TEST_CLIENT}/reconciliation/exceptions?status=open` });
    const freshExceptions = excRes.json().exceptions || [];
    if (freshExceptions.length === 0) return;

    // Try invalid transition: open → resolved (must go through investigating)
    const res = await app.inject({
      method: 'POST', url: `/oc/reconciliation/exceptions/${freshExceptions[0].id}/transition`,
      payload: { clientId: TEST_CLIENT, newStatus: 'resolved' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('invalid_transition');
  });
});

describe('Client Isolation — Financial', () => {
  it('client A cannot see client B transactions', async () => {
    // Create transaction for client A
    await app.inject({
      method: 'POST', url: `/oc/clients/${ISOLATION_CLIENT_A}/transactions`,
      payload: { transactionType: 'payment', amount: 7777, externalTransactionId: 'iso-txn-a' },
    });
    // Client B list should not contain it
    const bRes = await app.inject({ method: 'GET', url: `/oc/clients/${ISOLATION_CLIENT_B}/transactions` });
    expect(bRes.json().transactions.some((t: any) => t.external_transaction_id === 'iso-txn-a')).toBe(false);
  });

  it('client A cannot see client B reconciliation', async () => {
    const aRun = await app.inject({ method: 'POST', url: `/oc/clients/${ISOLATION_CLIENT_A}/reconciliation/run` });
    const aRunId = aRun.json().run.id;

    const bList = await app.inject({ method: 'GET', url: `/oc/clients/${ISOLATION_CLIENT_B}/reconciliation` });
    expect(bList.json().runs.some((r: any) => r.id === aRunId)).toBe(false);
  });
});

describe('Service Registry — New Capabilities', () => {
  it('cap-payment-methods is registered', async () => {
    const { rows } = await sharedPool.query("SELECT * FROM oc_capabilities WHERE id = 'cap-payment-methods'");
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('operational');
  });

  it('cap-financial-reconciliation is registered', async () => {
    const { rows } = await sharedPool.query("SELECT * FROM oc_capabilities WHERE id = 'cap-financial-reconciliation'");
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('operational');
  });

  it('cap-financial-transactions is registered', async () => {
    const { rows } = await sharedPool.query("SELECT * FROM oc_capabilities WHERE id = 'cap-financial-transactions'");
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('operational');
  });

  it('scheduler job registered', async () => {
    const { rows } = await sharedPool.query("SELECT * FROM oc_scheduled_jobs WHERE id = 'job-financial-recon'");
    expect(rows.length).toBe(1);
    expect(rows[0].job_type).toBe('FINANCIAL_RECONCILIATION');
  });
});
