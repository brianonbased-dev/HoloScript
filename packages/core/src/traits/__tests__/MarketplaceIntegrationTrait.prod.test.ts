/**
 * MarketplaceIntegrationTrait Production Tests
 *
 * Trait publishing, install/uninstall, review, revenue tracking,
 * and semver validation for the HoloScript marketplace.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import marketplaceIntegrationHandler, {
  validateSemVer,
  compareSemVer,
} from '../MarketplaceIntegrationTrait';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeNode(): any { return {}; }
function makeCtx() { const emit = vi.fn(); return { emit }; }

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    marketplace_url: 'https://marketplace.holoscript.dev',
    publisher_id: 'pub_123',
    publisher_name: 'TestPublisher',
    default_category: 'utility',
    default_pricing: 'free',
    default_price: 0,
    default_currency: 'USD',
    auto_update_installed: true,
    max_package_size_mb: 50,
    require_review: false, // default to no review for test convenience
    ...overrides,
  };
}

function attach(overrides: Record<string, unknown> = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const cfg = makeConfig(overrides);
  marketplaceIntegrationHandler.onAttach!(node, cfg as any, ctx as any);
  return { node, ctx, cfg };
}

function st(node: any) { return (node as any).__marketplaceIntegrationState; }

function fire(node: any, cfg: any, ctx: any, event: Record<string, unknown>) {
  marketplaceIntegrationHandler.onEvent!(node, cfg, ctx as any, event);
}

// ─── Tests: validateSemVer ───────────────────────────────────────────────────

describe('validateSemVer — helper', () => {

  it('accepts valid semver 1.0.0', () => expect(validateSemVer('1.0.0')).toBe(true));
  it('accepts valid semver 2.3.11', () => expect(validateSemVer('2.3.11')).toBe(true));
  it('accepts prerelease 1.0.0-alpha.1', () => expect(validateSemVer('1.0.0-alpha.1')).toBe(true));
  it('rejects bare integer "1"', () => expect(validateSemVer('1')).toBe(false));
  it('rejects "1.0" (missing patch)', () => expect(validateSemVer('1.0')).toBe(false));
  it('rejects empty string', () => expect(validateSemVer('')).toBe(false));
  it('rejects version with v prefix "v1.0.0"', () => expect(validateSemVer('v1.0.0')).toBe(false));
});

// ─── Tests: compareSemVer ────────────────────────────────────────────────────

describe('compareSemVer — helper', () => {

  it('returns 0 for equal versions', () => expect(compareSemVer('1.0.0', '1.0.0')).toBe(0));
  it('returns 1 when a > b (major)', () => expect(compareSemVer('2.0.0', '1.9.9')).toBe(1));
  it('returns -1 when a < b (major)', () => expect(compareSemVer('1.0.0', '2.0.0')).toBe(-1));
  it('compares minor correctly', () => expect(compareSemVer('1.2.0', '1.1.9')).toBe(1));
  it('compares patch correctly', () => expect(compareSemVer('1.0.1', '1.0.2')).toBe(-1));
});

// ─── Tests: defaultConfig / name ─────────────────────────────────────────────

describe('MarketplaceIntegrationTrait — defaultConfig', () => {

  it('has name marketplace_integration', () => {
    expect(marketplaceIntegrationHandler.name).toBe('marketplace_integration');
  });

  it('defaultConfig default_pricing is free', () => {
    expect(marketplaceIntegrationHandler.defaultConfig.default_pricing).toBe('free');
  });

  it('defaultConfig require_review is true', () => {
    expect(marketplaceIntegrationHandler.defaultConfig.require_review).toBe(true);
  });

  it('defaultConfig max_package_size_mb is 50', () => {
    expect(marketplaceIntegrationHandler.defaultConfig.max_package_size_mb).toBe(50);
  });
});

// ─── Tests: onAttach ─────────────────────────────────────────────────────────

describe('MarketplaceIntegrationTrait — onAttach', () => {

  beforeEach(() => vi.clearAllMocks());

  it('creates state with empty arrays and zero counters', () => {
    const { node } = attach();
    const s = st(node);
    expect(s.publishedPackages).toEqual([]);
    expect(s.installedTraits).toEqual([]);
    expect(s.pendingPublications).toEqual([]);
    expect(s.reviews).toEqual([]);
    expect(s.totalRevenue).toBe(0);
    expect(s.totalDownloads).toBe(0);
  });

  it('auto-authenticates when publisher_id is provided', () => {
    const { node, ctx } = attach({ publisher_id: 'pub_abc', publisher_name: 'Alice' });
    const s = st(node);
    expect(s.isAuthenticated).toBe(true);
    expect(s.publisherName).toBe('Alice');
    expect(ctx.emit).toHaveBeenCalledWith('marketplace_authenticated', expect.objectContaining({
      publisherId: 'pub_abc',
      publisherName: 'Alice',
    }));
  });

  it('uses publisher_id as name when publisher_name is empty', () => {
    const { node } = attach({ publisher_id: 'pub_xyz', publisher_name: '' });
    expect(st(node).publisherName).toBe('pub_xyz');
  });

  it('stays unauthenticated when publisher_id is empty', () => {
    const { node } = attach({ publisher_id: '' });
    expect(st(node).isAuthenticated).toBe(false);
  });

  it('emits marketplace_integration_initialized', () => {
    const { ctx } = attach();
    expect(ctx.emit).toHaveBeenCalledWith('marketplace_integration_initialized', expect.objectContaining({
      marketplaceUrl: 'https://marketplace.holoscript.dev',
    }));
  });
});

// ─── Tests: onDetach ─────────────────────────────────────────────────────────

describe('MarketplaceIntegrationTrait — onDetach', () => {

  it('removes state and emits marketplace_integration_disconnected', () => {
    const { node, ctx, cfg } = attach();
    marketplaceIntegrationHandler.onDetach!(node, cfg as any, ctx as any);
    expect(st(node)).toBeUndefined();
    expect(ctx.emit).toHaveBeenCalledWith('marketplace_integration_disconnected', expect.objectContaining({ node }));
  });
});

// ─── Tests: onEvent: publish ──────────────────────────────────────────────────

describe('MarketplaceIntegrationTrait — marketplace_publish', () => {

  beforeEach(() => vi.clearAllMocks());

  it('rejects publish when not authenticated', () => {
    const { node, ctx, cfg } = attach({ publisher_id: '' });
    fire(node, cfg, ctx, { type: 'marketplace_publish', name: 'MyTrait', version: '1.0.0' });
    expect(ctx.emit).toHaveBeenCalledWith('marketplace_error', expect.objectContaining({
      error: expect.stringContaining('authenticated'),
    }));
    expect(st(node).publishedPackages).toHaveLength(0);
  });

  it('rejects invalid semver', () => {
    const { node, ctx, cfg } = attach();
    fire(node, cfg, ctx, { type: 'marketplace_publish', name: 'T', version: 'bad' });
    expect(ctx.emit).toHaveBeenCalledWith('marketplace_error', expect.objectContaining({
      error: expect.stringContaining('semver'),
    }));
  });

  it('rejects file exceeding max size', () => {
    const { node, ctx, cfg } = attach({ max_package_size_mb: 1 });
    fire(node, cfg, ctx, { type: 'marketplace_publish', name: 'T', version: '1.0.0', fileSize: 2 * 1024 * 1024 });
    expect(ctx.emit).toHaveBeenCalledWith('marketplace_error', expect.objectContaining({
      error: expect.stringContaining('size'),
    }));
  });

  it('publishes directly when require_review=false', () => {
    const { node, ctx, cfg } = attach({ require_review: false });
    fire(node, cfg, ctx, { type: 'marketplace_publish', name: 'AwesomeTrait', version: '1.0.0' });
    expect(st(node).publishedPackages).toHaveLength(1);
    expect(st(node).publishedPackages[0].status).toBe('published');
    expect(ctx.emit).toHaveBeenCalledWith('marketplace_published', expect.objectContaining({
      name: 'AwesomeTrait',
      status: 'published',
    }));
  });

  it('adds to pendingPublications when require_review=true', () => {
    const { node, ctx, cfg } = attach({ require_review: true });
    fire(node, cfg, ctx, { type: 'marketplace_publish', name: 'Gated', version: '2.0.0' });
    expect(st(node).pendingPublications).toHaveLength(1);
    expect(st(node).pendingPublications[0].status).toBe('pending_review');
    expect(st(node).publishedPackages).toHaveLength(0);
  });
});

// ─── Tests: onEvent: review_result ───────────────────────────────────────────

describe('MarketplaceIntegrationTrait — marketplace_review_result', () => {

  beforeEach(() => vi.clearAllMocks());

  it('approves pending package and moves to published', () => {
    const { node, ctx, cfg } = attach({ require_review: true });
    fire(node, cfg, ctx, { type: 'marketplace_publish', name: 'P', version: '1.0.0' });
    const pkgId = st(node).pendingPublications[0].id;
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'marketplace_review_result', packageId: pkgId, approved: true });
    expect(st(node).pendingPublications).toHaveLength(0);
    expect(st(node).publishedPackages).toHaveLength(1);
    expect(ctx.emit).toHaveBeenCalledWith('marketplace_approved', expect.objectContaining({ packageId: pkgId }));
  });

  it('rejects pending package and removes from pending', () => {
    const { node, ctx, cfg } = attach({ require_review: true });
    fire(node, cfg, ctx, { type: 'marketplace_publish', name: 'P', version: '1.0.0' });
    const pkgId = st(node).pendingPublications[0].id;
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'marketplace_review_result', packageId: pkgId, approved: false, reason: 'Policy violation' });
    expect(st(node).pendingPublications).toHaveLength(0);
    expect(st(node).publishedPackages).toHaveLength(0);
    expect(ctx.emit).toHaveBeenCalledWith('marketplace_rejected', expect.objectContaining({ reason: 'Policy violation' }));
  });
});

// ─── Tests: unpublish ────────────────────────────────────────────────────────

describe('MarketplaceIntegrationTrait — marketplace_unpublish', () => {

  it('sets status to unpublished and emits marketplace_unpublished', () => {
    const { node, ctx, cfg } = attach({ require_review: false });
    fire(node, cfg, ctx, { type: 'marketplace_publish', name: 'T', version: '1.0.0' });
    const pkgId = st(node).publishedPackages[0].id;
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'marketplace_unpublish', packageId: pkgId });
    expect(st(node).publishedPackages[0].status).toBe('unpublished');
    expect(ctx.emit).toHaveBeenCalledWith('marketplace_unpublished', expect.objectContaining({ packageId: pkgId }));
  });
});

// ─── Tests: update_version ───────────────────────────────────────────────────

describe('MarketplaceIntegrationTrait — marketplace_update_version', () => {

  it('updates version when new is higher than current', () => {
    const { node, ctx, cfg } = attach({ require_review: false });
    fire(node, cfg, ctx, { type: 'marketplace_publish', name: 'T', version: '1.0.0' });
    const pkgId = st(node).publishedPackages[0].id;
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'marketplace_update_version', packageId: pkgId, version: '1.1.0' });
    expect(st(node).publishedPackages[0].version).toBe('1.1.0');
    expect(ctx.emit).toHaveBeenCalledWith('marketplace_version_updated', expect.objectContaining({ version: '1.1.0' }));
  });

  it('rejects downgrade (new version <= current)', () => {
    const { node, ctx, cfg } = attach({ require_review: false });
    fire(node, cfg, ctx, { type: 'marketplace_publish', name: 'T', version: '2.0.0' });
    const pkgId = st(node).publishedPackages[0].id;
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'marketplace_update_version', packageId: pkgId, version: '1.0.0' });
    expect(ctx.emit).toHaveBeenCalledWith('marketplace_error', expect.objectContaining({
      error: expect.stringContaining('greater than'),
    }));
  });

  it('rejects invalid semver on version update', () => {
    const { node, ctx, cfg } = attach({ require_review: false });
    fire(node, cfg, ctx, { type: 'marketplace_publish', name: 'T', version: '1.0.0' });
    const pkgId = st(node).publishedPackages[0].id;
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'marketplace_update_version', packageId: pkgId, version: 'not-valid' });
    expect(ctx.emit).toHaveBeenCalledWith('marketplace_error', expect.objectContaining({
      error: expect.stringContaining('Invalid version'),
    }));
  });
});

// ─── Tests: install / uninstall ──────────────────────────────────────────────

describe('MarketplaceIntegrationTrait — install/uninstall', () => {

  it('installs a trait and emits marketplace_installed', () => {
    const { node, ctx, cfg } = attach();
    fire(node, cfg, ctx, { type: 'marketplace_install', packageId: 'ext_pkg_1', name: 'CoolTrait', version: '1.0.0' });
    expect(st(node).installedTraits).toHaveLength(1);
    expect(st(node).installedTraits[0].packageId).toBe('ext_pkg_1');
    expect(ctx.emit).toHaveBeenCalledWith('marketplace_installed', expect.objectContaining({
      packageId: 'ext_pkg_1',
      name: 'CoolTrait',
    }));
  });

  it('prevents duplicate installs and emits error', () => {
    const { node, ctx, cfg } = attach();
    fire(node, cfg, ctx, { type: 'marketplace_install', packageId: 'pkg_dup', name: 'D', version: '1.0.0' });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'marketplace_install', packageId: 'pkg_dup', name: 'D', version: '1.0.0' });
    expect(ctx.emit).toHaveBeenCalledWith('marketplace_error', expect.objectContaining({
      error: expect.stringContaining('already installed'),
    }));
    expect(st(node).installedTraits).toHaveLength(1);
  });

  it('install increments download count on own published package', () => {
    const { node, ctx, cfg } = attach({ require_review: false });
    fire(node, cfg, ctx, { type: 'marketplace_publish', name: 'T', version: '1.0.0' });
    const pkgId = st(node).publishedPackages[0].id;
    fire(node, cfg, ctx, { type: 'marketplace_install', packageId: pkgId, name: 'T', version: '1.0.0' });
    expect(st(node).publishedPackages[0].downloads).toBe(1);
    expect(st(node).totalDownloads).toBe(1);
  });

  it('uninstalls a trait and emits marketplace_uninstalled', () => {
    const { node, ctx, cfg } = attach();
    fire(node, cfg, ctx, { type: 'marketplace_install', packageId: 'pkg_x', name: 'X', version: '1.0.0' });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'marketplace_uninstall', packageId: 'pkg_x' });
    expect(st(node).installedTraits).toHaveLength(0);
    expect(ctx.emit).toHaveBeenCalledWith('marketplace_uninstalled', expect.objectContaining({ packageId: 'pkg_x' }));
  });
});

// ─── Tests: submit_review ────────────────────────────────────────────────────

describe('MarketplaceIntegrationTrait — marketplace_submit_review', () => {

  it('stores review and emits marketplace_review_submitted', () => {
    const { node, ctx, cfg } = attach({ require_review: false });
    fire(node, cfg, ctx, { type: 'marketplace_publish', name: 'T', version: '1.0.0' });
    const pkgId = st(node).publishedPackages[0].id;
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'marketplace_submit_review', packageId: pkgId, rating: 5, comment: 'Great!' });
    expect(st(node).reviews).toHaveLength(1);
    expect(ctx.emit).toHaveBeenCalledWith('marketplace_review_submitted', expect.objectContaining({
      packageId: pkgId,
      rating: 5,
    }));
  });

  it('rating is clamped between 1 and 5', () => {
    const { node, ctx, cfg } = attach({ require_review: false });
    fire(node, cfg, ctx, { type: 'marketplace_publish', name: 'T', version: '1.0.0' });
    const pkgId = st(node).publishedPackages[0].id;
    fire(node, cfg, ctx, { type: 'marketplace_submit_review', packageId: pkgId, rating: 99 });
    expect(st(node).reviews[0].rating).toBe(5);
    fire(node, cfg, ctx, { type: 'marketplace_submit_review', packageId: pkgId, rating: -3 });
    expect(st(node).reviews[1].rating).toBe(1);
  });

  it('updates package average rating based on all reviews', () => {
    const { node, ctx, cfg } = attach({ require_review: false });
    fire(node, cfg, ctx, { type: 'marketplace_publish', name: 'T', version: '1.0.0' });
    const pkgId = st(node).publishedPackages[0].id;
    fire(node, cfg, ctx, { type: 'marketplace_submit_review', packageId: pkgId, rating: 4, reviewer: 'u1' });
    fire(node, cfg, ctx, { type: 'marketplace_submit_review', packageId: pkgId, rating: 2, reviewer: 'u2' });
    const rating = st(node).publishedPackages[0].rating;
    expect(rating).toBeCloseTo(3, 5); // (4+2)/2 = 3
  });
});

// ─── Tests: revenue ──────────────────────────────────────────────────────────

describe('MarketplaceIntegrationTrait — marketplace_revenue', () => {

  it('records revenue on package and totalRevenue', () => {
    const { node, ctx, cfg } = attach({ require_review: false });
    fire(node, cfg, ctx, { type: 'marketplace_publish', name: 'T', version: '1.0.0' });
    const pkgId = st(node).publishedPackages[0].id;
    fire(node, cfg, ctx, { type: 'marketplace_revenue', packageId: pkgId, amount: 99.5 });
    expect(st(node).publishedPackages[0].revenue).toBe(99.5);
    expect(st(node).totalRevenue).toBe(99.5);
    expect(ctx.emit).toHaveBeenCalledWith('marketplace_revenue_recorded', expect.objectContaining({
      amount: 99.5,
      totalRevenue: 99.5,
    }));
  });
});

// ─── Tests: query ────────────────────────────────────────────────────────────

describe('MarketplaceIntegrationTrait — marketplace_query', () => {

  it('emits marketplace_integration_info with full state snapshot', () => {
    const { node, ctx, cfg } = attach({ require_review: false });
    fire(node, cfg, ctx, { type: 'marketplace_publish', name: 'T', version: '1.0.0' });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'marketplace_query', queryId: 'Q1' });
    expect(ctx.emit).toHaveBeenCalledWith('marketplace_integration_info', expect.objectContaining({
      queryId: 'Q1',
      publishedCount: 1,
      installedCount: 0,
      pendingCount: 0,
      totalRevenue: 0,
    }));
  });
});

// ─── Unknown event ───────────────────────────────────────────────────────────

describe('MarketplaceIntegrationTrait — unknown events', () => {

  it('unknown event type is silently ignored', () => {
    const { node, ctx, cfg } = attach();
    expect(() => fire(node, cfg, ctx, { type: 'completely_bogus_event' })).not.toThrow();
  });
});
