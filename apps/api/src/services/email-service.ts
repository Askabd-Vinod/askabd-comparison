export type EmailStatus = 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'retrying' | 'not_configured';

export interface EmailResult {
  status: EmailStatus;
  messageId?: string;
  error?: string;
  timestamp: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Email Service — sends via SMTP (Mailpit in development, real provider in production).
 * Uses nodemailer-compatible approach via raw TCP/HTTP.
 */
export class EmailService {
  private smtpHost: string;
  private smtpPort: number;
  private smtpFrom: string;
  private configured: boolean;

  constructor() {
    this.smtpHost = process.env.SMTP_HOST || 'localhost';
    this.smtpPort = parseInt(process.env.SMTP_PORT || '1025');
    this.smtpFrom = process.env.SMTP_FROM || 'noreply@askabd.com';
    this.configured = !!process.env.SMTP_HOST;
  }

  async sendEmail(message: EmailMessage): Promise<EmailResult> {
    if (!this.configured) {
      return { status: 'not_configured', error: 'SMTP not configured. Set SMTP_HOST in environment.', timestamp: new Date().toISOString() };
    }

    try {
      // Use fetch to Mailpit's API in development (Mailpit exposes an API)
      // In production, this would use nodemailer or a provider SDK
      const response = await fetch(`http://${this.smtpHost}:8025/api/v1/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          From: { Email: this.smtpFrom, Name: 'AskABD Enterprise' },
          To: [{ Email: message.to }],
          Subject: message.subject,
          HTML: message.html,
          Text: message.text || '',
        }),
      });

      if (response.ok) {
        const data = await response.json().catch(() => ({})) as { ID?: string };
        return { status: 'sent', messageId: data.ID || `msg-${Date.now()}`, timestamp: new Date().toISOString() };
      }

      // Fallback: try raw SMTP via Mailpit's SMTP port
      return await this.sendViaSMTP(message);
    } catch (err) {
      // Try raw SMTP as fallback
      try {
        return await this.sendViaSMTP(message);
      } catch {
        return { status: 'failed', error: (err as Error).message, timestamp: new Date().toISOString() };
      }
    }
  }

  private async sendViaSMTP(message: EmailMessage): Promise<EmailResult> {
    // Minimal SMTP implementation for development
    const net = await import('net');
    return new Promise((resolve) => {
      const socket = net.connect(this.smtpPort, this.smtpHost, () => {
        const commands = [
          `HELO askabd\r\n`,
          `MAIL FROM:<${this.smtpFrom}>\r\n`,
          `RCPT TO:<${message.to}>\r\n`,
          `DATA\r\n`,
          `From: AskABD <${this.smtpFrom}>\r\nTo: ${message.to}\r\nSubject: ${message.subject}\r\nContent-Type: text/html\r\n\r\n${message.html}\r\n.\r\n`,
          `QUIT\r\n`,
        ];
        let idx = 0;
        socket.on('data', () => {
          if (idx < commands.length) {
            const command = commands[idx];
            idx++;
            if (command !== undefined) socket.write(command);
          } else {
            socket.end();
            resolve({ status: 'sent', messageId: `smtp-${Date.now()}`, timestamp: new Date().toISOString() });
          }
        });
      });
      socket.on('error', (err) => { resolve({ status: 'failed', error: err.message, timestamp: new Date().toISOString() }); });
      setTimeout(() => { socket.destroy(); resolve({ status: 'failed', error: 'SMTP timeout', timestamp: new Date().toISOString() }); }, 10000);
    });
  }

  isConfigured(): boolean { return this.configured; }
  getStatus(): EmailStatus { return this.configured ? 'sent' : 'not_configured'; }
}
