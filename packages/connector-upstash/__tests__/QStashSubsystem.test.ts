import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QStashSubsystem } from '../src/subsystems/QStashSubsystem';

// Mock @upstash/qstash -- use function() not arrow for constructor (W.011)
vi.mock('@upstash/qstash', () => ({
  Client: vi.fn().mockImplementation(function () {
    return {
      schedules: {
        list: vi.fn().mockResolvedValue([
          {
            scheduleId: 'sched-1',
            cron: '0 2 * * *',
            destination: 'https://api.holoscript.net/compile',
            createdAt: Date.now(),
            isPaused: false,
          },
        ]),
        create: vi.fn().mockResolvedValue({ scheduleId: 'sched-1' }),
        get: vi.fn().mockResolvedValue({
          scheduleId: 'sched-1',
          cron: '0 2 * * *',
          destination: 'https://api.holoscript.net/compile',
          createdAt: Date.now(),
          isPaused: false,
        }),
        delete: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn().mockResolvedValue(undefined),
        resume: vi.fn().mockResolvedValue(undefined),
      },
      publishJSON: vi.fn().mockResolvedValue({ messageId: 'msg-1' }),
      dlq: {
        listMessages: vi.fn().mockResolvedValue({
          messages: [
            {
              messageId: 'dlq-1',
              url: 'https://api.holoscript.net/webhook',
              body: '{"error": "timeout"}',
              createdAt: Date.now(),
              responseStatus: 500,
              responseBody: 'Internal Server Error',
            },
          ],
        }),
        delete: vi.fn().mockResolvedValue(undefined),
      },
    };
  }),
  Receiver: vi.fn().mockImplementation(function () {
    return {
      verify: vi.fn().mockResolvedValue(true),
    };
  }),
}));

describe('QStashSubsystem', () => {
  let qstash: QStashSubsystem;

  beforeEach(() => {
    qstash = new QStashSubsystem();
    process.env.QSTASH_TOKEN = 'test-token';
  });

  describe('connect', () => {
    it('should connect successfully with valid credentials', async () => {
      await qstash.connect();
      expect(await qstash.health()).toBe(true);
    });

    it('should throw error if QSTASH_TOKEN is missing', async () => {
      delete process.env.QSTASH_TOKEN;
      await expect(qstash.connect()).rejects.toThrow(
        'QSTASH_TOKEN environment variable is required'
      );
    });

    it('should initialize webhook receiver when signing keys are provided', async () => {
      process.env.QSTASH_CURRENT_SIGNING_KEY = 'current-key';
      process.env.QSTASH_NEXT_SIGNING_KEY = 'next-key';
      await qstash.connect();
      expect(qstash.isWebhookVerificationEnabled()).toBe(true);
    });

    it('should not initialize webhook receiver without signing keys', async () => {
      delete process.env.QSTASH_CURRENT_SIGNING_KEY;
      delete process.env.QSTASH_NEXT_SIGNING_KEY;
      await qstash.connect();
      expect(qstash.isWebhookVerificationEnabled()).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('should disconnect and mark as not connected', async () => {
      await qstash.connect();
      await qstash.disconnect();
      expect(await qstash.health()).toBe(false);
    });

    it('should clear webhook receiver on disconnect', async () => {
      process.env.QSTASH_CURRENT_SIGNING_KEY = 'current-key';
      process.env.QSTASH_NEXT_SIGNING_KEY = 'next-key';
      await qstash.connect();
      expect(qstash.isWebhookVerificationEnabled()).toBe(true);
      await qstash.disconnect();
      expect(qstash.isWebhookVerificationEnabled()).toBe(false);
    });
  });

  describe('health', () => {
    it('should return false when not connected', async () => {
      expect(await qstash.health()).toBe(false);
    });

    it('should return true when connected', async () => {
      await qstash.connect();
      expect(await qstash.health()).toBe(true);
    });
  });

  describe('schedule management', () => {
    beforeEach(async () => {
      await qstash.connect();
    });

    it('should create schedule', async () => {
      const scheduleId = await qstash.createSchedule({
        cron: '0 2 * * *',
        url: 'https://api.holoscript.net/compile',
        body: { target: 'unity', scene: 'main.holo' },
        retries: 3,
      });
      expect(scheduleId).toBe('sched-1');
    });

    it('should list schedules', async () => {
      const schedules = await qstash.listSchedules();
      expect(schedules).toHaveLength(1);
      expect(schedules[0].scheduleId).toBe('sched-1');
      expect(schedules[0].cron).toBe('0 2 * * *');
    });

    it('should get schedule by ID', async () => {
      const schedule = await qstash.getSchedule('sched-1');
      expect(schedule.scheduleId).toBe('sched-1');
      expect(schedule.destination).toBe('https://api.holoscript.net/compile');
    });

    it('should delete schedule', async () => {
      await qstash.deleteSchedule('sched-1');
    });

    it('should pause schedule', async () => {
      await qstash.pauseSchedule('sched-1');
    });

    it('should resume schedule', async () => {
      await qstash.resumeSchedule('sched-1');
    });
  });

  describe('message publishing', () => {
    beforeEach(async () => {
      await qstash.connect();
    });

    it('should publish one-time message', async () => {
      const messageId = await qstash.publishMessage({
        url: 'https://api.holoscript.net/webhook',
        body: { event: 'compilation_complete' },
      });
      expect(messageId).toBe('msg-1');
    });

    it('should publish message with delay', async () => {
      const messageId = await qstash.publishMessage({
        url: 'https://api.holoscript.net/webhook',
        body: { event: 'delayed_task' },
        delay: 300,
      });
      expect(messageId).toBe('msg-1');
    });
  });

  describe('dead letter queue', () => {
    beforeEach(async () => {
      await qstash.connect();
    });

    it('should list DLQ messages', async () => {
      const messages = await qstash.listDLQ();
      expect(messages).toHaveLength(1);
      expect(messages[0].messageId).toBe('dlq-1');
      expect(messages[0].responseStatus).toBe(500);
    });

    it('should delete DLQ message', async () => {
      await qstash.deleteDLQMessage('dlq-1');
    });
  });

  describe('webhook signature verification', () => {
    it('should verify valid webhook signature', async () => {
      process.env.QSTASH_CURRENT_SIGNING_KEY = 'current-key';
      process.env.QSTASH_NEXT_SIGNING_KEY = 'next-key';
      await qstash.connect();

      const result = await qstash.verifyWebhookSignature(
        'valid-signature',
        '{"event": "compilation_complete"}',
        'https://api.holoscript.net/webhook'
      );

      expect(result.isValid).toBe(true);
      expect(result.body).toBe('{"event": "compilation_complete"}');
    });

    it('should return error when verification is not configured', async () => {
      delete process.env.QSTASH_CURRENT_SIGNING_KEY;
      delete process.env.QSTASH_NEXT_SIGNING_KEY;
      await qstash.connect();

      const result = await qstash.verifyWebhookSignature('some-signature', '{"data": "test"}');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('not configured');
    });
  });

  describe('convenience methods', () => {
    beforeEach(async () => {
      await qstash.connect();
    });

    it('should schedule nightly compilation with default hour', async () => {
      const scheduleId = await qstash.scheduleNightlyCompilation(
        'https://api.holoscript.net/compile',
        'unity',
        'main.holo'
      );
      expect(scheduleId).toBe('sched-1');
    });

    it('should schedule nightly compilation with custom hour', async () => {
      const scheduleId = await qstash.scheduleNightlyCompilation(
        'https://api.holoscript.net/compile',
        'unity',
        'main.holo',
        3
      );
      expect(scheduleId).toBe('sched-1');
    });

    it('should schedule health ping with default interval', async () => {
      const scheduleId = await qstash.scheduleHealthPing('https://api.holoscript.net/health');
      expect(scheduleId).toBe('sched-1');
    });

    it('should schedule health ping with custom interval', async () => {
      const scheduleId = await qstash.scheduleHealthPing('https://api.holoscript.net/health', 10);
      expect(scheduleId).toBe('sched-1');
    });

    it('should trigger deployment with default delay', async () => {
      const messageId = await qstash.triggerDeployment('https://api.holoscript.net/deploy');
      expect(messageId).toBe('msg-1');
    });

    it('should trigger deployment with custom delay and metadata', async () => {
      const messageId = await qstash.triggerDeployment('https://api.holoscript.net/deploy', 600, {
        version: '1.0.0',
        environment: 'production',
      });
      expect(messageId).toBe('msg-1');
    });
  });

  describe('error handling', () => {
    it('should throw error when executing without connection', async () => {
      await expect(
        qstash.createSchedule({ cron: '0 2 * * *', url: 'https://test.com' })
      ).rejects.toThrow('QStashSubsystem not connected');
    });
  });
});
