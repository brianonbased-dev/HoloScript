/**
 * MarketplaceIntegrationTrait — Production Test Suite
 *
 * Commence All V — Track 4: New Feature Traits
 *
 * Coverage:
 *  - onAttach initialization and auto-authentication
 *  - Publish lifecycle (draft → pending_review / published)
 *  - Semver validation (valid/invalid formats)
 *  - Version update with comparison enforcement
 *  - Unpublish workflow
 *  - Review/approval/rejection of pending publications
 *  - Install/uninstall traits
 *  - Duplicate install prevention
 *  - Review/rating submission with average calculation
 *  - Revenue tracking
 *  - Max package size enforcement
 *  - Query marketplace state
 *  - onDetach cleanup
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  marketplaceIntegrationHandler,
  validateSemVer,
  compareSemVer,
} from '../MarketplaceIntegrationTrait';
import type {
  MarketplaceIntegrationConfig,
  MarketplaceIntegrationState,
} from '../MarketplaceIntegrationTrait';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createNode(): any {
  return { id: 'test-node' };
}

function createContext() {
  return {
    emit: vi.fn(),
    vr: {} as any,
    physics: {} as any,
    audio: {} as any,
    haptics: {} as any,
    getState: () => ({}),
    setState: vi.fn(),
    getScaleMultiplier: () => 1,
    setScaleContext: vi.fn(),
  };
}

function defaultConfig(
  overrides?: Partial<MarketplaceIntegrationConfig>
): MarketplaceIntegrationConfig {
  return {
    ...marketplaceIntegrationHandler.defaultConfig,
    publisher_id: 'pub_123',
    publisher_name: 'TestPublisher',
    ...overrides,
  };
}

function attach(node: any, config: MarketplaceIntegrationConfig, context: any) {
  marketplaceIntegrationHandler.onAttach!(node, config, context);
}

function getState(node: any): MarketplaceIntegrationState {
  return node.__marketplaceIntegrationState;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('MarketplaceIntegrationTrait — Production Tests', () => {
  let node: any;
  let ctx: ReturnType<typeof createContext>;

  beforeEach(() => {
    node = createNode();
    ctx = createContext();
  });

  // =========================================================================
  // Initialization
  // =========================================================================
  describe('initialization', () => {
    it('onAttach creates state', () => {
      attach(node, defaultConfig(), ctx);
      expect(getState(node)).toBeDefined();
      expect(getState(node).publishedPackages).toEqual([]);
      expect(getState(node).installedTraits).toEqual([]);
    });

    it('auto-authenticates when publisher_id is set', () => {
      attach(node, defaultConfig(), ctx);
      expect(getState(node).isAuthenticated).toBe(true);
      expect(getState(node).publisherName).toBe('TestPublisher');
      expect(ctx.emit).toHaveBeenCalledWith(
        'marketplace_authenticated',
        expect.objectContaining({
          publisherId: 'pub_123',
        })
      );
    });

    it('skips authentication without publisher_id', () => {
      attach(node, defaultConfig({ publisher_id: '' }), ctx);
      expect(getState(node).isAuthenticated).toBe(false);
    });
  });

  // =========================================================================
  // Publish lifecycle
  // =========================================================================
  describe('publish lifecycle', () => {
    it('publishes trait with review required → pending_review', () => {
      const config = defaultConfig({ require_review: true });
      attach(node, config, ctx);

      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_publish',
        name: 'My Trait',
        version: '1.0.0',
        description: 'A cool trait',
        category: 'visual',
      });

      const state = getState(node);
      expect(state.pendingPublications.length).toBe(1);
      expect(state.pendingPublications[0].status).toBe('pending_review');
      expect(state.publishedPackages.length).toBe(0);
    });

    it('publishes directly when review not required', () => {
      const config = defaultConfig({ require_review: false });
      attach(node, config, ctx);

      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_publish',
        name: 'My Trait',
        version: '1.0.0',
      });

      expect(getState(node).publishedPackages.length).toBe(1);
      expect(getState(node).publishedPackages[0].status).toBe('published');
    });

    it('rejects publish when not authenticated', () => {
      const config = defaultConfig({ publisher_id: '' });
      attach(node, config, ctx);

      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_publish',
        name: 'Trait',
        version: '1.0.0',
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'marketplace_error',
        expect.objectContaining({
          error: expect.stringContaining('Not authenticated'),
        })
      );
    });

    it('rejects invalid semver', () => {
      attach(node, defaultConfig(), ctx);

      marketplaceIntegrationHandler.onEvent!(node, defaultConfig(), ctx, {
        type: 'marketplace_publish',
        name: 'Trait',
        version: 'not-a-version',
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'marketplace_error',
        expect.objectContaining({
          error: expect.stringContaining('Invalid version format'),
        })
      );
    });

    it('rejects oversized packages', () => {
      const config = defaultConfig({ max_package_size_mb: 1 });
      attach(node, config, ctx);

      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_publish',
        name: 'Big Trait',
        version: '1.0.0',
        fileSize: 2 * 1024 * 1024, // 2MB > 1MB limit
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'marketplace_error',
        expect.objectContaining({
          error: expect.stringContaining('exceeds max size'),
        })
      );
    });
  });

  // =========================================================================
  // Review approval/rejection
  // =========================================================================
  describe('review approval', () => {
    it('approves pending publication', () => {
      const config = defaultConfig({ require_review: true });
      attach(node, config, ctx);

      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_publish',
        name: 'Pending Trait',
        version: '1.0.0',
      });

      const pkgId = getState(node).pendingPublications[0].id;

      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_review_result',
        packageId: pkgId,
        approved: true,
      });

      const state = getState(node);
      expect(state.pendingPublications.length).toBe(0);
      expect(state.publishedPackages.length).toBe(1);
      expect(state.publishedPackages[0].status).toBe('published');
    });

    it('rejects pending publication', () => {
      const config = defaultConfig({ require_review: true });
      attach(node, config, ctx);

      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_publish',
        name: 'Bad Trait',
        version: '1.0.0',
      });

      const pkgId = getState(node).pendingPublications[0].id;

      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_review_result',
        packageId: pkgId,
        approved: false,
        reason: 'Policy violation',
      });

      expect(getState(node).pendingPublications.length).toBe(0);
      expect(ctx.emit).toHaveBeenCalledWith(
        'marketplace_rejected',
        expect.objectContaining({
          reason: 'Policy violation',
        })
      );
    });
  });

  // =========================================================================
  // Unpublish
  // =========================================================================
  describe('unpublish', () => {
    it('unpublishes a published trait', () => {
      const config = defaultConfig({ require_review: false });
      attach(node, config, ctx);

      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_publish',
        name: 'Trait',
        version: '1.0.0',
      });

      const pkgId = getState(node).publishedPackages[0].id;

      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_unpublish',
        packageId: pkgId,
      });

      expect(getState(node).publishedPackages[0].status).toBe('unpublished');
    });
  });

  // =========================================================================
  // Version update
  // =========================================================================
  describe('version update', () => {
    it('updates to higher version', () => {
      const config = defaultConfig({ require_review: false });
      attach(node, config, ctx);

      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_publish',
        name: 'Trait',
        version: '1.0.0',
      });

      const pkgId = getState(node).publishedPackages[0].id;

      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_update_version',
        packageId: pkgId,
        version: '2.0.0',
      });

      expect(getState(node).publishedPackages[0].version).toBe('2.0.0');
    });

    it('rejects lower version', () => {
      const config = defaultConfig({ require_review: false });
      attach(node, config, ctx);

      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_publish',
        name: 'Trait',
        version: '2.0.0',
      });

      const pkgId = getState(node).publishedPackages[0].id;

      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_update_version',
        packageId: pkgId,
        version: '1.0.0',
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'marketplace_error',
        expect.objectContaining({
          error: expect.stringContaining('must be greater'),
        })
      );
    });

    it('rejects same version', () => {
      const config = defaultConfig({ require_review: false });
      attach(node, config, ctx);

      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_publish',
        name: 'Trait',
        version: '1.0.0',
      });

      const pkgId = getState(node).publishedPackages[0].id;

      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_update_version',
        packageId: pkgId,
        version: '1.0.0',
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'marketplace_error',
        expect.objectContaining({
          error: expect.stringContaining('must be greater'),
        })
      );
    });
  });

  // =========================================================================
  // Install / Uninstall
  // =========================================================================
  describe('install/uninstall', () => {
    it('installs a trait', () => {
      attach(node, defaultConfig(), ctx);

      marketplaceIntegrationHandler.onEvent!(node, defaultConfig(), ctx, {
        type: 'marketplace_install',
        packageId: 'pkg_external',
        name: 'External Trait',
        version: '3.0.0',
      });

      expect(getState(node).installedTraits.length).toBe(1);
      expect(getState(node).installedTraits[0].name).toBe('External Trait');
    });

    it('prevents duplicate install', () => {
      attach(node, defaultConfig(), ctx);
      const config = defaultConfig();

      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_install',
        packageId: 'pkg_1',
        name: 'Trait',
      });

      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_install',
        packageId: 'pkg_1',
        name: 'Trait',
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'marketplace_error',
        expect.objectContaining({
          error: expect.stringContaining('already installed'),
        })
      );
    });

    it('uninstalls a trait', () => {
      attach(node, defaultConfig(), ctx);
      const config = defaultConfig();

      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_install',
        packageId: 'pkg_1',
        name: 'Trait',
      });

      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_uninstall',
        packageId: 'pkg_1',
      });

      expect(getState(node).installedTraits.length).toBe(0);
    });
  });

  // =========================================================================
  // Reviews
  // =========================================================================
  describe('reviews', () => {
    it('submits review and updates package rating', () => {
      const config = defaultConfig({ require_review: false });
      attach(node, config, ctx);

      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_publish',
        name: 'Trait',
        version: '1.0.0',
      });

      const pkgId = getState(node).publishedPackages[0].id;

      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_submit_review',
        packageId: pkgId,
        rating: 5,
        reviewer: 'user1',
        comment: 'Great!',
      });

      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_submit_review',
        packageId: pkgId,
        rating: 3,
        reviewer: 'user2',
        comment: 'OK',
      });

      const pkg = getState(node).publishedPackages[0];
      expect(pkg.reviewCount).toBe(2);
      expect(pkg.rating).toBe(4); // (5+3)/2
    });

    it('clamps rating to 1-5', () => {
      const config = defaultConfig({ require_review: false });
      attach(node, config, ctx);

      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_publish',
        name: 'Trait',
        version: '1.0.0',
      });

      const pkgId = getState(node).publishedPackages[0].id;

      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_submit_review',
        packageId: pkgId,
        rating: 10,
      });

      expect(getState(node).reviews[0].rating).toBe(5);
    });
  });

  // =========================================================================
  // Revenue
  // =========================================================================
  describe('revenue', () => {
    it('tracks revenue per package', () => {
      const config = defaultConfig({ require_review: false });
      attach(node, config, ctx);

      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_publish',
        name: 'Paid Trait',
        version: '1.0.0',
        pricing: 'one_time',
        price: 10,
      });

      const pkgId = getState(node).publishedPackages[0].id;

      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_revenue',
        packageId: pkgId,
        amount: 10,
      });

      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_revenue',
        packageId: pkgId,
        amount: 15,
      });

      expect(getState(node).publishedPackages[0].revenue).toBe(25);
      expect(getState(node).totalRevenue).toBe(25);
    });
  });

  // =========================================================================
  // Query
  // =========================================================================
  describe('query', () => {
    it('returns marketplace state summary', () => {
      attach(node, defaultConfig(), ctx);

      marketplaceIntegrationHandler.onEvent!(node, defaultConfig(), ctx, {
        type: 'marketplace_query',
        queryId: 'q1',
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'marketplace_integration_info',
        expect.objectContaining({
          queryId: 'q1',
          publisherName: 'TestPublisher',
          isAuthenticated: true,
        })
      );
    });
  });

  // =========================================================================
  // Detach
  // =========================================================================
  describe('detach', () => {
    it('cleans up state', () => {
      attach(node, defaultConfig(), ctx);
      marketplaceIntegrationHandler.onDetach!(node, defaultConfig(), ctx);
      expect(node.__marketplaceIntegrationState).toBeUndefined();
    });
  });

  // =========================================================================
  // Semver helpers
  // =========================================================================
  describe('semver helpers', () => {
    it('validates correct semver', () => {
      expect(validateSemVer('1.0.0')).toBe(true);
      expect(validateSemVer('0.1.0')).toBe(true);
      expect(validateSemVer('10.20.30')).toBe(true);
      expect(validateSemVer('1.0.0-beta.1')).toBe(true);
    });

    it('rejects invalid semver', () => {
      expect(validateSemVer('1.0')).toBe(false);
      expect(validateSemVer('v1.0.0')).toBe(false);
      expect(validateSemVer('abc')).toBe(false);
      expect(validateSemVer('')).toBe(false);
    });

    it('compareSemVer orders correctly', () => {
      expect(compareSemVer('2.0.0', '1.0.0')).toBe(1);
      expect(compareSemVer('1.0.0', '2.0.0')).toBe(-1);
      expect(compareSemVer('1.0.0', '1.0.0')).toBe(0);
      expect(compareSemVer('1.2.0', '1.1.0')).toBe(1);
      expect(compareSemVer('1.0.1', '1.0.0')).toBe(1);
    });
  });
});
