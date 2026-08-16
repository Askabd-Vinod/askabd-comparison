/**
 * AskABD Payment Method Service
 *
 * Provider-agnostic payment method management.
 * NEVER stores: full PAN, CVV, PIN, passwords, provider secrets.
 * Only stores safe metadata (type, last4, brand, status).
 * All operations are client-scoped and audited.
 */
import { sharedPool } from './db-pool.js';
import { OperationsCenterService } from './operations-center-service.js';
import { WorkflowAutomationService } from './workflow-automation-service.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AddPaymentMethodInput {
  provider?: string;
  providerCustomerId?: string;
  providerPaymentMethodId?: string;
  type: string;
  brand?: string;
  last4?: string;
  expiryMonth?: number;
  expiryYear?: number;
  displayName: string;
  currency?: string;
  country?: string;
  billingName?: string;
  billingCountry?: string;
  engagementId?: string;
  metadata?: Record<string, unknown>;
}

const PAYMENT_METHOD_TRANSITIONS: Record<string, string[]> = {
  pending: ['active', 'disabled'],
  active: ['disabled'],
  disabled: ['active'],
};

const VALID_TYPES = [
  'bank_transfer', 'ach', 'wire_transfer', 'credit_card', 'debit_card',
  'upi', 'sepa', 'swift', 'payment_gateway', 'other',
];

export class PaymentMethodService {
  private audit = new OperationsCenterService();
  private workflow = new WorkflowAutomationService();

  async addPaymentMethod(clientId: string, data: AddPaymentMethodInput) {
    if (!VALID_TYPES.includes(data.type)) {
      return { success: false, error: 'invalid_type', message: `Invalid type. Allowed: ${VALID_TYPES.join(', ')}` };
    }

    // Idempotency: prevent duplicate by provider+providerPaymentMethodId
    if (data.providerPaymentMethodId) {
      const dup = await sharedPool.query(
        'SELECT id FROM oc_payment_methods WHERE client_id = $1 AND provider_payment_method_id = $2',
        [clientId, data.providerPaymentMethodId]
      );
      if (dup.rows.length > 0) {
        return { success: false, error: 'duplicate', message: 'Payment method already exists', existingId: dup.rows[0].id };
      }
    }

    const { rows } = await sharedPool.query(`
      INSERT INTO oc_payment_methods
        (client_id, engagement_id, provider, provider_customer_id, provider_payment_method_id,
         type, brand, last4, expiry_month, expiry_year, display_name, currency, country,
         billing_name, billing_country, metadata)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *
    `, [
      clientId, data.engagementId || null, data.provider || 'manual',
      data.providerCustomerId || null, data.providerPaymentMethodId || null,
      data.type, data.brand || null, data.last4 || null,
      data.expiryMonth || null, data.expiryYear || null,
      data.displayName, data.currency || 'USD', data.country || null,
      data.billingName || null, data.billingCountry || null,
      JSON.stringify(data.metadata || {}),
    ]);

    const pm = rows[0];

    await this.audit.createAuditEntry({
      entityType: 'payment_method', entityId: pm.id, entityName: data.displayName,
      action: 'created', actor: 'admin',
      details: { type: data.type, provider: data.provider || 'manual', last4: data.last4 },
      evidence: [`Payment method "${data.displayName}" (${data.type}) added for client ${clientId}`],
    });

    await this.workflow.emitEvent({
      eventType: 'PAYMENT_METHOD_ADDED', clientId,
      entityType: 'payment_method', entityId: pm.id, entityName: data.displayName,
      actor: 'admin', severity: 'info',
      payload: { type: data.type, provider: data.provider || 'manual' },
    });

    return { success: true, paymentMethod: pm };
  }

  async listPaymentMethods(clientId: string) {
    const { rows } = await sharedPool.query(
      'SELECT * FROM oc_payment_methods WHERE client_id = $1 ORDER BY is_default DESC, created_at DESC',
      [clientId]
    );
    return rows;
  }

  async getPaymentMethod(id: string, clientId?: string) {
    let query = 'SELECT * FROM oc_payment_methods WHERE id = $1';
    const params: any[] = [id];
    if (clientId) { query += ' AND client_id = $2'; params.push(clientId); }
    const { rows } = await sharedPool.query(query, params);
    return rows[0] || null;
  }

  async setDefault(id: string, clientId: string) {
    const pm = await this.getPaymentMethod(id, clientId);
    if (!pm) return { success: false, error: 'not_found' };
    if (pm.status !== 'active') return { success: false, error: 'not_active', message: 'Only active payment methods can be set as default' };

    // Unset previous default
    await sharedPool.query('UPDATE oc_payment_methods SET is_default = false, updated_at = NOW() WHERE client_id = $1 AND is_default = true', [clientId]);
    // Set new default
    await sharedPool.query('UPDATE oc_payment_methods SET is_default = true, updated_at = NOW() WHERE id = $1', [id]);

    await this.audit.createAuditEntry({
      entityType: 'payment_method', entityId: id, entityName: pm.display_name,
      action: 'set_default', actor: 'admin',
      details: { clientId }, evidence: [`Default payment method set to "${pm.display_name}"`],
    });

    await this.workflow.emitEvent({
      eventType: 'PAYMENT_METHOD_CHANGED', clientId,
      entityType: 'payment_method', entityId: id, entityName: pm.display_name,
      actor: 'admin', severity: 'info', payload: { action: 'set_default' },
    });

    return { success: true };
  }

  async verify(id: string, clientId: string) {
    const pm = await this.getPaymentMethod(id, clientId);
    if (!pm) return { success: false, error: 'not_found' };

    await sharedPool.query(
      `UPDATE oc_payment_methods SET status = 'active', verification_status = 'verified', verified_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [id]
    );

    await this.audit.createAuditEntry({
      entityType: 'payment_method', entityId: id, entityName: pm.display_name,
      action: 'verified', actor: 'admin',
      details: { clientId }, evidence: [`Payment method "${pm.display_name}" verified`],
    });

    await this.workflow.emitEvent({
      eventType: 'PAYMENT_METHOD_VERIFIED', clientId,
      entityType: 'payment_method', entityId: id, entityName: pm.display_name,
      actor: 'admin', severity: 'info', payload: { type: pm.type },
    });

    return { success: true };
  }

  async disable(id: string, clientId: string) {
    const pm = await this.getPaymentMethod(id, clientId);
    if (!pm) return { success: false, error: 'not_found' };
    if (pm.status === 'disabled') return { success: false, error: 'already_disabled' };

    await sharedPool.query(
      `UPDATE oc_payment_methods SET status = 'disabled', is_default = false, updated_at = NOW() WHERE id = $1`, [id]
    );

    await this.audit.createAuditEntry({
      entityType: 'payment_method', entityId: id, entityName: pm.display_name,
      action: 'disabled', actor: 'admin',
      details: { clientId }, evidence: [`Payment method "${pm.display_name}" disabled`],
    });

    await this.workflow.emitEvent({
      eventType: 'PAYMENT_METHOD_DISABLED', clientId,
      entityType: 'payment_method', entityId: id, entityName: pm.display_name,
      actor: 'admin', severity: 'info', payload: { type: pm.type },
    });

    return { success: true };
  }
}
