/**
 * Sprint 15: Registry LocalRegistry/PackageResolver/permissions,
 *            Partner SDK version/errors/branding
 *
 * Tests cover:
 *   - Feature 1:  LocalRegistry -- publish, retrieve, search, list, size, clear
 *   - Feature 2:  PackageResolver -- SemVer satisfies(), getMatchingVersions()
 *   - Feature 3:  Registry ROLE_PERMISSIONS + permission helpers
 *   - Feature 4:  Partner SDK -- SDK_VERSION, error classes, BRAND_COLORS
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  LocalRegistry,
  PackageResolver,
  ROLE_PERMISSIONS,
  hasPermission,
  canManageMembers,
  canPublishPackages,
} from '../../../registry/src/index.js';

import {
  SDK_VERSION,
  RateLimitError,
  AuthenticationError,
  WebhookVerificationError,
  BRAND_COLORS,
  TYPOGRAPHY,
} from '../../../partner-sdk/src/index.js';

// ============================================================================
// Feature 1A: LocalRegistry -- instantiation
// ============================================================================

describe('Feature 1A: LocalRegistry -- instantiation', () => {
  it('LocalRegistry is a class (function)', () => {
    expect(typeof LocalRegistry).toBe('function');
  });

  it('new LocalRegistry() creates an instance', () => {
    const reg = new LocalRegistry();
    expect(reg).toBeInstanceOf(LocalRegistry);
  });

  it('fresh registry has size 0', () => {
    const reg = new LocalRegistry();
    expect(reg.size).toBe(0);
  });

  it('instance has publish method', () => {
    expect(typeof new LocalRegistry().publish).toBe('function');
  });

  it('instance has getPackage method', () => {
    expect(typeof new LocalRegistry().getPackage).toBe('function');
  });

  it('instance has search method', () => {
    expect(typeof new LocalRegistry().search).toBe('function');
  });

  it('instance has list method', () => {
    expect(typeof new LocalRegistry().list).toBe('function');
  });

  it('instance has clear method', () => {
    expect(typeof new LocalRegistry().clear).toBe('function');
  });
});

// ============================================================================
// Feature 1B: LocalRegistry -- publish and retrieve
// ============================================================================

describe('Feature 1B: LocalRegistry -- publish & retrieve', () => {
  let reg: InstanceType<typeof LocalRegistry>;
  beforeEach(() => {
    reg = new LocalRegistry();
  });

  const PKG = {
    name: '@test/hello',
    version: '1.0.0',
    description: 'A test pkg',
    content: 'export default {}',
  };

  it('publish returns a manifest object', () => {
    const manifest = reg.publish(PKG);
    expect(typeof manifest).toBe('object');
    expect(manifest).not.toBeNull();
  });

  it('published manifest has the correct name', () => {
    const manifest = reg.publish(PKG);
    expect(manifest.name).toBe('@test/hello');
  });

  it('published manifest has a versions array', () => {
    const manifest = reg.publish(PKG);
    expect(Array.isArray(manifest.versions)).toBe(true);
  });

  it('published manifest includes the version', () => {
    const manifest = reg.publish(PKG);
    expect(manifest.versions.some((v: any) => v.version === '1.0.0')).toBe(true);
  });

  it('getPackage returns the published manifest', () => {
    reg.publish(PKG);
    const found = reg.getPackage('@test/hello');
    expect(found).toBeDefined();
    expect(found!.name).toBe('@test/hello');
  });

  it('getPackage returns undefined for unknown package', () => {
    expect(reg.getPackage('@does/not-exist')).toBeUndefined();
  });

  it('getVersion returns the specific version', () => {
    reg.publish(PKG);
    const ver = reg.getVersion('@test/hello', '1.0.0');
    expect(ver).toBeDefined();
    expect(ver!.version).toBe('1.0.0');
  });

  it('getVersion returns undefined for missing version', () => {
    reg.publish(PKG);
    expect(reg.getVersion('@test/hello', '9.9.9')).toBeUndefined();
  });

  it('size increments after publish', () => {
    expect(reg.size).toBe(0);
    reg.publish(PKG);
    expect(reg.size).toBe(1);
  });
});

// ============================================================================
// Feature 1C: LocalRegistry -- search
// ============================================================================

describe('Feature 1C: LocalRegistry -- search', () => {
  let reg: InstanceType<typeof LocalRegistry>;
  beforeEach(() => {
    reg = new LocalRegistry();
    reg.publish({
      name: '@holoscript/ui',
      version: '1.0.0',
      description: 'UI components for HoloScript',
      content: 'export default {}',
    });
    reg.publish({
      name: '@holoscript/physics',
      version: '2.0.0',
      description: 'Physics engine integration',
      content: 'export default {}',
    });
    reg.publish({
      name: '@other/tool',
      version: '1.0.0',
      description: 'An unrelated tool',
      content: 'export default {}',
    });
  });

  it('search returns an array', () => {
    expect(Array.isArray(reg.search('holoscript'))).toBe(true);
  });

  it('search finds packages by name', () => {
    const results = reg.search('holoscript');
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it('search is case-insensitive', () => {
    const lower = reg.search('holoscript');
    const upper = reg.search('HoloScript');
    expect(lower.length).toBe(upper.length);
  });

  it('search returns no results for unknown query', () => {
    const results = reg.search('zzz_not_found_xyz');
    expect(results.length).toBe(0);
  });

  it('list() returns all packages', () => {
    const all = reg.list();
    expect(all.length).toBe(3);
  });
});

// ============================================================================
// Feature 1D: LocalRegistry -- clear
// ============================================================================

describe('Feature 1D: LocalRegistry -- clear', () => {
  it('clear() removes all packages', () => {
    const reg = new LocalRegistry();
    reg.publish({
      name: '@test/pkg',
      version: '1.0.0',
      description: 'pkg',
      content: 'export default {}',
    });
    expect(reg.size).toBe(1);
    reg.clear();
    expect(reg.size).toBe(0);
  });

  it('getPackage returns undefined after clear', () => {
    const reg = new LocalRegistry();
    reg.publish({
      name: '@test/pkg',
      version: '1.0.0',
      description: 'pkg',
      content: 'export default {}',
    });
    reg.clear();
    expect(reg.getPackage('@test/pkg')).toBeUndefined();
  });
});

// ============================================================================
// Feature 2A: PackageResolver -- instantiation
// ============================================================================

describe('Feature 2A: PackageResolver -- instantiation', () => {
  it('PackageResolver is a class (function)', () => {
    expect(typeof PackageResolver).toBe('function');
  });

  it('new PackageResolver(registry) creates an instance', () => {
    const reg = new LocalRegistry();
    const resolver = new PackageResolver(reg);
    expect(resolver).toBeInstanceOf(PackageResolver);
  });

  it('instance has satisfies method', () => {
    const resolver = new PackageResolver(new LocalRegistry());
    expect(typeof resolver.satisfies).toBe('function');
  });

  it('instance has resolve method', () => {
    const resolver = new PackageResolver(new LocalRegistry());
    expect(typeof resolver.resolve).toBe('function');
  });

  it('instance has getMatchingVersions method', () => {
    const resolver = new PackageResolver(new LocalRegistry());
    expect(typeof resolver.getMatchingVersions).toBe('function');
  });
});

// ============================================================================
// Feature 2B: PackageResolver -- satisfies() SemVer logic
// ============================================================================

describe('Feature 2B: PackageResolver -- satisfies()', () => {
  let resolver: InstanceType<typeof PackageResolver>;
  beforeEach(() => {
    resolver = new PackageResolver(new LocalRegistry());
  });

  it('exact match satisfies', () => {
    expect(resolver.satisfies('1.2.3', '1.2.3')).toBe(true);
  });

  it('different version does not satisfy exact', () => {
    expect(resolver.satisfies('1.2.3', '1.2.4')).toBe(false);
  });

  it('"*" range satisfies any version', () => {
    expect(resolver.satisfies('1.0.0', '*')).toBe(true);
    expect(resolver.satisfies('99.0.0', '*')).toBe(true);
  });

  it('"^1.2.0" satisfies 1.x.x patch/minor', () => {
    expect(resolver.satisfies('1.2.3', '^1.2.0')).toBe(true);
    expect(resolver.satisfies('1.5.0', '^1.2.0')).toBe(true);
  });

  it('"^1.2.0" does not satisfy 2.x.x', () => {
    expect(resolver.satisfies('2.0.0', '^1.2.0')).toBe(false);
  });

  it('"~1.2.0" satisfies 1.2.x patches', () => {
    expect(resolver.satisfies('1.2.5', '~1.2.0')).toBe(true);
  });

  it('"~1.2.0" does not satisfy 1.3.x', () => {
    expect(resolver.satisfies('1.3.0', '~1.2.0')).toBe(false);
  });
});

// ============================================================================
// Feature 2C: PackageResolver -- getMatchingVersions
// ============================================================================

describe('Feature 2C: PackageResolver -- getMatchingVersions()', () => {
  let reg: InstanceType<typeof LocalRegistry>;
  let resolver: InstanceType<typeof PackageResolver>;

  beforeEach(() => {
    reg = new LocalRegistry();
    reg.publish({
      name: '@holoscript/core',
      version: '1.0.0',
      description: 'core',
      content: 'export default {}',
    });
    reg.publish({
      name: '@holoscript/core',
      version: '1.1.0',
      description: 'core',
      content: 'export default {}',
    });
    reg.publish({
      name: '@holoscript/core',
      version: '2.0.0',
      description: 'core',
      content: 'export default {}',
    });
    resolver = new PackageResolver(reg);
  });

  it('returns an array', () => {
    expect(Array.isArray(resolver.getMatchingVersions('@holoscript/core', '*'))).toBe(true);
  });

  it('"*" returns at least 1 version', () => {
    const versions = resolver.getMatchingVersions('@holoscript/core', '*');
    expect(versions.length).toBeGreaterThanOrEqual(1);
  });

  it('"^1.0.0" returns 1.x.x versions only', () => {
    const versions = resolver.getMatchingVersions('@holoscript/core', '^1.0.0');
    for (const v of versions) {
      expect(v.version.startsWith('1.')).toBe(true);
    }
  });

  it('returns empty array for unknown package', () => {
    const versions = resolver.getMatchingVersions('@does/not-exist', '*');
    expect(versions.length).toBe(0);
  });
});

// ============================================================================
// Feature 3A: ROLE_PERMISSIONS -- structure
// ============================================================================

describe('Feature 3A: ROLE_PERMISSIONS -- structure', () => {
  it('ROLE_PERMISSIONS is a non-null object', () => {
    expect(typeof ROLE_PERMISSIONS).toBe('object');
    expect(ROLE_PERMISSIONS).not.toBeNull();
  });

  it('has owner role', () => {
    expect(ROLE_PERMISSIONS).toHaveProperty('owner');
    expect(Array.isArray(ROLE_PERMISSIONS.owner)).toBe(true);
  });

  it('has admin role', () => {
    expect(ROLE_PERMISSIONS).toHaveProperty('admin');
    expect(Array.isArray(ROLE_PERMISSIONS.admin)).toBe(true);
  });

  it('has developer role', () => {
    expect(ROLE_PERMISSIONS).toHaveProperty('developer');
    expect(Array.isArray(ROLE_PERMISSIONS.developer)).toBe(true);
  });

  it('has viewer role', () => {
    expect(ROLE_PERMISSIONS).toHaveProperty('viewer');
    expect(Array.isArray(ROLE_PERMISSIONS.viewer)).toBe(true);
  });

  it('owner has the most permissions', () => {
    expect(ROLE_PERMISSIONS.owner.length).toBeGreaterThan(ROLE_PERMISSIONS.admin.length);
  });

  it('viewer has the fewest permissions', () => {
    expect(ROLE_PERMISSIONS.viewer.length).toBeLessThan(ROLE_PERMISSIONS.developer.length);
  });

  it('owner can delete workspace', () => {
    expect(ROLE_PERMISSIONS.owner).toContain('workspace.delete');
  });

  it('viewer cannot delete workspace', () => {
    expect(ROLE_PERMISSIONS.viewer).not.toContain('workspace.delete');
  });
});

// ============================================================================
// Feature 3B: hasPermission helper
// ============================================================================

describe('Feature 3B: hasPermission()', () => {
  it('owner has package.publish', () => {
    expect(hasPermission('owner', 'package.publish')).toBe(true);
  });

  it('viewer does not have package.publish', () => {
    expect(hasPermission('viewer', 'package.publish')).toBe(false);
  });

  it('developer has package.publish', () => {
    expect(hasPermission('developer', 'package.publish')).toBe(true);
  });

  it('unknown permission returns false', () => {
    expect(hasPermission('owner', 'does.not.exist')).toBe(false);
  });

  it('viewer has workspace.read', () => {
    expect(hasPermission('viewer', 'workspace.read')).toBe(true);
  });
});

// ============================================================================
// Feature 3C: canManageMembers / canPublishPackages helpers
// ============================================================================

describe('Feature 3C: canManageMembers / canPublishPackages', () => {
  it('owner can manage members', () => {
    expect(canManageMembers('owner')).toBe(true);
  });

  it('viewer cannot manage members', () => {
    expect(canManageMembers('viewer')).toBe(false);
  });

  it('owner can publish packages', () => {
    expect(canPublishPackages('owner')).toBe(true);
  });

  it('developer can publish packages', () => {
    expect(canPublishPackages('developer')).toBe(true);
  });

  it('viewer cannot publish packages', () => {
    expect(canPublishPackages('viewer')).toBe(false);
  });
});

// ============================================================================
// Feature 4A: Partner SDK -- SDK_VERSION
// ============================================================================

describe('Feature 4A: SDK_VERSION', () => {
  it('SDK_VERSION is a string', () => {
    expect(typeof SDK_VERSION).toBe('string');
  });

  it('SDK_VERSION is "1.0.0"', () => {
    expect(SDK_VERSION).toBe('1.0.0');
  });

  it('SDK_VERSION matches semver pattern', () => {
    expect(SDK_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});

// ============================================================================
// Feature 4B: RateLimitError
// ============================================================================

describe('Feature 4B: RateLimitError', () => {
  it('RateLimitError is a class (function)', () => {
    expect(typeof RateLimitError).toBe('function');
  });

  it('can be instantiated with retryAfter and limit', () => {
    const err = new RateLimitError(60, 100);
    expect(err).toBeInstanceOf(RateLimitError);
  });

  it('is an instanceof Error', () => {
    const err = new RateLimitError(60, 100);
    expect(err).toBeInstanceOf(Error);
  });

  it('has retryAfter property', () => {
    const err = new RateLimitError(60, 100);
    expect(err.retryAfter).toBe(60);
  });

  it('has limit property', () => {
    const err = new RateLimitError(60, 100);
    expect(err.limit).toBe(100);
  });

  it('has a message', () => {
    const err = new RateLimitError(60, 100);
    expect(typeof err.message).toBe('string');
    expect(err.message.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Feature 4C: AuthenticationError
// ============================================================================

describe('Feature 4C: AuthenticationError', () => {
  it('AuthenticationError is a class', () => {
    expect(typeof AuthenticationError).toBe('function');
  });

  it('can be instantiated with a message', () => {
    const err = new AuthenticationError('invalid credentials');
    expect(err).toBeInstanceOf(AuthenticationError);
  });

  it('is an instanceof Error', () => {
    const err = new AuthenticationError('invalid credentials');
    expect(err).toBeInstanceOf(Error);
  });

  it('message is preserved', () => {
    const err = new AuthenticationError('invalid credentials');
    expect(err.message).toContain('invalid credentials');
  });
});

// ============================================================================
// Feature 4D: WebhookVerificationError
// ============================================================================

describe('Feature 4D: WebhookVerificationError', () => {
  it('WebhookVerificationError is a class', () => {
    expect(typeof WebhookVerificationError).toBe('function');
  });

  it('can be instantiated with a message', () => {
    const err = new WebhookVerificationError('bad signature');
    expect(err).toBeInstanceOf(WebhookVerificationError);
  });

  it('is an instanceof Error', () => {
    expect(new WebhookVerificationError('test')).toBeInstanceOf(Error);
  });

  it('message is preserved', () => {
    const err = new WebhookVerificationError('bad signature');
    expect(err.message).toContain('bad signature');
  });
});

// ============================================================================
// Feature 4E: BRAND_COLORS
// ============================================================================

describe('Feature 4E: BRAND_COLORS', () => {
  it('BRAND_COLORS is a non-null object', () => {
    expect(typeof BRAND_COLORS).toBe('object');
    expect(BRAND_COLORS).not.toBeNull();
  });

  it('has primary color', () => {
    expect(BRAND_COLORS).toHaveProperty('primary');
  });

  it('primary color has a hex value', () => {
    expect(typeof BRAND_COLORS.primary.hex).toBe('string');
    expect(BRAND_COLORS.primary.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('primary hex is "#6366F1"', () => {
    expect(BRAND_COLORS.primary.hex).toBe('#6366F1');
  });

  it('has secondary color', () => {
    expect(BRAND_COLORS).toHaveProperty('secondary');
  });

  it('has accent color', () => {
    expect(BRAND_COLORS).toHaveProperty('accent');
  });

  it('has background with light and dark variants', () => {
    expect(typeof BRAND_COLORS.background.light).toBe('string');
    expect(typeof BRAND_COLORS.background.dark).toBe('string');
  });

  it('has text with light and dark variants', () => {
    expect(typeof BRAND_COLORS.text.light).toBe('string');
    expect(typeof BRAND_COLORS.text.dark).toBe('string');
  });
});

// ============================================================================
// Feature 4F: TYPOGRAPHY
// ============================================================================

describe('Feature 4F: TYPOGRAPHY', () => {
  it('TYPOGRAPHY is a non-null object', () => {
    expect(typeof TYPOGRAPHY).toBe('object');
    expect(TYPOGRAPHY).not.toBeNull();
  });

  it('has fontFamily string', () => {
    expect(typeof TYPOGRAPHY.fontFamily).toBe('string');
    expect(TYPOGRAPHY.fontFamily.length).toBeGreaterThan(0);
  });

  it('fontFamily is "Inter"', () => {
    expect(TYPOGRAPHY.fontFamily).toBe('Inter');
  });
});
