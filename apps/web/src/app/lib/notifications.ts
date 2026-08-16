/**
 * AskABD Standard Notification System
 * Sends email notifications to designated contacts when changes occur.
 * All notifications follow the AskABD Standard format.
 */

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

export type NotificationPhase =
  | 'onboarding'
  | 'service-change'
  | 'incident'
  | 'remediation'
  | 'deployment'
  | 'maintenance'
  | 'escalation'
  | 'resolution';

export type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';

export interface NotificationRecipient {
  name: string;
  email: string;
  role: string;
  phases: NotificationPhase[]; // Which phases this person gets notified for
}

export interface NotificationPayload {
  clientId: string;
  clientName: string;
  phase: NotificationPhase;
  priority: NotificationPriority;
  subject: string;
  summary: string;
  details: {
    action: string;
    performedBy: string;
    timestamp: string;
    environment?: string;
    impactLevel?: string;
    affectedServices?: string[];
    nextSteps?: string;
    rollbackPlan?: string;
  };
  recipients: NotificationRecipient[];
  evidence?: string[];
}

/**
 * Send a notification following AskABD Standard format.
 * This calls the API which will queue the email for delivery.
 */
export async function sendNotification(payload: NotificationPayload): Promise<{ success: boolean; notificationId?: string }> {
  try {
    const res = await fetch(`${API}/api/v1/oc/notifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { success: false };
    const data = await res.json();
    return { success: true, notificationId: data.notification?.id };
  } catch {
    // Graceful fallback — log locally if API is unavailable
    console.info('[AskABD Notification]', payload.subject, '→', payload.recipients.map(r => r.email).join(', '));
    return { success: false };
  }
}

/**
 * Formats the AskABD Standard notification email body.
 * Used by the API to generate the actual email content.
 */
export function formatNotificationEmail(payload: NotificationPayload): string {
  const priorityEmoji: Record<NotificationPriority, string> = {
    low: '🟢', medium: '🟡', high: '🟠', critical: '🔴',
  };

  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  AskABD Enterprise Operations Centre — Notification
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${priorityEmoji[payload.priority]} Priority: ${payload.priority.toUpperCase()}
📋 Client: ${payload.clientName}
🏷️ Phase: ${payload.phase}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ${payload.subject}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${payload.summary}

DETAILS
───────
• Action: ${payload.details.action}
• Performed By: ${payload.details.performedBy}
• Timestamp: ${payload.details.timestamp}
${payload.details.environment ? `• Environment: ${payload.details.environment}` : ''}
${payload.details.impactLevel ? `• Impact Level: ${payload.details.impactLevel}` : ''}
${payload.details.affectedServices?.length ? `• Affected Services: ${payload.details.affectedServices.join(', ')}` : ''}
${payload.details.nextSteps ? `\nNEXT STEPS\n──────────\n${payload.details.nextSteps}` : ''}
${payload.details.rollbackPlan ? `\nROLLBACK PLAN\n─────────────\n${payload.details.rollbackPlan}` : ''}
${payload.evidence?.length ? `\nEVIDENCE\n────────\n${payload.evidence.map(e => `• ${e}`).join('\n')}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This is an automated notification from AskABD Enterprise Operations Centre.
Do not reply to this email. For questions, contact your AskABD account manager.

© ${new Date().getFullYear()} AskABD Technologies — hello@askabd.com
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`.trim();
}

/**
 * Helper to get recipients for a specific phase from the client's notification settings.
 */
export function getRecipientsForPhase(allRecipients: NotificationRecipient[], phase: NotificationPhase): NotificationRecipient[] {
  return allRecipients.filter(r => r.phases.includes(phase));
}

/**
 * Standard notification subjects per phase.
 */
export function getStandardSubject(phase: NotificationPhase, action: string, clientName: string): string {
  const subjects: Record<NotificationPhase, string> = {
    'onboarding': `[AskABD] New Client Onboarded — ${clientName}`,
    'service-change': `[AskABD] Service Change — ${action} — ${clientName}`,
    'incident': `[AskABD] Incident Alert — ${action} — ${clientName}`,
    'remediation': `[AskABD] Remediation ${action} — ${clientName}`,
    'deployment': `[AskABD] Deployment — ${action} — ${clientName}`,
    'maintenance': `[AskABD] Scheduled Maintenance — ${action} — ${clientName}`,
    'escalation': `[AskABD] ⚠ Escalation — ${action} — ${clientName}`,
    'resolution': `[AskABD] ✓ Resolved — ${action} — ${clientName}`,
  };
  return subjects[phase];
}
