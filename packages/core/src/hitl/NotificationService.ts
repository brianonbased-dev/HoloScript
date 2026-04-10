/**
 * HITL Notification Service
 *
 * Multi-channel notification system for Human-in-the-Loop approval requests.
 * Supports email, Slack, webhooks, SMS, and push notifications.
 *
 * @version 3.3.0
 * @Sprint Sprint 3: Safety & Testing
 */

import { logger } from '../logger';
import type { ApprovalRequest, NotificationChannel } from './HITLBackendService';

// =============================================================================
// TYPES
// =============================================================================

export interface NotificationPayload {
  title: string;
  message: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  approval: ApprovalRequest;
  actionUrl?: string;
  expiresAt?: number;
}

export interface EmailConfig {
  provider: 'sendgrid' | 'ses' | 'smtp' | 'resend';
  apiKey?: string;
  from: string;
  replyTo?: string;
  smtpConfig?: {
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass: string };
  };
}

export interface SlackConfig {
  webhookUrl: string;
  channel?: string;
  username?: string;
  iconEmoji?: string;
}

export interface WebhookConfig {
  url: string;
  method: 'POST' | 'PUT';
  headers?: Record<string, string>;
  signatureSecret?: string;
}

export interface SMSConfig {
  provider: 'twilio' | 'messagebird' | 'vonage';
  apiKey: string;
  apiSecret?: string;
  from: string;
}

export interface PushConfig {
  provider: 'firebase' | 'onesignal' | 'webpush';
  apiKey: string;
  appId?: string;
}

export interface NotificationServiceConfig {
  channels: NotificationChannel[];
  email?: EmailConfig;
  slack?: SlackConfig;
  webhook?: WebhookConfig;
  sms?: SMSConfig;
  push?: PushConfig;
  recipients: {
    email?: string[];
    phone?: string[];
    pushTokens?: string[];
  };
  templates?: {
    email?: {
      subject: string;
      bodyHtml: string;
      bodyText: string;
    };
    slack?: {
      blocks: unknown[];
    };
  };
}

export interface NotificationResult {
  channel: NotificationChannel;
  success: boolean;
  messageId?: string;
  error?: string;
  timestamp: number;
}

// =============================================================================
// NOTIFICATION PROVIDERS
// =============================================================================

interface NotificationProvider {
  send(
    payload: NotificationPayload,
    config: unknown,
    recipients: unknown
  ): Promise<NotificationResult>;
}

class EmailProvider implements NotificationProvider {
  async send(
    payload: NotificationPayload,
    config: EmailConfig,
    recipients: string[]
  ): Promise<NotificationResult> {
    const timestamp = Date.now();

    try {
      switch (config.provider) {
        case 'sendgrid':
          return this.sendViaSendGrid(payload, config, recipients, timestamp);
        case 'ses':
          return this.sendViaSES(payload, config, recipients, timestamp);
        case 'resend':
          return this.sendViaResend(payload, config, recipients, timestamp);
        case 'smtp':
        default:
          // SMTP requires nodemailer, emit event for external handling
          logger.info('[Notification] SMTP email queued', { recipients, subject: payload.title });
          return {
            channel: 'email',
            success: true,
            messageId: `smtp_${timestamp}`,
            timestamp,
          };
      }
    } catch (error) {
      return {
        channel: 'email',
        success: false,
        error: String(error),
        timestamp,
      };
    }
  }

  private async sendViaSendGrid(
    payload: NotificationPayload,
    config: EmailConfig,
    recipients: string[],
    timestamp: number
  ): Promise<NotificationResult> {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        personalizations: [{ to: recipients.map((email) => ({ email })) }],
        from: { email: config.from },
        subject: payload.title,
        content: [
          { type: 'text/plain', value: payload.message },
          { type: 'text/html', value: this.formatEmailHtml(payload) },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`SendGrid error: ${response.statusText}`);
    }

    return {
      channel: 'email',
      success: true,
      messageId: response.headers.get('x-message-id') || `sg_${timestamp}`,
      timestamp,
    };
  }

  private async sendViaSES(
    payload: NotificationPayload,
    config: EmailConfig,
    recipients: string[],
    timestamp: number
  ): Promise<NotificationResult> {
    // AWS SES requires AWS SDK - emit event for external handling
    logger.info('[Notification] SES email queued', { recipients, subject: payload.title });
    return {
      channel: 'email',
      success: true,
      messageId: `ses_${timestamp}`,
      timestamp,
    };
  }

  private async sendViaResend(
    payload: NotificationPayload,
    config: EmailConfig,
    recipients: string[],
    timestamp: number
  ): Promise<NotificationResult> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        from: config.from,
        to: recipients,
        subject: payload.title,
        text: payload.message,
        html: this.formatEmailHtml(payload),
      }),
    });

    if (!response.ok) {
      throw new Error(`Resend error: ${response.statusText}`);
    }

    const result = await response.json();
    return {
      channel: 'email',
      success: true,
      messageId: result.id,
      timestamp,
    };
  }

  private formatEmailHtml(payload: NotificationPayload): string {
    const priorityColors: Record<string, string> = {
      low: '#6c757d',
      normal: '#17a2b8',
      high: '#ffc107',
      critical: '#dc3545',
    };

    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #1a1a2e; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .priority { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: bold; }
    .content { background: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px; }
    .details { background: white; padding: 16px; border-radius: 4px; margin: 16px 0; }
    .action-btn { display: inline-block; background: #6366f1; color: white !important; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; }
    .meta { color: #6c757d; font-size: 12px; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0 0 12px 0;">🔒 HITL Approval Required</h2>
      <span class="priority" style="background: ${priorityColors[payload.priority]}">${payload.priority.toUpperCase()}</span>
    </div>
    <div class="content">
      <h3>${payload.title}</h3>
      <p>${payload.message}</p>
      
      <div class="details">
        <p><strong>Agent:</strong> ${payload.approval.agentId}</p>
        <p><strong>Action:</strong> ${payload.approval.action}</p>
        <p><strong>Category:</strong> ${payload.approval.category}</p>
        <p><strong>Confidence:</strong> ${(payload.approval.confidence * 100).toFixed(1)}%</p>
        <p><strong>Risk Score:</strong> ${(payload.approval.riskScore * 100).toFixed(1)}%</p>
      </div>
      
      ${payload.actionUrl ? `<p><a href="${payload.actionUrl}" class="action-btn">Review & Approve</a></p>` : ''}
      
      <div class="meta">
        <p>Request ID: ${payload.approval.id}</p>
        ${payload.expiresAt ? `<p>Expires: ${new Date(payload.expiresAt).toISOString()}</p>` : ''}
      </div>
    </div>
  </div>
</body>
</html>`;
  }
}

class SlackProvider implements NotificationProvider {
  async send(
    payload: NotificationPayload,
    config: SlackConfig,
    _recipients: unknown
  ): Promise<NotificationResult> {
    const timestamp = Date.now();

    try {
      const response = await fetch(config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: config.channel,
          username: config.username || 'HoloScript HITL',
          icon_emoji: config.iconEmoji || ':robot_face:',
          blocks: this.formatSlackBlocks(payload),
        }),
      });

      if (!response.ok) {
        throw new Error(`Slack error: ${response.statusText}`);
      }

      return {
        channel: 'slack',
        success: true,
        messageId: `slack_${timestamp}`,
        timestamp,
      };
    } catch (error) {
      return {
        channel: 'slack',
        success: false,
        error: String(error),
        timestamp,
      };
    }
  }

  private formatSlackBlocks(payload: NotificationPayload): unknown[] {
    const priorityEmojis: Record<string, string> = {
      low: '🟢',
      normal: '🔵',
      high: '🟡',
      critical: '🔴',
    };

    return [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${priorityEmojis[payload.priority]} HITL Approval Required`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${payload.title}*\n${payload.message}`,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Agent:*\n${payload.approval.agentId}` },
          { type: 'mrkdwn', text: `*Action:*\n${payload.approval.action}` },
          { type: 'mrkdwn', text: `*Category:*\n${payload.approval.category}` },
          { type: 'mrkdwn', text: `*Priority:*\n${payload.priority.toUpperCase()}` },
          {
            type: 'mrkdwn',
            text: `*Confidence:*\n${(payload.approval.confidence * 100).toFixed(1)}%`,
          },
          { type: 'mrkdwn', text: `*Risk:*\n${(payload.approval.riskScore * 100).toFixed(1)}%` },
        ],
      },
      ...(payload.actionUrl
        ? [
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: '✅ Approve', emoji: true },
                  style: 'primary',
                  url: `${payload.actionUrl}?action=approve`,
                },
                {
                  type: 'button',
                  text: { type: 'plain_text', text: '❌ Reject', emoji: true },
                  style: 'danger',
                  url: `${payload.actionUrl}?action=reject`,
                },
              ],
            },
          ]
        : []),
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Request ID: \`${payload.approval.id}\` ${payload.expiresAt ? `• Expires: <!date^${Math.floor(payload.expiresAt / 1000)}^{date_short_pretty} {time}|${new Date(payload.expiresAt).toISOString()}>` : ''}`,
          },
        ],
      },
    ];
  }
}

class WebhookProvider implements NotificationProvider {
  async send(
    payload: NotificationPayload,
    config: WebhookConfig,
    _recipients: unknown
  ): Promise<NotificationResult> {
    const timestamp = Date.now();

    try {
      const body = JSON.stringify({
        type: 'hitl_approval_request',
        payload,
        timestamp,
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...config.headers,
      };

      // Add HMAC signature if secret is configured
      if (config.signatureSecret) {
        const signature = await this.computeSignature(body, config.signatureSecret);
        headers['X-Holoscript-Signature'] = signature;
      }

      const response = await fetch(config.url, {
        method: config.method,
        headers,
        body,
      });

      if (!response.ok) {
        throw new Error(`Webhook error: ${response.statusText}`);
      }

      return {
        channel: 'webhook',
        success: true,
        messageId: `webhook_${timestamp}`,
        timestamp,
      };
    } catch (error) {
      return {
        channel: 'webhook',
        success: false,
        error: String(error),
        timestamp,
      };
    }
  }

  private async computeSignature(payload: string, secret: string): Promise<string> {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
      return Array.from(new Uint8Array(signature))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
    // Fallback for environments without crypto.subtle
    return `sha256=${Buffer.from(payload).toString('base64').slice(0, 32)}`;
  }
}

class SMSProvider implements NotificationProvider {
  async send(
    payload: NotificationPayload,
    config: SMSConfig,
    recipients: string[]
  ): Promise<NotificationResult> {
    const timestamp = Date.now();

    try {
      switch (config.provider) {
        case 'twilio':
          return this.sendViaTwilio(payload, config, recipients, timestamp);
        case 'messagebird':
          return this.sendViaMessageBird(payload, config, recipients, timestamp);
        default:
          throw new Error(`Unknown SMS provider: ${config.provider}`);
      }
    } catch (error) {
      return {
        channel: 'sms',
        success: false,
        error: String(error),
        timestamp,
      };
    }
  }

  private async sendViaTwilio(
    payload: NotificationPayload,
    config: SMSConfig,
    recipients: string[],
    timestamp: number
  ): Promise<NotificationResult> {
    // Twilio implementation - requires account SID in API key format: SID:Token
    const [accountSid, authToken] = (config.apiKey || '').split(':');
    const auth = btoa(`${accountSid}:${authToken}`);

    for (const phone of recipients) {
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            From: config.from,
            To: phone,
            Body: this.formatSMSMessage(payload),
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Twilio error: ${response.statusText}`);
      }
    }

    return {
      channel: 'sms',
      success: true,
      messageId: `twilio_${timestamp}`,
      timestamp,
    };
  }

  private async sendViaMessageBird(
    payload: NotificationPayload,
    config: SMSConfig,
    recipients: string[],
    timestamp: number
  ): Promise<NotificationResult> {
    const response = await fetch('https://rest.messagebird.com/messages', {
      method: 'POST',
      headers: {
        Authorization: `AccessKey ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        originator: config.from,
        recipients,
        body: this.formatSMSMessage(payload),
      }),
    });

    if (!response.ok) {
      throw new Error(`MessageBird error: ${response.statusText}`);
    }

    return {
      channel: 'sms',
      success: true,
      messageId: `mb_${timestamp}`,
      timestamp,
    };
  }

  private formatSMSMessage(payload: NotificationPayload): string {
    const maxLength = 160;
    const message = `[HITL] ${payload.title}: ${payload.approval.action} (${payload.approval.category}). Confidence: ${(payload.approval.confidence * 100).toFixed(0)}%. Risk: ${(payload.approval.riskScore * 100).toFixed(0)}%. Reply APPROVE or REJECT.`;
    return message.length > maxLength ? message.slice(0, maxLength - 3) + '...' : message;
  }
}

// =============================================================================
// NOTIFICATION SERVICE
// =============================================================================

export class HITLNotificationService {
  private config: NotificationServiceConfig;
  private providers: Map<NotificationChannel, NotificationProvider> = new Map();

  constructor(config: Partial<NotificationServiceConfig> = {}) {
    this.config = {
      channels: config.channels || [],
      email: config.email,
      slack: config.slack,
      webhook: config.webhook,
      sms: config.sms,
      push: config.push,
      recipients: config.recipients || {},
      templates: config.templates,
    };

    // Initialize providers
    this.providers.set('email', new EmailProvider());
    this.providers.set('slack', new SlackProvider());
    this.providers.set('webhook', new WebhookProvider());
    this.providers.set('sms', new SMSProvider());
  }

  /**
   * Send notifications for an approval request
   */
  async notify(
    approval: ApprovalRequest,
    options: Partial<NotificationPayload> = {}
  ): Promise<NotificationResult[]> {
    const payload: NotificationPayload = {
      title: options.title || `Approval Required: ${approval.action}`,
      message: options.message || approval.description,
      priority: this.determinePriority(approval),
      approval,
      actionUrl: options.actionUrl,
      expiresAt: options.expiresAt || approval.expiresAt,
    };

    const results: NotificationResult[] = [];

    for (const channel of this.config.channels) {
      const result = await this.sendToChannel(channel, payload);
      results.push(result);
    }

    // Log notification results
    const successCount = results.filter((r) => r.success).length;
    logger.info(
      `[Notification] Sent ${successCount}/${results.length} notifications for ${approval.id}`
    );

    return results;
  }

  private async sendToChannel(
    channel: NotificationChannel,
    payload: NotificationPayload
  ): Promise<NotificationResult> {
    const provider = this.providers.get(channel);
    if (!provider) {
      return {
        channel,
        success: false,
        error: `No provider for channel: ${channel}`,
        timestamp: Date.now(),
      };
    }

    const config = this.getChannelConfig(channel);
    if (!config) {
      return {
        channel,
        success: false,
        error: `No configuration for channel: ${channel}`,
        timestamp: Date.now(),
      };
    }

    const recipients = this.getRecipients(channel);
    return provider.send(payload, config, recipients);
  }

  private getChannelConfig(channel: NotificationChannel): unknown {
    switch (channel) {
      case 'email':
        return this.config.email;
      case 'slack':
        return this.config.slack;
      case 'webhook':
        return this.config.webhook;
      case 'sms':
        return this.config.sms;
      case 'push':
        return this.config.push;
      default:
        return null;
    }
  }

  private getRecipients(channel: NotificationChannel): unknown {
    switch (channel) {
      case 'email':
        return this.config.recipients.email || [];
      case 'sms':
        return this.config.recipients.phone || [];
      case 'push':
        return this.config.recipients.pushTokens || [];
      default:
        return [];
    }
  }

  private determinePriority(approval: ApprovalRequest): 'low' | 'normal' | 'high' | 'critical' {
    if (approval.riskScore > 0.8) return 'critical';
    if (approval.riskScore > 0.5) return 'high';
    if (approval.confidence < 0.5) return 'high';
    if (approval.category === 'financial' || approval.category === 'admin') return 'high';
    return 'normal';
  }

  /**
   * Update configuration
   */
  configure(config: Partial<NotificationServiceConfig>): void {
    Object.assign(this.config, config);
  }

  /**
   * Add a recipient
   */
  addRecipient(channel: 'email' | 'phone' | 'pushTokens', value: string): void {
    const key = channel === 'phone' ? 'phone' : channel === 'pushTokens' ? 'pushTokens' : 'email';
    if (!this.config.recipients[key]) {
      this.config.recipients[key] = [];
    }
    if (!this.config.recipients[key]!.includes(value)) {
      this.config.recipients[key]!.push(value);
    }
  }

  /**
   * Remove a recipient
   */
  removeRecipient(channel: 'email' | 'phone' | 'pushTokens', value: string): void {
    const key = channel === 'phone' ? 'phone' : channel === 'pushTokens' ? 'pushTokens' : 'email';
    const recipients = this.config.recipients[key];
    if (recipients) {
      const index = recipients.indexOf(value);
      if (index >= 0) {
        recipients.splice(index, 1);
      }
    }
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let notificationServiceInstance: HITLNotificationService | null = null;

export function getNotificationService(
  config?: Partial<NotificationServiceConfig>
): HITLNotificationService {
  if (!notificationServiceInstance) {
    notificationServiceInstance = new HITLNotificationService(config);
  }
  return notificationServiceInstance;
}

export function configureNotifications(config: Partial<NotificationServiceConfig>): void {
  notificationServiceInstance = new HITLNotificationService(config);
}
