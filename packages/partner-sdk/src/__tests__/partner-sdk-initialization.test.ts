/**
 * @holoscript/partner-sdk acceptance tests
 * Covers: SDK_VERSION, createPartnerSDK, RegistryClient, WebhookHandler,
 *         PartnerAnalytics, BrandingKit, BRAND_COLORS, TYPOGRAPHY, LOGO_ASSETS,
 *         error classes, engine export adapters
 */
import { describe, it, expect } from 'vitest';
import {
  SDK_VERSION,
  createPartnerSDK,
  RegistryClient,
  WebhookHandler,
  PartnerAnalytics,
  BrandingKit,
  createBrandingKit,
  BRAND_COLORS,
  TYPOGRAPHY,
  LOGO_ASSETS,
  RateLimitError,
  AuthenticationError,
  WebhookVerificationError,
  createRegistryClient,
  createWebhookHandler,
  createPartnerAnalytics,
} from '../index';

const CREDENTIALS = {
  partnerId: 'test-partner',
  apiKey: 'test-api-key',
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SDK_VERSION
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('SDK_VERSION', () => {
  it('is a string', () => {
    expect(typeof SDK_VERSION).toBe('string');
  });

  it('is non-empty', () => {
    expect(SDK_VERSION.length).toBeGreaterThan(0);
  });

  it('follows semver format', () => {
    expect(SDK_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// createPartnerSDK
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('createPartnerSDK', () => {
  it('is a function', () => {
    expect(typeof createPartnerSDK).toBe('function');
  });

  it('creates SDK with api property', () => {
    const sdk = createPartnerSDK(CREDENTIALS);
    expect(sdk).toHaveProperty('api');
  });

  it('creates SDK with webhooks property (null without secret)', () => {
    const sdk = createPartnerSDK(CREDENTIALS);
    expect(sdk).toHaveProperty('webhooks');
    expect(sdk.webhooks).toBeNull();
  });

  it('creates SDK with analytics property', () => {
    const sdk = createPartnerSDK(CREDENTIALS);
    expect(sdk).toHaveProperty('analytics');
  });

  it('api is RegistryClient instance', () => {
    const sdk = createPartnerSDK(CREDENTIALS);
    expect(sdk.api).toBeInstanceOf(RegistryClient);
  });

  it('analytics is PartnerAnalytics instance', () => {
    const sdk = createPartnerSDK(CREDENTIALS);
    expect(sdk.analytics).toBeInstanceOf(PartnerAnalytics);
  });

  it('creates WebhookHandler when webhookSecret provided', () => {
    const sdk = createPartnerSDK({
      ...CREDENTIALS,
      webhookSecret: 'my-secret',
    });
    expect(sdk.webhooks).toBeInstanceOf(WebhookHandler);
  });

  it('accepts optional secretKey and baseUrl', () => {
    const sdk = createPartnerSDK({
      ...CREDENTIALS,
      secretKey: 'sk-abc',
      baseUrl: 'https://example.com',
    });
    expect(sdk.api).toBeDefined();
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// createRegistryClient
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('createRegistryClient', () => {
  it('is a function', () => {
    expect(typeof createRegistryClient).toBe('function');
  });

  it('returns a RegistryClient', () => {
    const client = createRegistryClient({ credentials: CREDENTIALS });
    expect(client).toBeInstanceOf(RegistryClient);
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// createWebhookHandler
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('createWebhookHandler', () => {
  it('is a function', () => {
    expect(typeof createWebhookHandler).toBe('function');
  });

  it('returns a WebhookHandler', () => {
    const handler = createWebhookHandler({
      signingSecret: 'test-secret',
      partnerId: 'partner-1',
    });
    expect(handler).toBeInstanceOf(WebhookHandler);
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// createPartnerAnalytics
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('createPartnerAnalytics', () => {
  it('is a function', () => {
    expect(typeof createPartnerAnalytics).toBe('function');
  });

  it('returns a PartnerAnalytics instance', () => {
    const analytics = createPartnerAnalytics(CREDENTIALS);
    expect(analytics).toBeInstanceOf(PartnerAnalytics);
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Error classes
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('Error classes', () => {
  it('RateLimitError is an Error subclass', () => {
    const err = new RateLimitError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('RateLimitError');
  });

  it('AuthenticationError is an Error subclass', () => {
    const err = new AuthenticationError('Invalid key');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('AuthenticationError');
    expect(err.message).toContain('Invalid key');
  });

  it('WebhookVerificationError is an Error subclass', () => {
    const err = new WebhookVerificationError('bad sig');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('WebhookVerificationError');
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// BRAND_COLORS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('BRAND_COLORS', () => {
  it('is defined', () => {
    expect(BRAND_COLORS).toBeDefined();
  });

  it('has primary color', () => {
    expect(BRAND_COLORS).toHaveProperty('primary');
  });

  it('primary has hex value', () => {
    expect(typeof BRAND_COLORS.primary.hex).toBe('string');
    expect(BRAND_COLORS.primary.hex).toMatch(/^#/);
  });

  it('has secondary and accent', () => {
    expect(BRAND_COLORS).toHaveProperty('secondary');
    expect(BRAND_COLORS).toHaveProperty('accent');
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// TYPOGRAPHY
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('TYPOGRAPHY', () => {
  it('is defined', () => {
    expect(TYPOGRAPHY).toBeDefined();
  });

  it('has fontFamily', () => {
    expect(typeof TYPOGRAPHY.fontFamily).toBe('string');
  });

  it('has headings, body, code styles', () => {
    expect(TYPOGRAPHY).toHaveProperty('headings');
    expect(TYPOGRAPHY).toHaveProperty('body');
    expect(TYPOGRAPHY).toHaveProperty('code');
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// LOGO_ASSETS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('LOGO_ASSETS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(LOGO_ASSETS)).toBe(true);
    expect(LOGO_ASSETS.length).toBeGreaterThan(0);
  });

  it('each asset has name and url', () => {
    for (const asset of LOGO_ASSETS) {
      expect(typeof asset.name).toBe('string');
      expect(typeof asset.url).toBe('string');
    }
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// createBrandingKit
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('createBrandingKit', () => {
  it('is a function', () => {
    expect(typeof createBrandingKit).toBe('function');
  });

  it('returns a BrandingKit instance', () => {
    const kit = createBrandingKit();
    expect(kit).toBeInstanceOf(BrandingKit);
  });
});
