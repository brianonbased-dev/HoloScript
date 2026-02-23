/**
 * Tests for HoloScript Partner SDK
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createRegistryClient,
  createWebhookHandler,
  createPartnerAnalytics,
  createPartnerSDK,
  RegistryClient,
  WebhookHandler,
  PartnerAnalytics,
  RateLimitError,
  AuthenticationError,
  WebhookVerificationError,
  SDK_VERSION,
} from './index';

describe('Partner SDK', () => {
  describe('createPartnerSDK', () => {
    it('should create all SDK components', () => {
      const sdk = createPartnerSDK({
        partnerId: 'test-partner',
        apiKey: 'test-key',
        webhookSecret: 'test-secret',
      });

      expect(sdk.api).toBeInstanceOf(RegistryClient);
      expect(sdk.webhooks).toBeInstanceOf(WebhookHandler);
      expect(sdk.analytics).toBeInstanceOf(PartnerAnalytics);
    });

    it('should not create webhooks without secret', () => {
      const sdk = createPartnerSDK({
        partnerId: 'test-partner',
        apiKey: 'test-key',
      });

      expect(sdk.api).toBeInstanceOf(RegistryClient);
      expect(sdk.webhooks).toBeNull();
      expect(sdk.analytics).toBeInstanceOf(PartnerAnalytics);
    });

    it('should export SDK version', () => {
      expect(SDK_VERSION).toBe('1.0.0');
    });
  });
});

describe('RegistryClient', () => {
  let client: RegistryClient;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;

    const futureResetTimestamp = Math.floor(Date.now() / 1000) + 3600;

    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      const rateLimitHeaders = new Headers({
        'Content-Type': 'application/json',
        'X-RateLimit-Remaining': '999',
        'X-RateLimit-Limit': '1000',
        'X-RateLimit-Reset': futureResetTimestamp.toString(),
      });

      let responseBody: unknown;

      if (url.includes('/partner/validate')) {
        responseBody = {
          success: true,
          data: { valid: true, partnerId: 'test-partner', tier: 'standard' },
        };
      } else if (url.includes('/packages/search')) {
        responseBody = {
          success: true,
          data: { packages: [], total: 0, page: 1, pageSize: 20 },
        };
      } else if (url.includes('/versions/')) {
        responseBody = {
          success: true,
          data: {
            version: '1.0.0',
            publishedAt: '2026-01-01T00:00:00Z',
            downloadCount: 100,
            tarballUrl: 'https://registry.holoscript.net/tarballs/test-1.0.0.tgz',
            integrity: 'sha512-abc123',
          },
        };
      } else if (url.includes('/packages/')) {
        responseBody = {
          success: true,
          data: {
            name: '@test/package',
            version: '1.0.0',
            description: 'A test package',
            author: 'test-author',
            license: 'MIT',
            downloads: { total: 5000, lastMonth: 500, lastWeek: 100 },
            certified: true,
            certificationGrade: 'A',
            publishedAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-15T00:00:00Z',
            keywords: ['test'],
            maintainers: [{ name: 'test-author' }],
          },
        };
      } else {
        responseBody = { success: true, data: {} };
      }

      return new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: rateLimitHeaders,
      });
    }) as typeof globalThis.fetch;

    client = createRegistryClient({
      credentials: {
        partnerId: 'test-partner',
        apiKey: 'test-api-key',
      },
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('getPackage', () => {
    it('should fetch package information', async () => {
      const response = await client.getPackage('@test/package');

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data?.name).toBe('@test/package');
    });

    it('should include rate limit information', async () => {
      const response = await client.getPackage('@test/package');

      expect(response.rateLimit).toBeDefined();
      expect(response.rateLimit?.remaining).toBeGreaterThan(0);
      expect(response.rateLimit?.limit).toBeGreaterThan(0);
    });
  });

  describe('search', () => {
    it('should search for packages', async () => {
      const response = await client.search('holoscript');

      expect(response.success).toBe(true);
      expect(response.data?.packages).toBeInstanceOf(Array);
      expect(response.data?.total).toBeGreaterThanOrEqual(0);
    });

    it('should support search options', async () => {
      const response = await client.search('holoscript', {
        page: 1,
        pageSize: 10,
        certified: true,
        sort: 'downloads',
      });

      expect(response.success).toBe(true);
    });
  });

  describe('getVersion', () => {
    it('should fetch specific version info', async () => {
      const response = await client.getVersion('@test/package', '1.0.0');

      expect(response.success).toBe(true);
    });
  });

  describe('validateCredentials', () => {
    it('should validate partner credentials', async () => {
      const response = await client.validateCredentials();

      expect(response.success).toBe(true);
      expect(response.data?.valid).toBe(true);
      expect(response.data?.partnerId).toBe('test-partner');
    });
  });

  describe('rate limit tracking', () => {
    it('should track rate limit status', async () => {
      await client.getPackage('@test/package');

      const status = client.getRateLimitStatus();
      expect(status.remaining).toBeGreaterThan(0);
    });
  });
});

describe('WebhookHandler', () => {
  let handler: WebhookHandler;

  beforeEach(() => {
    handler = createWebhookHandler({
      signingSecret: 'test-webhook-secret',
      partnerId: 'test-partner',
    });
  });

  describe('event registration', () => {
    it('should register handlers for specific events', async () => {
      const callback = vi.fn();
      handler.on('package.published', callback);

      await handler.handle({
        eventId: 'evt-123',
        eventType: 'package.published',
        timestamp: new Date().toISOString(),
        partnerId: 'test-partner',
        data: { name: '@test/pkg', version: '1.0.0' },
      });

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should register wildcard handlers', async () => {
      const callback = vi.fn();
      handler.on('*', callback);

      await handler.handle({
        eventId: 'evt-456',
        eventType: 'version.published',
        timestamp: new Date().toISOString(),
        partnerId: 'test-partner',
        data: {},
      });

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('convenience registration methods', () => {
    it('should register package published handler', async () => {
      const callback = vi.fn();
      handler.onPackagePublished(callback);

      await handler.handle({
        eventId: 'evt-789',
        eventType: 'package.published',
        timestamp: new Date().toISOString(),
        partnerId: 'test-partner',
        data: { name: '@test/pkg', version: '1.0.0' },
      });

      expect(callback).toHaveBeenCalled();
    });

    it('should register security alert handler', async () => {
      const callback = vi.fn();
      handler.onSecurityAlert(callback);

      await handler.handle({
        eventId: 'evt-security',
        eventType: 'security.alert',
        timestamp: new Date().toISOString(),
        partnerId: 'test-partner',
        data: { severity: 'high', vulnerabilityId: 'CVE-2024-0001' },
      });

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('validation', () => {
    it('should reject webhooks from wrong partner', async () => {
      const result = await handler.handle({
        eventId: 'evt-wrong',
        eventType: 'package.published',
        timestamp: new Date().toISOString(),
        partnerId: 'wrong-partner',
        data: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Partner ID mismatch');
    });

    it('should reject old webhooks', async () => {
      const oldTimestamp = new Date(Date.now() - 600000).toISOString(); // 10 minutes ago

      const result = await handler.handle({
        eventId: 'evt-old',
        eventType: 'package.published',
        timestamp: oldTimestamp,
        partnerId: 'test-partner',
        data: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('timestamp too old');
    });

    it('should handle duplicate events (idempotency)', async () => {
      const callback = vi.fn();
      handler.on('package.published', callback);

      const event = {
        eventId: 'evt-duplicate',
        eventType: 'package.published' as const,
        timestamp: new Date().toISOString(),
        partnerId: 'test-partner',
        data: {},
      };

      await handler.handle(event);
      await handler.handle(event);

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('middleware', () => {
    it('should create Express-compatible middleware', () => {
      const middleware = handler.middleware();
      expect(typeof middleware).toBe('function');
    });
  });
});

describe('PartnerAnalytics', () => {
  let analytics: PartnerAnalytics;

  beforeEach(() => {
    analytics = createPartnerAnalytics({
      partnerId: 'test-partner',
      apiKey: 'test-api-key',
    });
    analytics.clearCache();
  });

  describe('getDownloadStats', () => {
    it('should fetch download statistics', async () => {
      const stats = await analytics.getDownloadStats('@test/package', 'month');

      expect(stats.packageName).toBe('@test/package');
      expect(stats.period).toBe('month');
      expect(stats.total).toBeGreaterThan(0);
      expect(stats.unique).toBeGreaterThan(0);
      expect(stats.byVersion).toBeDefined();
      expect(stats.byCountry).toBeDefined();
      expect(stats.byDate).toBeInstanceOf(Array);
      expect(stats.trend).toBeDefined();
    });

    it('should cache results', async () => {
      const stats1 = await analytics.getDownloadStats('@test/package', 'month');
      const stats2 = await analytics.getDownloadStats('@test/package', 'month');

      expect(stats1.total).toBe(stats2.total);
    });

    it('should support different periods', async () => {
      const dayStats = await analytics.getDownloadStats('@test/package', 'day');
      const yearStats = await analytics.getDownloadStats('@test/package', 'year');

      expect(yearStats.total).toBeGreaterThan(dayStats.total);
    });
  });

  describe('getEngagementMetrics', () => {
    it('should fetch engagement metrics', async () => {
      const metrics = await analytics.getEngagementMetrics('@test/package');

      expect(metrics.packageName).toBe('@test/package');
      expect(metrics.views).toBeGreaterThan(0);
      expect(metrics.conversionRate).toBeGreaterThanOrEqual(0);
      expect(metrics.avgTimeOnPage).toBeGreaterThan(0);
    });
  });

  describe('getPackageHealth', () => {
    it('should calculate package health score', async () => {
      const health = await analytics.getPackageHealth('@test/package');

      expect(health.packageName).toBe('@test/package');
      expect(health.score).toBeGreaterThanOrEqual(0);
      expect(health.score).toBeLessThanOrEqual(100);
      expect(health.factors).toBeDefined();
      expect(health.factors.downloads).toBeDefined();
      expect(health.factors.security).toBeDefined();
      expect(health.recommendations).toBeInstanceOf(Array);
    });
  });

  describe('getRevenueMetrics', () => {
    it('should fetch revenue data', async () => {
      const revenue = await analytics.getRevenueMetrics('@test/package');

      expect(revenue.packageName).toBe('@test/package');
      expect(revenue.totalRevenue).toBeGreaterThanOrEqual(0);
      expect(revenue.currency).toBe('USD');
      expect(revenue.subscriptions).toBeDefined();
    });
  });

  describe('getDependencyAnalytics', () => {
    it('should fetch dependency data', async () => {
      const deps = await analytics.getDependencyAnalytics('@test/package');

      expect(deps.packageName).toBe('@test/package');
      expect(deps.dependentPackages).toBeGreaterThanOrEqual(0);
      expect(deps.directDependents).toBeInstanceOf(Array);
    });
  });

  describe('getCompetitorAnalysis', () => {
    it('should provide competitor insights', async () => {
      const analysis = await analytics.getCompetitorAnalysis('@test/package');

      expect(analysis.packageName).toBe('@test/package');
      expect(analysis.marketShare).toBeGreaterThan(0);
      expect(analysis.competitors).toBeInstanceOf(Array);
      expect(analysis.differentiators).toBeInstanceOf(Array);
    });
  });

  describe('getPortfolioStats', () => {
    it('should aggregate stats across all packages', async () => {
      const portfolio = await analytics.getPortfolioStats();

      expect(portfolio.totalPackages).toBeGreaterThan(0);
      expect(portfolio.totalDownloads).toBeGreaterThan(0);
      expect(portfolio.topPerformers).toBeInstanceOf(Array);
    });
  });

  describe('exportAnalytics', () => {
    it('should export as JSON', async () => {
      const exported = await analytics.exportAnalytics('@test/package', {
        metrics: ['downloads', 'health'],
        period: 'month',
        format: 'json',
      });

      expect(typeof exported).toBe('string');
      const parsed = JSON.parse(exported as string);
      expect(parsed.downloads).toBeDefined();
      expect(parsed.health).toBeDefined();
    });

    it('should export as CSV', async () => {
      const exported = await analytics.exportAnalytics('@test/package', {
        metrics: ['downloads'],
        period: 'month',
        format: 'csv',
      });

      expect(typeof exported).toBe('string');
      expect(exported).toContain('DOWNLOADS');
    });
  });

  describe('cache management', () => {
    it('should clear cache', async () => {
      await analytics.getDownloadStats('@test/package');
      analytics.clearCache();

      // Cache should be empty, but no direct way to verify
      // Just ensure no errors
      const stats = await analytics.getDownloadStats('@test/package');
      expect(stats).toBeDefined();
    });
  });
});

describe('Error Classes', () => {
  describe('RateLimitError', () => {
    it('should store retry information', () => {
      const error = new RateLimitError(60, 1000);

      expect(error.name).toBe('RateLimitError');
      expect(error.retryAfter).toBe(60);
      expect(error.limit).toBe(1000);
      expect(error.message).toContain('60 seconds');
    });
  });

  describe('AuthenticationError', () => {
    it('should have correct name', () => {
      const error = new AuthenticationError('Invalid credentials');

      expect(error.name).toBe('AuthenticationError');
      expect(error.message).toBe('Invalid credentials');
    });
  });

  describe('WebhookVerificationError', () => {
    it('should have correct name', () => {
      const error = new WebhookVerificationError('Signature mismatch');

      expect(error.name).toBe('WebhookVerificationError');
      expect(error.message).toBe('Signature mismatch');
    });
  });
});
