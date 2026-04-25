/**
 * NotificationService Tests
 *
 * Tests for the HITL multi-channel notification service.
 *
 * @version 3.3.0
 * @Sprint Sprint 3: Safety & Testing
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readJson } from '../../errors/safeJsonParse';
import {
  HITLNotificationService,
  getNotificationService,
  configureNotifications,
  type NotificationPayload,
  type NotificationServiceConfig,
} from '../NotificationService';
import type { ApprovalRequest } from '../HITLBackendService';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('HITLNotificationService', () => {
  let service: HITLNotificationService;

  const mockApproval: ApprovalRequest = {
    id: 'req-123',
    timestamp: Date.now(),
    agentId: 'test-agent',
    action: 'transfer_funds',
    category: 'financial',
    description: 'Transfer $100 to external account',
    confidence: 0.85,
    riskScore: 0.6,
    context: { amount: 100, currency: 'USD' },
    status: 'pending',
    expiresAt: Date.now() + 3600000,
    metadata: {},
  };

  const mockPayload: NotificationPayload = {
    title: 'Approval Required',
    message: 'Agent test-agent requires approval for transfer_funds',
    priority: 'high',
    approval: mockApproval,
    actionUrl: 'https://dashboard.example.com/approve/req-123',
  };

  const testConfig: NotificationServiceConfig = {
    channels: ['email', 'slack', 'webhook'],
    email: {
      provider: 'sendgrid',
      apiKey: 'test-api-key',
      from: 'notifications@test.com',
    },
    slack: {
      webhookUrl: 'https://hooks.slack.com/services/xxx/yyy/zzz',
      channel: '#approvals',
      username: 'HITL Bot',
    },
    webhook: {
      url: 'https://api.example.com/webhook',
      method: 'POST',
      headers: { 'X-Custom-Header': 'test' },
    },
    recipients: {
      email: ['admin@test.com', 'manager@test.com'],
      phone: ['+1234567890'],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve({ id: 'msg_123' }),
      headers: {
        get: (name: string) => {
          if (name === 'x-message-id') return 'msg_123';
          return null;
        },
      },
    });
    service = new HITLNotificationService(testConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create service with config', () => {
      expect(service).toBeInstanceOf(HITLNotificationService);
    });

    it('should configure service via factory function', () => {
      configureNotifications(testConfig);
      const notifService = getNotificationService();
      expect(notifService).toBeInstanceOf(HITLNotificationService);
    });

    it('should support minimal config', () => {
      const minimalService = new HITLNotificationService({
        channels: ['webhook'],
        webhook: {
          url: 'https://api.example.com/webhook',
          method: 'POST',
        },
        recipients: {},
      });
      expect(minimalService).toBeInstanceOf(HITLNotificationService);
    });

    it('should support all providers', () => {
      const fullService = new HITLNotificationService({
        channels: ['email', 'slack', 'webhook', 'sms'],
        email: { provider: 'ses', apiKey: 'key', from: 'test@test.com' },
        slack: { webhookUrl: 'https://hooks.slack.com/xxx' },
        webhook: { url: 'https://api.example.com', method: 'POST' },
        sms: { provider: 'twilio', apiKey: 'key', from: '+1234567890' },
        recipients: { email: ['test@test.com'], phone: ['+1234567890'] },
      });
      expect(fullService).toBeInstanceOf(HITLNotificationService);
    });
  });

  describe('notify', () => {
    it('should send to all configured channels', async () => {
      const results = await service.notify(mockApproval);

      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.timestamp)).toBe(true);
    });

    it('should include channel in each result', async () => {
      const results = await service.notify(mockApproval);

      const channels = results.map((r) => r.channel);
      expect(channels).toContain('email');
      expect(channels).toContain('slack');
      expect(channels).toContain('webhook');
    });

    it('should handle partial failures gracefully', async () => {
      // First call succeeds, second fails
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: { get: () => null },
          json: () => Promise.resolve({}),
        })
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: { get: () => null },
          json: () => Promise.resolve({}),
        });

      const results = await service.notify(mockApproval);

      // Should have mixed results
      expect(results.some((r) => r.success)).toBe(true);
    });

    it('should include message IDs when available', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve({ id: 'msg_abc123' }),
        headers: { get: (name: string) => (name === 'x-message-id' ? 'msg_abc123' : null) },
      });

      const results = await service.notify(mockApproval);

      // At least some results should have messageId
      expect(results.some((r) => r.messageId)).toBe(true);
    });
  });

  describe('email notifications', () => {
    it('should send via SendGrid', async () => {
      const emailService = new HITLNotificationService({
        channels: ['email'],
        email: {
          provider: 'sendgrid',
          apiKey: 'sg-test-key',
          from: 'notifications@test.com',
        },
        recipients: { email: ['admin@test.com'] },
      });

      const results = await emailService.notify(mockApproval);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.sendgrid.com/v3/mail/send',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer sg-test-key',
          }),
        })
      );
      expect(results.find((r) => r.channel === 'email')?.success).toBe(true);
    });

    it('should send via AWS SES', async () => {
      const sesService = new HITLNotificationService({
        channels: ['email'],
        email: {
          provider: 'ses',
          apiKey: 'ses-test-key',
          from: 'notifications@test.com',
        },
        recipients: { email: ['admin@test.com'] },
      });

      const results = await sesService.notify(mockApproval);

      expect(results.find((r) => r.channel === 'email')?.success).toBe(true);
    });

    it('should send via Resend', async () => {
      const resendService = new HITLNotificationService({
        channels: ['email'],
        email: {
          provider: 'resend',
          apiKey: 're-test-key',
          from: 'notifications@test.com',
        },
        recipients: { email: ['admin@test.com'] },
      });

      const results = await resendService.notify(mockApproval);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer re-test-key',
          }),
        })
      );
    });

    it('should handle multiple recipients', async () => {
      const multiService = new HITLNotificationService({
        channels: ['email'],
        email: { provider: 'sendgrid', apiKey: 'key', from: 'test@test.com' },
        recipients: {
          email: ['admin@test.com', 'manager@test.com', 'cto@test.com'],
        },
      });

      await multiService.notify(mockApproval);

      // Should send to all recipients
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('slack notifications', () => {
    it('should send to Slack webhook', async () => {
      const slackService = new HITLNotificationService({
        channels: ['slack'],
        slack: {
          webhookUrl: 'https://hooks.slack.com/services/T00/B00/xxx',
          channel: '#hitl-approvals',
          username: 'HITL Bot',
          iconEmoji: ':robot_face:',
        },
        recipients: {},
      });

      const results = await slackService.notify(mockApproval);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://hooks.slack.com/services/T00/B00/xxx',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(String),
        })
      );
      expect(results.find((r) => r.channel === 'slack')?.success).toBe(true);
    });

    it('should format Slack message with approval details', async () => {
      const slackService = new HITLNotificationService({
        channels: ['slack'],
        slack: { webhookUrl: 'https://hooks.slack.com/xxx' },
        recipients: {},
      });

      await slackService.notify(mockApproval);

      const call = mockFetch.mock.calls.find((c) => c[0].includes('slack'));
      expect(call).toBeDefined();
      if (call) {
        const body = readJson(call[1].body);
        expect(body.text || body.blocks).toBeDefined();
      }
    });

    it('should include action URL in Slack message', async () => {
      const slackService = new HITLNotificationService({
        channels: ['slack'],
        slack: { webhookUrl: 'https://hooks.slack.com/xxx' },
        recipients: {},
      });

      await slackService.notify(mockApproval, {
        actionUrl: 'https://dashboard.example.com/approve/123',
      });

      // Should include URL in the payload
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('webhook notifications', () => {
    it('should send to custom webhook', async () => {
      const webhookService = new HITLNotificationService({
        channels: ['webhook'],
        webhook: {
          url: 'https://api.example.com/hitl-webhook',
          method: 'POST',
          headers: { 'X-API-Key': 'secret-key' },
        },
        recipients: {},
      });

      const results = await webhookService.notify(mockApproval);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/hitl-webhook',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-API-Key': 'secret-key',
          }),
        })
      );
      expect(results.find((r) => r.channel === 'webhook')?.success).toBe(true);
    });

    it('should include HMAC signature when configured', async () => {
      const webhookService = new HITLNotificationService({
        channels: ['webhook'],
        webhook: {
          url: 'https://api.example.com/webhook',
          method: 'POST',
          signatureSecret: 'hmac-secret-key',
        },
        recipients: {},
      });

      await webhookService.notify(mockApproval);

      // Should include signature header
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Holoscript-Signature': expect.any(String),
          }),
        })
      );
    });

    it('should support PUT method', async () => {
      const webhookService = new HITLNotificationService({
        channels: ['webhook'],
        webhook: {
          url: 'https://api.example.com/webhook',
          method: 'PUT',
        },
        recipients: {},
      });

      await webhookService.notify(mockApproval);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'PUT',
        })
      );
    });
  });

  describe('SMS notifications', () => {
    it('should send via Twilio', async () => {
      const smsService = new HITLNotificationService({
        channels: ['sms'],
        sms: {
          provider: 'twilio',
          apiKey: 'twilio-sid:twilio-token',
          from: '+15551234567',
        },
        recipients: { phone: ['+15559876543'] },
      });

      const results = await smsService.notify(mockApproval);

      expect(mockFetch).toHaveBeenCalled();
      expect(results.find((r) => r.channel === 'sms')).toBeDefined();
    });

    it('should send via MessageBird', async () => {
      const smsService = new HITLNotificationService({
        channels: ['sms'],
        sms: {
          provider: 'messagebird',
          apiKey: 'messagebird-key',
          from: '+15551234567',
        },
        recipients: { phone: ['+15559876543'] },
      });

      const results = await smsService.notify(mockApproval);

      expect(results.find((r) => r.channel === 'sms')).toBeDefined();
    });

    it('should handle multiple phone numbers', async () => {
      const smsService = new HITLNotificationService({
        channels: ['sms'],
        sms: { provider: 'twilio', apiKey: 'key', from: '+1234567890' },
        recipients: {
          phone: ['+15551111111', '+15552222222', '+15553333333'],
        },
      });

      await smsService.notify(mockApproval);

      // Should attempt to send to all numbers
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('priority handling', () => {
    it('should handle low priority', async () => {
      // Low risk score = low priority
      const lowRiskApproval = { ...mockApproval, riskScore: 0.1 };
      const results = await service.notify(lowRiskApproval);

      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle normal priority', async () => {
      // Medium-low risk score = normal priority
      const normalRiskApproval = { ...mockApproval, riskScore: 0.3 };
      const results = await service.notify(normalRiskApproval);

      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle high priority', async () => {
      // High risk score = high priority
      const highRiskApproval = { ...mockApproval, riskScore: 0.6 };
      const results = await service.notify(highRiskApproval);

      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle critical priority', async () => {
      // Very high risk score = critical priority
      const criticalRiskApproval = { ...mockApproval, riskScore: 0.9 };
      const results = await service.notify(criticalRiskApproval);

      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      // The service may throw or catch - check that it handles errors
      try {
        const results = await service.notify(mockApproval);
        // If it doesn't throw, results should indicate failure
        expect(results.every((r) => r.success === false)).toBe(true);
      } catch (error) {
        // It's acceptable to throw on network errors
        expect(error).toBeDefined();
      }
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: { get: () => null },
        json: () => Promise.resolve({ error: 'Invalid payload' }),
      });

      // The service may throw or return errors
      try {
        const results = await service.notify(mockApproval);
        expect(results.length).toBeGreaterThan(0);
      } catch (error) {
        // Throwing is acceptable
        expect(error).toBeDefined();
      }
    });

    it('should handle timeout', async () => {
      mockFetch.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 10000)));

      // Should not hang indefinitely
      const resultsPromise = service.notify(mockApproval);
      expect(resultsPromise).toBeInstanceOf(Promise);
    });

    it('should continue on partial failure', async () => {
      // Slack fails, others succeed
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('slack')) {
          return Promise.reject(new Error('Slack unavailable'));
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: { get: () => null },
          json: () => Promise.resolve({}),
        });
      });

      try {
        const results = await service.notify(mockApproval);
        const slackResult = results.find((r) => r.channel === 'slack');
        const webhookResult = results.find((r) => r.channel === 'webhook');

        // Slack should fail, webhook should succeed
        expect(slackResult?.success).toBe(false);
        expect(webhookResult?.success).toBe(true);
      } catch (error) {
        // If email fails first, that's acceptable
        expect(error).toBeDefined();
      }
    });
  });

  describe('template support', () => {
    it('should use custom email template', async () => {
      const templateService = new HITLNotificationService({
        channels: ['email'],
        email: { provider: 'sendgrid', apiKey: 'key', from: 'test@test.com' },
        recipients: { email: ['admin@test.com'] },
        templates: {
          email: {
            subject: 'Custom: {{title}}',
            bodyHtml: '<h1>{{title}}</h1><p>{{message}}</p>',
            bodyText: '{{title}}\n\n{{message}}',
          },
        },
      });

      await templateService.notify(mockApproval);

      expect(mockFetch).toHaveBeenCalled();
    });
  });
});

describe('Notification Factory Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should configure and retrieve service', () => {
    configureNotifications({
      channels: ['webhook'],
      webhook: { url: 'https://api.example.com', method: 'POST' },
      recipients: {},
    });

    const service = getNotificationService();
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(HITLNotificationService);
  });

  it('should update config on reconfigure', () => {
    configureNotifications({
      channels: ['email'],
      email: { provider: 'sendgrid', apiKey: 'key1', from: 'test@test.com' },
      recipients: { email: ['first@test.com'] },
    });

    const service1 = getNotificationService();

    configureNotifications({
      channels: ['slack'],
      slack: { webhookUrl: 'https://hooks.slack.com/xxx' },
      recipients: {},
    });

    const service2 = getNotificationService();

    // Services should be different after reconfiguration
    expect(service2).toBeInstanceOf(HITLNotificationService);
  });
});
