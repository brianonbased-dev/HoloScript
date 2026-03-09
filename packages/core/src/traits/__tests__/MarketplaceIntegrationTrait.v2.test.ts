/**
 * MarketplaceIntegrationTrait v2 Deep Expansion Tests
 *
 * Covers gaps in existing production suite: version management (semver validation,
 * upgrade/downgrade), review system (rating clamp, average calc), revenue tracking,
 * publish lifecycle edge cases (oversized, unauthenticated, direct publish),
 * install/uninstall (duplicate, download tracking), and query.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { marketplaceIntegrationHandler } from '../MarketplaceIntegrationTrait';

// =============================================================================
// HELPERS
// =============================================================================

function makeNode(id = 'mkt-node') {
  return { id } as any;
}

function makeConfig(
  overrides: Partial<Parameters<typeof marketplaceIntegrationHandler.onAttach>[1]> = {}
) {
  return { ...marketplaceIntegrationHandler.defaultConfig, ...overrides };
}

function makeAuthConfig(
  overrides: Partial<Parameters<typeof marketplaceIntegrationHandler.onAttach>[1]> = {}
) {
  return makeConfig({ publisher_id: 'pub_1', publisher_name: 'TestPub', ...overrides });
}

function makeContext() {
  return { emit: vi.fn() };
}

function getState(node: any) {
  return (node as any).__marketplaceIntegrationState;
}

/** Publish a package and return the emitted packageId */
function publishPackage(node: any, cfg: any, ctx: any, overrides: Record<string, any> = {}) {
  marketplaceIntegrationHandler.onEvent!(node, cfg, ctx, {
    type: 'marketplace_publish',
    name: 'TestTrait',
    version: '1.0.0',
    description: 'A test trait',
    ...overrides,
  });
  const publishCall = ctx.emit.mock.calls.find((c: any) => c[0] === 'marketplace_published');
  return publishCall?.[1]?.packageId;
}

// =============================================================================
// TESTS
// =============================================================================

describe('MarketplaceIntegrationTrait — Deep Expansion', () => {
  let node: any;
  let config: ReturnType<typeof makeAuthConfig>;
  let ctx: ReturnType<typeof makeContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    node = makeNode();
    config = makeAuthConfig();
    ctx = makeContext();
    marketplaceIntegrationHandler.onAttach(node, config, ctx);
  });

  afterEach(() => {
    delete (node as any).__marketplaceIntegrationState;
  });

  // ======== VERSION MANAGEMENT ========

  describe('version management', () => {
    it('rejects invalid semver format', () => {
      ctx.emit.mockClear();
      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_publish',
        name: 'BadVersion',
        version: 'not-a-version',
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'marketplace_error',
        expect.objectContaining({
          error: expect.stringContaining('Invalid version format'),
        })
      );
    });

    it('accepts valid semver with prerelease', () => {
      ctx.emit.mockClear();
      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_publish',
        name: 'PreRelease',
        version: '1.0.0-beta.1',
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'marketplace_published',
        expect.objectContaining({
          version: '1.0.0-beta.1',
        })
      );
    });

    it('updates version on marketplace_update_version', () => {
      const pkgId = publishPackage(node, makeConfig({ ...config, require_review: false }), ctx);
      ctx.emit.mockClear();

      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_update_version',
        packageId: pkgId,
        version: '2.0.0',
      });

      expect(ctx.emit).toHaveBeenCalledWith('marketplace_version_updated', {
        node,
        packageId: pkgId,
        version: '2.0.0',
      });

      const pkg = getState(node).publishedPackages.find((p: any) => p.id === pkgId);
      expect(pkg.version).toBe('2.0.0');
    });

    it('rejects downgrade version', () => {
      const cfg = makeAuthConfig({ require_review: false });
      marketplaceIntegrationHandler.onAttach(node, cfg, ctx);
      const pkgId = publishPackage(node, cfg, ctx, { version: '2.0.0' });
      ctx.emit.mockClear();

      marketplaceIntegrationHandler.onEvent!(node, cfg, ctx, {
        type: 'marketplace_update_version',
        packageId: pkgId,
        version: '1.0.0',
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'marketplace_error',
        expect.objectContaining({
          error: expect.stringContaining('must be greater than'),
        })
      );
    });

    it('rejects same version', () => {
      const cfg = makeAuthConfig({ require_review: false });
      marketplaceIntegrationHandler.onAttach(node, cfg, ctx);
      const pkgId = publishPackage(node, cfg, ctx, { version: '1.0.0' });
      ctx.emit.mockClear();

      marketplaceIntegrationHandler.onEvent!(node, cfg, ctx, {
        type: 'marketplace_update_version',
        packageId: pkgId,
        version: '1.0.0',
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'marketplace_error',
        expect.objectContaining({
          error: expect.stringContaining('must be greater than'),
        })
      );
    });

    it('rejects invalid semver in update', () => {
      const cfg = makeAuthConfig({ require_review: false });
      marketplaceIntegrationHandler.onAttach(node, cfg, ctx);
      const pkgId = publishPackage(node, cfg, ctx);
      ctx.emit.mockClear();

      marketplaceIntegrationHandler.onEvent!(node, cfg, ctx, {
        type: 'marketplace_update_version',
        packageId: pkgId,
        version: 'bad',
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'marketplace_error',
        expect.objectContaining({
          error: expect.stringContaining('Invalid version'),
        })
      );
    });
  });

  // ======== REVIEW SYSTEM ========

  describe('review system', () => {
    it('clamps rating to range 1-5 (low)', () => {
      const cfg = makeAuthConfig({ require_review: false });
      marketplaceIntegrationHandler.onAttach(node, cfg, ctx);
      const pkgId = publishPackage(node, cfg, ctx);
      ctx.emit.mockClear();

      marketplaceIntegrationHandler.onEvent!(node, cfg, ctx, {
        type: 'marketplace_submit_review',
        packageId: pkgId,
        rating: -1,
        reviewer: 'alice',
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'marketplace_review_submitted',
        expect.objectContaining({
          rating: 1,
        })
      );
    });

    it('clamps rating to range 1-5 (high)', () => {
      const cfg = makeAuthConfig({ require_review: false });
      marketplaceIntegrationHandler.onAttach(node, cfg, ctx);
      const pkgId = publishPackage(node, cfg, ctx);
      ctx.emit.mockClear();

      marketplaceIntegrationHandler.onEvent!(node, cfg, ctx, {
        type: 'marketplace_submit_review',
        packageId: pkgId,
        rating: 10,
        reviewer: 'bob',
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'marketplace_review_submitted',
        expect.objectContaining({
          rating: 5,
        })
      );
    });

    it('calculates average rating across multiple reviews', () => {
      const cfg = makeAuthConfig({ require_review: false });
      marketplaceIntegrationHandler.onAttach(node, cfg, ctx);
      const pkgId = publishPackage(node, cfg, ctx);

      // Submit 3 reviews: 3, 5, 4 → avg = 4.0
      marketplaceIntegrationHandler.onEvent!(node, cfg, ctx, {
        type: 'marketplace_submit_review',
        packageId: pkgId,
        rating: 3,
        reviewer: 'a',
      });
      marketplaceIntegrationHandler.onEvent!(node, cfg, ctx, {
        type: 'marketplace_submit_review',
        packageId: pkgId,
        rating: 5,
        reviewer: 'b',
      });
      marketplaceIntegrationHandler.onEvent!(node, cfg, ctx, {
        type: 'marketplace_submit_review',
        packageId: pkgId,
        rating: 4,
        reviewer: 'c',
      });

      const pkg = getState(node).publishedPackages.find((p: any) => p.id === pkgId);
      expect(pkg.reviewCount).toBe(3);
      expect(pkg.rating).toBe(4);
    });

    it('defaults reviewer to anonymous', () => {
      const cfg = makeAuthConfig({ require_review: false });
      marketplaceIntegrationHandler.onAttach(node, cfg, ctx);
      publishPackage(node, cfg, ctx);

      marketplaceIntegrationHandler.onEvent!(node, cfg, ctx, {
        type: 'marketplace_submit_review',
        packageId: getState(node).publishedPackages[0].id,
        rating: 5,
      });

      const review = getState(node).reviews[0];
      expect(review.reviewer).toBe('anonymous');
    });
  });

  // ======== REVENUE ========

  describe('revenue tracking', () => {
    it('accumulates revenue per-package and total', () => {
      const cfg = makeAuthConfig({ require_review: false });
      marketplaceIntegrationHandler.onAttach(node, cfg, ctx);
      const pkgId = publishPackage(node, cfg, ctx);
      ctx.emit.mockClear();

      marketplaceIntegrationHandler.onEvent!(node, cfg, ctx, {
        type: 'marketplace_revenue',
        packageId: pkgId,
        amount: 50,
      });
      marketplaceIntegrationHandler.onEvent!(node, cfg, ctx, {
        type: 'marketplace_revenue',
        packageId: pkgId,
        amount: 30,
      });

      const s = getState(node);
      const pkg = s.publishedPackages.find((p: any) => p.id === pkgId);
      expect(pkg.revenue).toBe(80);
      expect(s.totalRevenue).toBe(80);
    });

    it('ignores revenue for unknown package', () => {
      ctx.emit.mockClear();
      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_revenue',
        packageId: 'fake_pkg',
        amount: 100,
      });

      expect(ctx.emit).not.toHaveBeenCalledWith('marketplace_revenue_recorded', expect.anything());
    });
  });

  // ======== PUBLISH LIFECYCLE ========

  describe('publish lifecycle', () => {
    it('sets pending_review when require_review is true', () => {
      ctx.emit.mockClear();
      publishPackage(node, config, ctx);

      expect(ctx.emit).toHaveBeenCalledWith(
        'marketplace_published',
        expect.objectContaining({
          status: 'pending_review',
        })
      );
      expect(getState(node).pendingPublications).toHaveLength(1);
    });

    it('publishes directly when require_review is false', () => {
      const cfg = makeAuthConfig({ require_review: false });
      marketplaceIntegrationHandler.onAttach(node, cfg, ctx);
      ctx.emit.mockClear();

      publishPackage(node, cfg, ctx);

      expect(ctx.emit).toHaveBeenCalledWith(
        'marketplace_published',
        expect.objectContaining({
          status: 'published',
        })
      );
      expect(getState(node).publishedPackages).toHaveLength(1);
    });

    it('approves pending publication', () => {
      ctx.emit.mockClear();
      const pkgId = publishPackage(node, config, ctx);

      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_review_result',
        packageId: pkgId,
        approved: true,
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'marketplace_approved',
        expect.objectContaining({ packageId: pkgId })
      );
      expect(getState(node).publishedPackages).toHaveLength(1);
      expect(getState(node).pendingPublications).toHaveLength(0);
    });

    it('rejects pending publication', () => {
      ctx.emit.mockClear();
      const pkgId = publishPackage(node, config, ctx);

      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_review_result',
        packageId: pkgId,
        approved: false,
        reason: 'Quality too low',
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'marketplace_rejected',
        expect.objectContaining({
          packageId: pkgId,
          reason: 'Quality too low',
        })
      );
    });

    it('unpublishes a published package', () => {
      const cfg = makeAuthConfig({ require_review: false });
      marketplaceIntegrationHandler.onAttach(node, cfg, ctx);
      const pkgId = publishPackage(node, cfg, ctx);
      ctx.emit.mockClear();

      marketplaceIntegrationHandler.onEvent!(node, cfg, ctx, {
        type: 'marketplace_unpublish',
        packageId: pkgId,
      });

      const pkg = getState(node).publishedPackages.find((p: any) => p.id === pkgId);
      expect(pkg.status).toBe('unpublished');
      expect(ctx.emit).toHaveBeenCalledWith(
        'marketplace_unpublished',
        expect.objectContaining({ packageId: pkgId })
      );
    });

    it('rejects unauthenticated publish', () => {
      const unauthCfg = makeConfig();
      const unauthNode = makeNode('unauth');
      const unauthCtx = makeContext();
      marketplaceIntegrationHandler.onAttach(unauthNode, unauthCfg, unauthCtx);
      unauthCtx.emit.mockClear();

      marketplaceIntegrationHandler.onEvent!(unauthNode, unauthCfg, unauthCtx, {
        type: 'marketplace_publish',
        name: 'Sneaky',
        version: '1.0.0',
      });

      expect(unauthCtx.emit).toHaveBeenCalledWith(
        'marketplace_error',
        expect.objectContaining({
          error: expect.stringContaining('Not authenticated'),
        })
      );
    });

    it('rejects oversized package', () => {
      const cfg = makeAuthConfig({ max_package_size_mb: 1 });
      marketplaceIntegrationHandler.onAttach(node, cfg, ctx);
      ctx.emit.mockClear();

      marketplaceIntegrationHandler.onEvent!(node, cfg, ctx, {
        type: 'marketplace_publish',
        name: 'BigTrait',
        version: '1.0.0',
        fileSize: 2 * 1024 * 1024, // 2 MB > 1 MB limit
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'marketplace_error',
        expect.objectContaining({
          error: expect.stringContaining('exceeds max size'),
        })
      );
    });
  });

  // ======== INSTALL / UNINSTALL ========

  describe('install / uninstall', () => {
    it('rejects duplicate install', () => {
      ctx.emit.mockClear();
      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_install',
        packageId: 'pkg_dup',
        name: 'DupTrait',
        version: '1.0.0',
      });
      ctx.emit.mockClear();

      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_install',
        packageId: 'pkg_dup',
        name: 'DupTrait',
        version: '1.0.0',
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'marketplace_error',
        expect.objectContaining({
          error: expect.stringContaining('already installed'),
        })
      );
    });

    it('tracks downloads on own published package', () => {
      const cfg = makeAuthConfig({ require_review: false });
      marketplaceIntegrationHandler.onAttach(node, cfg, ctx);
      const pkgId = publishPackage(node, cfg, ctx);

      marketplaceIntegrationHandler.onEvent!(node, cfg, ctx, {
        type: 'marketplace_install',
        packageId: pkgId,
      });

      const s = getState(node);
      const pkg = s.publishedPackages.find((p: any) => p.id === pkgId);
      expect(pkg.downloads).toBe(1);
      expect(s.totalDownloads).toBe(1);
    });

    it('uninstalls a trait', () => {
      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_install',
        packageId: 'pkg_rem',
        name: 'RemoveTrait',
      });

      ctx.emit.mockClear();
      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_uninstall',
        packageId: 'pkg_rem',
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'marketplace_uninstalled',
        expect.objectContaining({
          packageId: 'pkg_rem',
          name: 'RemoveTrait',
        })
      );
      expect(getState(node).installedTraits).toHaveLength(0);
    });
  });

  // ======== QUERY ========

  describe('query', () => {
    it('responds with full marketplace state', () => {
      ctx.emit.mockClear();
      marketplaceIntegrationHandler.onEvent!(node, config, ctx, {
        type: 'marketplace_query',
        queryId: 'q1',
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'marketplace_integration_info',
        expect.objectContaining({
          queryId: 'q1',
          publisherName: 'TestPub',
          isAuthenticated: true,
          publishedCount: 0,
          installedCount: 0,
        })
      );
    });
  });
});
