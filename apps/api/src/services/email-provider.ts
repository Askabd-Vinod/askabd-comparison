/**
 * AskABD Email Provider Abstraction
 * Supports: Mailpit (DEV), SMTP, AWS SES (production-ready architecture).
 * Provider selected via environment configuration.
 * Never exposes credentials. Supports retry.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  from?: string;
  correlationId?: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  provider: string;
  error?: string;
  attempts: number;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<EmailResult>;
  name: string;
}

// ─── Mailpit Provider (DEV) ───────────────────────────────────────────────────

class MailpitProvider implements EmailProvider {
  name = 'mailpit';

  async send(msg: EmailMessage): Promise<EmailResult> {
    const nodemailer = await import('nodemailer').catch(() => null);
    if (!nodemailer) return { success: false, provider: this.name, error: 'nodemailer not available', attempts: 1 };

    const transport = nodemailer.createTransport({ host: 'localhost', port: 1025, secure: false });
    const result = await transport.sendMail({
      from: msg.from || 'AskABD <noreply@askabd.com>',
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      headers: msg.correlationId ? { 'X-Correlation-ID': msg.correlationId } : undefined,
    });
    return { success: true, messageId: result.messageId, provider: this.name, attempts: 1 };
  }
}

// ─── SMTP Provider (Production) ───────────────────────────────────────────────

class SmtpProvider implements EmailProvider {
  name = 'smtp';

  async send(msg: EmailMessage): Promise<EmailResult> {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587');
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host) return { success: false, provider: this.name, error: 'SMTP_HOST not configured', attempts: 1 };

    const nodemailer = await import('nodemailer').catch(() => null);
    if (!nodemailer) return { success: false, provider: this.name, error: 'nodemailer not available', attempts: 1 };

    const transport = nodemailer.createTransport({ host, port, secure: port === 465, auth: user ? { user, pass } : undefined });
    const result = await transport.sendMail({ from: msg.from || 'AskABD <noreply@askabd.com>', to: msg.to, subject: msg.subject, html: msg.html });
    return { success: true, messageId: result.messageId, provider: this.name, attempts: 1 };
  }
}

// ─── AWS SES Provider (Production) ────────────────────────────────────────────

class SesProvider implements EmailProvider {
  name = 'ses';
  private client: any = null;

  private async getClient(): Promise<any> {
    if (this.client) return this.client;
    try {
      const { SESv2Client } = await import('@aws-sdk/client-sesv2');
      this.client = new SESv2Client({ region: process.env.SES_REGION || process.env.AWS_REGION || 'us-east-1' });
      return this.client;
    } catch (err) {
      throw new Error(`[SES] Failed to load @aws-sdk/client-sesv2: ${(err as Error).message}`);
    }
  }

  async send(msg: EmailMessage): Promise<EmailResult> {
    try {
      const ses = await this.getClient();
      const { SendEmailCommand } = await import('@aws-sdk/client-sesv2');

      const command = new SendEmailCommand({
        FromEmailAddress: msg.from || `AskABD <noreply@${process.env.SES_DOMAIN || 'askabd.com'}>`,
        Destination: { ToAddresses: [msg.to] },
        Content: {
          Simple: {
            Subject: { Data: msg.subject, Charset: 'UTF-8' },
            Body: { Html: { Data: msg.html, Charset: 'UTF-8' } },
          },
        },
        ...(msg.correlationId ? { EmailTags: [{ Name: 'CorrelationId', Value: msg.correlationId }] } : {}),
      });

      const result = await ses.send(command);
      return { success: true, messageId: result.MessageId, provider: this.name, attempts: 1 };
    } catch (err) {
      return { success: false, provider: this.name, error: (err as Error).message, attempts: 1 };
    }
  }
}

// ─── Provider Factory ─────────────────────────────────────────────────────────

let _provider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (_provider) return _provider;

  const providerName = process.env.EMAIL_PROVIDER || 'mailpit';
  switch (providerName) {
    case 'ses': _provider = new SesProvider(); break;
    case 'smtp': _provider = new SmtpProvider(); break;
    default: _provider = new MailpitProvider(); break;
  }
  console.log(`[EMAIL] Provider initialized: ${_provider.name}`);
  return _provider;
}

/** Reset provider singleton (for testing) */
export function resetEmailProvider(): void {
  _provider = null;
}

/** Send email with bounded retry (max 3 attempts) */
export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  const provider = getEmailProvider();
  let lastError = '';

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await provider.send(msg);
      if (result.success) return { ...result, attempts: attempt };
      lastError = result.error || 'Unknown failure';
    } catch (err) {
      lastError = (err as Error).message;
    }
    if (attempt < 3) await new Promise(r => setTimeout(r, 500 * attempt));
  }

  return { success: false, provider: provider.name, error: lastError, attempts: 3 };
}
