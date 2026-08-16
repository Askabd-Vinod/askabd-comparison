/**
 * AskABD Demo Seed Script
 * Creates "Meridian Financial Group" with full transformation journey data.
 * IDEMPOTENT: safe to run multiple times.
 * Uses real AskABD APIs — not raw SQL.
 *
 * Usage: npx tsx scripts/seed-demo.ts
 */

const API = 'http://localhost:4200/api/v1';
const DEMO_CLIENT_ID = 'demo-meridian-financial';

async function post(path: string, body: any) {
  const r = await fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}
async function get(path: string) {
  const r = await fetch(`${API}${path}`);
  return r.json();
}
async function put(path: string, body: any) {
  const r = await fetch(`${API}${path}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}

async function seed() {
  console.log('=== AskABD Demo Seed: Meridian Financial Group ===\n');

  // 1. Check if already exists
  const existing = await get(`/oc/lifecycle/${DEMO_CLIENT_ID}`);
  if (existing.initialized) {
    console.log('✓ Demo client already exists. Skipping creation (idempotent).');
    console.log(`  Lifecycle: ${existing.status}`);
    return;
  }

  // 2. Initialize lifecycle
  console.log('1. Initializing lifecycle...');
  await post('/oc/lifecycle/init', { clientId: DEMO_CLIENT_ID, initialStatus: 'organization-created' });

  // 3. Progress through lifecycle stages
  const transitions = [
    'organization_created', 'otp_verified', 'identity_verified', 'security_validated',
    'environment_registered', 'connectors_configured', 'discovery_started', 'discovery_completed',
    'assessment_started', 'assessment_completed', 'recommendations_generated',
    'migration_plan_created', 'migration_approved', 'migration_started', 'migration_completed',
    'validation_started', 'validation_passed', 'managed_services_active',
  ];
  for (const event of transitions) {
    await post('/oc/lifecycle/transition', { clientId: DEMO_CLIENT_ID, event, actor: 'demo-seed', actorType: 'system', skipReadiness: true });
  }
  console.log('   ✓ Lifecycle: managed-services');

  // 4. Create problems
  console.log('2. Creating problems...');
  const problems = [
    { title: 'Legacy Database Platform Risk', domain: 'database', category: 'technology', severity: 'critical', priority: 'critical', description: 'Core banking database running on unsupported PostgreSQL 9.6 with end-of-life security risks.', businessImpact: 'Regulatory exposure and potential audit findings.', technicalImpact: 'No security patches, increasing vulnerability surface.' },
    { title: 'Infrastructure Cost Overrun', domain: 'infrastructure', category: 'cost', severity: 'high', priority: 'high', description: 'On-premises infrastructure costs 3x equivalent cloud-managed services.', businessImpact: '$180K annual overspend on infrastructure operations.' },
    { title: 'Manual Deployment Process', domain: 'devops', category: 'operations', severity: 'high', priority: 'medium', description: 'All deployments require manual SSH access and 4-hour maintenance windows.', businessImpact: 'Slow release cycles, high operational risk, staff dependency.' },
    { title: 'No Disaster Recovery Plan', domain: 'infrastructure', category: 'resilience', severity: 'critical', priority: 'critical', description: 'No tested DR procedure. RPO/RTO undefined.', businessImpact: 'Potential complete data loss in disaster scenario.' },
    { title: 'Security Compliance Gap', domain: 'security', category: 'compliance', severity: 'high', priority: 'high', description: 'Missing encryption at rest, incomplete access controls.', businessImpact: 'SOC 2 audit failure risk, regulatory penalties.' },
    { title: 'Application Performance Degradation', domain: 'application', category: 'performance', severity: 'medium', priority: 'medium', description: 'Core transaction processing P95 latency has increased 40% over 12 months.', technicalImpact: 'Customer-facing SLA at risk during peak periods.' },
    { title: 'Vendor Lock-in Risk', domain: 'vendor', category: 'strategy', severity: 'medium', priority: 'low', description: 'Single-vendor dependency for core infrastructure with limited negotiation leverage.', businessImpact: 'Increasing license costs with 15% annual escalation.' },
  ];
  for (const p of problems) {
    await post(`/oc/clients/${DEMO_CLIENT_ID}/problems`, p);
  }
  console.log(`   ✓ ${problems.length} problems created`);

  // 5. Generate gaps
  console.log('3. Generating gaps...');
  const gapResult = await post(`/oc/clients/${DEMO_CLIENT_ID}/gaps/generate`, {});
  console.log(`   ✓ ${gapResult.generated || 0} gaps generated`);

  // 6. Financial estimates
  console.log('4. Creating financial estimates...');
  const probList = await get(`/oc/clients/${DEMO_CLIENT_ID}/problems`);
  const firstProb = probList.problems?.[0];
  if (firstProb) {
    await post(`/oc/problems/${firstProb.id}/financial`, { currentCost: 520000, implementationCost: 250000, annualSavings: 400000, confidence: 'high', calculationMethod: 'comparative', assumptions: ['Cloud-managed DB reduces ops cost 60%', '3-year payback model'] });
    await post(`/oc/problems/${firstProb.id}/effort`, { personDays: 120, teamSize: 5, duration: '6 months', complexity: 'high', confidence: 'medium', roles: ['Solution Architect', 'Database Engineer', 'Cloud Engineer', 'Security Engineer', 'QA Engineer'], assumptions: ['Dedicated team', 'No major scope changes'] });
  }
  console.log('   ✓ Financial + effort estimates');

  // 7. Create transformation
  console.log('5. Creating transformation...');
  const tfm = await post(`/oc/clients/${DEMO_CLIENT_ID}/transformations`, {
    title: 'Cloud Database Modernization', domain: 'database', transformationType: 'cloud_migration',
    description: 'Migrate legacy PostgreSQL 9.6 to AWS RDS PostgreSQL 16 with full HA, automated backups, and managed security.',
    investment: 250000, expectedSavings: 400000, expectedRoi: 60, personDays: 120, duration: '6 months', teamSize: 5,
    phases: [{ name: 'Discovery & Preparation', duration: '4 weeks' }, { name: 'Architecture & Design', duration: '3 weeks' }, { name: 'Migration Execution', duration: '6 weeks' }, { name: 'Validation & Testing', duration: '3 weeks' }, { name: 'Optimization', duration: '4 weeks' }],
    milestones: ['Architecture approved', 'Test migration successful', 'Production cutover', 'Validation complete', 'Optimization baseline'],
    rollbackStrategy: 'Maintain parallel legacy environment for 30 days post-migration. Automated failback procedure tested.',
    expectedOutcome: 'Fully managed cloud database with 99.99% availability, automated security patching, and 60% cost reduction.',
    roles: ['Solution Architect', 'Database Engineer', 'Cloud Engineer', 'Security Engineer', 'QA Engineer'],
    risks: [{ risk: 'Data migration complexity', mitigation: 'Phased approach with dry-runs' }, { risk: 'Application compatibility', mitigation: 'Comprehensive testing phase' }],
    successCriteria: ['Zero data loss', '99.99% availability', 'P95 latency < 50ms', 'All compliance controls met'],
  });
  console.log(`   ✓ Transformation: ${tfm.id}`);

  // 8. Record outcome
  console.log('6. Recording outcome...');
  if (tfm.id) {
    await post(`/oc/clients/${DEMO_CLIENT_ID}/optimization/outcomes`, {
      transformationId: tfm.id, expectedCost: 250000, actualCost: 275000, expectedSavings: 400000, actualSavings: 350000,
      roiExpected: 60, roiActual: 48, expectedDuration: '6 months', actualDuration: '7 months', scheduleVarianceDays: 30,
      expectedAvailability: 99.99, actualAvailability: 99.97, summary: 'Migration completed with minor cost overrun. Benefits tracking on target.',
    });
  }
  console.log('   ✓ Outcome recorded');

  // 9. Create optimization metrics + measurement
  console.log('7. Creating optimization metrics...');
  const metricRes = await post(`/oc/clients/${DEMO_CLIENT_ID}/optimization/metrics`, {
    name: 'Monthly Infrastructure Cost', category: 'cost', domain: 'infrastructure', unit: 'USD',
    direction: 'lower_is_better', targetValue: 25000, thresholdWarning: 35000, thresholdCritical: 45000,
    measurementFrequency: 'monthly', transformationId: tfm?.id,
  });
  if (metricRes?.id) {
    await post(`/oc/clients/${DEMO_CLIENT_ID}/optimization/baselines`, { metricId: metricRes.id, value: 43000, confidence: 'high', evidence: [{ source: 'billing', period: 'pre-migration average' }] });
    await post(`/oc/clients/${DEMO_CLIENT_ID}/optimization/measurements`, { metricId: metricRes.id, value: 28000, source: 'billing', confidence: 'high', evidence: [{ source: 'aws_billing', month: '2026-07' }] });
  }
  console.log('   ✓ Optimization baseline + measurement');

  // 10. Compliance
  console.log('8. Initializing compliance...');
  await post(`/oc/clients/${DEMO_CLIENT_ID}/compliance/initialize`, { frameworkId: 'fw-iso27001' });
  await post(`/oc/clients/${DEMO_CLIENT_ID}/compliance/initialize`, { frameworkId: 'fw-soc2' });
  await post(`/oc/clients/${DEMO_CLIENT_ID}/compliance/auto-map`, {});
  console.log('   ✓ ISO 27001 + SOC 2 initialized');

  // 11. Emit events for workflow
  console.log('9. Emitting workflow events...');
  await post('/oc/events', { eventType: 'LIFECYCLE_CHANGED', clientId: DEMO_CLIENT_ID, entityType: 'lifecycle', entityId: DEMO_CLIENT_ID, entityName: 'managed-services', severity: 'info', idempotencyKey: `demo-lc-${DEMO_CLIENT_ID}` });
  await post('/oc/events', { eventType: 'PROBLEM_CREATED', clientId: DEMO_CLIENT_ID, entityType: 'problem', entityId: 'demo-prob', entityName: 'Legacy Database Platform Risk', severity: 'critical', payload: { severity: 'critical' }, idempotencyKey: `demo-prob-${DEMO_CLIENT_ID}` });
  console.log('   ✓ Events emitted');

  console.log('\n=== Demo Seed Complete ===');
  console.log(`Client ID: ${DEMO_CLIENT_ID}`);
  console.log(`Portal: http://localhost:3001/client-portal/${DEMO_CLIENT_ID}`);
  console.log(`Journey: http://localhost:3001/client-portal/${DEMO_CLIENT_ID}/journey`);
}

seed().catch(err => { console.error('Seed failed:', err.message); process.exit(1); });
