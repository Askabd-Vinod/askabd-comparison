/**
 * AskABD Client Service Requirements Service
 * Manages what information clients must provide for each lifecycle stage.
 * PostgreSQL-persisted, auditable, version-tracked.
 */

import { sharedPool } from './db-pool.js';

const dbPool = sharedPool;

export interface RequirementField {
  key: string;
  label: string;
  description?: string;
  fieldType: string; // text, textarea, email, phone, number, url, date, select, multiselect, checkbox, secret
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: string[];
  securityClassification?: string;
  validationRules?: string[]; // email, phone, url, number, date, required
}

export interface DocumentRequirement {
  key: string;
  name: string;
  description: string;
  required: boolean;
  acceptedTypes: string[]; // mime types
  maxSizeMb: number;
  expiryRequired: boolean;
}

export interface RequirementDefinition {
  requirementKey: string;
  requirementName: string;
  description: string;
  whyRequired?: string;
  fieldType: string; // legacy single-field support
  required: boolean;
  securityClassification: string;
  helpText?: string;
  placeholder?: string;
  options?: string[];
  fields?: RequirementField[]; // multi-field support
  documents?: DocumentRequirement[]; // document requirements
}

export interface ServiceRequirementDef {
  serviceId: string;
  serviceName: string;
  lifecycleStatus: string;
  requirements: RequirementDefinition[];
}

export interface ClientRequirement {
  id: string;
  clientId: string;
  serviceId: string;
  lifecycleStatus: string;
  requirementKey: string;
  requirementName: string;
  description: string;
  fieldType: string;
  required: boolean;
  status: string;
  value: string;
  fieldsData: Record<string, string>;
  validationStatus: string;
  validationMessage: string;
  securityClassification: string;
  version: number;
  updatedAt: string;
  updatedBy: string;
  whyRequired: string;
  fields?: RequirementField[];
  documents?: DocumentRequirement[];
}

// ─── SERVICE REQUIREMENT DEFINITIONS ─────────────────────────────────────────
// Defines what information is needed at each lifecycle stage.

export const serviceDefinitions: ServiceRequirementDef[] = [
  { serviceId: 'identity-verification', serviceName: 'Identity Verification', lifecycleStatus: 'otp-verified',
    requirements: [
      { requirementKey: 'business_owner_name', requirementName: 'Business Owner Name', description: 'Full name of the primary business owner', fieldType: 'text', required: true, securityClassification: 'internal' },
      { requirementKey: 'business_owner_email', requirementName: 'Business Owner Email', description: 'Verified email address for identity confirmation', fieldType: 'email', required: true, securityClassification: 'internal' },
      { requirementKey: 'organization_legal_name', requirementName: 'Legal Organization Name', description: 'Registered legal entity name', fieldType: 'text', required: true, securityClassification: 'internal' },
    ]},
  { serviceId: 'security-validation', serviceName: 'Security Validation', lifecycleStatus: 'identity-verified',
    requirements: [
      { requirementKey: 'security_contact', requirementName: 'Security Contact', description: 'Primary security representative', whyRequired: 'Required for security coordination, approvals, and incident communication during validation activities.', fieldType: 'text', required: true, securityClassification: 'internal',
        fields: [
          { key: 'full_name', label: 'Full Name', fieldType: 'text', required: true, placeholder: 'John Smith', validationRules: ['required'] },
          { key: 'email', label: 'Email', fieldType: 'email', required: true, placeholder: 'security@company.com', validationRules: ['required', 'email'] },
          { key: 'phone', label: 'Phone', fieldType: 'phone', required: true, placeholder: '+61 400 000 000', validationRules: ['required', 'phone'] },
          { key: 'designation', label: 'Designation', fieldType: 'select', required: false, options: ['CISO', 'Security Manager', 'IT Manager', 'CTO', 'DevOps Lead', 'Other'] },
        ]},
      { requirementKey: 'compliance_certification', requirementName: 'Compliance Certification', description: 'Applicable compliance standards and certification evidence', whyRequired: 'AskABD must verify the client meets minimum compliance standards before accessing their systems.', fieldType: 'text', required: true, securityClassification: 'internal',
        fields: [
          { key: 'framework', label: 'Compliance Framework', fieldType: 'select', required: true, options: ['ISO 27001', 'SOC 2 Type II', 'PCI-DSS', 'HIPAA', 'GDPR', 'FedRAMP', 'Other'], validationRules: ['required'] },
          { key: 'certification_status', label: 'Certification Status', fieldType: 'select', required: true, options: ['Certified', 'In Progress', 'Planned', 'Not Applicable'], validationRules: ['required'] },
          { key: 'certificate_number', label: 'Certificate Number', fieldType: 'text', required: false, placeholder: 'CERT-2024-XXXXX' },
          { key: 'expiry_date', label: 'Certificate Expiry', fieldType: 'date', required: false },
          { key: 'certifying_org', label: 'Certifying Organization', fieldType: 'text', required: false, placeholder: 'BSI, Schellman, etc.' },
        ],
        documents: [
          { key: 'iso_certificate', name: 'Compliance Certificate', description: 'Current compliance certification document', required: true, acceptedTypes: ['application/pdf'], maxSizeMb: 10, expiryRequired: true },
          { key: 'security_policy', name: 'Security Policy', description: 'Organization security policy document', required: false, acceptedTypes: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], maxSizeMb: 20, expiryRequired: false },
        ]},
      { requirementKey: 'authentication_preference', requirementName: 'Authentication Configuration', description: 'Preferred authentication method for AskABD platform access', whyRequired: 'AskABD must configure secure authentication aligned with the client security architecture.', fieldType: 'select', required: true, securityClassification: 'internal',
        fields: [
          { key: 'auth_method', label: 'Authentication Method', fieldType: 'select', required: true, options: ['SSO (SAML)', 'SSO (OIDC)', 'OAuth 2.0', 'API Key', 'MFA + Password'], validationRules: ['required'] },
          { key: 'idp_url', label: 'Identity Provider URL', fieldType: 'url', required: false, placeholder: 'https://login.company.com', validationRules: ['url'] },
          { key: 'mfa_required', label: 'MFA Required', fieldType: 'checkbox', required: false },
        ]},
      { requirementKey: 'encryption_requirements', requirementName: 'Encryption Requirements', description: 'Data encryption standards', whyRequired: 'Ensures AskABD handles client data according to required encryption standards.', fieldType: 'text', required: false, securityClassification: 'internal', placeholder: 'AES-256, TLS 1.3' },
      { requirementKey: 'network_restrictions', requirementName: 'Network Restrictions', description: 'IP allowlists, VPN requirements, or network access restrictions', whyRequired: 'AskABD must comply with network access controls when connecting to client systems.', fieldType: 'textarea', required: false, securityClassification: 'confidential' },
    ]},
  { serviceId: 'environment-registration', serviceName: 'Environment Registration', lifecycleStatus: 'security-validated',
    requirements: [
      { requirementKey: 'environment_list', requirementName: 'Environment List', description: 'All environments the client operates (dev, test, staging, prod)', fieldType: 'text', required: true, securityClassification: 'internal', placeholder: 'Development, Staging, Production' },
      { requirementKey: 'primary_cloud_provider', requirementName: 'Primary Cloud Provider', description: 'Main cloud infrastructure provider', fieldType: 'select', required: true, securityClassification: 'internal', options: ['AWS', 'Azure', 'Google Cloud', 'On-Premise', 'Hybrid', 'Other'] },
      { requirementKey: 'infrastructure_contact', requirementName: 'Infrastructure Contact', description: 'Technical contact for infrastructure access', fieldType: 'email', required: true, securityClassification: 'internal' },
      { requirementKey: 'vpn_requirements', requirementName: 'VPN/Network Access', description: 'VPN or network access requirements for AskABD to reach environments', fieldType: 'textarea', required: false, securityClassification: 'confidential' },
    ]},
  { serviceId: 'connector-configuration', serviceName: 'Connector Configuration', lifecycleStatus: 'environment-registered',
    requirements: [
      { requirementKey: 'database_host', requirementName: 'Database Host', description: 'Primary database hostname or IP address', fieldType: 'text', required: true, securityClassification: 'confidential', placeholder: 'db.example.com' },
      { requirementKey: 'database_port', requirementName: 'Database Port', description: 'Database port number', fieldType: 'number', required: true, securityClassification: 'internal', placeholder: '5432' },
      { requirementKey: 'database_name', requirementName: 'Database Name', description: 'Target database name', fieldType: 'text', required: true, securityClassification: 'internal' },
      { requirementKey: 'database_username', requirementName: 'Database Username', description: 'Read-only database user for AskABD access', fieldType: 'text', required: true, securityClassification: 'confidential' },
      { requirementKey: 'database_password', requirementName: 'Database Password', description: 'Database password (stored securely)', fieldType: 'secret', required: true, securityClassification: 'secret' },
      { requirementKey: 'database_ssl', requirementName: 'SSL Mode', description: 'SSL connection requirement', fieldType: 'select', required: false, securityClassification: 'internal', options: ['disable', 'prefer', 'require', 'verify-ca', 'verify-full'] },
    ]},
  { serviceId: 'discovery', serviceName: 'Infrastructure Discovery', lifecycleStatus: 'connectors-configured',
    requirements: [
      { requirementKey: 'discovery_scope', requirementName: 'Discovery Scope', description: 'Systems and boundaries for discovery scanning', fieldType: 'textarea', required: true, securityClassification: 'internal', placeholder: 'All production databases, application servers, and cloud resources' },
      { requirementKey: 'readonly_consent', requirementName: 'Read-Only Consent', description: 'Confirmation that AskABD may perform read-only scanning', fieldType: 'checkbox', required: true, securityClassification: 'internal' },
    ]},
];

export class RequirementsService {

  /**
   * Get or initialize requirements for a client at a specific service/stage
   */
  async getRequirements(clientId: string, serviceId: string): Promise<ClientRequirement[]> {
    // Check if requirements exist in DB
    const existing = await dbPool.query(
      'SELECT * FROM oc_client_service_requirements WHERE client_id = $1 AND service_id = $2 ORDER BY requirement_key',
      [clientId, serviceId]
    );

    if (existing.rows.length > 0) {
      return existing.rows.map(this.mapRow);
    }

    // Initialize from service definitions (batch insert for performance)
    const def = serviceDefinitions.find(s => s.serviceId === serviceId);
    if (!def) return [];

    const values: any[] = [];
    const placeholders: string[] = [];
    let paramIdx = 1;
    for (const req of def.requirements) {
      placeholders.push(`($${paramIdx}, $${paramIdx+1}, $${paramIdx+2}, $${paramIdx+3}, $${paramIdx+4}, $${paramIdx+5}, $${paramIdx+6}, $${paramIdx+7}, $${paramIdx+8})`);
      values.push(clientId, serviceId, def.lifecycleStatus, req.requirementKey, req.requirementName, req.description, req.fieldType, req.required, req.securityClassification);
      paramIdx += 9;
    }

    if (placeholders.length > 0) {
      await dbPool.query(`
        INSERT INTO oc_client_service_requirements (client_id, service_id, lifecycle_status, requirement_key, requirement_name, description, field_type, required, security_classification)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (client_id, service_id, requirement_key) DO NOTHING
      `, values);
    }

    const fresh = await dbPool.query(
      'SELECT * FROM oc_client_service_requirements WHERE client_id = $1 AND service_id = $2 ORDER BY requirement_key',
      [clientId, serviceId]
    );
    return fresh.rows.map(this.mapRow);
  }

  /**
   * Update a requirement value or multi-field values. Creates history entry.
   * Auto-initializes the requirement if it doesn't exist yet (handles race condition
   * where save is attempted before GET initializes the records).
   *
   * Transactional: the UPDATE and its history entry are committed atomically —
   * either both happen or neither does (no partial requirement state on error).
   *
   * Idempotent: if the incoming value/fieldsData is identical to what's already
   * stored, this is a no-op (no version bump, no duplicate history row). This
   * makes a retried save (e.g. after a client-side timeout on an already-committed
   * write) safe to repeat.
   */
  async updateRequirement(clientId: string, serviceId: string, requirementKey: string, value: string, actor: string, fieldsData?: Record<string, string>): Promise<ClientRequirement | null> {
    // Get current record (auto-initializing if missing) — read-only, outside the write transaction.
    let current = await dbPool.query(
      'SELECT * FROM oc_client_service_requirements WHERE client_id = $1 AND service_id = $2 AND requirement_key = $3',
      [clientId, serviceId, requirementKey]
    );

    // Auto-initialize if not found (race condition: save before GET)
    if (current.rows.length === 0) {
      // Trigger full initialization for this service
      await this.getRequirements(clientId, serviceId);
      // Re-query after initialization
      current = await dbPool.query(
        'SELECT * FROM oc_client_service_requirements WHERE client_id = $1 AND service_id = $2 AND requirement_key = $3',
        [clientId, serviceId, requirementKey]
      );
      if (current.rows.length === 0) return null; // Truly unknown requirement key
    }

    const row = current.rows[0];
    const oldValue = row.value || '';

    // Determine status based on field completion
    const def = serviceDefinitions.flatMap(s => s.requirements).find(r => r.requirementKey === requirementKey);
    let newStatus = 'not_provided';
    if (def?.fields && fieldsData) {
      const requiredFields = def.fields.filter(f => f.required);
      const allRequiredFilled = requiredFields.every(f => (fieldsData[f.key] || '').trim().length > 0);
      const anyFilled = Object.values(fieldsData).some(v => v.trim().length > 0);
      newStatus = allRequiredFilled ? 'provided' : anyFilled ? 'in_progress' : 'not_provided';

      // Field validation
      const validationErrors = this.validateFields(def.fields, fieldsData);
      if (validationErrors.length > 0 && allRequiredFilled) {
        newStatus = 'invalid';
      }
    } else {
      newStatus = value.trim() ? 'provided' : 'not_provided';
    }

    // If value changed and was previously validated, mark validation outdated
    const newValidationStatus = (oldValue !== value && row.validation_status === 'passed') ? 'outdated' : row.validation_status;
    const finalFieldsData = fieldsData ? JSON.stringify(fieldsData) : (row.fields_data ? JSON.stringify(row.fields_data) : '{}');

    // Idempotency guard: nothing actually changed (e.g. a retried save whose
    // original request already committed) — skip the write, no duplicate history.
    const existingFieldsData = JSON.stringify(row.fields_data || {});
    const noOp = oldValue === value && finalFieldsData === existingFieldsData && newStatus === row.status && newValidationStatus === row.validation_status;
    if (noOp) {
      return this.mapRow(row);
    }

    const newVersion = (row.version || 1) + 1;

    // Mask secrets for the history entry
    const safeOld = row.security_classification === 'secret' ? (oldValue ? '••••••••' : '') : oldValue;
    const safeNew = row.security_classification === 'secret' ? (value ? '••••••••' : '') : value;

    // UPDATE + history INSERT are atomic: both commit together, or neither does.
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');

      await client.query(`
        UPDATE oc_client_service_requirements
        SET value = $1, status = $2, validation_status = $3, updated_at = NOW(), updated_by = $4, version = $5, fields_data = $6
        WHERE client_id = $7 AND service_id = $8 AND requirement_key = $9
      `, [value, newStatus, newValidationStatus, actor, newVersion, finalFieldsData, clientId, serviceId, requirementKey]);

      await client.query(`
        INSERT INTO oc_client_service_requirement_history (requirement_id, client_id, service_id, requirement_key, old_value, new_value, old_status, new_status, changed_by, version)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [row.id, clientId, serviceId, requirementKey, safeOld, safeNew, row.status, newStatus, actor, newVersion]);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    // Return updated record (read-only, post-commit)
    const updated = await dbPool.query(
      'SELECT * FROM oc_client_service_requirements WHERE client_id = $1 AND service_id = $2 AND requirement_key = $3',
      [clientId, serviceId, requirementKey]
    );
    return updated.rows.length > 0 ? this.mapRow(updated.rows[0]) : null;
  }

  /**
   * Validate field values against their rules
   */
  private validateFields(fields: RequirementField[], data: Record<string, string>): string[] {
    const errors: string[] = [];
    for (const field of fields) {
      const val = (data[field.key] || '').trim();
      if (field.required && !val) { errors.push(`${field.label} is required`); continue; }
      if (!val) continue;

      for (const rule of (field.validationRules || [])) {
        switch (rule) {
          case 'email': if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) errors.push(`${field.label}: invalid email`); break;
          case 'phone': if (!/^[\d\s\+\-\(\)]{7,20}$/.test(val)) errors.push(`${field.label}: invalid phone`); break;
          case 'url': try { new URL(val); } catch { errors.push(`${field.label}: invalid URL`); } break;
          case 'number': if (isNaN(Number(val))) errors.push(`${field.label}: must be a number`); break;
          case 'date': if (isNaN(Date.parse(val))) errors.push(`${field.label}: invalid date`); break;
        }
      }
    }
    return errors;
  }

  /**
   * Get history for a requirement
   */
  async getHistory(clientId: string, serviceId: string, requirementKey: string): Promise<any[]> {
    const res = await dbPool.query(
      'SELECT * FROM oc_client_service_requirement_history WHERE client_id = $1 AND service_id = $2 AND requirement_key = $3 ORDER BY changed_at DESC LIMIT 20',
      [clientId, serviceId, requirementKey]
    );
    return res.rows;
  }

  /**
   * Get readiness summary including fields AND documents — with exact blockers and next action
   */
  async getReadiness(clientId: string, serviceId: string): Promise<{ total: number; provided: number; required: number; requiredProvided: number; blocking: string[]; blockers: any[]; documents: { required: number; uploaded: number; valid: number; expired: number }; nextAction: any | null; status: string }> {
    const reqs = await this.getRequirements(clientId, serviceId);
    const required = reqs.filter(r => r.required);
    const provided = reqs.filter(r => r.status === 'provided' || r.status === 'valid');
    const requiredProvided = required.filter(r => r.status === 'provided' || r.status === 'valid');

    // Calculate document readiness
    let docsRequired = 0, docsUploaded = 0, docsValid = 0, docsExpired = 0;
    const docBlockers: any[] = [];
    for (const req of reqs) {
      const def = serviceDefinitions.flatMap(s => s.requirements).find(r => r.requirementKey === req.requirementKey);
      if (!def?.documents) continue;
      for (const docDef of def.documents) {
        if (docDef.required) docsRequired++;
        // Check if document exists in database
        try {
          const docRes = await dbPool.query(
            "SELECT status, expiry_date FROM oc_client_service_documents WHERE client_id = $1 AND service_id = $2 AND requirement_key = $3 AND status NOT IN ('superseded', 'replaced') ORDER BY version DESC LIMIT 1",
            [clientId, serviceId, req.requirementKey]
          );
          if (docRes.rows.length > 0) {
            docsUploaded++;
            const doc = docRes.rows[0];
            if (doc.status === 'valid') docsValid++;
            if (doc.expiry_date && new Date(doc.expiry_date) <= new Date()) {
              docsExpired++;
              if (docDef.required) docBlockers.push({ type: 'document', requirementKey: req.requirementKey, documentKey: docDef.key, message: `${docDef.name} has expired`, action: 'replace_document' });
            } else if (docDef.required && doc.status === 'uploaded') {
              docsValid++; // Uploaded counts as structurally valid for readiness
            }
          } else if (docDef.required) {
            docBlockers.push({ type: 'document', requirementKey: req.requirementKey, documentKey: docDef.key, message: `${docDef.name} is required`, action: 'upload_document' });
          }
        } catch { /* skip */ }
      }
    }

    // Calculate field blockers
    const fieldBlockers: any[] = [];
    for (const req of required) {
      if (req.status === 'not_provided' || req.status === 'invalid' || req.status === 'blocked') {
        const def = serviceDefinitions.flatMap(s => s.requirements).find(r => r.requirementKey === req.requirementKey);
        if (def?.fields) {
          const vals = req.fieldsData || {};
          for (const f of def.fields) {
            if (f.required && !(vals[f.key] || '').trim()) {
              fieldBlockers.push({ type: 'field', requirementKey: req.requirementKey, fieldKey: f.key, message: `${req.requirementName} → ${f.label} is required`, action: 'provide_information' });
            }
          }
          if (fieldBlockers.filter(b => b.requirementKey === req.requirementKey).length === 0) {
            fieldBlockers.push({ type: 'field', requirementKey: req.requirementKey, fieldKey: '', message: `${req.requirementName} is required`, action: 'provide_information' });
          }
        } else {
          fieldBlockers.push({ type: 'field', requirementKey: req.requirementKey, fieldKey: '', message: `${req.requirementName} is required`, action: 'provide_information' });
        }
      }
    }

    const allBlockers = [...fieldBlockers, ...docBlockers];
    const blocking = allBlockers.map(b => b.message);

    // Determine overall status
    const isReady = allBlockers.length === 0 && requiredProvided.length === required.length;
    const status = isReady ? 'ready' : 'blocked';

    // Next action
    const nextAction = allBlockers.length > 0 ? { label: allBlockers[0].message, action: allBlockers[0].action, requirementKey: allBlockers[0].requirementKey, fieldKey: allBlockers[0].fieldKey, documentKey: allBlockers[0].documentKey } : null;

    return { total: reqs.length, provided: provided.length, required: required.length, requiredProvided: requiredProvided.length, blocking, blockers: allBlockers, documents: { required: docsRequired, uploaded: docsUploaded, valid: docsValid, expired: docsExpired }, nextAction, status };
  }

  /**
   * Get service definitions (for UI to know what fields are available)
   */
  getServiceDefinition(serviceId: string): ServiceRequirementDef | null {
    return serviceDefinitions.find(s => s.serviceId === serviceId) || null;
  }

  getAllServiceDefinitions(): ServiceRequirementDef[] {
    return serviceDefinitions;
  }

  private mapRow(row: any): ClientRequirement {
    const def = serviceDefinitions.flatMap(s => s.requirements).find(r => r.requirementKey === row.requirement_key);
    return {
      id: row.id, clientId: row.client_id, serviceId: row.service_id,
      lifecycleStatus: row.lifecycle_status, requirementKey: row.requirement_key,
      requirementName: row.requirement_name, description: row.description,
      fieldType: row.field_type, required: row.required, status: row.status,
      value: row.security_classification === 'secret' ? (row.value ? '••••••••' : '') : (row.value || ''),
      fieldsData: row.fields_data || {},
      validationStatus: row.validation_status || 'pending',
      validationMessage: row.validation_message || '',
      securityClassification: row.security_classification || 'internal',
      version: row.version || 1, updatedAt: row.updated_at, updatedBy: row.updated_by,
      whyRequired: def?.whyRequired || row.why_required || '',
      fields: def?.fields || undefined,
      documents: def?.documents || undefined,
    };
  }
}
