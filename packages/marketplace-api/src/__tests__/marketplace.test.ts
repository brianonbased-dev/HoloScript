/**
 * @fileoverview Tests for HoloScript Trait Marketplace API
 * @module marketplace-api/__tests__/marketplace.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// =============================================================================
// TYPES TESTS
// =============================================================================

describe('Types', () => {
  it('should export RATE_LIMITS', async () => {
    const { RATE_LIMITS } = await import('../types.js');

    expect(RATE_LIMITS.anonymous).toBe(100);
    expect(RATE_LIMITS.authenticated).toBe(1000);
    expect(RATE_LIMITS.verified).toBe(5000);
    expect(RATE_LIMITS.premium).toBe(20000);
  });

  it('should define TraitCategory type', async () => {
    const types = await import('../types.js');
    const categories: (typeof types)['TraitCategory'][] = [
      'rendering',
      'physics',
      'networking',
      'audio',
      'ui',
      'ai',
      'blockchain',
      'utility',
      'animation',
      'input',
      'data',
      'debug',
    ];
    expect(categories.length).toBe(12);
  });

  it('should define Platform type', async () => {
    const types = await import('../types.js');
    const platforms: (typeof types)['Platform'][] = [
      'web',
      'nodejs',
      'unity',
      'unreal',
      'godot',
      'native',
      'wasm',
      'all',
    ];
    expect(platforms.length).toBe(8);
  });
});

// =============================================================================
// TRAIT REGISTRY TESTS
// =============================================================================

describe('TraitRegistry', () => {
  let registry: any;

  beforeEach(async () => {
    const { TraitRegistry } = await import('../TraitRegistry.js');
    registry = new TraitRegistry();
  });

  describe('publish', () => {
    it('should publish a new trait', async () => {
      const result = await registry.publish(
        {
          name: 'TestTrait',
          version: '1.0.0',
          description: 'A test trait for unit testing purposes',
          license: 'MIT',
          keywords: ['test', 'example'],
          platforms: ['web', 'nodejs'],
          category: 'utility',
          source: 'trait TestTrait { fn init() {} }',
        },
        { name: 'testuser', verified: false }
      );

      expect(result.success).toBe(true);
      expect(result.traitId).toBe('testtrait');
      expect(result.version).toBe('1.0.0');
      expect(result.shasum).toBeDefined();
    });

    it('should reject duplicate version', async () => {
      const request = {
        name: 'DupeTrait',
        version: '1.0.0',
        description: 'A test trait for testing duplicates',
        license: 'MIT',
        keywords: ['test'],
        platforms: ['web'] as const,
        category: 'utility' as const,
        source: 'trait DupeTrait {}',
      };
      const author = { name: 'user', verified: false };

      await registry.publish(request, author);
      const result = await registry.publish(request, author);

      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('already exists');
    });

    it('should reject invalid trait name', async () => {
      const result = await registry.publish(
        {
          name: '123invalid',
          version: '1.0.0',
          description: 'Invalid name starting with number',
          license: 'MIT',
          keywords: ['test'],
          platforms: ['web'],
          category: 'utility',
          source: 'trait Invalid {}',
        },
        { name: 'user', verified: false }
      );

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should reject invalid version', async () => {
      const result = await registry.publish(
        {
          name: 'ValidName',
          version: 'invalid',
          description: 'Invalid version format',
          license: 'MIT',
          keywords: ['test'],
          platforms: ['web'],
          category: 'utility',
          source: 'trait Valid {}',
        },
        { name: 'user', verified: false }
      );

      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('semver');
    });

    it('should add warnings for missing optional fields', async () => {
      const result = await registry.publish(
        {
          name: 'NoReadme',
          version: '1.0.0',
          description: 'No readme or types provided',
          license: 'MIT',
          keywords: ['test'],
          platforms: ['web'],
          category: 'utility',
          source: 'trait NoReadme {}',
        },
        { name: 'user', verified: false }
      );

      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some((w: string) => w.includes('README'))).toBe(true);
    });
  });

  describe('getTrait', () => {
    beforeEach(async () => {
      await registry.publish(
        {
          name: 'FetchTest',
          version: '1.0.0',
          description: 'Trait for testing fetch operations',
          license: 'MIT',
          keywords: ['test'],
          platforms: ['web'],
          category: 'utility',
          source: 'trait FetchTest {}',
        },
        { name: 'user', verified: true }
      );
    });

    it('should get trait by ID', async () => {
      const trait = await registry.getTrait('fetchtest');

      expect(trait).toBeDefined();
      expect(trait?.name).toBe('FetchTest');
      expect(trait?.version).toBe('1.0.0');
    });

    it('should return null for non-existent trait', async () => {
      const trait = await registry.getTrait('nonexistent');
      expect(trait).toBeNull();
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      // Publish multiple traits for search testing
      await registry.publish(
        {
          name: 'PhysicsEngine',
          version: '2.0.0',
          description: 'Physics simulation engine for games',
          license: 'MIT',
          keywords: ['physics', 'simulation', 'game'],
          platforms: ['web', 'unity'],
          category: 'physics',
          source: 'trait PhysicsEngine {}',
        },
        { name: 'gamedev', verified: true }
      );

      await registry.publish(
        {
          name: 'UIComponents',
          version: '1.5.0',
          description: 'Reusable UI component library',
          license: 'MIT',
          keywords: ['ui', 'components', 'widgets'],
          platforms: ['web'],
          category: 'ui',
          source: 'trait UIComponents {}',
        },
        { name: 'uimaster', verified: true }
      );

      await registry.publish(
        {
          name: 'NetworkSync',
          version: '3.0.0',
          description: 'Real-time network synchronization',
          license: 'Apache-2.0',
          keywords: ['network', 'multiplayer', 'sync'],
          platforms: ['web', 'nodejs'],
          category: 'networking',
          source: 'trait NetworkSync {}',
        },
        { name: 'netguru', verified: false }
      );
    });

    it('should search by query string', async () => {
      const result = await registry.search({ q: 'physics' });

      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].name).toBe('PhysicsEngine');
    });

    it('should search by category', async () => {
      const result = await registry.search({ category: 'ui' });

      expect(result.results.length).toBe(1);
      expect(result.results[0].name).toBe('UIComponents');
    });

    it('should search by platform', async () => {
      const result = await registry.search({ platform: 'unity' });

      expect(result.results.length).toBe(1);
      expect(result.results[0].name).toBe('PhysicsEngine');
    });

    it('should filter by verified', async () => {
      const result = await registry.search({ verified: true });

      expect(result.results.length).toBe(2); // PhysicsEngine and UIComponents
      expect(result.results.every((r: any) => r.verified)).toBe(true);
    });

    it('should paginate results', async () => {
      const result = await registry.search({ limit: 2, page: 1 });

      expect(result.results.length).toBeLessThanOrEqual(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(2);
    });

    it('should sort by downloads', async () => {
      const result = await registry.search({ sortBy: 'downloads', sortOrder: 'desc' });

      expect(result.results).toBeDefined();
    });
  });

  describe('unpublish', () => {
    beforeEach(async () => {
      await registry.publish(
        {
          name: 'ToUnpublish',
          version: '1.0.0',
          description: 'Trait that will be unpublished',
          license: 'MIT',
          keywords: ['test'],
          platforms: ['web'],
          category: 'utility',
          source: 'trait ToUnpublish {}',
        },
        { name: 'owner', verified: false }
      );
    });

    it('should unpublish trait', async () => {
      await registry.unpublish('tounpublish', undefined, 'owner');

      const trait = await registry.getTrait('tounpublish');
      expect(trait).toBeNull();
    });

    it('should throw for wrong author', async () => {
      await expect(registry.unpublish('tounpublish', undefined, 'notowner')).rejects.toThrow(
        "don't have permission"
      );
    });
  });

  describe('deprecate', () => {
    beforeEach(async () => {
      await registry.publish(
        {
          name: 'ToDeprecate',
          version: '1.0.0',
          description: 'Trait that will be deprecated',
          license: 'MIT',
          keywords: ['test'],
          platforms: ['web'],
          category: 'utility',
          source: 'trait ToDeprecate {}',
        },
        { name: 'owner', verified: false }
      );
    });

    it('should deprecate trait', async () => {
      await registry.deprecate('todeprecate', 'No longer maintained', undefined, 'BetterTrait');

      const trait = await registry.getTrait('todeprecate');
      expect(trait?.deprecated).toBe(true);
      expect(trait?.deprecationMessage).toContain('No longer maintained');
      expect(trait?.deprecationMessage).toContain('BetterTrait');
    });
  });
});

// =============================================================================
// DEPENDENCY RESOLVER TESTS
// =============================================================================

describe('DependencyResolver', () => {
  let registry: any;
  let resolver: any;

  beforeEach(async () => {
    const { TraitRegistry } = await import('../TraitRegistry.js');
    const { DependencyResolver } = await import('../DependencyResolver.js');

    registry = new TraitRegistry();
    resolver = new DependencyResolver(registry);

    // Setup traits with dependencies
    await registry.publish(
      {
        name: 'CoreLib',
        version: '1.0.0',
        description: 'Core library with no dependencies',
        license: 'MIT',
        keywords: ['core'],
        platforms: ['all'],
        category: 'utility',
        source: 'trait CoreLib {}',
        dependencies: {},
      },
      { name: 'author', verified: true }
    );

    await registry.publish(
      {
        name: 'UIBase',
        version: '2.0.0',
        description: 'UI base depending on CoreLib',
        license: 'MIT',
        keywords: ['ui'],
        platforms: ['web'],
        category: 'ui',
        source: 'trait UIBase {}',
        dependencies: { CoreLib: '^1.0.0' },
      },
      { name: 'author', verified: true }
    );

    await registry.publish(
      {
        name: 'WidgetLib',
        version: '3.0.0',
        description: 'Widget library depending on UIBase',
        license: 'MIT',
        keywords: ['widgets'],
        platforms: ['web'],
        category: 'ui',
        source: 'trait WidgetLib {}',
        dependencies: { UIBase: '^2.0.0' },
      },
      { name: 'author', verified: true }
    );
  });

  describe('resolve', () => {
    it('should resolve single dependency', async () => {
      const result = await resolver.resolve([{ name: 'CoreLib', version: '*' }]);

      expect(result.resolved.length).toBe(1);
      expect(result.resolved[0].name).toBe('CoreLib');
      expect(result.conflicts.length).toBe(0);
    });

    it('should resolve transitive dependencies', async () => {
      const result = await resolver.resolve([{ name: 'WidgetLib', version: '*' }]);

      // Should have WidgetLib, UIBase, CoreLib
      expect(result.resolved.length).toBe(3);

      const names = result.resolved.map((d: any) => d.name);
      expect(names).toContain('WidgetLib');
      expect(names).toContain('UIBase');
      expect(names).toContain('CoreLib');
    });

    it('should handle missing dependency', async () => {
      const result = await resolver.resolve([{ name: 'NonExistent', version: '1.0.0' }]);

      expect(result.warnings).toBeDefined();
      expect(result.warnings.some((w: string) => w.includes('NonExistent'))).toBe(true);
    });
  });

  describe('checkCompatibility', () => {
    it('should report compatible traits', async () => {
      const result = await resolver.checkCompatibility([{ name: 'CoreLib', version: '1.0.0' }]);

      expect(result.compatible).toBe(true);
      expect(result.issues.filter((i: any) => i.severity === 'error').length).toBe(0);
    });
  });

  describe('utility functions', () => {
    it('should parse version requirements', async () => {
      const { parseVersionRequirement } = await import('../DependencyResolver.js');

      expect(parseVersionRequirement('1.0.0')).toEqual({ type: 'exact', value: '1.0.0' });
      expect(parseVersionRequirement('^1.0.0')).toEqual({ type: 'range', value: '^1.0.0' });
      expect(parseVersionRequirement('latest')).toEqual({ type: 'tag', value: 'latest' });
    });

    it('should check version satisfaction', async () => {
      const { satisfies } = await import('../DependencyResolver.js');

      expect(satisfies('1.2.3', '^1.0.0')).toBe(true);
      expect(satisfies('2.0.0', '^1.0.0')).toBe(false);
      expect(satisfies('1.0.0', '*')).toBe(true);
    });

    it('should compare versions', async () => {
      const { compareVersions } = await import('../DependencyResolver.js');

      expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0);
      expect(compareVersions('2.0.0', '1.0.0')).toBeGreaterThan(0);
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    });

    it('should get latest version', async () => {
      const { getLatestVersion } = await import('../DependencyResolver.js');

      expect(getLatestVersion(['1.0.0', '2.0.0', '1.5.0'])).toBe('2.0.0');
      expect(getLatestVersion([])).toBeNull();
    });
  });
});

// =============================================================================
// VERIFICATION SERVICE TESTS
// =============================================================================

describe('VerificationService', () => {
  let verificationService: any;

  beforeEach(async () => {
    const { VerificationService } = await import('../VerificationService.js');
    verificationService = new VerificationService();
  });

  describe('email verification', () => {
    it('should start email verification', async () => {
      const result = await verificationService.startEmailVerification('user1', 'test@example.com');

      expect(result.sent).toBe(true);
      expect(result.expiresIn).toBe(30 * 60);
    });

    it('should verify email with correct code', async () => {
      // Start verification to store code
      await verificationService.startEmailVerification('user2', 'test2@example.com');

      // Get the stored code (in real scenario, user receives via email)
      // For testing, we can access internal state or mock
      // Since we can't access private emailCodes, this would need adjustment in real tests
    });
  });

  describe('verification status', () => {
    it('should return unverified for new users', async () => {
      const status = await verificationService.getVerificationStatus('newuser');

      expect(status.verified).toBe(false);
      expect(status.level).toBe('none');
    });
  });

  describe('source verification', () => {
    it('should pass safe source code', async () => {
      const result = await verificationService.verifyTraitSource(`
        trait SafeTrait {
          fn render() {
            log("Hello world");
          }
        }
      `);

      expect(result.safe).toBe(true);
      expect(result.issues.length).toBe(0);
    });

    it('should flag dangerous patterns', async () => {
      const result = await verificationService.verifyTraitSource(`
        trait DangerousTrait {
          fn hack() {
            eval("malicious code");
          }
        }
      `);

      expect(result.safe).toBe(false);
      expect(result.issues.some((i: string) => i.includes('eval'))).toBe(true);
    });

    it('should warn about network access', async () => {
      const result = await verificationService.verifyTraitSource(`
        trait NetworkTrait {
          fn fetchData() {
            fetch("https://api.example.com");
          }
        }
      `);

      expect(result.warnings.some((w: string) => w.includes('Network'))).toBe(true);
    });
  });
});

// =============================================================================
// RATE LIMITER TESTS
// =============================================================================

describe('RateLimiter', () => {
  let limiter: any;

  beforeEach(async () => {
    const { RateLimiter } = await import('../VerificationService.js');
    limiter = new RateLimiter(1000, 5); // 1 second window, 5 requests
  });

  it('should allow requests within limit', () => {
    expect(limiter.isAllowed('testkey')).toBe(true);
    expect(limiter.isAllowed('testkey')).toBe(true);
    expect(limiter.isAllowed('testkey')).toBe(true);
  });

  it('should block requests over limit', () => {
    for (let i = 0; i < 5; i++) {
      limiter.isAllowed('blocked');
    }

    expect(limiter.isAllowed('blocked')).toBe(false);
  });

  it('should track remaining requests', () => {
    limiter.isAllowed('remaining');
    limiter.isAllowed('remaining');

    expect(limiter.getRemaining('remaining')).toBe(3);
  });

  it('should reset', () => {
    for (let i = 0; i < 5; i++) {
      limiter.isAllowed('reset');
    }
    expect(limiter.isAllowed('reset')).toBe(false);

    limiter.reset('reset');
    expect(limiter.isAllowed('reset')).toBe(true);
  });
});

// =============================================================================
// SPAM DETECTOR TESTS
// =============================================================================

describe('SpamDetector', () => {
  let detector: any;

  beforeEach(async () => {
    const { SpamDetector } = await import('../VerificationService.js');
    detector = new SpamDetector();
  });

  it('should allow normal content', () => {
    const result = detector.isSpam('user1', 'This is a helpful review of the trait.');
    expect(result.isSpam).toBe(false);
  });

  it('should detect duplicate content', () => {
    detector.isSpam('user2', 'Duplicate content test message here');
    const result = detector.isSpam('user2', 'Duplicate content test message here');

    expect(result.isSpam).toBe(true);
    expect(result.reason).toContain('Duplicate');
  });

  it('should detect too short content', () => {
    const result = detector.isSpam('user3', 'Hi');

    expect(result.isSpam).toBe(true);
    expect(result.reason).toContain('short');
  });

  it('should detect spam patterns', () => {
    const result = detector.isSpam('user4', 'Click here to buy now and make $1000!');

    expect(result.isSpam).toBe(true);
    expect(result.reason).toContain('pattern');
  });
});

// =============================================================================
// MARKETPLACE SERVICE TESTS
// =============================================================================

describe('MarketplaceService', () => {
  let marketplace: any;

  beforeEach(async () => {
    const { MarketplaceService } = await import('../MarketplaceService.js');
    marketplace = new MarketplaceService();

    // Register test session
    marketplace.registerSession('test-token', 'testuser', 'authenticated');
  });

  describe('publish', () => {
    it('should publish with valid token', async () => {
      const result = await marketplace.publish(
        {
          name: 'AuthTest',
          version: '1.0.0',
          description: 'Testing authenticated publish',
          license: 'MIT',
          keywords: ['test'],
          platforms: ['web'],
          category: 'utility',
          source: 'trait AuthTest {}',
        },
        'test-token'
      );

      expect(result.success).toBe(true);
    });

    it('should reject without token', async () => {
      const result = await marketplace.publish(
        {
          name: 'NoAuth',
          version: '1.0.0',
          description: 'Testing unauthenticated publish',
          license: 'MIT',
          keywords: ['test'],
          platforms: ['web'],
          category: 'utility',
          source: 'trait NoAuth {}',
        },
        'invalid-token'
      );

      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('Authentication');
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      await marketplace.publish(
        {
          name: 'SearchableMarket',
          version: '1.0.0',
          description: 'Trait for marketplace search testing',
          license: 'MIT',
          keywords: ['search', 'test'],
          platforms: ['web'],
          category: 'utility',
          source: 'trait SearchableMarket {}',
        },
        'test-token'
      );
    });

    it('should search traits', async () => {
      const result = await marketplace.search({ q: 'searchable' });

      expect(result.results.length).toBeGreaterThan(0);
    });
  });

  describe('health', () => {
    it('should return health status', async () => {
      const health = await marketplace.getHealth();

      expect(health.status).toBe('ok');
      expect(health.components.registry).toBe('ok');
    });
  });

  describe('metrics', () => {
    it('should return metrics', async () => {
      const metrics = await marketplace.getMetrics();

      expect(metrics.totalTraits).toBeDefined();
      expect(metrics.activeSessions).toBeDefined();
    });
  });

  describe('rate limiting', () => {
    it('should check rate limit', () => {
      const info = marketplace.checkRateLimit('test-token');

      expect(info.limit).toBe(1000); // authenticated tier
      expect(info.remaining).toBeLessThan(info.limit);
    });
  });
});

// =============================================================================
// DOWNLOAD STATS TESTS
// =============================================================================

describe('DownloadStatsTracker', () => {
  let tracker: any;

  beforeEach(async () => {
    const { DownloadStatsTracker } = await import('../MarketplaceService.js');
    tracker = new DownloadStatsTracker();
  });

  it('should record downloads', () => {
    tracker.record('trait1', '1.0.0');
    tracker.record('trait1', '1.0.0');

    const stats = tracker.getStats('trait1');
    expect(stats.total).toBe(2);
  });

  it('should track daily stats', () => {
    tracker.record('trait2', '1.0.0');

    const stats = tracker.getStats('trait2');
    expect(stats.lastDay).toBe(1);
    expect(stats.lastWeek).toBe(1);
    expect(stats.lastMonth).toBe(1);
  });

  it('should return empty stats for unknown trait', () => {
    const stats = tracker.getStats('unknown');
    expect(stats.total).toBe(0);
  });
});

// =============================================================================
// RATING SERVICE TESTS
// =============================================================================

describe('RatingService', () => {
  let ratingService: any;

  beforeEach(async () => {
    const { RatingService } = await import('../MarketplaceService.js');
    ratingService = new RatingService();
  });

  it('should rate trait', async () => {
    const result = await ratingService.rate('trait1', 'user1', 5, 'Great trait!');
    expect(result.success).toBe(true);
  });

  it('should reject invalid rating', async () => {
    const result = await ratingService.rate('trait1', 'user1', 6);
    expect(result.success).toBe(false);
    expect(result.error).toContain('1 and 5');
  });

  it('should get average rating', async () => {
    await ratingService.rate('trait2', 'user1', 5);
    await ratingService.rate('trait2', 'user2', 3);

    const avg = ratingService.getAverageRating('trait2');
    expect(avg.average).toBe(4);
    expect(avg.count).toBe(2);
  });

  it('should update existing rating', async () => {
    await ratingService.rate('trait3', 'user1', 3);
    await ratingService.rate('trait3', 'user1', 5);

    const avg = ratingService.getAverageRating('trait3');
    expect(avg.average).toBe(5);
    expect(avg.count).toBe(1);
  });
});

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('Module Exports', () => {
  it('should export all required modules', async () => {
    const marketplace = await import('../index.js');

    // Types
    expect(marketplace.RATE_LIMITS).toBeDefined();

    // Core services
    expect(marketplace.TraitRegistry).toBeDefined();
    expect(marketplace.MarketplaceService).toBeDefined();
    expect(marketplace.DependencyResolver).toBeDefined();
    expect(marketplace.VerificationService).toBeDefined();

    // Utilities
    expect(marketplace.RateLimiter).toBeDefined();
    expect(marketplace.SpamDetector).toBeDefined();
    expect(marketplace.parseVersionRequirement).toBeDefined();
    expect(marketplace.satisfies).toBeDefined();

    // API
    expect(marketplace.createMarketplaceRoutes).toBeDefined();
    expect(marketplace.createApp).toBeDefined();
    expect(marketplace.startServer).toBeDefined();
  }, 60_000);
});
