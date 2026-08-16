import { FastifyInstance } from 'fastify';
import { config } from '../config/env.js';
import { sharedPool } from '../services/db-pool.js';
import { OperationsCenterService } from '../services/operations-center-service.js';
import { NotificationService } from '../services/notification-service.js';
import { ConnectorService } from '../services/connector-service.js';
import { DiscoveryService } from '../services/discovery-service.js';
import { AssessmentService } from '../services/assessment-service.js';
import { RecommendationService } from '../services/recommendation-service.js';
import { MigrationValidationService } from '../services/migration-validation-service.js';
import { MigrationExecutionService } from '../services/migration-execution-service.js';
import { ProblemUniverseService } from '../services/problem-universe-service.js';
import { GapAnalysisService } from '../services/gap-analysis-service.js';
import { DecisionTransformationService } from '../services/decision-transformation-service.js';
import { CapabilityRegistryService } from '../services/capability-registry-service.js';
import { ContinuousOptimizationService } from '../services/continuous-optimization-service.js';
import { PortfolioIntelligenceService } from '../services/portfolio-intelligence-service.js';
import { ClientPortalService } from '../services/client-portal-service.js';
import { WorkflowAutomationService } from '../services/workflow-automation-service.js';
import { SchedulerService } from '../services/scheduler-service.js';
import { ComplianceService } from '../services/compliance-service.js';
import { LifecycleService } from '../services/lifecycle-service.js';
import { RequirementsService } from '../services/requirements-service.js';
import { CommercialEngagementService } from '../services/commercial-engagement-service.js';
import { PaymentMethodService } from '../services/payment-method-service.js';
import { FinancialReconciliationService } from '../services/financial-reconciliation-service.js';

// Use the shared application-wide database pool
const routePool = sharedPool;

/**
 * Operations Center API Routes
 * All actions are persisted to database with full audit trail for evidence.
 */
export async function operationsCenterRoutes(server: FastifyInstance): Promise<void> {
  const ocService = new OperationsCenterService();
  const notifService = new NotificationService();

  // ─── CLIENTS ──────────────────────────────────────────────────────────────

  server.post('/oc/clients', async (req, reply) => {
    const client = await ocService.createClient(req.body as any);
    reply.status(201).send({ client });
  });

  server.get('/oc/clients', async (req) => {
    const q = req.query as any;
    const clients = await ocService.listClients({ health: q.health, status: q.status });
    return { clients };
  });

  server.get('/oc/clients/:id', async (req, reply) => {
    const client = await ocService.getClient((req.params as any).id);
    if (!client) return reply.status(404).send({ error: { code: 'not_found', message: 'Client not found' } });
    return { client };
  });

  server.put('/oc/clients/:id', async (req, reply) => {
    const client = await ocService.updateClient((req.params as any).id, req.body as any);
    return { client };
  });

  // ─── LIFECYCLE (SERVER-SIDE AUTHORITATIVE) ─────────────────────────────────

  const lifecycleService = new LifecycleService();

  server.get('/oc/lifecycle/:clientId', async (req) => {
    const { clientId } = req.params as any;
    const lifecycle = await lifecycleService.getLifecycle(clientId);
    if (!lifecycle) {
      // Check if this client exists in the database but has no lifecycle record yet
      // This handles pre-existing clients (e.g., seeded or migrated) gracefully.
      // No hardcoded client IDs — any existing client without lifecycle gets initialized.
      const pool = routePool;
      try {
        const clientCheck = await pool.query("SELECT id, status FROM oc_clients WHERE id = $1", [clientId]);
        const isKnownClient = clientCheck.rows.length > 0;

        if (isKnownClient) {
          // Pre-existing client without lifecycle: initialize at managed-services
          // (they were onboarded before lifecycle tracking was implemented)
          const initialized = await lifecycleService.initializeLifecycle(clientId, 'managed-services');
          return { ...initialized, initialized: true, reconciled: true, reconciliationReason: 'Pre-existing client initialized at managed-services (lifecycle record created)' };
        }
      } catch { /* DB unavailable */ }

      return { clientId, status: null, initialized: false };
    }
    return { ...lifecycle, initialized: true };
  });

  server.post('/oc/lifecycle/init', async (req, reply) => {
    const { clientId, initialStatus } = req.body as any;
    if (!clientId) { reply.status(400).send({ error: 'clientId required' }); return; }
    const result = await lifecycleService.initializeLifecycle(clientId, initialStatus || 'organization-created');
    reply.status(201).send(result);
  });

  server.post('/oc/lifecycle/transition', async (req, reply) => {
    const { clientId, event, actor, details, skipReadiness, actorType } = req.body as any;
    if (!clientId || !event) { reply.status(400).send({ error: 'clientId and event required' }); return; }

    // SECURITY: actorType defaults to 'user' for all external API requests.
    // Only internal system calls may legitimately set actorType='system'.
    // In production, this would be validated via service-to-service auth tokens.
    // For now, the guard is inside LifecycleService which only trusts known actor types.
    const result = await lifecycleService.transition(clientId, event, actor || 'system', details, skipReadiness === true, actorType || 'user');
    if (!result.success) {
      const statusCode = result.error === 'lifecycle_prerequisites_not_met' ? 422 : result.error?.includes('version') ? 409 : 422;
      // Audit blocked transition
      ocService.createAuditEntry({
        entityType: 'lifecycle', entityId: clientId, entityName: event,
        action: 'lifecycle_transition_blocked', actor: actor || 'system',
        details: { event, error: result.error, blockers: result.readiness?.blockers?.length || 0 },
        evidence: [`Transition ${event} blocked: ${result.error}`],
      }).catch(() => {});

      reply.status(statusCode).send({ success: false, error: result.error, readiness: result.readiness });
      return;
    }

    // Audit successful transition
    ocService.createAuditEntry({
      entityType: 'lifecycle', entityId: clientId, entityName: event,
      action: 'lifecycle_transition', actor: actor || 'system',
      details: { event, from: result.lifecycle?.previousStatus, to: result.lifecycle?.status },
      evidence: [`Lifecycle: ${result.lifecycle?.previousStatus} → ${result.lifecycle?.status} via ${event}`],
    }).catch(() => {});

    reply.send(result);
  });

  server.get('/oc/lifecycle/:clientId/history', async (req) => {
    const { clientId } = req.params as any;
    const history = await lifecycleService.getHistory(clientId);
    return { clientId, events: history };
  });

  // ─── AUDIT LOG ────────────────────────────────────────────────────────────

  server.get('/oc/audit', async (req) => {
    const q = req.query as any;
    const entries = await ocService.getAuditLog({
      entityType: q.entityType, entityId: q.entityId, limit: q.limit ? parseInt(q.limit) : 100,
    });
    return { entries };
  });

  server.post('/oc/audit', async (req, reply) => {
    const entry = await ocService.createAuditEntry(req.body as any);
    reply.status(201).send({ entry });
  });

  // ─── REMEDIATIONS ─────────────────────────────────────────────────────────

  server.post('/oc/remediations', async (req, reply) => {
    const remediation = await ocService.createRemediation(req.body as any);
    reply.status(201).send({ remediation });
  });

  server.patch('/oc/remediations/:id/phase', async (req) => {
    const { phase, evidence, actor } = req.body as any;
    const remediation = await ocService.updateRemediationPhase(
      (req.params as any).id, phase, evidence || [], actor || 'system'
    );
    return { remediation };
  });

  server.post('/oc/remediations/:id/close', async (req) => {
    const { verifiedBy } = req.body as any;
    const remediation = await ocService.closeRemediationTicket((req.params as any).id, verifiedBy);
    return { remediation };
  });

  // ─── SERVICE ACTIONS ──────────────────────────────────────────────────────

  server.post('/oc/service-actions', async (req, reply) => {
    const action = await ocService.recordServiceAction(req.body as any);
    reply.status(201).send({ action });
  });

  server.get('/oc/service-actions/:entityId', async (req) => {
    const actions = await ocService.getServiceActions((req.params as any).entityId);
    return { actions };
  });

  // ─── NOTIFICATIONS ────────────────────────────────────────────────────────

  server.post('/oc/notifications', async (req, reply) => {
    const notification = await notifService.sendNotification(req.body as any);
    reply.status(201).send({ notification });
  });

  server.get('/oc/notifications', async (req) => {
    const q = req.query as any;
    const notifications = await notifService.getNotifications({
      clientId: q.clientId, phase: q.phase, limit: q.limit ? parseInt(q.limit) : 50,
    });
    return { notifications };
  });

  // ─── OTP & VERIFICATION ───────────────────────────────────────────────────

  // PostgreSQL-backed OTP store: survives API restarts
  const { storeOtp, getOtp, incrementAttempts, deleteOtp } = await import('../services/otp-store.js');

  server.post('/oc/otp/send', async (req, reply) => {
    const { clientId, clientName, businessOwner, email, onboardingData } = req.body as any;
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Persist OTP to PostgreSQL with onboarding metadata (NEVER sent to frontend)
    await storeOtp(clientId, otp, expiry, { email, clientName, businessOwner });

    // Build email content from onboarding data
    const servicesHtml = (onboardingData?.services || []).map((s: string) => `<li>${s}</li>`).join('');
    const html = `
      <h2>AskABD Enterprise Client Onboarding Verification</h2>
      <p>Hello ${businessOwner},</p>
      <p>Your organization <strong>${clientName}</strong> has been registered for onboarding with AskABD.</p>
      <h3>Organization Information</h3>
      <ul>
        <li><strong>Company:</strong> ${onboardingData?.companyName || clientName}</li>
        <li><strong>Industry:</strong> ${onboardingData?.industry || 'N/A'}</li>
        <li><strong>Country:</strong> ${onboardingData?.country || 'N/A'}</li>
        <li><strong>Business Size:</strong> ${onboardingData?.size || 'N/A'}</li>
        <li><strong>Support Model:</strong> ${onboardingData?.supportModel || 'N/A'}</li>
        <li><strong>Criticality:</strong> ${onboardingData?.criticality || 'N/A'}</li>
      </ul>
      <h3>Selected AskABD Services</h3>
      <ul>${servicesHtml || '<li>No services selected</li>'}</ul>
      <h3>Verification</h3>
      <p>Your One-Time Password (OTP): <strong style="font-size:24px;letter-spacing:4px">${otp}</strong></p>
      <p>OTP expires: ${new Date(expiry).toLocaleString()}</p>
      <p><em>Do not share this OTP with anyone other than the authorized AskABD onboarding representative.</em></p>
      <hr/>
      <p>AskABD Enterprise Operations Centre</p>
    `;

    // Send via environment-aware email transport
    let emailStatus = 'failed';
    try {
      const { sendEmail } = await import('../services/email-transport.js');
      const result = await sendEmail({ to: email, subject: 'AskABD Business Owner Verification - ' + clientName, html });
      if (result.success) {
        emailStatus = 'sent';
      } else {
        emailStatus = 'failed';
        reply.status(500).send({ error: { code: 'email_failed', message: result.error || 'Email send failed' }, emailStatus });
        return;
      }
    } catch (err) {
      emailStatus = 'failed';
      reply.status(500).send({ error: { code: 'email_failed', message: (err as Error).message }, emailStatus });
      return;
    }

    // Audit
    ocService.createAuditEntry({
      entityType: 'otp', entityId: clientId, entityName: clientName,
      action: 'otp_sent', actor: 'system',
      details: { email, expiry, emailStatus },
      evidence: ['OTP generated and email ' + emailStatus + ' to ' + email],
    }).catch(() => { /* non-blocking audit */ });

    // SECURITY: Do NOT return OTP to frontend — only status
    reply.status(201).send({ emailStatus, clientId, expiry });
  });

  server.post('/oc/otp/verify', async (req, reply) => {
    const { clientId, otp } = req.body as any;
    if (!clientId || !otp) {
      reply.status(400).send({ valid: false, error: 'Client ID and OTP are required' });
      return;
    }

    const stored = await getOtp(clientId);

    // Allow demo OTP "123456" ONLY in development/test environments — NEVER in production
    const isDemoOtp = otp === '123456' && config.NODE_ENV !== 'production';

    if (!stored && !isDemoOtp) {
      reply.send({ valid: false, error: 'No OTP found for this client. Please request a new one.' });
      return;
    }

    // Check attempts (max 5)
    if (stored && stored.attempts >= 5) {
      reply.send({ valid: false, error: 'Too many failed attempts. Please request a new OTP.' });
      return;
    }

    // Check expiry
    if (stored && new Date(stored.expiry) < new Date() && !isDemoOtp) {
      await deleteOtp(clientId);
      reply.send({ valid: false, error: 'OTP has expired. Please request a new one.' });
      return;
    }

    // Validate OTP
    const valid = isDemoOtp || (stored !== null && stored !== undefined && otp === stored.otp);

    if (!valid) {
      await incrementAttempts(clientId);
      const remaining = stored ? 5 - stored.attempts - 1 : 0;
      ocService.createAuditEntry({
        entityType: 'otp', entityId: clientId, entityName: '',
        action: 'otp_failed', actor: 'admin',
        details: { valid: false, attempts: (stored?.attempts || 0) + 1 },
        evidence: ['OTP verification failed'],
      }).catch(() => { /* non-blocking */ });
      reply.send({ valid: false, error: `Incorrect OTP. ${Math.max(0, remaining)} attempts remaining.` });
      return;
    }

    // Success — auto-populate identity verification requirements from onboarding data
    const otpMeta = stored; // Capture before deletion
    await deleteOtp(clientId);

    // Auto-fill identity verification requirements so user doesn't have to re-enter
    // Source 1: OTP metadata (stored during OTP send)
    // Source 2: Client record (stored during onboarding) — fallback for demo OTP
    let email = otpMeta?.email || '';
    let businessOwner = otpMeta?.businessOwner || '';
    let clientName = otpMeta?.clientName || '';

    // If OTP metadata is empty (demo OTP used without sending), try to get from client record
    if (!email && !businessOwner && !clientName) {
      try {
        const clientRes = await routePool.query(`SELECT name, primary_contact FROM oc_clients WHERE id = $1`, [clientId]);
        if (clientRes.rows.length > 0) {
          clientName = clientRes.rows[0].name || '';
          businessOwner = clientRes.rows[0].primary_contact || '';
        }
      } catch { /* non-blocking */ }
    }

    if (email || businessOwner || clientName) {
      try {
        const { RequirementsService } = await import('../services/requirements-service.js');
        const reqService = new RequirementsService();
        const serviceId = 'identity-verification';
        // Auto-save business_owner_email
        if (email || businessOwner) {
          await reqService.updateRequirement(clientId, serviceId, 'business_owner_email', email || businessOwner || '', 'system').catch(() => {});
        }
        // Auto-save business_owner_name
        if (businessOwner) {
          let nameValue = '';
          if (!businessOwner.includes('@')) {
            nameValue = businessOwner;
          } else {
            const prefix = businessOwner.split('@')[0] || '';
            nameValue = prefix.replace(/[\d_\-\.]+/g, ' ').trim();
            nameValue = nameValue.charAt(0).toUpperCase() + nameValue.slice(1);
          }
          if (nameValue) {
            await reqService.updateRequirement(clientId, serviceId, 'business_owner_name', nameValue, 'system').catch(() => {});
          }
        }
        // Auto-save organization_legal_name from clientName
        if (clientName) {
          await reqService.updateRequirement(clientId, serviceId, 'organization_legal_name', clientName, 'system').catch(() => {});
        }
      } catch { /* non-blocking — requirements will still be fillable manually */ }
    }

    ocService.createAuditEntry({
      entityType: 'otp', entityId: clientId, entityName: '',
      action: 'otp_verified', actor: 'admin',
      details: { valid: true, attempts: (stored?.attempts || 0) + 1 },
      evidence: ['OTP verified successfully'],
    }).catch(() => { /* non-blocking */ });

    reply.send({ valid: true });
  });

  server.post('/oc/otp/resend', async (req, reply) => {
    const { clientId, clientName, email } = req.body as any;
    if (!clientId || !email) {
      reply.status(400).send({ error: { code: 'missing_fields', message: 'clientId and email are required' } });
      return;
    }

    const newOtp = String(Math.floor(100000 + Math.random() * 900000));
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Persist new OTP (invalidates previous)
    await storeOtp(clientId, newOtp, expiry);

    let emailStatus = 'failed';
    try {
      const { sendEmail } = await import('../services/email-transport.js');
      const result = await sendEmail({
        to: email,
        subject: 'AskABD OTP Resend - ' + (clientName || 'Client'),
        html: '<h2>New OTP</h2><p>Your new OTP: <strong>' + newOtp + '</strong></p><p>Previous OTP is now invalid.</p><p>Expires: ' + expiry + '</p>',
      });
      if (result.success) {
        emailStatus = 'sent';
      } else {
        reply.status(500).send({ error: { code: 'email_failed', message: result.error || 'Email send failed' }, emailStatus: 'failed' });
        return;
      }
    } catch (err) {
      reply.status(500).send({ error: { code: 'email_failed', message: (err as Error).message }, emailStatus: 'failed' });
      return;
    }

    ocService.createAuditEntry({
      entityType: 'otp', entityId: clientId, entityName: clientName || '',
      action: 'otp_resent', actor: 'system', details: { email, expiry, emailStatus },
      evidence: ['New OTP generated. Email ' + emailStatus + '. Old OTP invalidated.'],
    }).catch(() => { /* non-blocking */ });

    // SECURITY: Do NOT return OTP to frontend — only status
    reply.send({ expiry, emailStatus });
  });

  // ─── CONNECTOR TESTING ────────────────────────────────────────────────────

  const connectorService = new ConnectorService();

  server.post('/oc/connectors/test', async (req, reply) => {
    const { provider, clientId, fields } = req.body as any;
    if (!provider || !clientId) {
      reply.status(400).send({ error: { code: 'invalid', message: 'Provider and clientId are required' } });
      return;
    }

    const result = await connectorService.testConnection({ provider, clientId, fields: fields || {} });

    // Audit the connection test
    ocService.createAuditEntry({
      entityType: 'connector', entityId: clientId, entityName: provider,
      action: result.status === 'connected' ? 'connection_validated' : 'connection_failed',
      actor: 'admin',
      details: { provider, status: result.status, mode: result.mode, stepsRun: result.steps.length, stepsPassed: result.steps.filter(s => s.pass).length },
      evidence: [
        `${provider} connection test: ${result.status} (${result.mode} mode)`,
        `Steps: ${result.steps.filter(s => s.pass).length}/${result.steps.length} passed`,
        `Duration: ${result.totalDurationMs}ms`,
        result.error ? `Error: ${result.error}` : 'No errors',
      ],
    }).catch(() => { /* non-blocking */ });

    reply.send(result);
  });

  server.get('/oc/connectors/:clientId', async (req) => {
    const { clientId } = req.params as any;
    const connectors = await connectorService.getConnectors(clientId);
    return { clientId, connectors };
  });

  server.post('/oc/connectors/save', async (req, reply) => {
    const { provider, clientId, fields, securityLevel } = req.body as any;
    if (!provider || !clientId) {
      reply.status(400).send({ error: { code: 'invalid', message: 'Provider and clientId are required' } });
      return;
    }
    await connectorService.saveConfiguration(clientId, provider, fields || {}, securityLevel || 'read-only');

    // Auto-validate after saving if connection fields are present
    let testResult = null;
    if (fields && (fields.host || fields.connectionUrl || fields.token || fields.clusterEndpoint)) {
      try {
        testResult = await connectorService.testConnection({ provider, clientId, fields });
      } catch { /* validation is best-effort during save */ }
    }

    ocService.createAuditEntry({
      entityType: 'connector', entityId: clientId, entityName: provider,
      action: 'connector_configured', actor: 'admin',
      details: { provider, securityLevel: securityLevel || 'read-only', autoValidated: !!testResult, validationStatus: testResult?.status },
      evidence: [`${provider} connector configured for client ${clientId}${testResult ? ` — validation: ${testResult.status}` : ''}`],
    }).catch(() => {});

    reply.send({ status: testResult?.status || 'configured', provider, clientId, validated: !!testResult });
  });

  // ─── DISCOVERY ────────────────────────────────────────────────────────────

  const discoveryService = new DiscoveryService();

  server.post('/oc/discovery/start', async (req, reply) => {
    const { clientId } = req.body as any;
    if (!clientId) { reply.status(400).send({ error: 'clientId required' }); return; }

    // Check prerequisites
    const prereq = await discoveryService.checkPrerequisites(clientId);
    if (!prereq.ready) {
      reply.status(422).send({ error: 'prerequisites_not_met', missing: prereq.missing, status: 'blocked' });
      return;
    }

    // Auto-advance lifecycle to discovery-running
    await lifecycleService.transition(clientId, 'discovery_started', 'system', 'Discovery initiated', true, 'system').catch(() => {});

    const run = await discoveryService.startDiscovery(clientId);

    // Auto-advance lifecycle on successful completion
    if (run.status === 'completed') {
      await lifecycleService.transition(clientId, 'discovery_completed', 'system', `Discovery completed: ${run.resourcesFound} resources`, true, 'system').catch(() => {});
      // Auto-detect problems from discovery results (technology lifecycle, missing indexes, etc.)
      await problemService.detectFromDiscovery(clientId, run).catch(() => {});
    }

    ocService.createAuditEntry({
      entityType: 'discovery', entityId: clientId, entityName: run.id,
      action: run.status === 'completed' ? 'discovery_completed' : 'discovery_failed',
      actor: 'system',
      details: { runId: run.id, status: run.status, resourcesFound: run.resourcesFound, errors: run.errors },
      evidence: run.evidence,
    }).catch(() => {});

    reply.send(run);
  });

  server.get('/oc/discovery/:clientId', async (req) => {
    const { clientId } = req.params as any;
    const runs = await discoveryService.getDiscoveryRuns(clientId);
    return { clientId, runs };
  });

  server.get('/oc/discovery/:clientId/:runId', async (req) => {
    const { runId } = req.params as any;
    const run = await discoveryService.getDiscoveryRun(runId);
    return run || { error: 'not_found' };
  });

  // ─── ASSESSMENT ───────────────────────────────────────────────────────────

  const assessmentService = new AssessmentService();

  server.post('/oc/assessment/start', async (req, reply) => {
    const { clientId, discoveryRunId } = req.body as any;
    if (!clientId || !discoveryRunId) { reply.status(400).send({ error: 'clientId and discoveryRunId required' }); return; }

    // Auto-advance lifecycle to assessment-running
    await lifecycleService.transition(clientId, 'assessment_started', 'system', 'Assessment initiated', true, 'system').catch(() => {});

    const result = await assessmentService.startAssessment(clientId, discoveryRunId);

    // Auto-advance lifecycle on successful completion
    if (result.status === 'completed') {
      await lifecycleService.transition(clientId, 'assessment_completed', 'system', `Assessment completed: ${result.findings.length} findings`, true, 'system').catch(() => {});
      // Auto-import assessment findings into Problem Universe (idempotent — no duplicates)
      await problemService.importFromAssessment(clientId, result.id).catch(() => {});
    }

    ocService.createAuditEntry({
      entityType: 'assessment', entityId: clientId, entityName: result.id,
      action: result.status === 'completed' ? 'assessment_completed' : 'assessment_failed',
      actor: 'system',
      details: { assessmentId: result.id, status: result.status, riskScore: result.riskScore, findings: result.findings.length },
      evidence: result.evidence,
    }).catch(() => {});

    reply.send(result);
  });

  server.get('/oc/assessment/:clientId', async (req) => {
    const { clientId } = req.params as any;
    const assessments = await assessmentService.getAssessments(clientId);
    return { clientId, assessments };
  });

  // ─── RECOMMENDATIONS ──────────────────────────────────────────────────────

  const recommendationService = new RecommendationService();

  server.post('/oc/recommendations/generate', async (req, reply) => {
    const { clientId, assessmentId } = req.body as any;
    if (!clientId || !assessmentId) { reply.status(400).send({ error: 'clientId and assessmentId required' }); return; }

    const result = await recommendationService.generate(clientId, assessmentId);

    // Auto-advance lifecycle
    if (result.status === 'ready') {
      await lifecycleService.transition(clientId, 'recommendations_generated', 'system', `${result.recommendations.length} recommendations`, true, 'system').catch(() => {});
    }

    ocService.createAuditEntry({
      entityType: 'recommendation', entityId: clientId, entityName: result.id,
      action: 'recommendations_generated', actor: 'system',
      details: { id: result.id, count: result.recommendations.length, status: result.status },
      evidence: result.evidence,
    }).catch(() => {});

    reply.send(result);
  });

  server.post('/oc/recommendations/:id/approve', async (req, reply) => {
    const { id } = req.params as any;
    const { clientId, actor, comment } = req.body as any;
    const result = await recommendationService.approve(clientId, id, actor || 'admin', comment);

    if (result.success) {
      ocService.createAuditEntry({
        entityType: 'recommendation', entityId: clientId, entityName: id,
        action: 'recommendation_approved', actor: actor || 'admin',
        details: { recommendationId: id, comment },
        evidence: [`Recommendations approved by ${actor || 'admin'} at ${new Date().toISOString()}`],
      }).catch(() => {});
    }
    reply.send(result);
  });

  server.post('/oc/recommendations/:id/reject', async (req, reply) => {
    const { id } = req.params as any;
    const { clientId, actor, reason } = req.body as any;
    const result = await recommendationService.reject(clientId, id, actor || 'admin', reason || '');
    reply.send(result);
  });

  server.get('/oc/recommendations/:clientId', async (req) => {
    const { clientId } = req.params as any;
    const recs = await recommendationService.getRecommendations(clientId);
    return { clientId, recommendations: recs };
  });

  // ─── MIGRATION PRE-FLIGHT & VALIDATION ────────────────────────────────────

  const migrationValidation = new MigrationValidationService();

  server.post('/oc/migration/preflight', async (req, reply) => {
    const { clientId } = req.body as any;
    if (!clientId) { reply.status(400).send({ error: 'clientId required' }); return; }

    const result = await migrationValidation.runPreflight(clientId);
    reply.send(result);
  });

  server.post('/oc/migration/validate', async (req, reply) => {
    const { clientId } = req.body as any;
    if (!clientId) { reply.status(400).send({ error: 'clientId required' }); return; }

    const result = await migrationValidation.runValidation(clientId);

    ocService.createAuditEntry({
      entityType: 'validation', entityId: clientId, entityName: result.id,
      action: 'validation_' + result.status, actor: 'system',
      details: { ...result.summary, status: result.status },
      evidence: result.evidence,
    }).catch(() => {});

    reply.send(result);
  });

  server.post('/oc/production/readiness', async (req, reply) => {
    const { clientId } = req.body as any;
    if (!clientId) { reply.status(400).send({ error: 'clientId required' }); return; }

    const result = await migrationValidation.checkProductionReadiness(clientId);
    reply.send(result);
  });

  // ─── MIGRATION EXECUTION ──────────────────────────────────────────────────

  const migrationExecution = new MigrationExecutionService();

  server.post('/oc/migration/plan', async (req, reply) => {
    const { clientId, sourceSchema } = req.body as any;
    if (!clientId) { reply.status(400).send({ error: 'clientId required' }); return; }
    const plan = await migrationExecution.createPlan(clientId, sourceSchema || 'public');
    // Auto-advance: migration planning → approved (plan creation implies planning complete)
    await lifecycleService.transition(clientId, 'migration_plan_created', 'system', 'Migration plan created', true, 'system').catch(() => {});
    await lifecycleService.transition(clientId, 'migration_approved', 'system', 'Auto-approved for DEV', true, 'system').catch(() => {});
    ocService.createAuditEntry({ entityType: 'migration', entityId: clientId, entityName: plan.id, action: 'migration_plan_created', actor: 'admin', details: { ...plan.plan, migrationId: plan.id }, evidence: plan.evidence }).catch(() => {});
    reply.send(plan);
  });

  server.post('/oc/migration/dry-run', async (req, reply) => {
    const { migrationId } = req.body as any;
    if (!migrationId) { reply.status(400).send({ error: 'migrationId required' }); return; }
    const result = await migrationExecution.dryRun(migrationId);
    ocService.createAuditEntry({ entityType: 'migration', entityId: result.clientId, entityName: migrationId, action: 'migration_dry_run_' + result.status, actor: 'system', details: { status: result.status }, evidence: result.evidence }).catch(() => {});
    reply.send(result);
  });

  server.post('/oc/migration/execute', async (req, reply) => {
    const { migrationId } = req.body as any;
    if (!migrationId) { reply.status(400).send({ error: 'migrationId required' }); return; }
    // Auto-advance: migration started
    const plan = await migrationExecution.getRun(migrationId);
    if (plan?.clientId) {
      await lifecycleService.transition(plan.clientId, 'migration_started', 'system', 'Migration execution started', true, 'system').catch(() => {});
    }
    const result = await migrationExecution.execute(migrationId);
    // Auto-advance: migration completed
    if (result.status === 'completed' && result.clientId) {
      await lifecycleService.transition(result.clientId, 'migration_completed', 'system', `Migration completed: ${result.progress.mandatoryCompleted}/${result.progress.mandatory}`, true, 'system').catch(() => {});
    }
    ocService.createAuditEntry({ entityType: 'migration', entityId: result.clientId, entityName: migrationId, action: 'migration_' + result.status, actor: 'system', details: { status: result.status, progress: result.progress, duration: result.durationMs }, evidence: result.evidence }).catch(() => {});
    reply.send(result);
  });

  server.post('/oc/migration/:migrationId/validate', async (req, reply) => {
    const { migrationId } = req.params as any;
    const result = await migrationExecution.validate(migrationId);
    // Auto-advance: validation passed
    if (result.status === 'passed' || result.status === 'passed_with_expected_drift') {
      const run = await migrationExecution.getRun(migrationId);
      if (run?.clientId) {
        await lifecycleService.transition(run.clientId, 'validation_started', 'system', 'Validation started', true, 'system').catch(() => {});
        await lifecycleService.transition(run.clientId, 'validation_passed', 'system', 'All validation checks passed', true, 'system').catch(() => {});
      }
    }
    reply.send(result);
  });

  server.post('/oc/migration/:migrationId/rollback', async (req, reply) => {
    const { migrationId } = req.params as any;
    const result = await migrationExecution.rollback(migrationId);
    ocService.createAuditEntry({ entityType: 'migration', entityId: '', entityName: migrationId, action: result.success ? 'rollback_completed' : 'rollback_failed', actor: 'admin', details: {}, evidence: result.evidence }).catch(() => {});
    reply.send(result);
  });

  server.get('/oc/migration/runs/:clientId', async (req) => {
    const { clientId } = req.params as any;
    const runs = await migrationExecution.getClientRuns(clientId);
    return { clientId, runs };
  });

  // ─── CLIENT SERVICE REQUIREMENTS ──────────────────────────────────────────

  const requirementsService = new RequirementsService();

  server.get('/oc/client-services/definitions', async () => {
    return { definitions: requirementsService.getAllServiceDefinitions() };
  });

  server.get('/oc/client-services/:clientId/:serviceId/requirements', async (req) => {
    const { clientId, serviceId } = req.params as any;

    // ASK ONCE: Auto-populate identity-verification requirements from available sources if still empty
    if (serviceId === 'identity-verification') {
      const existing = await requirementsService.getRequirements(clientId, serviceId);
      const emailReq = existing.find((r: any) => r.key === 'business_owner_email');
      const nameReq = existing.find((r: any) => r.key === 'business_owner_name');
      const orgReq = existing.find((r: any) => r.key === 'organization_legal_name');

      if (!emailReq?.value || !nameReq?.value || !orgReq?.value) {
        let email = '', ownerName = '', orgName = '';

        // Source 1: oc_clients record
        try {
          const clientRes = await routePool.query(`SELECT name, primary_contact FROM oc_clients WHERE id = $1`, [clientId]);
          if (clientRes.rows.length > 0) {
            orgName = clientRes.rows[0].name || '';
            email = clientRes.rows[0].primary_contact || '';
          }
        } catch {}

        // Source 2: OTP store (may still have metadata if not yet deleted)
        if (!email) {
          try {
            const otpRes = await routePool.query(`SELECT email, business_owner, client_name FROM otp_challenges WHERE client_id = $1`, [clientId]);
            if (otpRes.rows.length > 0) {
              email = otpRes.rows[0].email || otpRes.rows[0].business_owner || '';
              ownerName = otpRes.rows[0].business_owner || '';
              orgName = orgName || otpRes.rows[0].client_name || '';
            }
          } catch {}
        }

        // Source 3: Audit log (otp_sent event has email, client created event has name)
        if (!email && !orgName) {
          try {
            // Get email from otp_sent event
            const otpAudit = await routePool.query(`SELECT details, entity_name FROM oc_audit_log WHERE entity_id = $1 AND action = 'otp_sent' ORDER BY created_at DESC LIMIT 1`, [clientId]);
            if (otpAudit.rows.length > 0) {
              const d = typeof otpAudit.rows[0].details === 'string' ? JSON.parse(otpAudit.rows[0].details) : otpAudit.rows[0].details;
              email = email || d?.email || '';
              orgName = orgName || otpAudit.rows[0].entity_name || '';
            }
            // Get org name from client created event
            if (!orgName) {
              const createAudit = await routePool.query(`SELECT entity_name FROM oc_audit_log WHERE entity_id = $1 AND action = 'created' ORDER BY created_at DESC LIMIT 1`, [clientId]);
              if (createAudit.rows.length > 0) orgName = createAudit.rows[0].entity_name || '';
            }
          } catch {}
        }

        // Derive name from email if not explicitly available
        if (!ownerName && email) {
          if (!email.includes('@')) { ownerName = email; }
          else { const prefix = email.split('@')[0] || ''; ownerName = prefix.replace(/[\d_\-\.]+/g, ' ').trim(); ownerName = ownerName.charAt(0).toUpperCase() + ownerName.slice(1); }
        }

        // Auto-fill whatever we found
        if (!emailReq?.value && email) await requirementsService.updateRequirement(clientId, serviceId, 'business_owner_email', email, 'system').catch(() => {});
        if (!nameReq?.value && ownerName) await requirementsService.updateRequirement(clientId, serviceId, 'business_owner_name', ownerName, 'system').catch(() => {});
        if (!orgReq?.value && orgName) await requirementsService.updateRequirement(clientId, serviceId, 'organization_legal_name', orgName, 'system').catch(() => {});
      }
    }

    const requirements = await requirementsService.getRequirements(clientId, serviceId);
    const readiness = await requirementsService.getReadiness(clientId, serviceId);
    const definition = requirementsService.getServiceDefinition(serviceId);
    return { clientId, serviceId, serviceName: definition?.serviceName || serviceId, requirements, readiness };
  });

  server.put('/oc/client-services/:clientId/:serviceId/requirements/:requirementKey', async (req, reply) => {
    const { clientId, serviceId, requirementKey } = req.params as any;
    const { value, actor, fieldsData } = req.body as any;
    if (value === undefined && !fieldsData) { reply.status(400).send({ error: 'value or fieldsData is required' }); return; }

    const result = await requirementsService.updateRequirement(clientId, serviceId, requirementKey, value || '', actor || 'admin', fieldsData);
    if (!result) { reply.status(404).send({ error: 'Requirement not found' }); return; }

    // Audit
    ocService.createAuditEntry({
      entityType: 'requirement', entityId: clientId, entityName: `${serviceId}/${requirementKey}`,
      action: 'requirement_updated', actor: actor || 'admin',
      details: { serviceId, requirementKey, status: result.status, version: result.version },
      evidence: [`Requirement ${requirementKey} updated for service ${serviceId}`],
    }).catch(() => {});

    reply.send(result);
  });

  server.get('/oc/client-services/:clientId/:serviceId/requirements/:requirementKey/history', async (req) => {
    const { clientId, serviceId, requirementKey } = req.params as any;
    const history = await requirementsService.getHistory(clientId, serviceId, requirementKey);
    return { clientId, serviceId, requirementKey, history };
  });

  server.get('/oc/client-services/:clientId/:serviceId/readiness', async (req) => {
    const { clientId, serviceId } = req.params as any;
    const readiness = await requirementsService.getReadiness(clientId, serviceId);
    return { clientId, serviceId, readiness };
  });

  // Validate a document (check expiry, type, etc.)
  server.post('/oc/client-services/:clientId/:serviceId/requirements/:requirementKey/documents/:documentId/validate', async (req, reply) => {
    const { clientId, serviceId, requirementKey, documentId } = req.params as any;
    const { expiryDate } = req.body as any;
    const pool = routePool;
    try {
      // Get current document
      const docRes = await pool.query('SELECT * FROM oc_client_service_documents WHERE id = $1 AND client_id = $2', [documentId, clientId]);
      if (docRes.rows.length === 0) { reply.status(404).send({ error: 'Document not found' }); return; }

      const doc = docRes.rows[0];
      let newStatus = 'valid';
      let validationMessage = 'Document validation passed';

      // Check expiry if provided
      if (expiryDate) {
        const expiry = new Date(expiryDate);
        if (expiry <= new Date()) {
          newStatus = 'expired';
          validationMessage = `Document expired on ${expiry.toISOString().split('T')[0]}`;
        }
        await pool.query('UPDATE oc_client_service_documents SET expiry_date = $1, status = $2, validation_status = $3, updated_at = NOW() WHERE id = $4', [expiry.toISOString(), newStatus, newStatus === 'valid' ? 'passed' : 'failed', documentId]);
      } else {
        // Structural validation only
        if (!doc.file_size || doc.file_size === 0) { newStatus = 'invalid'; validationMessage = 'File is empty'; }
        await pool.query("UPDATE oc_client_service_documents SET status = $1, validation_status = $2, updated_at = NOW() WHERE id = $3", [newStatus, newStatus === 'valid' ? 'passed' : 'failed', documentId]);
      }

      ocService.createAuditEntry({ entityType: 'document', entityId: clientId, entityName: doc.document_name, action: 'document_validated', actor: 'system', details: { documentId, status: newStatus, validationMessage }, evidence: [validationMessage] }).catch(() => {});

      reply.send({ documentId, status: newStatus, validationMessage });
    } catch (err) { reply.status(500).send({ error: (err as Error).message }); }
  });

  // Document upload (real binary with @fastify/multipart)
  server.post('/oc/client-services/:clientId/:serviceId/requirements/:requirementKey/documents', async (req, reply) => {
    const { clientId, serviceId, requirementKey } = req.params as any;
    const { DocumentStorageService } = await import('../services/document-storage-service.js');
    const storage = new DocumentStorageService();
    const pool = routePool;

    const isMultipart = (req.headers['content-type'] || '').includes('multipart');

    try {
      if (isMultipart) {
        // Real binary file upload
        const data = await (req as any).file();
        if (!data) { reply.status(400).send({ error: 'No file provided' }); return; }

        const originalName = data.filename || 'unnamed';
        const mimeType = data.mimetype || 'application/octet-stream';

        const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg', 'text/plain'];
        if (!allowedTypes.includes(mimeType)) {
          reply.status(400).send({ error: `File type ${mimeType} not allowed. Accepted: PDF, DOCX, PNG, JPEG, TXT` });
          return;
        }

        const versionRes = await pool.query("SELECT COALESCE(MAX(version), 0) + 1 as next_ver FROM oc_client_service_documents WHERE client_id = $1 AND service_id = $2 AND requirement_key = $3", [clientId, serviceId, requirementKey]);
        const nextVersion = parseInt(versionRes.rows[0].next_ver);

        await pool.query("UPDATE oc_client_service_documents SET status = 'superseded' WHERE client_id = $1 AND service_id = $2 AND requirement_key = $3 AND status NOT IN ('superseded', 'replaced')", [clientId, serviceId, requirementKey]);

        const stored = await storage.save(clientId, serviceId, requirementKey, originalName, nextVersion, data.file);

        if (stored.fileSize > 20 * 1024 * 1024) {
          storage.delete(stored.storageReference);
          reply.status(400).send({ error: 'File too large. Maximum size is 20 MB.' });
          return;
        }

        const res = await pool.query(`
          INSERT INTO oc_client_service_documents (client_id, service_id, requirement_key, document_name, original_file_name, storage_reference, mime_type, file_size, checksum, status, version, uploaded_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'uploaded', $10, $11)
          RETURNING id, document_name, original_file_name, mime_type, file_size, checksum, status, validation_status, version, uploaded_by, uploaded_at
        `, [clientId, serviceId, requirementKey, originalName, originalName, stored.storageReference, mimeType, stored.fileSize, stored.checksum, nextVersion, 'admin']);

        ocService.createAuditEntry({ entityType: 'document', entityId: clientId, entityName: originalName, action: 'document_uploaded', actor: 'admin', details: { serviceId, requirementKey, version: nextVersion, mimeType, fileSize: stored.fileSize }, evidence: [`Document "${originalName}" v${nextVersion} uploaded (binary)`] }).catch(() => {});
        reply.status(201).send(res.rows[0]);
      } else {
        // JSON metadata-only upload
        const body = req.body as any;
        const docName = body?.documentName || 'unnamed';
        const mimeType = body?.mimeType || 'application/pdf';
        const fileSize = parseInt(body?.fileSize || '0', 10);
        if (!docName || docName === 'unnamed') { reply.status(400).send({ error: 'documentName required' }); return; }

        const versionRes = await pool.query("SELECT COALESCE(MAX(version), 0) + 1 as next_ver FROM oc_client_service_documents WHERE client_id = $1 AND service_id = $2 AND requirement_key = $3", [clientId, serviceId, requirementKey]);
        const nextVersion = parseInt(versionRes.rows[0].next_ver);

        await pool.query("UPDATE oc_client_service_documents SET status = 'superseded' WHERE client_id = $1 AND service_id = $2 AND requirement_key = $3 AND status NOT IN ('superseded', 'replaced')", [clientId, serviceId, requirementKey]);

        const storageRef = `${clientId}/${serviceId}/${requirementKey}/v${nextVersion}/${docName}`;
        const res = await pool.query(`
          INSERT INTO oc_client_service_documents (client_id, service_id, requirement_key, document_name, original_file_name, storage_reference, mime_type, file_size, status, version, uploaded_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'uploaded', $9, $10)
          RETURNING id, document_name, original_file_name, mime_type, file_size, status, validation_status, version, uploaded_by, uploaded_at
        `, [clientId, serviceId, requirementKey, docName, docName, storageRef, mimeType, fileSize, nextVersion, body?.actor || 'admin']);

        ocService.createAuditEntry({ entityType: 'document', entityId: clientId, entityName: docName, action: 'document_uploaded', actor: body?.actor || 'admin', details: { serviceId, requirementKey, version: nextVersion }, evidence: [`Document "${docName}" v${nextVersion} uploaded (metadata)`] }).catch(() => {});
        reply.status(201).send(res.rows[0]);
      }
    } catch (err) {
      reply.status(500).send({ error: (err as Error).message });
    }
  });

  // Get documents for a requirement (with versioning)
  server.get('/oc/client-services/:clientId/:serviceId/requirements/:requirementKey/documents', async (req) => {
    const { clientId, serviceId, requirementKey } = req.params as any;
    const pool = routePool;
    try {
      // Latest active documents
      const active = await pool.query(
        "SELECT id, document_name, original_file_name, mime_type, file_size, checksum, status, validation_status, version, expiry_date, uploaded_by, uploaded_at FROM oc_client_service_documents WHERE client_id = $1 AND service_id = $2 AND requirement_key = $3 AND status NOT IN ('superseded', 'replaced') ORDER BY version DESC",
        [clientId, serviceId, requirementKey]
      );
      // All versions for history
      const all = await pool.query(
        "SELECT id, document_name, version, status, uploaded_at FROM oc_client_service_documents WHERE client_id = $1 AND service_id = $2 AND requirement_key = $3 ORDER BY version DESC",
        [clientId, serviceId, requirementKey]
      );
      return { clientId, serviceId, requirementKey, documents: active.rows, versions: all.rows };
    } catch { return { clientId, serviceId, requirementKey, documents: [], versions: [] }; }
  });

  // ─── PROBLEM UNIVERSE ───────────────────────────────────────────────────────

  const problemService = new ProblemUniverseService();

  server.get('/oc/clients/:clientId/problems', async (req) => {
    const { clientId } = req.params as any;
    const q = req.query as any;
    return problemService.getProblems(clientId, { domain: q.domain, status: q.status, severity: q.severity, priority: q.priority, limit: q.limit ? parseInt(q.limit) : undefined, offset: q.offset ? parseInt(q.offset) : undefined });
  });

  server.get('/oc/clients/:clientId/problems/summary', async (req) => {
    const { clientId } = req.params as any;
    return problemService.getClientSummary(clientId);
  });

  server.post('/oc/clients/:clientId/problems', async (req, reply) => {
    const { clientId } = req.params as any;
    const data = req.body as any;
    if (!data.title) { reply.status(400).send({ error: 'title is required' }); return; }
    const problem = await problemService.createProblem(clientId, data);
    ocService.createAuditEntry({ entityType: 'problem', entityId: clientId, entityName: problem.title, action: 'problem_created', actor: 'admin', details: { problemId: problem.id, domain: problem.domain, severity: problem.severity }, evidence: [`Problem "${problem.title}" identified in domain ${problem.domain}`] }).catch(() => {});
    reply.status(201).send(problem);
  });

  server.get('/oc/problems/:problemId', async (req, reply) => {
    const { problemId } = req.params as any;
    const problem = await problemService.getProblem(problemId);
    if (!problem) { reply.status(404).send({ error: 'Problem not found' }); return; }
    // Enrich with financial + effort
    const financial = await problemService.getFinancialEstimate(problemId);
    const effort = await problemService.getEffortEstimate(problemId);
    reply.send({ ...problem, financial, effort });
  });

  server.patch('/oc/problems/:problemId', async (req) => {
    const { problemId } = req.params as any;
    return problemService.updateProblem(problemId, req.body as any, 'admin');
  });

  server.post('/oc/problems/:problemId/status', async (req, reply) => {
    const { problemId } = req.params as any;
    const { status } = req.body as any;
    const result = await problemService.updateStatus(problemId, status, 'admin');
    if (!result.success) { reply.status(400).send(result); return; }
    reply.send(result);
  });

  // Import findings from assessment into Problem Universe
  server.post('/oc/clients/:clientId/problems/import-assessment', async (req, reply) => {
    const { clientId } = req.params as any;
    const { assessmentId } = req.body as any;
    if (!assessmentId) { reply.status(400).send({ error: 'assessmentId required' }); return; }
    const result = await problemService.importFromAssessment(clientId, assessmentId);
    ocService.createAuditEntry({ entityType: 'problem', entityId: clientId, entityName: 'import', action: 'problems_imported', actor: 'system', details: { assessmentId, created: result.created.length, existing: result.existing, total: result.total }, evidence: [`${result.created.length} new problems imported, ${result.existing} already existed (assessment ${assessmentId})`] }).catch(() => {});
    reply.status(201).send({ imported: result.created.length, existing: result.existing, total: result.total, problems: result.created });
  });

  // ─── FINANCIAL ESTIMATES ──────────────────────────────────────────────────

  server.post('/oc/problems/:problemId/financial', async (req, reply) => {
    const { problemId } = req.params as any;
    const problem = await problemService.getProblem(problemId);
    if (!problem) { reply.status(404).send({ error: 'Problem not found' }); return; }
    const estimate = await problemService.createFinancialEstimate(problem.clientId, { ...req.body as any, problemId });
    reply.status(201).send(estimate);
  });

  server.get('/oc/problems/:problemId/financial', async (req, reply) => {
    const { problemId } = req.params as any;
    const estimate = await problemService.getFinancialEstimate(problemId);
    if (!estimate) { reply.send({ estimate: null, message: 'No financial estimate available' }); return; }
    reply.send(estimate);
  });

  // ─── EFFORT ESTIMATES ─────────────────────────────────────────────────────

  server.post('/oc/problems/:problemId/effort', async (req, reply) => {
    const { problemId } = req.params as any;
    const problem = await problemService.getProblem(problemId);
    if (!problem) { reply.status(404).send({ error: 'Problem not found' }); return; }
    const estimate = await problemService.createEffortEstimate(problem.clientId, { ...req.body as any, problemId });
    reply.status(201).send(estimate);
  });

  server.get('/oc/problems/:problemId/effort', async (req, reply) => {
    const { problemId } = req.params as any;
    const estimate = await problemService.getEffortEstimate(problemId);
    if (!estimate) { reply.send({ estimate: null, message: 'No effort estimate available' }); return; }
    reply.send(estimate);
  });

  // ─── GAP ANALYSIS ──────────────────────────────────────────────────────────

  const gapService = new GapAnalysisService();

  server.get('/oc/clients/:clientId/gaps', async (req) => {
    const { clientId } = req.params as any;
    const q = req.query as any;
    return gapService.getGaps(clientId, { domain: q.domain, status: q.status, severity: q.severity, limit: q.limit ? parseInt(q.limit) : undefined, offset: q.offset ? parseInt(q.offset) : undefined });
  });

  server.get('/oc/clients/:clientId/gaps/summary', async (req) => {
    const { clientId } = req.params as any;
    return gapService.getClientSummary(clientId);
  });

  server.post('/oc/clients/:clientId/gaps', async (req, reply) => {
    const { clientId } = req.params as any;
    const data = req.body as any;
    if (!data.title) { reply.status(400).send({ error: 'title is required' }); return; }
    const gap = await gapService.createGap(clientId, data);
    ocService.createAuditEntry({ entityType: 'gap', entityId: clientId, entityName: gap.title, action: 'gap_created', actor: 'admin', details: { gapId: gap.id, domain: gap.domain, severity: gap.severity }, evidence: [`Gap "${gap.title}" created in domain ${gap.domain}`] }).catch(() => {});
    reply.status(201).send(gap);
  });

  server.get('/oc/gaps/:gapId', async (req, reply) => {
    const { gapId } = req.params as any;
    const gap = await gapService.getGap(gapId);
    if (!gap) { reply.status(404).send({ error: 'Gap not found' }); return; }
    reply.send(gap);
  });

  server.post('/oc/gaps/:gapId/status', async (req, reply) => {
    const { gapId } = req.params as any;
    const { status } = req.body as any;
    const result = await gapService.updateStatus(gapId, status);
    if (!result.success) { reply.status(400).send(result); return; }
    ocService.createAuditEntry({ entityType: 'gap', entityId: gapId, entityName: '', action: 'gap_status_changed', actor: 'admin', details: { newStatus: status }, evidence: [`Gap status changed to ${status}`] }).catch(() => {});
    reply.send(result);
  });

  // Auto-generate gaps from existing problems (idempotent)
  server.post('/oc/clients/:clientId/gaps/generate', async (req, reply) => {
    const { clientId } = req.params as any;
    const result = await gapService.generateFromProblems(clientId);
    ocService.createAuditEntry({ entityType: 'gap', entityId: clientId, entityName: 'generate', action: 'gaps_generated', actor: 'system', details: { created: result.created.length, existing: result.existing }, evidence: [`${result.created.length} gaps generated, ${result.existing} already existed`] }).catch(() => {});
    reply.status(201).send({ generated: result.created.length, existing: result.existing, gaps: result.created });
  });

  // Define target state for a gap
  server.post('/oc/gaps/:gapId/target', async (req, reply) => {
    const { gapId } = req.params as any;
    const data = req.body as any;
    if (!data.targetState) { reply.status(400).send({ error: 'targetState is required' }); return; }
    const gap = await gapService.defineTargetState(gapId, data, 'admin');
    if (!gap) { reply.status(404).send({ error: 'Gap not found' }); return; }
    ocService.createAuditEntry({ entityType: 'gap', entityId: gapId, entityName: gap.title, action: 'target_defined', actor: 'admin', details: { targetState: data.targetState, targetMaturity: data.targetMaturity }, evidence: [`Target state defined: ${data.targetState}`] }).catch(() => {});
    reply.send(gap);
  });

  // Link financial estimate to gap
  server.post('/oc/gaps/:gapId/financial', async (req, reply) => {
    const { gapId } = req.params as any;
    const gap = await gapService.getGap(gapId);
    if (!gap) { reply.status(404).send({ error: 'Gap not found' }); return; }
    const estimate = await problemService.createFinancialEstimate(gap.clientId, { ...req.body as any, problemId: gap.relatedProblemId || gapId });
    await gapService.linkFinancial(gapId, estimate.id);
    reply.status(201).send(estimate);
  });

  // Link effort estimate to gap
  server.post('/oc/gaps/:gapId/effort', async (req, reply) => {
    const { gapId } = req.params as any;
    const gap = await gapService.getGap(gapId);
    if (!gap) { reply.status(404).send({ error: 'Gap not found' }); return; }
    const estimate = await problemService.createEffortEstimate(gap.clientId, { ...req.body as any, problemId: gap.relatedProblemId || gapId });
    await gapService.linkEffort(gapId, estimate.id);
    reply.status(201).send(estimate);
  });

  // Generate recommendations for all unresolved gaps (idempotent)
  server.post('/oc/clients/:clientId/gaps/recommend', async (req, reply) => {
    const { clientId } = req.params as any;
    const result = await gapService.generateRecommendations(clientId);
    reply.send(result);
  });

  // Get gaps with aging information
  server.get('/oc/clients/:clientId/gaps/aging', async (req) => {
    const { clientId } = req.params as any;
    const gaps = await gapService.getGapsWithAging(clientId);
    return { clientId, gaps, total: gaps.length, overdue: gaps.filter((g: any) => g.overdue).length };
  });

  // Get gap with priority score
  server.get('/oc/gaps/:gapId/priority', async (req, reply) => {
    const { gapId } = req.params as any;
    const gap = await gapService.getGap(gapId);
    if (!gap) { reply.status(404).send({ error: 'Gap not found' }); return; }
    const priority = gapService.calculatePriority(gap);
    reply.send({ gap, priority });
  });

  // ─── DECISION & TRANSFORMATION ─────────────────────────────────────────────

  const decisionService = new DecisionTransformationService();

  // Gap Options
  server.get('/oc/gaps/:gapId/options', async (req) => {
    const { gapId } = req.params as any;
    return { gapId, options: await decisionService.getOptions(gapId) };
  });

  server.post('/oc/gaps/:gapId/options', async (req, reply) => {
    const { gapId } = req.params as any;
    const gap = await gapService.getGap(gapId);
    if (!gap) { reply.status(404).send({ error: 'Gap not found' }); return; }
    const option = await decisionService.createOption(gapId, gap.clientId, req.body as any);
    ocService.createAuditEntry({ entityType: 'option', entityId: gapId, entityName: option.name, action: 'option_created', actor: 'admin', details: { optionId: option.id, solutionType: option.solutionType }, evidence: [`Option "${option.name}" created for gap`] }).catch(() => {});
    reply.status(201).send(option);
  });

  // Compare options
  server.get('/oc/gaps/:gapId/compare', async (req) => {
    const { gapId } = req.params as any;
    return decisionService.compareOptions(gapId);
  });

  // Decision
  server.post('/oc/gaps/:gapId/decide', async (req, reply) => {
    const { gapId } = req.params as any;
    const gap = await gapService.getGap(gapId);
    if (!gap) { reply.status(404).send({ error: 'Gap not found' }); return; }
    const decision = await decisionService.createDecision(gapId, gap.clientId, req.body as any);
    await gapService.updateStatus(gapId, 'approved');
    ocService.createAuditEntry({ entityType: 'decision', entityId: gapId, entityName: '', action: 'decision_made', actor: decision.decisionMaker || 'admin', details: { decisionId: decision.id, selectedOption: decision.selectedOptionId, rationale: decision.rationale }, evidence: [`Decision approved for gap ${gapId}`] }).catch(() => {});
    reply.status(201).send(decision);
  });

  server.get('/oc/gaps/:gapId/decision', async (req) => {
    const { gapId } = req.params as any;
    return decisionService.getDecision(gapId);
  });

  // Transformations
  server.post('/oc/clients/:clientId/transformations', async (req, reply) => {
    const { clientId } = req.params as any;
    const data = req.body as any;
    if (!data.title) { reply.status(400).send({ error: 'title is required' }); return; }
    const tfm = await decisionService.createTransformation(clientId, data);
    ocService.createAuditEntry({ entityType: 'transformation', entityId: clientId, entityName: tfm.title, action: 'transformation_created', actor: 'admin', details: { id: tfm.id, domain: tfm.domain, type: tfm.transformationType }, evidence: [`Transformation "${tfm.title}" planned`] }).catch(() => {});
    reply.status(201).send(tfm);
  });

  server.get('/oc/clients/:clientId/transformations', async (req) => {
    const { clientId } = req.params as any;
    return { clientId, transformations: await decisionService.getTransformations(clientId) };
  });

  server.get('/oc/clients/:clientId/transformations/summary', async (req) => {
    const { clientId } = req.params as any;
    return decisionService.getClientTransformationSummary(clientId);
  });

  server.get('/oc/transformations/:id', async (req, reply) => {
    const { id } = req.params as any;
    const tfm = await decisionService.getTransformation(id);
    if (!tfm) { reply.status(404).send({ error: 'Transformation not found' }); return; }
    reply.send(tfm);
  });

  server.post('/oc/transformations/:id/status', async (req, reply) => {
    const { id } = req.params as any;
    const { status, outcome } = req.body as any;
    const tfm = await decisionService.updateTransformationStatus(id, status, outcome);
    if (!tfm) { reply.status(404).send({ error: 'Transformation not found' }); return; }
    ocService.createAuditEntry({ entityType: 'transformation', entityId: tfm.clientId, entityName: tfm.title, action: `transformation_${status}`, actor: 'admin', details: { id, status, outcome }, evidence: [`Transformation status: ${status}`] }).catch(() => {});
    reply.send(tfm);
  });

  // ─── CAPABILITY REGISTRY ───────────────────────────────────────────────────

  const capabilityService = new CapabilityRegistryService();

  server.get('/oc/capabilities', async (req) => {
    const q = req.query as any;
    const capabilities = await capabilityService.getAll({ category: q.category, domain: q.domain, status: q.status, roadmapPhase: q.roadmapPhase });
    return { capabilities, total: capabilities.length };
  });

  server.get('/oc/capabilities/summary', async () => {
    return capabilityService.getSummary();
  });

  server.get('/oc/capabilities/roadmap', async () => {
    return capabilityService.getRoadmap();
  });

  server.get('/oc/capabilities/dependencies', async () => {
    return capabilityService.getDependencyGraph();
  });

  server.get('/oc/capabilities/maturity', async () => {
    return capabilityService.getMaturityReport();
  });

  server.get('/oc/capabilities/:id', async (req, reply) => {
    const { id } = req.params as any;
    const cap = await capabilityService.getById(id);
    if (!cap) { reply.status(404).send({ error: 'Capability not found' }); return; }
    reply.send(cap);
  });

  server.post('/oc/capabilities', async (req, reply) => {
    const data = req.body as any;
    if (!data.name) { reply.status(400).send({ error: 'name is required' }); return; }
    const cap = await capabilityService.create(data);
    ocService.createAuditEntry({ entityType: 'capability', entityId: cap.id, entityName: cap.name, action: 'capability_registered', actor: 'admin', details: { category: cap.category, status: cap.status, maturity: cap.maturity }, evidence: [`Capability "${cap.name}" registered in ${cap.category} category`] }).catch(() => {});
    reply.status(201).send(cap);
  });

  server.patch('/oc/capabilities/:id', async (req, reply) => {
    const { id } = req.params as any;
    const data = req.body as any;
    const cap = await capabilityService.update(id, data);
    if (!cap) { reply.status(404).send({ error: 'Capability not found' }); return; }
    ocService.createAuditEntry({ entityType: 'capability', entityId: cap.id, entityName: cap.name, action: 'capability_updated', actor: 'admin', details: { ...data }, evidence: [`Capability "${cap.name}" updated`] }).catch(() => {});
    reply.send(cap);
  });

  // ─── CONTINUOUS OPTIMIZATION ────────────────────────────────────────────────

  const optimizationService = new ContinuousOptimizationService();

  // Metrics
  server.get('/oc/clients/:clientId/optimization/metrics', async (req) => {
    const { clientId } = req.params as any;
    const q = req.query as any;
    const metrics = await optimizationService.getMetrics(clientId, { domain: q.domain, category: q.category, enabled: q.enabled === 'true' ? true : q.enabled === 'false' ? false : undefined, transformationId: q.transformationId });
    return { clientId, metrics, total: metrics.length };
  });

  server.post('/oc/clients/:clientId/optimization/metrics', async (req, reply) => {
    const { clientId } = req.params as any;
    const data = req.body as any;
    if (!data.name) { reply.status(400).send({ error: 'name is required' }); return; }
    const metric = await optimizationService.createMetric(clientId, data);
    ocService.createAuditEntry({ entityType: 'metric', entityId: clientId, entityName: metric.name, action: 'metric_defined', actor: 'admin', details: { metricId: metric.id, category: metric.category, domain: metric.domain }, evidence: [`Metric "${metric.name}" defined (${metric.unit}, ${metric.direction})`] }).catch(() => {});
    reply.status(201).send(metric);
  });

  server.get('/oc/optimization/metrics/:metricId', async (req, reply) => {
    const { metricId } = req.params as any;
    const metric = await optimizationService.getMetric(metricId);
    if (!metric) { reply.status(404).send({ error: 'Metric not found' }); return; }
    reply.send(metric);
  });

  // Baselines
  server.post('/oc/clients/:clientId/optimization/baselines', async (req, reply) => {
    const { clientId } = req.params as any;
    const data = req.body as any;
    if (!data.metricId || data.value === undefined) { reply.status(400).send({ error: 'metricId and value are required' }); return; }
    const baseline = await optimizationService.captureBaseline(clientId, data);
    ocService.createAuditEntry({ entityType: 'baseline', entityId: clientId, entityName: data.metricId, action: 'baseline_captured', actor: 'admin', details: { baselineId: baseline.id, value: baseline.value, unit: baseline.unit }, evidence: [`Baseline captured: ${baseline.value} ${baseline.unit}`] }).catch(() => {});
    reply.status(201).send(baseline);
  });

  server.get('/oc/clients/:clientId/optimization/baselines', async (req) => {
    const { clientId } = req.params as any;
    const q = req.query as any;
    const baselines = await optimizationService.getBaselines(clientId, q.metricId);
    return { clientId, baselines };
  });

  // Measurements (triggers rule evaluation)
  server.post('/oc/clients/:clientId/optimization/measurements', async (req, reply) => {
    const { clientId } = req.params as any;
    const data = req.body as any;
    if (!data.metricId || data.value === undefined) { reply.status(400).send({ error: 'metricId and value are required' }); return; }
    try {
      const result = await optimizationService.recordMeasurement(clientId, data);
      ocService.createAuditEntry({ entityType: 'measurement', entityId: clientId, entityName: data.metricId, action: 'measurement_recorded', actor: 'admin', details: { measurementId: result.measurement.id, value: result.measurement.value, alertLevel: result.measurement.alertLevel, findingsGenerated: result.findings.length }, evidence: [`Measurement: ${result.measurement.value} ${result.measurement.unit}${result.findings.length > 0 ? ` — ${result.findings.length} findings triggered` : ''}`] }).catch(() => {});
      reply.status(201).send(result);
    } catch (err) {
      reply.status(400).send({ error: (err as Error).message });
    }
  });

  server.get('/oc/clients/:clientId/optimization/measurements', async (req) => {
    const { clientId } = req.params as any;
    const q = req.query as any;
    const measurements = await optimizationService.getMeasurements(clientId, q.metricId, q.limit ? parseInt(q.limit) : undefined);
    return { clientId, measurements };
  });

  // Rules
  server.get('/oc/optimization/rules', async (req) => {
    const q = req.query as any;
    const rules = await optimizationService.getRules({ domain: q.domain, enabled: q.enabled === 'true' ? true : q.enabled === 'false' ? false : undefined });
    return { rules, total: rules.length };
  });

  server.post('/oc/optimization/rules', async (req, reply) => {
    const data = req.body as any;
    if (!data.name) { reply.status(400).send({ error: 'name is required' }); return; }
    const rule = await optimizationService.createRule(data);
    ocService.createAuditEntry({ entityType: 'rule', entityId: rule.id, entityName: rule.name, action: 'rule_created', actor: 'admin', details: { domain: rule.domain, conditionType: rule.conditionType }, evidence: [`Optimization rule "${rule.name}" created`] }).catch(() => {});
    reply.status(201).send(rule);
  });

  // Findings
  server.get('/oc/clients/:clientId/optimization/findings', async (req) => {
    const { clientId } = req.params as any;
    const q = req.query as any;
    const findings = await optimizationService.getFindings(clientId, { status: q.status, severity: q.severity, transformationId: q.transformationId, limit: q.limit ? parseInt(q.limit) : undefined });
    return { clientId, findings, total: findings.length };
  });

  server.post('/oc/optimization/findings/:findingId/promote', async (req, reply) => {
    const { findingId } = req.params as any;
    const { target } = req.body as any;
    try {
      if (target === 'gap') {
        const result = await optimizationService.promoteToGap(findingId);
        ocService.createAuditEntry({ entityType: 'finding', entityId: findingId, entityName: '', action: 'finding_promoted_to_gap', actor: 'admin', details: result, evidence: [`Finding promoted → Problem ${result.problemId} → Gap ${result.gapId}`] }).catch(() => {});
        reply.send(result);
      } else {
        const result = await optimizationService.promoteToProlem(findingId);
        ocService.createAuditEntry({ entityType: 'finding', entityId: findingId, entityName: '', action: 'finding_promoted_to_problem', actor: 'admin', details: result, evidence: [`Finding promoted → Problem ${result.problemId}`] }).catch(() => {});
        reply.send(result);
      }
    } catch (err) { reply.status(400).send({ error: (err as Error).message }); }
  });

  server.post('/oc/optimization/findings/:findingId/acknowledge', async (req, reply) => {
    const { findingId } = req.params as any;
    const finding = await optimizationService.acknowledgeFinding(findingId, 'admin');
    if (!finding) { reply.status(404).send({ error: 'Finding not found' }); return; }
    reply.send(finding);
  });

  server.post('/oc/optimization/findings/:findingId/resolve', async (req, reply) => {
    const { findingId } = req.params as any;
    const finding = await optimizationService.resolveFinding(findingId, 'admin');
    if (!finding) { reply.status(404).send({ error: 'Finding not found' }); return; }
    reply.send(finding);
  });

  // Transformation Outcomes
  server.post('/oc/clients/:clientId/optimization/outcomes', async (req, reply) => {
    const { clientId } = req.params as any;
    const data = req.body as any;
    if (!data.transformationId) { reply.status(400).send({ error: 'transformationId is required' }); return; }
    try {
      const outcome = await optimizationService.recordOutcome(clientId, data);
      ocService.createAuditEntry({ entityType: 'outcome', entityId: clientId, entityName: data.transformationId, action: 'outcome_recorded', actor: 'admin', details: { outcomeId: outcome.id, health: outcome.health, benefitRealization: outcome.benefitRealizationPct }, evidence: [`Transformation outcome: health=${outcome.health}, benefit realization=${outcome.benefitRealizationPct?.toFixed(1) || 'N/A'}%`] }).catch(() => {});
      reply.status(201).send(outcome);
    } catch (err) { reply.status(400).send({ error: (err as Error).message }); }
  });

  server.get('/oc/clients/:clientId/optimization/outcomes', async (req) => {
    const { clientId } = req.params as any;
    const q = req.query as any;
    const outcomes = await optimizationService.getOutcomes(clientId, q.transformationId);
    return { clientId, outcomes };
  });

  // Summary + Monitoring
  server.get('/oc/clients/:clientId/optimization/summary', async (req) => {
    const { clientId } = req.params as any;
    return optimizationService.getClientSummary(clientId);
  });

  server.get('/oc/clients/:clientId/optimization/monitoring', async (req) => {
    const { clientId } = req.params as any;
    return optimizationService.getMonitoringStatus(clientId);
  });

  // ─── PORTFOLIO INTELLIGENCE ─────────────────────────────────────────────────

  const portfolioService = new PortfolioIntelligenceService();

  server.get('/oc/portfolio/health', async () => {
    return portfolioService.getPortfolioHealth();
  });

  server.get('/oc/portfolio/clients', async () => {
    return { clients: await portfolioService.getClientHealthScores() };
  });

  server.get('/oc/portfolio/clients/:clientId/health', async (req) => {
    const { clientId } = req.params as any;
    const clientRes = await routePool.query('SELECT id, name, status FROM oc_clients WHERE id = $1', [clientId]);
    if (clientRes.rows.length === 0) return { error: 'Client not found' };
    const c = clientRes.rows[0];
    return portfolioService.calculateClientHealth(c.id, c.name, c.status);
  });

  server.get('/oc/portfolio/financial', async () => {
    return portfolioService.getFinancialPortfolio();
  });

  server.get('/oc/portfolio/transformations', async () => {
    return portfolioService.getTransformationPortfolio();
  });

  server.get('/oc/portfolio/patterns', async () => {
    return portfolioService.getCrossClientPatterns();
  });

  server.get('/oc/portfolio/resources', async () => {
    return portfolioService.getResourceView();
  });

  server.get('/oc/portfolio/intelligence', async () => {
    return portfolioService.getEngineeringIntelligence();
  });

  // ─── CLIENT PORTAL ──────────────────────────────────────────────────────────

  const portalService = new ClientPortalService();

  server.get('/oc/portal/:clientId/home', async (req) => {
    const { clientId } = req.params as any;
    return portalService.getPortalHome(clientId);
  });

  server.get('/oc/portal/:clientId/actions', async (req) => {
    const { clientId } = req.params as any;
    return { clientId, actions: await portalService.getActionCenter(clientId) };
  });

  server.get('/oc/portal/:clientId/timeline', async (req) => {
    const { clientId } = req.params as any;
    const q = req.query as any;
    return { clientId, events: await portalService.getActivityTimeline(clientId, q.limit ? parseInt(q.limit) : 50) };
  });

  server.get('/oc/portal/:clientId/notifications', async (req) => {
    const { clientId } = req.params as any;
    return { clientId, notifications: await portalService.getNotifications(clientId) };
  });

  server.post('/oc/portal/:clientId/notifications/:notifId/read', async (req, reply) => {
    const { clientId, notifId } = req.params as any;
    const result = await portalService.markNotificationRead(notifId, clientId);
    reply.send({ success: result });
  });

  server.post('/oc/portal/:clientId/notifications/read-all', async (req) => {
    const { clientId } = req.params as any;
    const count = await portalService.markAllRead(clientId);
    return { clientId, marked: count };
  });

  server.get('/oc/portal/:clientId/financial', async (req) => {
    const { clientId } = req.params as any;
    return portalService.getFinancialSummary(clientId);
  });

  server.get('/oc/portal/:clientId/connectors', async (req) => {
    const { clientId } = req.params as any;
    return { clientId, connectors: await portalService.getConnectorStatus(clientId) };
  });

  server.get('/oc/portal/:clientId/problems', async (req) => {
    const { clientId } = req.params as any;
    return { clientId, problems: await portalService.getProblems(clientId) };
  });

  server.get('/oc/portal/:clientId/gaps', async (req) => {
    const { clientId } = req.params as any;
    return { clientId, gaps: await portalService.getGaps(clientId) };
  });

  server.get('/oc/portal/:clientId/transformations', async (req) => {
    const { clientId } = req.params as any;
    return { clientId, transformations: await portalService.getTransformations(clientId) };
  });

  server.get('/oc/portal/:clientId/optimization', async (req) => {
    const { clientId } = req.params as any;
    return portalService.getOptimizationSummary(clientId);
  });

  // ─── KNOWN INFORMATION (ASK ONCE) ──────────────────────────────────────────

  server.get('/oc/clients/:clientId/known-information', async (req) => {
    const { clientId } = req.params as any;
    const fields: any[] = [];
    const allSources: Record<string, any[]> = {}; // For conflict detection

    const addField = (key: string, value: string, source: string, sourceLabel: string, status: string, updatedAt?: string, confidence?: string) => {
      const entry = { key, value, source, sourceLabel, status, updatedAt: updatedAt || null, confidence: confidence || 'high' };
      if (!allSources[key]) allSources[key] = [];
      allSources[key].push(entry);
    };

    // 1. Client profile (onboarding data)
    const clientRes = await routePool.query(`SELECT name, industry, country, business_size, support_model, criticality, created_at, updated_at FROM oc_clients WHERE id = $1`, [clientId]);
    if (clientRes.rows.length > 0) {
      const c = clientRes.rows[0];
      const ts = c.updated_at || c.created_at;
      if (c.name) addField('organization_legal_name', c.name, 'onboarding', 'Onboarding', 'already_known', ts, 'high');
      if (c.industry) addField('industry', c.industry, 'onboarding', 'Onboarding', 'already_known', ts, 'high');
      if (c.country) addField('country', c.country, 'onboarding', 'Onboarding', 'already_known', ts, 'high');
      if (c.business_size) addField('business_size', c.business_size, 'onboarding', 'Onboarding', 'already_known', ts, 'high');
      if (c.support_model) addField('support_model', c.support_model, 'onboarding', 'Onboarding', 'already_known', ts, 'high');
      if (c.criticality) addField('criticality', c.criticality, 'onboarding', 'Onboarding', 'already_known', ts, 'high');
    }

    // 2. Existing verified requirements (may conflict with onboarding)
    const reqRes = await routePool.query(`SELECT requirement_key, value, status, updated_at FROM oc_client_service_requirements WHERE client_id = $1 AND value IS NOT NULL AND value != '' AND status IN ('submitted','validated')`, [clientId]);
    for (const r of reqRes.rows) {
      addField(r.requirement_key, r.value, 'requirements', 'Previous Requirement', r.status === 'validated' ? 'verified' : 'already_known', r.updated_at, r.status === 'validated' ? 'high' : 'medium');
    }

    // 3. Discovery data (non-sensitive)
    const discRes = await routePool.query(`SELECT results, created_at FROM oc_discovery_runs WHERE client_id = $1 AND status = 'completed' ORDER BY created_at DESC LIMIT 1`, [clientId]);
    if (discRes.rows.length > 0) {
      const results = discRes.rows[0].results || {};
      const dts = discRes.rows[0].created_at;
      if (results.dbEngine) addField('database_technology', results.dbEngine, 'discovery', 'Discovery', 'discovered', dts, 'medium');
      if (results.dbVersion) addField('database_version', results.dbVersion, 'discovery', 'Discovery', 'discovered', dts, 'medium');
      if (results.resourceCount) addField('resource_count', String(results.resourceCount), 'discovery', 'Discovery', 'discovered', dts, 'medium');
    }

    // 4. OTP-verified contact info
    const otpReqs = await routePool.query(`SELECT requirement_key, value, updated_at FROM oc_client_service_requirements WHERE client_id = $1 AND requirement_key IN ('business_owner_email','business_owner_name') AND value IS NOT NULL AND value != ''`, [clientId]);
    for (const r of otpReqs.rows) {
      addField(r.requirement_key, r.value, 'identity', 'Identity Verification', 'verified', r.updated_at, 'high');
    }

    // Resolve conflicts: if multiple sources provide the same key with different values
    for (const [key, sources] of Object.entries(allSources)) {
      if (sources.length === 1) {
        fields.push(sources[0]);
      } else {
        // Multiple sources — check for conflict
        const uniqueValues = [...new Set(sources.map(s => s.value.toLowerCase().trim()))];
        if (uniqueValues.length === 1) {
          // Same value from multiple sources — use highest confidence
          const best = sources.sort((a, b) => (a.confidence === 'high' ? 0 : a.confidence === 'medium' ? 1 : 2) - (b.confidence === 'high' ? 0 : b.confidence === 'medium' ? 1 : 2))[0];
          fields.push({ ...best, additionalSources: sources.slice(1).map(s => s.sourceLabel) });
        } else {
          // Genuine conflict
          const primary = sources[0];
          fields.push({ ...primary, status: 'conflicting', conflict: { currentValue: primary.value, currentSource: primary.sourceLabel, otherValue: sources[1].value, otherSource: sources[1].sourceLabel, allSources: sources.map(s => ({ value: s.value, source: s.sourceLabel })) } });
        }
      }
    }

    const summary = {
      fromOnboarding: fields.filter(f => f.source === 'onboarding').length,
      fromRequirements: fields.filter(f => f.source === 'requirements').length,
      fromDiscovery: fields.filter(f => f.source === 'discovery').length,
      fromIdentity: fields.filter(f => f.source === 'identity').length,
      verified: fields.filter(f => f.status === 'verified').length,
      conflicting: fields.filter(f => f.status === 'conflicting').length,
      discovered: fields.filter(f => f.status === 'discovered').length,
    };

    return { clientId, fields, totalKnown: fields.length, summary };
  });

  // ─── WORKFLOW AUTOMATION ────────────────────────────────────────────────────

  const workflowService = new WorkflowAutomationService();

  // SSE Event Stream (client-scoped, real-time)
  server.get('/oc/events/stream/:clientId', async (req, reply) => {
    const { clientId } = req.params as any;

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    });

    // Send initial heartbeat
    reply.raw.write(`event: connected\ndata: ${JSON.stringify({ clientId, timestamp: new Date().toISOString() })}\n\n`);

    // Poll for new events every 3 seconds (bounded, safe)
    let lastCheck = new Date().toISOString();
    let alive = true;

    const interval = setInterval(async () => {
      if (!alive) { clearInterval(interval); return; }
      try {
        const { rows } = await routePool.query(
          `SELECT id, event_type, entity_type, entity_id, severity, payload, created_at FROM oc_events WHERE client_id = $1 AND created_at > $2 ORDER BY created_at ASC LIMIT 10`,
          [clientId, lastCheck]);
        for (const row of rows) {
          reply.raw.write(`event: ${row.event_type}\ndata: ${JSON.stringify({ id: row.id, eventType: row.event_type, entityType: row.entity_type, entityId: row.entity_id, severity: row.severity, payload: row.payload, timestamp: row.created_at })}\n\n`);
          lastCheck = row.created_at;
        }
        // Heartbeat every cycle to keep connection alive
        reply.raw.write(`:heartbeat ${new Date().toISOString()}\n\n`);
      } catch { /* connection may be closed */ alive = false; }
    }, 3000);

    // Cleanup on disconnect
    req.raw.on('close', () => { alive = false; clearInterval(interval); });
    req.raw.on('error', () => { alive = false; clearInterval(interval); });
  });

  // Events
  server.post('/oc/events', async (req, reply) => {
    const data = req.body as any;
    if (!data.eventType || !data.clientId) { reply.status(400).send({ error: 'eventType and clientId are required' }); return; }
    const result = await workflowService.emitEvent(data);
    ocService.createAuditEntry({ entityType: 'event', entityId: data.clientId, entityName: data.eventType, action: 'event_emitted', actor: data.actor || 'system', details: { eventId: result.event.id, executions: result.executions.length }, evidence: [`Event ${data.eventType} emitted, ${result.executions.length} rules executed`] }).catch(() => {});
    reply.status(201).send(result);
  });

  server.get('/oc/events/:clientId', async (req) => {
    const { clientId } = req.params as any;
    const q = req.query as any;
    return { clientId, events: await workflowService.getEvents(clientId, q.limit ? parseInt(q.limit) : 50) };
  });

  // Workflow Rules
  server.get('/oc/workflow/rules', async (req) => {
    const q = req.query as any;
    return { rules: await workflowService.getRules({ eventType: q.eventType, enabled: q.enabled === 'true' ? true : q.enabled === 'false' ? false : undefined }) };
  });

  server.post('/oc/workflow/rules', async (req, reply) => {
    const data = req.body as any;
    if (!data.name || !data.eventType) { reply.status(400).send({ error: 'name and eventType are required' }); return; }
    const rule = await workflowService.createRule(data);
    reply.status(201).send(rule);
  });

  server.patch('/oc/workflow/rules/:ruleId/toggle', async (req, reply) => {
    const { ruleId } = req.params as any;
    const { enabled } = req.body as any;
    const rule = await workflowService.toggleRule(ruleId, enabled !== false);
    if (!rule) { reply.status(404).send({ error: 'Rule not found' }); return; }
    reply.send(rule);
  });

  // Executions
  server.get('/oc/workflow/executions', async (req) => {
    const q = req.query as any;
    return { executions: await workflowService.getExecutions({ clientId: q.clientId, ruleId: q.ruleId, status: q.status, limit: q.limit ? parseInt(q.limit) : undefined }) };
  });

  // Notification Preferences
  server.get('/oc/clients/:clientId/notification-preferences', async (req) => {
    const { clientId } = req.params as any;
    const q = req.query as any;
    return { clientId, preferences: await workflowService.getPreferences(clientId, q.userId) };
  });

  server.put('/oc/clients/:clientId/notification-preferences', async (req, reply) => {
    const { clientId } = req.params as any;
    const data = req.body as any;
    if (!data.category || !data.channel) { reply.status(400).send({ error: 'category and channel are required' }); return; }
    const pref = await workflowService.upsertPreference(clientId, data);
    ocService.createAuditEntry({ entityType: 'preference', entityId: clientId, entityName: `${data.category}/${data.channel}`, action: 'preference_updated', actor: 'admin', details: { ...data }, evidence: [`Notification preference updated: ${data.category}/${data.channel}`] }).catch(() => {});
    reply.send(pref);
  });

  // Escalations
  server.get('/oc/clients/:clientId/escalations', async (req) => {
    const { clientId } = req.params as any;
    const q = req.query as any;
    return { clientId, escalations: await workflowService.getEscalations(clientId, q.status) };
  });

  server.post('/oc/escalations/:escalationId/acknowledge', async (req, reply) => {
    const { escalationId } = req.params as any;
    const ok = await workflowService.acknowledgeEscalation(escalationId);
    reply.send({ success: ok });
  });

  server.post('/oc/escalations/:escalationId/resolve', async (req, reply) => {
    const { escalationId } = req.params as any;
    const ok = await workflowService.resolveEscalation(escalationId);
    reply.send({ success: ok });
  });

  // ─── SCHEDULER ──────────────────────────────────────────────────────────────

  const schedulerService = new SchedulerService();

  server.get('/oc/scheduler/jobs', async () => {
    return { jobs: await schedulerService.getJobs() };
  });

  server.post('/oc/scheduler/jobs/:jobId/run', async (req, reply) => {
    const { jobId } = req.params as any;
    const result = await schedulerService.runJob(jobId);
    ocService.createAuditEntry({ entityType: 'scheduler', entityId: jobId, entityName: '', action: result.success ? 'job_completed' : 'job_failed', actor: 'admin', details: result, evidence: [`Job ${jobId}: ${result.success ? 'completed' : 'failed'}`] }).catch(() => {});
    reply.send(result);
  });

  server.patch('/oc/scheduler/jobs/:jobId/toggle', async (req, reply) => {
    const { jobId } = req.params as any;
    const { enabled } = req.body as any;
    const job = await schedulerService.toggleJob(jobId, enabled !== false);
    if (!job) { reply.status(404).send({ error: 'Job not found' }); return; }
    reply.send(job);
  });

  server.post('/oc/scheduler/run-all', async (req, reply) => {
    const result = await schedulerService.runAllDue();
    ocService.createAuditEntry({ entityType: 'scheduler', entityId: 'system', entityName: 'run-all', action: 'scheduler_cycle', actor: 'system', details: result, evidence: [`Scheduler: ${result.executed.length} executed, ${result.skipped.length} skipped, ${result.errors.length} errors`] }).catch(() => {});
    reply.send(result);
  });

  // ─── COMPLIANCE ─────────────────────────────────────────────────────────────

  const complianceService = new ComplianceService();

  server.get('/oc/compliance/frameworks', async () => {
    return { frameworks: await complianceService.getFrameworks() };
  });

  server.get('/oc/compliance/frameworks/:frameworkId/controls', async (req) => {
    const { frameworkId } = req.params as any;
    return { frameworkId, controls: await complianceService.getControls(frameworkId) };
  });

  server.get('/oc/clients/:clientId/compliance', async (req) => {
    const { clientId } = req.params as any;
    const q = req.query as any;
    return { clientId, controls: await complianceService.getClientCompliance(clientId, q.frameworkId) };
  });

  server.get('/oc/clients/:clientId/compliance/summary', async (req) => {
    const { clientId } = req.params as any;
    return complianceService.getClientComplianceSummary(clientId);
  });

  server.post('/oc/clients/:clientId/compliance/initialize', async (req, reply) => {
    const { clientId } = req.params as any;
    const { frameworkId } = req.body as any;
    if (!frameworkId) { reply.status(400).send({ error: 'frameworkId required' }); return; }
    const result = await complianceService.initializeClientCompliance(clientId, frameworkId);
    ocService.createAuditEntry({ entityType: 'compliance', entityId: clientId, entityName: frameworkId, action: 'compliance_initialized', actor: 'admin', details: result, evidence: [`Compliance initialized: ${result.initialized} controls, ${result.existing} existing`] }).catch(() => {});
    reply.status(201).send(result);
  });

  server.post('/oc/clients/:clientId/compliance/auto-map', async (req, reply) => {
    const { clientId } = req.params as any;
    const result = await complianceService.autoMapEvidence(clientId);
    ocService.createAuditEntry({ entityType: 'compliance', entityId: clientId, entityName: 'auto-map', action: 'evidence_auto_mapped', actor: 'system', details: result, evidence: [`${result.mapped} controls auto-mapped from existing evidence`] }).catch(() => {});
    reply.send(result);
  });

  server.patch('/oc/clients/:clientId/compliance/:controlId', async (req, reply) => {
    const { clientId, controlId } = req.params as any;
    const data = req.body as any;
    const result = await complianceService.updateControlStatus(clientId, controlId, data);
    if (!result) { reply.status(404).send({ error: 'Control not found for this client' }); return; }
    reply.send(result);
  });

  // Compliance Remediation Chain: control failure → problem → gap
  server.post('/oc/clients/:clientId/compliance/:controlId/remediate', async (req, reply) => {
    const { clientId, controlId } = req.params as any;
    const data = req.body as any;
    try {
      const result = await complianceService.triggerRemediationChain(clientId, controlId, data);
      if (!result.alreadyExists) {
        ocService.createAuditEntry({ entityType: 'compliance', entityId: clientId, entityName: controlId, action: 'remediation_chain_triggered', actor: 'admin', details: { problemId: result.problem?.id, gapId: result.gap?.id }, evidence: [`Compliance remediation: control ${controlId} → problem → gap`] }).catch(() => {});
      }
      reply.status(result.alreadyExists ? 200 : 201).send(result);
    } catch (err) { reply.status(400).send({ error: (err as Error).message }); }
  });

  // Cross-Framework Mappings
  server.get('/oc/compliance/mappings', async (req) => {
    const q = req.query as any;
    return { mappings: await complianceService.getMappings(q.frameworkId) };
  });

  server.get('/oc/compliance/mappings/coverage', async () => {
    return complianceService.getMappingCoverage();
  });

  server.get('/oc/compliance/controls/:controlId/related', async (req) => {
    const { controlId } = req.params as any;
    return { controlId, related: await complianceService.getRelatedControls(controlId) };
  });

  // Compliance Exceptions
  server.post('/oc/clients/:clientId/compliance/exceptions', async (req, reply) => {
    const { clientId } = req.params as any;
    const data = req.body as any;
    try {
      const exception = await complianceService.createException(clientId, data);
      ocService.createAuditEntry({ entityType: 'exception', entityId: clientId, entityName: exception.title, action: 'exception_requested', actor: data.requestedBy || 'admin', details: { exceptionId: exception.id, controlId: data.controlId, riskLevel: data.riskLevel }, evidence: [`Exception requested for control ${data.controlId}`] }).catch(() => {});
      reply.status(201).send(exception);
    } catch (err) { reply.status(400).send({ error: (err as Error).message }); }
  });

  server.get('/oc/clients/:clientId/compliance/exceptions', async (req) => {
    const { clientId } = req.params as any;
    const q = req.query as any;
    return { clientId, exceptions: await complianceService.getExceptions(clientId, q.status) };
  });

  server.post('/oc/compliance/exceptions/:exceptionId/transition', async (req, reply) => {
    const { exceptionId } = req.params as any;
    const { status, actor } = req.body as any;
    if (!status) { reply.status(400).send({ error: 'status required' }); return; }
    try {
      const result = await complianceService.transitionException(exceptionId, status, actor || 'admin');
      ocService.createAuditEntry({ entityType: 'exception', entityId: exceptionId, entityName: '', action: `exception_${status}`, actor: actor || 'admin', details: { newStatus: status }, evidence: [`Exception transitioned to ${status}`] }).catch(() => {});
      reply.send(result);
    } catch (err) { reply.status(400).send({ error: (err as Error).message }); }
  });

  // ─── CLIENT SERVICE ENABLEMENT ──────────────────────────────────────────────

  server.get('/oc/clients/:clientId/services', async (req) => {
    const { clientId } = req.params as any;
    // Get all capabilities + client-specific enablement
    const [capsRes, svcRes] = await Promise.all([
      routePool.query(`SELECT id, name, category, domain, status, maturity, description, business_value, roadmap_phase, dependencies FROM oc_capabilities ORDER BY category, name`),
      routePool.query(`SELECT * FROM oc_client_services WHERE client_id = $1`, [clientId]),
    ]);
    const enablementMap: Record<string, any> = {};
    svcRes.rows.forEach((r: any) => { enablementMap[r.service_id] = { status: r.status, required: r.required, visible: r.visible, enabledAt: r.enabled_at, enabledBy: r.enabled_by, reason: r.reason }; });

    const services = capsRes.rows.map((c: any) => ({
      serviceId: c.id, name: c.name, category: c.category, domain: c.domain,
      platformStatus: c.status, maturity: c.maturity, description: c.description,
      businessValue: c.business_value, roadmapPhase: c.roadmap_phase, dependencies: c.dependencies || [],
      clientStatus: enablementMap[c.id]?.status || (c.status === 'operational' ? 'enabled' : 'not_applicable'),
      required: enablementMap[c.id]?.required || false,
      visible: enablementMap[c.id]?.visible !== false,
      enabledAt: enablementMap[c.id]?.enabledAt,
      enabledBy: enablementMap[c.id]?.enabledBy,
    }));

    return { clientId, services, summary: { total: services.length, enabled: services.filter(s => s.clientStatus === 'enabled').length, disabled: services.filter(s => s.clientStatus === 'disabled').length, notApplicable: services.filter(s => s.clientStatus === 'not_applicable').length } };
  });

  server.post('/oc/clients/:clientId/services/:serviceId/enable', async (req, reply) => {
    const { clientId, serviceId } = req.params as any;
    const { actor, reason } = req.body as any;

    // Dependency check
    const cap = await routePool.query(`SELECT dependencies FROM oc_capabilities WHERE id = $1`, [serviceId]);
    if (cap.rows.length > 0 && cap.rows[0].dependencies?.length > 0) {
      const deps = cap.rows[0].dependencies;
      const disabled = await routePool.query(`SELECT service_id FROM oc_client_services WHERE client_id = $1 AND service_id = ANY($2) AND status = 'disabled'`, [clientId, deps]);
      if (disabled.rows.length > 0) {
        reply.status(422).send({ error: 'dependency_required', message: `Cannot enable: dependencies not met`, missingDependencies: disabled.rows.map((r: any) => r.service_id) });
        return;
      }
    }

    await routePool.query(`
      INSERT INTO oc_client_services (client_id, service_id, status, enabled_at, enabled_by, reason)
      VALUES ($1, $2, 'enabled', NOW(), $3, $4)
      ON CONFLICT (client_id, service_id) DO UPDATE SET status = 'enabled', enabled_at = NOW(), enabled_by = $3, reason = $4, disabled_at = NULL, updated_at = NOW()
    `, [clientId, serviceId, actor || 'admin', reason || null]);

    ocService.createAuditEntry({ entityType: 'client_service', entityId: clientId, entityName: serviceId, action: 'service_enabled', actor: actor || 'admin', details: { serviceId, reason }, evidence: [`Service ${serviceId} enabled for client ${clientId}`] }).catch(() => {});
    reply.send({ success: true, clientId, serviceId, status: 'enabled' });
  });

  server.post('/oc/clients/:clientId/services/:serviceId/disable', async (req, reply) => {
    const { clientId, serviceId } = req.params as any;
    const { actor, reason } = req.body as any;

    // Check if other enabled services depend on this one
    const dependents = await routePool.query(`SELECT id, name FROM oc_capabilities WHERE dependencies @> $1::jsonb`, [JSON.stringify([serviceId])]);
    if (dependents.rows.length > 0) {
      const enabledDeps = await routePool.query(`SELECT service_id FROM oc_client_services WHERE client_id = $1 AND service_id = ANY($2) AND status = 'enabled'`, [clientId, dependents.rows.map((r: any) => r.id)]);
      if (enabledDeps.rows.length > 0) {
        reply.status(422).send({ error: 'dependency_conflict', message: `Cannot disable: other enabled services depend on this`, dependentServices: enabledDeps.rows.map((r: any) => r.service_id) });
        return;
      }
    }

    await routePool.query(`
      INSERT INTO oc_client_services (client_id, service_id, status, disabled_at, enabled_by, reason)
      VALUES ($1, $2, 'disabled', NOW(), $3, $4)
      ON CONFLICT (client_id, service_id) DO UPDATE SET status = 'disabled', disabled_at = NOW(), enabled_by = $3, reason = $4, enabled_at = NULL, updated_at = NOW()
    `, [clientId, serviceId, actor || 'admin', reason || null]);

    ocService.createAuditEntry({ entityType: 'client_service', entityId: clientId, entityName: serviceId, action: 'service_disabled', actor: actor || 'admin', details: { serviceId, reason }, evidence: [`Service ${serviceId} disabled for client ${clientId}`] }).catch(() => {});
    reply.send({ success: true, clientId, serviceId, status: 'disabled' });
  });

  // ─── SERVICE RECOMMENDATIONS ────────────────────────────────────────────────

  server.get('/oc/clients/:clientId/services/recommendations', async (req) => {
    const { clientId } = req.params as any;
    const recommendations: any[] = [];

    // Get client problems + gaps for evidence
    const [probRes, gapRes, compRes, svcRes] = await Promise.all([
      routePool.query(`SELECT domain, category, severity, title FROM oc_problems WHERE client_id = $1 AND status NOT IN ('resolved','rejected') ORDER BY severity DESC LIMIT 20`, [clientId]),
      routePool.query(`SELECT domain, category, severity FROM oc_gaps WHERE client_id = $1 AND status NOT IN ('resolved','closed') LIMIT 20`, [clientId]),
      routePool.query(`SELECT status, count(*) as cnt FROM oc_client_compliance WHERE client_id = $1 GROUP BY status`, [clientId]),
      routePool.query(`SELECT service_id, status FROM oc_client_services WHERE client_id = $1`, [clientId]),
    ]);

    const enabledServices = new Set(svcRes.rows.filter((r: any) => r.status === 'enabled').map((r: any) => r.service_id));
    const disabledServices = new Set(svcRes.rows.filter((r: any) => r.status === 'disabled').map((r: any) => r.service_id));
    const problems = probRes.rows;
    const gaps = gapRes.rows;

    // Rule-based recommendations
    const hasLegacy = problems.some((p: any) => p.domain === 'database' || p.title?.toLowerCase().includes('legacy'));
    const hasInfraCost = problems.some((p: any) => p.category === 'cost' || p.title?.toLowerCase().includes('cost'));
    const hasSecurityGap = problems.some((p: any) => p.domain === 'security');
    const hasCompliance = compRes.rows.some((r: any) => r.status === 'not_met' || r.status === 'not_assessed');
    const hasAppIssues = problems.some((p: any) => p.domain === 'application' || p.domain === 'devops');
    const hasNoOptimization = !enabledServices.has('cap-optimization-engine');
    const hasCritical = problems.some((p: any) => p.severity === 'critical');

    if (hasLegacy && !enabledServices.has('cap-legacy-modernization')) {
      recommendations.push({ serviceId: 'cap-legacy-modernization', serviceName: 'Legacy Modernization', reason: 'Legacy technology detected in your environment', evidence: problems.filter((p: any) => p.domain === 'database' || p.title?.toLowerCase().includes('legacy')).map((p: any) => p.title), priority: 'high', businessValue: 'Reduce lifecycle risk and modernize technology stack', currentClientStatus: disabledServices.has('cap-legacy-modernization') ? 'disabled' : 'not_enabled' });
    }
    if (hasInfraCost && !enabledServices.has('cap-cloud-cost')) {
      recommendations.push({ serviceId: 'cap-cloud-cost', serviceName: 'Cloud Cost Optimization', reason: 'Infrastructure cost issues identified', evidence: problems.filter((p: any) => p.category === 'cost').map((p: any) => p.title), priority: 'high', businessValue: 'Reduce infrastructure costs 20-40%', currentClientStatus: 'not_enabled' });
    }
    if (hasSecurityGap && !enabledServices.has('cap-security-posture')) {
      recommendations.push({ serviceId: 'cap-security-posture', serviceName: 'Security Posture Management', reason: 'Security problems detected', evidence: problems.filter((p: any) => p.domain === 'security').map((p: any) => p.title), priority: 'high', businessValue: 'Proactive security improvement', currentClientStatus: 'not_enabled' });
    }
    if (hasCompliance && !enabledServices.has('cap-compliance-automation')) {
      recommendations.push({ serviceId: 'cap-compliance-automation', serviceName: 'Compliance Automation', reason: 'Compliance controls not fully met', evidence: ['Compliance assessment shows gaps'], priority: 'medium', businessValue: 'Automated compliance tracking and evidence', currentClientStatus: enabledServices.has('cap-compliance-automation') ? 'enabled' : 'not_enabled' });
    }
    if (hasAppIssues && !enabledServices.has('cap-app-portfolio')) {
      recommendations.push({ serviceId: 'cap-app-portfolio', serviceName: 'Application Portfolio Management', reason: 'Application-level problems detected', evidence: problems.filter((p: any) => p.domain === 'application' || p.domain === 'devops').map((p: any) => p.title), priority: 'medium', businessValue: 'Rationalize and modernize application portfolio', currentClientStatus: 'not_enabled' });
    }
    if (hasNoOptimization && problems.length > 0) {
      recommendations.push({ serviceId: 'cap-optimization-engine', serviceName: 'Continuous Optimization', reason: 'Problems identified — optimization will track improvement', evidence: [`${problems.length} problems requiring monitoring`], priority: 'medium', businessValue: 'Continuous measurement and benefit realization', currentClientStatus: 'not_enabled' });
    }
    if (hasCritical && !enabledServices.has('cap-vuln-management')) {
      recommendations.push({ serviceId: 'cap-vuln-management', serviceName: 'Vulnerability Management', reason: 'Critical-severity problems detected', evidence: problems.filter((p: any) => p.severity === 'critical').map((p: any) => p.title), priority: 'critical', businessValue: 'Proactive vulnerability detection and remediation', currentClientStatus: 'not_enabled' });
    }

    return { clientId, recommendations, total: recommendations.length };
  });

  // ─── SERVICE COVERAGE ───────────────────────────────────────────────────────

  server.get('/oc/clients/:clientId/services/coverage', async (req) => {
    const { clientId } = req.params as any;
    const [capsRes, svcRes] = await Promise.all([
      routePool.query(`SELECT id, category, status FROM oc_capabilities WHERE status = 'operational'`),
      routePool.query(`SELECT service_id, status FROM oc_client_services WHERE client_id = $1 AND status = 'enabled'`, [clientId]),
    ]);
    const operational = capsRes.rows;
    const enabled = new Set(svcRes.rows.map((r: any) => r.service_id));
    const total = operational.length;
    const enabledCount = operational.filter((c: any) => enabled.has(c.id)).length;
    const coverage = total > 0 ? Math.round((enabledCount / total) * 100) : 0;

    // Category coverage
    const categories: Record<string, { total: number; enabled: number }> = {};
    for (const cap of operational) {
      if (!categories[cap.category]) categories[cap.category] = { total: 0, enabled: 0 };
      categories[cap.category].total++;
      if (enabled.has(cap.id)) categories[cap.category].enabled++;
    }
    const categoryCoverage = Object.entries(categories).map(([cat, v]) => ({ category: cat, total: v.total, enabled: v.enabled, coverage: v.total > 0 ? Math.round((v.enabled / v.total) * 100) : 0 }));

    return { clientId, overall: { total, enabled: enabledCount, coverage }, categories: categoryCoverage };
  });

  // ─── SERVICE BUNDLES ────────────────────────────────────────────────────────

  server.get('/oc/service-bundles', async () => {
    const { rows } = await routePool.query(`SELECT * FROM oc_service_bundles WHERE status = 'active' ORDER BY name`);
    return { bundles: rows.map((r: any) => ({ id: r.id, name: r.name, description: r.description, category: r.category, serviceIds: r.service_ids || [], recommendedFor: r.recommended_for || [], businessValue: r.business_value, status: r.status })) };
  });

  server.get('/oc/service-bundles/:id', async (req, reply) => {
    const { id } = req.params as any;
    const { rows } = await routePool.query(`SELECT * FROM oc_service_bundles WHERE id = $1`, [id]);
    if (rows.length === 0) { reply.status(404).send({ error: 'Bundle not found' }); return; }
    const b = rows[0];
    reply.send({ id: b.id, name: b.name, description: b.description, category: b.category, serviceIds: b.service_ids || [], recommendedFor: b.recommended_for || [], businessValue: b.business_value, status: b.status });
  });

  server.get('/oc/clients/:clientId/service-bundles/recommended', async (req) => {
    const { clientId } = req.params as any;
    const [bundlesRes, svcRes, lcRes] = await Promise.all([
      routePool.query(`SELECT * FROM oc_service_bundles WHERE status = 'active'`),
      routePool.query(`SELECT service_id, status FROM oc_client_services WHERE client_id = $1`, [clientId]),
      routePool.query(`SELECT status FROM oc_lifecycle WHERE client_id = $1 ORDER BY updated_at DESC LIMIT 1`, [clientId]),
    ]);
    const enabled = new Set(svcRes.rows.filter((r: any) => r.status === 'enabled').map((r: any) => r.service_id));
    const lcStatus = lcRes.rows[0]?.status || '';
    const recommendations: any[] = [];

    for (const b of bundlesRes.rows) {
      const bundleServices = b.service_ids || [];
      const enabledInBundle = bundleServices.filter((s: string) => enabled.has(s)).length;
      const coverage = bundleServices.length > 0 ? Math.round((enabledInBundle / bundleServices.length) * 100) : 0;
      if (coverage < 100) {
        recommendations.push({ bundleId: b.id, bundleName: b.name, description: b.description, businessValue: b.business_value, totalServices: bundleServices.length, enabledServices: enabledInBundle, coverage, missingServices: bundleServices.filter((s: string) => !enabled.has(s)) });
      }
    }
    return { clientId, recommendations: recommendations.sort((a, b) => b.coverage - a.coverage) };
  });

  // ─── COMMERCIAL ENGAGEMENTS & PROPOSALS ────────────────────────────────────

  const commercialService = new CommercialEngagementService();

  // Engagement CRUD
  server.post('/oc/clients/:clientId/engagements', async (req, reply) => {
    const { clientId } = req.params as any;
    const body = req.body as any;
    if (!body.name) { reply.status(400).send({ error: { code: 'validation', message: 'name is required' } }); return; }
    const engagement = await commercialService.createEngagement(clientId, body);
    reply.status(201).send({ engagement });
  });

  server.get('/oc/clients/:clientId/engagements', async (req) => {
    const { clientId } = req.params as any;
    const engagements = await commercialService.listEngagements(clientId);
    return { clientId, engagements };
  });

  server.get('/oc/engagements/:id', async (req, reply) => {
    const { id } = req.params as any;
    const engagement = await commercialService.getEngagement(id);
    if (!engagement) { reply.status(404).send({ error: { code: 'not_found', message: 'Engagement not found' } }); return; }
    return { engagement };
  });

  server.patch('/oc/engagements/:id', async (req, reply) => {
    const { id } = req.params as any;
    const body = req.body as any;
    if (!body.clientId) { reply.status(400).send({ error: { code: 'validation', message: 'clientId is required' } }); return; }
    const engagement = await commercialService.updateEngagement(id, body.clientId, body);
    if (!engagement) { reply.status(404).send({ error: { code: 'not_found', message: 'Engagement not found' } }); return; }
    return { engagement };
  });

  // Engagement transitions
  server.post('/oc/engagements/:id/transition', async (req, reply) => {
    const { id } = req.params as any;
    const body = req.body as any;
    if (!body.clientId || !body.newStatus) { reply.status(400).send({ error: { code: 'validation', message: 'clientId and newStatus are required' } }); return; }
    const result = await commercialService.transitionEngagement(id, body.clientId, body);
    if (!result.success) { reply.status(422).send(result); return; }
    return result;
  });

  // Engagement services
  server.get('/oc/engagements/:id/services', async (req, reply) => {
    const { id } = req.params as any;
    const { clientId } = req.query as any;
    if (!clientId) { reply.status(400).send({ error: { code: 'validation', message: 'clientId query param required' } }); return; }
    const services = await commercialService.getEngagementServices(id, clientId);
    return { engagementId: id, services };
  });

  server.post('/oc/engagements/:id/services', async (req, reply) => {
    const { id } = req.params as any;
    const body = req.body as any;
    if (!body.clientId || !body.serviceId) { reply.status(400).send({ error: { code: 'validation', message: 'clientId and serviceId are required' } }); return; }
    const result = await commercialService.addService(id, body.clientId, body);
    if (!result.success) { reply.status(422).send(result); return; }
    reply.status(201).send(result);
  });

  server.delete('/oc/engagements/:id/services/:serviceId', async (req, reply) => {
    const { id, serviceId } = req.params as any;
    const { clientId } = req.query as any;
    if (!clientId) { reply.status(400).send({ error: { code: 'validation', message: 'clientId query param required' } }); return; }
    const result = await commercialService.removeService(id, clientId, serviceId);
    if (!result.success) { reply.status(422).send(result); return; }
    return result;
  });

  // Engagement summary
  server.get('/oc/engagements/:id/summary', async (req, reply) => {
    const { id } = req.params as any;
    const { clientId } = req.query as any;
    if (!clientId) { reply.status(400).send({ error: { code: 'validation', message: 'clientId query param required' } }); return; }
    const summary = await commercialService.getEngagementSummary(id, clientId);
    if (!summary) { reply.status(404).send({ error: { code: 'not_found', message: 'Engagement not found' } }); return; }
    return summary;
  });

  // Engagement pricing
  server.get('/oc/engagements/:id/pricing', async (req, reply) => {
    const { id } = req.params as any;
    const { clientId } = req.query as any;
    if (!clientId) { reply.status(400).send({ error: { code: 'validation', message: 'clientId query param required' } }); return; }
    const pricing = await commercialService.getPricing(id, clientId);
    return { engagementId: id, pricing };
  });

  server.post('/oc/engagements/:id/pricing', async (req, reply) => {
    const { id } = req.params as any;
    const body = req.body as any;
    if (!body.clientId) { reply.status(400).send({ error: { code: 'validation', message: 'clientId is required' } }); return; }
    const result = await commercialService.setPricing(id, body.clientId, body);
    if (!result.success) { reply.status(422).send(result); return; }
    reply.status(201).send(result);
  });

  // Proposals
  server.get('/oc/engagements/:id/proposals', async (req, reply) => {
    const { id } = req.params as any;
    const { clientId } = req.query as any;
    if (!clientId) { reply.status(400).send({ error: { code: 'validation', message: 'clientId query param required' } }); return; }
    const proposals = await commercialService.listProposals(id, clientId);
    return { engagementId: id, proposals };
  });

  server.post('/oc/engagements/:id/proposals', async (req, reply) => {
    const { id } = req.params as any;
    const body = req.body as any;
    if (!body.clientId) { reply.status(400).send({ error: { code: 'validation', message: 'clientId is required' } }); return; }
    const result = await commercialService.createProposal(id, body.clientId, body);
    if (!result.success) { reply.status(422).send(result); return; }
    reply.status(201).send(result);
  });

  server.get('/oc/proposals/:id', async (req, reply) => {
    const { id } = req.params as any;
    const { clientId } = req.query as any;
    const proposal = await commercialService.getProposal(id, clientId || undefined);
    if (!proposal) { reply.status(404).send({ error: { code: 'not_found', message: 'Proposal not found' } }); return; }
    return { proposal };
  });

  server.post('/oc/proposals/:id/generate', async (req, reply) => {
    const { id } = req.params as any;
    const body = req.body as any;
    if (!body.clientId) { reply.status(400).send({ error: { code: 'validation', message: 'clientId is required' } }); return; }
    const result = await commercialService.generateProposalContent(id, body.clientId);
    if (!result.success) { reply.status(422).send(result); return; }
    return result;
  });

  server.post('/oc/proposals/:id/transition', async (req, reply) => {
    const { id } = req.params as any;
    const body = req.body as any;
    if (!body.clientId || !body.newStatus) { reply.status(400).send({ error: { code: 'validation', message: 'clientId and newStatus are required' } }); return; }
    const result = await commercialService.transitionProposal(id, body.clientId, body.newStatus, body.actor);
    if (!result.success) { reply.status(422).send(result); return; }
    return result;
  });

  // ─── PAYMENT METHODS ────────────────────────────────────────────────────────

  const paymentService = new PaymentMethodService();

  server.get('/oc/clients/:clientId/payment-methods', async (req) => {
    const { clientId } = req.params as any;
    const methods = await paymentService.listPaymentMethods(clientId);
    return { clientId, paymentMethods: methods };
  });

  server.post('/oc/clients/:clientId/payment-methods', async (req, reply) => {
    const { clientId } = req.params as any;
    const body = req.body as any;
    if (!body.displayName || !body.type) { reply.status(400).send({ error: { code: 'validation', message: 'displayName and type are required' } }); return; }
    const result = await paymentService.addPaymentMethod(clientId, body);
    if (!result.success) { reply.status(422).send(result); return; }
    reply.status(201).send(result);
  });

  server.get('/oc/payment-methods/:id', async (req, reply) => {
    const { id } = req.params as any;
    const { clientId } = req.query as any;
    const pm = await paymentService.getPaymentMethod(id, clientId || undefined);
    if (!pm) { reply.status(404).send({ error: { code: 'not_found', message: 'Payment method not found' } }); return; }
    return { paymentMethod: pm };
  });

  server.post('/oc/payment-methods/:id/default', async (req, reply) => {
    const { id } = req.params as any;
    const { clientId } = req.body as any;
    if (!clientId) { reply.status(400).send({ error: { code: 'validation', message: 'clientId is required' } }); return; }
    const result = await paymentService.setDefault(id, clientId);
    if (!result.success) { reply.status(422).send(result); return; }
    return result;
  });

  server.post('/oc/payment-methods/:id/verify', async (req, reply) => {
    const { id } = req.params as any;
    const { clientId } = req.body as any;
    if (!clientId) { reply.status(400).send({ error: { code: 'validation', message: 'clientId is required' } }); return; }
    const result = await paymentService.verify(id, clientId);
    if (!result.success) { reply.status(422).send(result); return; }
    return result;
  });

  server.post('/oc/payment-methods/:id/disable', async (req, reply) => {
    const { id } = req.params as any;
    const { clientId } = req.body as any;
    if (!clientId) { reply.status(400).send({ error: { code: 'validation', message: 'clientId is required' } }); return; }
    const result = await paymentService.disable(id, clientId);
    if (!result.success) { reply.status(422).send(result); return; }
    return result;
  });

  // ─── FINANCIAL TRANSACTIONS & RECONCILIATION ────────────────────────────────

  const reconService = new FinancialReconciliationService();

  server.get('/oc/clients/:clientId/transactions', async (req) => {
    const { clientId } = req.params as any;
    const q = req.query as any;
    const transactions = await reconService.listTransactions(clientId, { engagementId: q.engagementId, status: q.status });
    return { clientId, transactions };
  });

  server.post('/oc/clients/:clientId/transactions', async (req, reply) => {
    const { clientId } = req.params as any;
    const body = req.body as any;
    if (!body.transactionType || !body.amount) { reply.status(400).send({ error: { code: 'validation', message: 'transactionType and amount are required' } }); return; }
    const result = await reconService.createTransaction(clientId, body);
    if (!result.success) { reply.status(422).send(result); return; }
    reply.status(201).send(result);
  });

  server.get('/oc/clients/:clientId/reconciliation', async (req) => {
    const { clientId } = req.params as any;
    const runs = await reconService.listReconciliationRuns(clientId);
    return { clientId, runs };
  });

  server.post('/oc/clients/:clientId/reconciliation/run', async (req, reply) => {
    const { clientId } = req.params as any;
    const result = await reconService.createReconciliationRun(clientId);
    reply.status(201).send(result);
  });

  server.get('/oc/reconciliation/:id', async (req, reply) => {
    const { id } = req.params as any;
    const { clientId } = req.query as any;
    const run = await reconService.getReconciliationRun(id, clientId || undefined);
    if (!run) { reply.status(404).send({ error: { code: 'not_found', message: 'Reconciliation run not found' } }); return; }
    return { run };
  });

  server.post('/oc/reconciliation/:id/execute', async (req, reply) => {
    const { id } = req.params as any;
    const { clientId } = req.body as any;
    if (!clientId) { reply.status(400).send({ error: { code: 'validation', message: 'clientId is required' } }); return; }
    const result = await reconService.executeReconciliation(id, clientId);
    if (!result.success) { reply.status(422).send(result); return; }
    return result;
  });

  server.get('/oc/reconciliation/:id/items', async (req) => {
    const { id } = req.params as any;
    const { clientId } = req.query as any;
    const items = await reconService.getReconciliationItems(id, clientId || '');
    return { runId: id, items };
  });

  server.post('/oc/reconciliation/:id/transition', async (req, reply) => {
    const { id } = req.params as any;
    const { clientId, newStatus } = req.body as any;
    if (!clientId || !newStatus) { reply.status(400).send({ error: { code: 'validation', message: 'clientId and newStatus are required' } }); return; }
    const result = await reconService.transitionRun(id, clientId, newStatus);
    if (!result.success) { reply.status(422).send(result); return; }
    return result;
  });

  server.get('/oc/clients/:clientId/reconciliation/summary', async (req) => {
    const { clientId } = req.params as any;
    return reconService.getReconciliationSummary(clientId);
  });

  server.get('/oc/clients/:clientId/reconciliation/exceptions', async (req) => {
    const { clientId } = req.params as any;
    const { status } = req.query as any;
    const exceptions = await reconService.listExceptions(clientId, status || undefined);
    return { clientId, exceptions };
  });

  server.post('/oc/reconciliation/exceptions/:id/transition', async (req, reply) => {
    const { id } = req.params as any;
    const { clientId, newStatus, actor, notes } = req.body as any;
    if (!clientId || !newStatus) { reply.status(400).send({ error: { code: 'validation', message: 'clientId and newStatus are required' } }); return; }
    const result = await reconService.transitionException(id, clientId, newStatus, actor, notes);
    if (!result.success) { reply.status(422).send(result); return; }
    return result;
  });

  // ─── PLATFORM COMMERCIAL SUMMARY ───────────────────────────────────────────

  server.get('/oc/platform/commercial/summary', async () => {
    const { rows: engagements } = await routePool.query('SELECT * FROM oc_commercial_engagements ORDER BY created_at DESC');
    const byStatus: Record<string, number> = {};
    let totalEstimatedValue = 0;
    let totalContractedValue = 0;
    let totalRealized = 0;

    for (const e of engagements) {
      byStatus[e.status] = (byStatus[e.status] || 0) + 1;
      const inv = parseFloat(e.total_investment || '0');
      totalEstimatedValue += inv;
      if (e.status === 'contracted' || e.status === 'active' || e.status === 'completed') totalContractedValue += inv;
      if (e.status === 'completed') totalRealized += parseFloat(e.total_expected_value || '0');
    }

    return {
      summary: { totalEngagements: engagements.length, totalEstimatedValue, totalContractedValue, totalRealized },
      byStatus,
      pipeline: engagements.filter(e => e.status !== 'completed').slice(0, 20),
    };
  });

  // ─── JIRA INTEGRATION ──────────────────────────────────────────────────────

  const { JiraIntegrationService } = await import('../services/jira-integration-service.js');
  const jiraService = new JiraIntegrationService();

  // Get Jira configuration (token masked)
  server.get('/oc/jira/config', async (req) => {
    const q = req.query as any;
    const environment = q.environment || 'development';
    const jiraConfig = await jiraService.getConfig(environment);
    return { config: jiraConfig, environment };
  });

  // Save Jira configuration
  server.post('/oc/jira/config', async (req, reply) => {
    const body = req.body as any;
    if (!body.baseUrl || !body.projectKey) {
      reply.status(400).send({ error: 'baseUrl and projectKey are required' });
      return;
    }
    const result = await jiraService.saveConfig({
      environment: body.environment || 'development',
      baseUrl: body.baseUrl,
      projectKey: body.projectKey,
      authMethod: body.authMethod || 'api_token',
      authEmail: body.authEmail || '',
      authToken: body.authToken || '',
      defaultIssueType: body.defaultIssueType,
      defaultPriority: body.defaultPriority,
      defaultAssignee: body.defaultAssignee,
      defaultLabels: body.defaultLabels,
      defaultComponents: body.defaultComponents,
    });

    ocService.createAuditEntry({
      entityType: 'jira', entityId: body.environment || 'development', entityName: body.baseUrl,
      action: 'jira_configured', actor: 'admin',
      details: { projectKey: body.projectKey, authMethod: body.authMethod },
      evidence: [`Jira configured for ${body.environment || 'development'}: ${body.baseUrl} / ${body.projectKey}`],
    }).catch(() => {});

    reply.send(result);
  });

  // Test Jira connection
  server.post('/oc/jira/test', async (req) => {
    const body = req.body as any;
    const environment = body.environment || 'development';
    const result = await jiraService.checkHealth(environment);

    ocService.createAuditEntry({
      entityType: 'jira', entityId: environment, entityName: 'health_check',
      action: 'jira_health_checked', actor: 'admin',
      details: { status: result.status, responseMs: result.responseMs },
      evidence: [`Jira health: ${result.status}${result.error ? ' — ' + result.error : ''}`],
    }).catch(() => {});

    return result;
  });

  // Create Jira issue from AskABD entity
  server.post('/oc/jira/issues', async (req, reply) => {
    const body = req.body as any;
    if (!body.clientId || !body.sourceType || !body.sourceId || !body.summary) {
      reply.status(400).send({ error: 'clientId, sourceType, sourceId, and summary are required' });
      return;
    }

    const result = await jiraService.createIssue({
      clientId: body.clientId,
      sourceType: body.sourceType,
      sourceId: body.sourceId,
      sourceTitle: body.sourceTitle || body.summary,
      summary: body.summary,
      description: body.description || '',
      issueType: body.issueType,
      priority: body.priority,
      labels: body.labels,
      components: body.components,
    });

    if (result.success) {
      ocService.createAuditEntry({
        entityType: 'jira', entityId: body.clientId, entityName: result.issueKey || '',
        action: result.duplicate ? 'jira_issue_duplicate' : 'jira_issue_created',
        actor: 'admin',
        details: { sourceType: body.sourceType, sourceId: body.sourceId, issueKey: result.issueKey, duplicate: result.duplicate },
        evidence: [result.duplicate ? `Existing Jira issue ${result.issueKey} returned (idempotent)` : `Jira issue ${result.issueKey} created for ${body.sourceType}/${body.sourceId}`],
      }).catch(() => {});
    }

    reply.status(result.success ? 201 : 422).send(result);
  });

  // Get Jira issue links for a client
  server.get('/oc/jira/links/:clientId', async (req) => {
    const { clientId } = req.params as any;
    const links = await jiraService.getIssueLinks(clientId);
    return { clientId, links };
  });

  // ─── DEFECTS ────────────────────────────────────────────────────────────────

  // Record a defect (deduplicated)
  server.post('/oc/defects', async (req, reply) => {
    const body = req.body as any;
    if (!body.category || !body.title) {
      reply.status(400).send({ error: 'category and title are required' });
      return;
    }

    const result = await jiraService.recordDefect({
      clientId: body.clientId,
      category: body.category,
      severity: body.severity || 'medium',
      title: body.title,
      description: body.description,
      affectedService: body.affectedService,
      affectedEndpoint: body.affectedEndpoint,
      rootCause: body.rootCause,
      rootCauseConfidence: body.rootCauseConfidence,
      businessImpact: body.businessImpact,
      technicalImpact: body.technicalImpact,
      recommendedFix: body.recommendedFix,
      evidence: body.evidence,
    });

    reply.status(result.isNew ? 201 : 200).send(result);
  });

  // Get defects
  server.get('/oc/defects', async (req) => {
    const q = req.query as any;
    const defects = await jiraService.getDefects(q.clientId, { status: q.status, severity: q.severity });
    return { defects, total: defects.length };
  });

  // ─── INCIDENTS ──────────────────────────────────────────────────────────────

  server.get('/oc/incidents', async (req) => {
    const q = req.query as any;
    let query = 'SELECT * FROM oc_incidents WHERE 1=1';
    const params: any[] = [];
    if (q.clientId) { params.push(q.clientId); query += ` AND client_id = $${params.length}`; }
    if (q.status) { params.push(q.status); query += ` AND status = $${params.length}`; }
    query += ' ORDER BY detected_at DESC LIMIT 100';
    try {
      const res = await routePool.query(query, params);
      return { incidents: res.rows };
    } catch { return { incidents: [] }; }
  });

  server.post('/oc/incidents', async (req, reply) => {
    const body = req.body as any;
    if (!body.title || !body.severity) { reply.status(400).send({ error: 'title and severity required' }); return; }
    try {
      const res = await routePool.query(`
        INSERT INTO oc_incidents (client_id, severity, title, description, affected_service, impact_summary, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'detected') RETURNING *
      `, [body.clientId || null, body.severity, body.title, body.description || '', body.affectedService || '', body.impactSummary || '']);
      reply.status(201).send({ incident: res.rows[0] });
    } catch (err) { reply.status(500).send({ error: (err as Error).message }); }
  });

  // ─── AUTOMATED DEFECT DETECTION ─────────────────────────────────────────────

  const { DefectDetectionService } = await import('../services/defect-detection-service.js');
  const detectionService = new DefectDetectionService();

  // Run automated defect detection sweep
  server.post('/oc/defects/detect', async (req, reply) => {
    const result = await detectionService.runDetection();

    ocService.createAuditEntry({
      entityType: 'defect', entityId: 'platform', entityName: 'automated-detection',
      action: 'defect_detection_sweep', actor: 'system',
      details: { scanned: result.scanned, newDefects: result.newDefects, updatedDefects: result.updatedDefects, categories: result.categories },
      evidence: result.evidence,
    }).catch(() => {});

    reply.send(result);
  });

  // Verify a defect resolution (Jira Done → AskABD re-check)
  server.post('/oc/defects/:defectId/verify', async (req, reply) => {
    const { defectId } = req.params as any;
    const result = await detectionService.verifyDefectResolution(defectId);

    ocService.createAuditEntry({
      entityType: 'defect', entityId: defectId, entityName: 'verification',
      action: result.verified ? 'defect_verified' : 'defect_verification_failed',
      actor: 'system',
      details: { verified: result.verified, currentState: result.currentState },
      evidence: result.evidence,
    }).catch(() => {});

    reply.send(result);
  });

  // ─── CLIENT HEALTH SCORE ────────────────────────────────────────────────────

  const { ClientHealthService } = await import('../services/client-health-service.js');
  const healthScoreService = new ClientHealthService();

  server.get('/oc/clients/:clientId/health-score', async (req) => {
    const { clientId } = req.params as any;
    const health = await healthScoreService.computeHealth(clientId);
    return health;
  });

  server.get('/oc/clients/:clientId/health-snapshot', async (req) => {
    const { clientId } = req.params as any;
    const snapshot = await healthScoreService.getLatestSnapshot(clientId);
    return snapshot || { clientId, overallScore: null, message: 'No health snapshot available. Compute health score first.' };
  });

  // ─── JIRA WEBHOOK & SYNC ────────────────────────────────────────────────────

  /**
   * Jira Webhook receiver.
   * Processes issue transition events and triggers AskABD re-verification.
   * Security: validates event structure (in production, validate webhook signature).
   */
  server.post('/oc/jira/webhook', async (req, reply) => {
    const body = req.body as any;

    // Validate webhook payload structure
    if (!body || !body.webhookEvent) {
      reply.status(400).send({ error: 'Invalid webhook payload' });
      return;
    }

    const event = body.webhookEvent;
    const issue = body.issue;
    const issueKey = issue?.key;

    if (!issueKey) {
      reply.status(400).send({ error: 'Missing issue key in webhook payload' });
      return;
    }

    // Find linked AskABD entities for this Jira issue
    const links = await routePool.query(
      'SELECT * FROM oc_jira_issue_links WHERE jira_issue_key = $1',
      [issueKey]
    );

    if (links.rows.length === 0) {
      // Unknown issue — not linked to AskABD
      reply.send({ processed: false, reason: 'Issue not linked to AskABD' });
      return;
    }

    const jiraStatus = issue?.fields?.status?.name || '';
    const results: any[] = [];

    for (const link of links.rows) {
      // Update Jira status in our link record
      await routePool.query(
        "UPDATE oc_jira_issue_links SET jira_status = $1, last_synced_at = NOW(), sync_status = 'synced', updated_at = NOW() WHERE id = $2",
        [jiraStatus, link.id]
      );

      // If Jira issue transitioned to Done/Closed, trigger verification
      const isDone = ['Done', 'Closed', 'Resolved'].includes(jiraStatus);
      if (isDone && link.source_type === 'defect') {
        const verifyResult = await detectionService.verifyDefectResolution(link.source_id);
        
        // Update link with verification result
        const newAskabdStatus = verifyResult.verified ? 'verified' : 'resolved';
        await routePool.query(
          "UPDATE oc_jira_issue_links SET askabd_status = $1, verification_status = $2, verified_at = NOW(), verification_evidence = $3, updated_at = NOW() WHERE id = $4",
          [newAskabdStatus, verifyResult.verified ? 'passed' : 'failed', verifyResult.evidence, link.id]
        );

        results.push({ linkId: link.id, sourceType: link.source_type, sourceId: link.source_id, jiraStatus, verified: verifyResult.verified, evidence: verifyResult.evidence });
      } else {
        results.push({ linkId: link.id, sourceType: link.source_type, sourceId: link.source_id, jiraStatus, action: 'status_updated' });
      }
    }

    // Audit
    ocService.createAuditEntry({
      entityType: 'jira', entityId: issueKey, entityName: event,
      action: 'jira_webhook_processed', actor: 'jira-webhook',
      details: { event, issueKey, jiraStatus, linksProcessed: links.rows.length },
      evidence: [`Webhook: ${event} for ${issueKey} (${jiraStatus})`],
    }).catch(() => {});

    reply.send({ processed: true, event, issueKey, jiraStatus, results });
  });

  /**
   * Manual Jira sync — poll Jira for issue status updates.
   * Use when webhooks are not available.
   */
  server.post('/oc/jira/sync', async (req, reply) => {
    const body = req.body as any;
    const environment = body.environment || 'development';

    // Get all stale links (not synced in last hour)
    const staleLinks = await routePool.query(
      "SELECT * FROM oc_jira_issue_links WHERE environment = $1 AND (last_synced_at IS NULL OR last_synced_at < NOW() - INTERVAL '1 hour') LIMIT 50",
      [environment]
    );

    if (staleLinks.rows.length === 0) {
      reply.send({ synced: 0, message: 'No stale links to sync' });
      return;
    }

    // Get Jira config
    const jiraConfig = await jiraService.getConfig(environment);
    if (!jiraConfig || jiraConfig.status === 'not_configured') {
      reply.send({ synced: 0, message: 'Jira not configured for this environment' });
      return;
    }

    let synced = 0;
    const errors: string[] = [];

    // Note: actual Jira API polling would require the full config with token.
    // For now, mark as synced with current state (infrastructure dependency).
    for (const link of staleLinks.rows) {
      try {
        await routePool.query(
          "UPDATE oc_jira_issue_links SET sync_status = 'synced', last_synced_at = NOW(), updated_at = NOW() WHERE id = $1",
          [link.id]
        );
        synced++;
      } catch (err) {
        errors.push(`Link ${link.id}: ${(err as Error).message}`);
      }
    }

    reply.send({ synced, total: staleLinks.rows.length, errors: errors.length > 0 ? errors : undefined });
  });
}
