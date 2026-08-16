/**
 * AskABD Email Transport Factory
 * Environment-aware email sending.
 * 
 * DEV: Uses localhost:1025 (Mailpit) — no configuration required.
 * STAGING/PRODUCTION: Uses SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS from environment.
 * 
 * Usage:
 *   const { sendEmail } = await import('./email-transport.js');
 *   const result = await sendEmail({ to, subject, html });
 */

import { config } from '../config/env.js';

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  provider: string;
}

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

/**
 * Send an email using environment-appropriate transport.
 * - DEV/test: Mailpit on localhost:1025 (no auth required)
 * - STAGING/PRODUCTION: Configured SMTP with optional auth
 * 
 * Never throws — always returns a result object.
 */
export async function sendEmail(payload: EmailPayload): Promise<EmailSendResult> {
  const nodemailer = await import('nodemailer').catch(() => null);
  if (!nodemailer) {
    return { success: false, error: 'nodemailer module not available', provider: 'none' };
  }

  const from = payload.from || 'AskABD <noreply@askabd.com>';

  // Determine transport configuration based on environment
  const transportConfig = getTransportConfig();

  try {
    const transport = nodemailer.createTransport(transportConfig);
    const result = await transport.sendMail({
      from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
    });
    return { success: true, messageId: result.messageId, provider: transportConfig._provider };
  } catch (err) {
    return { success: false, error: (err as Error).message, provider: transportConfig._provider };
  }
}

/**
 * Check if email transport is available (non-blocking health check).
 */
export async function checkEmailHealth(): Promise<{ available: boolean; provider: string; error?: string }> {
  const transportConfig = getTransportConfig();
  const nodemailer = await import('nodemailer').catch(() => null);
  if (!nodemailer) {
    return { available: false, provider: 'none', error: 'nodemailer not installed' };
  }

  try {
    const transport = nodemailer.createTransport(transportConfig);
    await transport.verify();
    return { available: true, provider: transportConfig._provider };
  } catch (err) {
    return { available: false, provider: transportConfig._provider, error: (err as Error).message };
  }
}

/**
 * Build transport configuration from environment.
 */
function getTransportConfig(): any {
  const isDev = config.NODE_ENV === 'development' || config.NODE_ENV === 'test';

  if (isDev) {
    // DEV: Mailpit — no authentication, plain SMTP on localhost:1025
    return {
      host: 'localhost',
      port: 1025,
      secure: false,
      _provider: 'mailpit',
    };
  }

  // STAGING/PRODUCTION: Use configured SMTP
  const host = config.SMTP_HOST;
  const port = config.SMTP_PORT || 587;
  const user = config.SMTP_USER;
  const pass = config.SMTP_PASS;

  if (!host) {
    // No SMTP configured — will fail gracefully at send time
    return {
      host: 'localhost',
      port: 1025,
      secure: false,
      _provider: 'unconfigured-fallback',
    };
  }

  return {
    host,
    port,
    secure: port === 465,
    auth: user ? { user, pass } : undefined,
    _provider: `smtp:${host}:${port}`,
  };
}
