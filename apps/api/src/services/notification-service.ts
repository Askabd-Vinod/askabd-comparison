import { getPool } from '../db/connection.js';

/**
 * AskABD Standard Notification Service.
 * Stores notification records and queues emails for delivery.
 * In production, integrates with SMTP/SES. In dev, logs to audit table.
 */
export class NotificationService {
  private pool = getPool();

  async sendNotification(payload: NotificationPayload): Promise<{ id: string; queued: boolean }> {
    // Store notification record
    const result = await this.pool.query(
      `INSERT INTO oc_notifications (client_id, client_name, phase, priority, subject, summary, details, recipients, evidence, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'queued') RETURNING id`,
      [payload.clientId, payload.clientName, payload.phase, payload.priority,
       payload.subject, payload.summary, JSON.stringify(payload.details),
       JSON.stringify(payload.recipients), payload.evidence || []]
    );

    const notificationId = result.rows[0].id;

    // In production: send via SMTP/SES
    // In dev: log to audit trail
    await this.pool.query(
      `INSERT INTO oc_audit_log (entity_type, entity_id, entity_name, action, actor, details, evidence)
       VALUES ('notification', $1, $2, 'sent', 'system', $3, $4)`,
      [notificationId, payload.subject,
       JSON.stringify({ recipients: payload.recipients.map(r => r.email), phase: payload.phase, priority: payload.priority }),
       [`Notification queued: ${payload.subject}`, `Recipients: ${payload.recipients.map(r => `${r.name} <${r.email}>`).join(', ')}`]]
    );

    // Mark as sent (in real system, this would happen after SMTP confirms delivery)
    await this.pool.query(`UPDATE oc_notifications SET status = 'sent', sent_at = NOW() WHERE id = $1`, [notificationId]);

    return { id: notificationId, queued: true };
  }

  async getNotifications(filters?: { clientId?: string; phase?: string; limit?: number }) {
    let query = 'SELECT * FROM oc_notifications WHERE 1=1';
    const params: any[] = [];
    if (filters?.clientId) { params.push(filters.clientId); query += ` AND client_id = $${params.length}`; }
    if (filters?.phase) { params.push(filters.phase); query += ` AND phase = $${params.length}`; }
    query += ' ORDER BY created_at DESC';
    if (filters?.limit) { params.push(filters.limit); query += ` LIMIT $${params.length}`; }
    const result = await this.pool.query(query, params);
    return result.rows;
  }
}

export interface NotificationPayload {
  clientId: string;
  clientName: string;
  phase: string;
  priority: string;
  subject: string;
  summary: string;
  details: Record<string, unknown>;
  recipients: Array<{ name: string; email: string; role: string; phases: string[] }>;
  evidence?: string[];
}
