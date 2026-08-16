/**
 * AskABD Demo Commercial Seed
 * Creates clean demo commercial data for demo-meridian-financial.
 * Idempotent — safe to re-run. Cleans test artifacts first.
 *
 * Usage: npx tsx scripts/seed-demo-commercial.ts
 */
import { sharedPool } from '../src/services/db-pool.js';

const CLIENT_ID = 'demo-meridian-financial';
const DEMO_ENG_NAME = 'Meridian Financial — Cloud & Security Modernization';

async function main() {
  console.log('[DEMO SEED] Starting demo commercial data seed...');
  console.log('[DEMO SEED] Client:', CLIENT_ID);

  // ─── Phase 1: Clean test artifacts ──────────────────────────────────────────
  console.log('\n[Phase 1] Cleaning test artifacts...');

  // Delete proposals linked to test engagements
  const { rowCount: propsDel } = await sharedPool.query(`
    DELETE FROM oc_proposals WHERE engagement_id IN (
      SELECT id FROM oc_commercial_engagements
      WHERE client_id = $1 AND name != $2
    )`, [CLIENT_ID, DEMO_ENG_NAME]);
  console.log(`  Deleted ${propsDel} test proposals`);

  // Delete engagement services for test engagements
  const { rowCount: esDel } = await sharedPool.query(`
    DELETE FROM oc_engagement_services WHERE engagement_id IN (
      SELECT id FROM oc_commercial_engagements
      WHERE client_id = $1 AND name != $2
    )`, [CLIENT_ID, DEMO_ENG_NAME]);
  console.log(`  Deleted ${esDel} test engagement services`);

  // Delete pricing for test engagements
  const { rowCount: epDel } = await sharedPool.query(`
    DELETE FROM oc_engagement_pricing WHERE engagement_id IN (
      SELECT id FROM oc_commercial_engagements
      WHERE client_id = $1 AND name != $2
    )`, [CLIENT_ID, DEMO_ENG_NAME]);
  console.log(`  Deleted ${epDel} test engagement pricing`);

  // Delete test engagements (keep only demo-named)
  const { rowCount: engDel } = await sharedPool.query(`
    DELETE FROM oc_commercial_engagements
    WHERE client_id = $1 AND name != $2`, [CLIENT_ID, DEMO_ENG_NAME]);
  console.log(`  Deleted ${engDel} test engagements`);

  // ─── Phase 2: Enable demo services ──────────────────────────────────────────
  console.log('\n[Phase 2] Enabling demo services...');

  const DEMO_SERVICES = [
    'cap-discovery-engine',
    'cap-assessment-engine',
    'cap-problem-universe',
    'cap-gap-analysis',
    'cap-transformation-planning',
    'cap-optimization-engine',
    'cap-compliance-automation',
    'cap-financial-reconciliation',
  ];

  for (const svcId of DEMO_SERVICES) {
    // Check if capability exists
    const { rows: capCheck } = await sharedPool.query(`SELECT id FROM oc_capabilities WHERE id = $1`, [svcId]);
    if (capCheck.length === 0) {
      console.log(`  SKIP ${svcId} — capability not found`);
      continue;
    }
    // Upsert
    await sharedPool.query(`
      INSERT INTO oc_client_services (client_id, service_id, status, enabled_at, enabled_by)
      VALUES ($1, $2, 'enabled', NOW(), 'demo-seed')
      ON CONFLICT (client_id, service_id) DO UPDATE SET status = 'enabled', enabled_at = NOW()
    `, [CLIENT_ID, svcId]);
    console.log(`  ✓ ${svcId} enabled`);
  }

  // ─── Phase 3: Create/find demo engagement ───────────────────────────────────
  console.log('\n[Phase 3] Creating demo engagement...');

  let engagementId: string;
  const { rows: existing } = await sharedPool.query(
    `SELECT id FROM oc_commercial_engagements WHERE client_id = $1 AND name = $2`,
    [CLIENT_ID, DEMO_ENG_NAME]
  );

  if (existing.length > 0) {
    engagementId = existing[0].id;
    console.log(`  Demo engagement already exists: ${engagementId}`);
  } else {
    const { rows: created } = await sharedPool.query(`
      INSERT INTO oc_commercial_engagements
        (client_id, name, description, engagement_type, currency, status,
         total_investment, total_expected_value, total_effort_days, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id
    `, [
      CLIENT_ID,
      DEMO_ENG_NAME,
      'Comprehensive cloud and security modernization addressing 7 identified problems and 7 capability gaps. Includes database migration, infrastructure hardening, compliance alignment, and continuous optimization.',
      'transformation',
      'USD',
      'active',
      250000,
      400000,
      120,
      'demo-seed',
    ]);
    engagementId = created[0].id;
    console.log(`  ✓ Created engagement: ${engagementId}`);
  }

  // Add engagement services
  const ENG_SERVICES = ['cap-discovery-engine', 'cap-assessment-engine', 'cap-transformation-planning', 'cap-optimization-engine', 'cap-compliance-engine'];
  for (const svcId of ENG_SERVICES) {
    await sharedPool.query(`
      INSERT INTO oc_engagement_services (engagement_id, client_id, service_id, status, estimated_effort, estimated_investment, expected_value)
      VALUES ($1, $2, $3, 'active', $4, $5, $6)
      ON CONFLICT DO NOTHING
    `, [engagementId, CLIENT_ID, svcId, 24, 50000, 80000]);
  }
  console.log(`  ✓ ${ENG_SERVICES.length} services attached`);

  // Add pricing
  await sharedPool.query(`
    INSERT INTO oc_engagement_pricing (engagement_id, subtotal, discount, tax, total, currency, billing_model, payment_terms)
    VALUES ($1, 250000, 25000, 22500, 247500, 'USD', 'milestone', 'Net 30')
    ON CONFLICT DO NOTHING
  `, [engagementId]);
  console.log(`  ✓ Pricing set: $247,500`);

  // ─── Phase 4: Create demo proposal ──────────────────────────────────────────
  console.log('\n[Phase 4] Creating demo proposal...');

  // Remove old demo proposals for this engagement
  await sharedPool.query(`DELETE FROM oc_proposals WHERE engagement_id = $1`, [engagementId]);

  const { rows: propRows } = await sharedPool.query(`
    INSERT INTO oc_proposals
      (engagement_id, client_id, version, status, title,
       executive_summary, scope_summary, investment_summary, value_summary,
       payment_terms, created_by)
    VALUES ($1, $2, 1, 'accepted', $3, $4, $5, $6, $7, $8, $9) RETURNING id
  `, [
    engagementId, CLIENT_ID,
    'Cloud & Security Modernization Proposal — Meridian Financial',
    'AskABD has identified 7 critical problems and 7 capability gaps in Meridian Financial\'s technology estate through automated discovery of 156 resources and comprehensive risk assessment (score: 72/100). This proposal addresses the most impactful modernization opportunities with a projected annual savings of $400,000 and 87.5% benefit realization.',
    'Database modernization, infrastructure security hardening, compliance alignment (ISO 27001, SOC 2, NIST CSF), disaster recovery implementation, and continuous optimization monitoring.',
    'Total investment: $247,500 (milestone billing). Estimated effort: 120 person-days across 5 service domains.',
    'Expected annual savings: $400,000. Realized to date: $350,000 (87.5% benefit realization). ROI: 160% first year.',
    'Milestone billing, Net 30 payment terms. Invoiced at phase completion.',
    'demo-seed',
  ]);
  console.log(`  ✓ Proposal created: ${propRows[0].id} (status: accepted)`);

  // ─── Phase 5: Create demo payment method ────────────────────────────────────
  console.log('\n[Phase 5] Creating demo payment method...');

  // Remove old demo payment methods
  await sharedPool.query(`DELETE FROM oc_payment_methods WHERE client_id = $1 AND provider = 'demo'`, [CLIENT_ID]);

  const { rows: pmRows } = await sharedPool.query(`
    INSERT INTO oc_payment_methods
      (client_id, engagement_id, provider, type, brand, last4, display_name,
       currency, status, is_default, verification_status, verified_at, metadata)
    VALUES ($1, $2, 'demo', 'credit_card', 'Visa', '4242', 'Demo Corporate Card ····4242',
            'USD', 'active', true, 'verified', NOW(), '{"demo": true, "note": "DEMO — Fictional payment method"}')
    RETURNING id
  `, [CLIENT_ID, engagementId]);
  console.log(`  ✓ Payment method: ${pmRows[0].id} (Demo Corporate Card ····4242)`);

  // ─── Phase 6: Create demo transaction ───────────────────────────────────────
  console.log('\n[Phase 6] Creating demo transaction...');

  // Remove old demo transactions
  await sharedPool.query(`DELETE FROM oc_financial_transactions WHERE client_id = $1 AND provider = 'demo'`, [CLIENT_ID]);

  const { rows: txRows } = await sharedPool.query(`
    INSERT INTO oc_financial_transactions
      (client_id, engagement_id, payment_method_id, transaction_type,
       amount, currency, status, provider, reference, description, metadata)
    VALUES ($1, $2, $3, 'payment', 247500, 'USD', 'settled', 'demo',
            'DEMO-TXN-MF-001', 'Cloud & Security Modernization — Milestone 1',
            '{"demo": true, "note": "DEMO — Fictional transaction"}')
    RETURNING id
  `, [CLIENT_ID, engagementId, pmRows[0].id]);
  console.log(`  ✓ Transaction: ${txRows[0].id} ($247,500 settled)`);

  // ─── Phase 7: Create demo reconciliation ────────────────────────────────────
  console.log('\n[Phase 7] Running demo reconciliation...');

  // Remove old demo reconciliation data
  await sharedPool.query(`DELETE FROM oc_reconciliation_items WHERE client_id = $1`, [CLIENT_ID]);
  await sharedPool.query(`DELETE FROM oc_reconciliation_exceptions WHERE client_id = $1`, [CLIENT_ID]);
  await sharedPool.query(`DELETE FROM oc_reconciliation_runs WHERE client_id = $1`, [CLIENT_ID]);

  const { rows: reconRows } = await sharedPool.query(`
    INSERT INTO oc_reconciliation_runs
      (client_id, status, started_at, completed_at, records_processed,
       matched, unmatched, exceptions, total_expected, total_actual, variance)
    VALUES ($1, 'completed', NOW() - INTERVAL '1 hour', NOW(), 1, 1, 0, 0, 247500, 247500, 0)
    RETURNING id
  `, [CLIENT_ID]);
  const reconId = reconRows[0].id;

  // Create matched reconciliation item
  await sharedPool.query(`
    INSERT INTO oc_reconciliation_items
      (run_id, client_id, transaction_id, expected_amount, actual_amount, variance,
       currency, match_status, match_reason, confidence)
    VALUES ($1, $2, $3, 247500, 247500, 0, 'USD', 'matched', 'exact_amount_match', 100)
  `, [reconId, CLIENT_ID, txRows[0].id]);

  console.log(`  ✓ Reconciliation run: ${reconId} (1 matched, 0 exceptions, $0 variance)`);

  // ─── Summary ────────────────────────────────────────────────────────────────
  console.log('\n[DEMO SEED] ✓ Complete!');
  console.log('  Services enabled: 8');
  console.log('  Engagement: ' + DEMO_ENG_NAME);
  console.log('  Proposal: accepted');
  console.log('  Payment: Demo Corporate Card ····4242');
  console.log('  Transaction: $247,500 settled');
  console.log('  Reconciliation: 1 matched, $0 variance');
  console.log('\n  All data clearly marked as DEMO/fictional.');

  await sharedPool.end();
}

main().catch(e => { console.error('[DEMO SEED] ERROR:', e.message); process.exit(1); });
