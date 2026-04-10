/**
 * @holoscript/marketplace-api acceptance tests
 * Covers: InMemoryTraitDatabase CRUD/search, TraitRegistry publish/get,
 *         satisfies(), compareVersions(), parseVersionRequirement()
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryTraitDatabase,
  TraitRegistry,
  satisfies,
  compareVersions,
  parseVersionRequirement,
} from '../index';
import type { TraitPackage } from '../index';

// â”€â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function makeTrait(overrides: Partial<TraitPackage> = {}): TraitPackage {
  const now = new Date();
  return {
    id: overrides.id ?? 'test-trait',
    name: overrides.name ?? 'test-trait',
    version: overrides.version ?? '1.0.0',
    description: overrides.description ?? 'A test trait for unit testing purposes',
    author: overrides.author ?? { name: 'TestUser', email: 'test@example.com', verified: false },
    license: overrides.license ?? 'MIT',
    keywords: overrides.keywords ?? ['test'],
    source: overrides.source ?? '@trait test { enabled: true }',
    platforms: overrides.platforms ?? ['web'],
    category: overrides.category ?? 'utility',
    verified: overrides.verified ?? false,
    deprecated: overrides.deprecated ?? false,
    downloads: overrides.downloads ?? 0,
    rating: overrides.rating ?? 0,
    ratingCount: overrides.ratingCount ?? 0,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    publishedAt: overrides.publishedAt ?? now,
    dependencies: overrides.dependencies ?? {},
    peerDependencies: overrides.peerDependencies ?? {},
  };
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// InMemoryTraitDatabase â€” CRUD
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('InMemoryTraitDatabase', () => {
  let db: InMemoryTraitDatabase;

  beforeEach(() => {
    db = new InMemoryTraitDatabase();
  });

  it('constructs successfully', () => {
    expect(db).toBeDefined();
  });

  it('getTraitById returns null for unknown id', async () => {
    const result = await db.getTraitById('nonexistent');
    expect(result).toBeNull();
  });

  it('getTraitByName returns null for unknown name', async () => {
    const result = await db.getTraitByName('nonexistent');
    expect(result).toBeNull();
  });

  it('insertTrait then getTraitById returns the trait', async () => {
    const trait = makeTrait({ id: 'my-trait', name: 'my-trait' });
    await db.insertTrait(trait);
    const found = await db.getTraitById('my-trait');
    expect(found).not.toBeNull();
    expect(found!.name).toBe('my-trait');
  });

  it('insertTrait then getTraitByName returns the trait', async () => {
    const trait = makeTrait({ id: 'named-trait', name: 'named-trait' });
    await db.insertTrait(trait);
    const found = await db.getTraitByName('named-trait');
    expect(found).not.toBeNull();
    expect(found!.id).toBe('named-trait');
  });

  it('deleteTrait removes the trait', async () => {
    const trait = makeTrait({ id: 'delete-me', name: 'delete-me' });
    await db.insertTrait(trait);
    await db.deleteTrait('delete-me');
    const found = await db.getTraitById('delete-me');
    expect(found).toBeNull();
  });

  it('updateTrait modifies the trait', async () => {
    const trait = makeTrait({ id: 'update-me', name: 'update-me', downloads: 0 });
    await db.insertTrait(trait);
    await db.updateTrait('update-me', { downloads: 99 });
    const found = await db.getTraitById('update-me');
    expect(found!.downloads).toBe(99);
  });

  it('updateTrait throws for unknown id', async () => {
    await expect(db.updateTrait('unknown', { downloads: 1 })).rejects.toThrow();
  });

  it('incrementDownloads increases download count', async () => {
    const trait = makeTrait({ id: 'dl-trait', name: 'dl-trait', downloads: 5 });
    await db.insertTrait(trait);
    await db.incrementDownloads('dl-trait', '1.0.0');
    const found = await db.getTraitById('dl-trait');
    expect(found!.downloads).toBe(6);
  });

  it('getVersions returns version info for a trait', async () => {
    const trait = makeTrait({ id: 'versioned', name: 'versioned' });
    await db.insertTrait(trait);
    const versions = await db.getVersions('versioned');
    expect(Array.isArray(versions)).toBe(true);
    expect(versions).toHaveLength(1);
    expect(versions[0].version).toBe('1.0.0');
  });

  it('getVersions returns empty array for unknown trait', async () => {
    const versions = await db.getVersions('unknown');
    expect(versions).toEqual([]);
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// InMemoryTraitDatabase â€” search
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('InMemoryTraitDatabase search', () => {
  let db: InMemoryTraitDatabase;

  beforeEach(async () => {
    db = new InMemoryTraitDatabase();
    await db.insertTrait(
      makeTrait({
        id: 'alpha',
        name: 'alpha',
        description: 'First trait for alpha testing purposes',
        keywords: ['first'],
        category: 'rendering',
        downloads: 100,
      })
    );
    await db.insertTrait(
      makeTrait({
        id: 'beta',
        name: 'beta',
        description: 'Second trait for beta testing purposes',
        keywords: ['second'],
        category: 'physics',
        downloads: 50,
      })
    );
    await db.insertTrait(
      makeTrait({
        id: 'gamma',
        name: 'gamma',
        description: 'Third trait for gamma testing purposes',
        keywords: ['third'],
        category: 'rendering',
        downloads: 200,
      })
    );
  });

  it('search returns all traits with empty query', async () => {
    const result = await db.search({});
    expect(result.total).toBe(3);
    expect(Array.isArray(result.results)).toBe(true);
  });

  it('search filters by text query', async () => {
    const result = await db.search({ q: 'alpha' });
    expect(result.total).toBe(1);
    expect(result.results[0].name).toBe('alpha');
  });

  it('search filters by category', async () => {
    const result = await db.search({ category: 'rendering' });
    expect(result.total).toBe(2);
  });

  it('search returns correct page/limit structure', async () => {
    const result = await db.search({ page: 1, limit: 2 });
    expect(result.page).toBe(1);
    expect(result.limit).toBe(2);
    expect(result.results.length).toBeLessThanOrEqual(2);
  });

  it('search hasMore is false when all results fit on one page', async () => {
    const result = await db.search({ limit: 100 });
    expect(result.hasMore).toBe(false);
  });

  it('getPopular returns traits sorted by downloads desc', async () => {
    const popular = await db.getPopular();
    expect(popular[0].downloads).toBeGreaterThanOrEqual(popular[1]?.downloads ?? 0);
  });

  it('getRecent returns traits', async () => {
    const recent = await db.getRecent();
    expect(Array.isArray(recent)).toBe(true);
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// TraitRegistry â€” publish and get
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('TraitRegistry', () => {
  let registry: TraitRegistry;
  const author = { name: 'Dev', email: 'dev@example.com', verified: false };

  beforeEach(() => {
    registry = new TraitRegistry();
  });

  it('constructs with default in-memory database', () => {
    expect(registry).toBeDefined();
  });

  it('publish returns success for a valid request', async () => {
    const result = await registry.publish(
      {
        name: 'my-trait',
        version: '1.0.0',
        description: 'A nice trait for doing things well',
        source: '@trait my-trait { enabled: true }',
        platforms: ['web'],
        category: 'utility',
        license: 'MIT',
        keywords: ['test'],
      },
      author
    );
    expect(result.success).toBe(true);
    expect(result.traitId).toBe('my-trait');
  });

  it('publish returns failure for invalid name', async () => {
    const result = await registry.publish(
      {
        name: '',
        version: '1.0.0',
        description: 'Bad trait',
        source: 'x',
        platforms: ['web'],
        category: 'utility',
        license: 'MIT',
        keywords: [],
      },
      author
    );
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it('publish rejects duplicate version', async () => {
    const req = {
      name: 'unique-trait',
      version: '1.0.0',
      description: 'A unique trait for testing purposes',
      source: '@trait unique {}',
      platforms: ['web'] as any,
      category: 'utility' as any,
      license: 'MIT',
      keywords: [],
    };
    await registry.publish(req, author);
    const second = await registry.publish(req, author);
    expect(second.success).toBe(false);
    expect(second.errors![0]).toContain('already exists');
  });

  it('getTrait returns null for unpublished trait', async () => {
    const found = await registry.getTrait('nonexistent');
    expect(found).toBeNull();
  });

  it('getTrait returns published trait', async () => {
    await registry.publish(
      {
        name: 'find-me',
        version: '1.0.0',
        description: 'Finding this trait is the test goal',
        source: '@trait find-me {}',
        platforms: ['web'],
        category: 'utility',
        license: 'MIT',
        keywords: [],
      },
      author
    );
    const found = await registry.getTrait('find-me');
    expect(found).not.toBeNull();
    expect(found!.name).toBe('find-me');
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// satisfies() â€” semver constraint checking
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('satisfies()', () => {
  it('is a function', () => {
    expect(typeof satisfies).toBe('function');
  });

  it('returns true for exact match', () => {
    expect(satisfies('1.0.0', '1.0.0')).toBe(true);
  });

  it('returns true for ^ range', () => {
    expect(satisfies('1.2.3', '^1.0.0')).toBe(true);
  });

  it('returns false for incompatible major version', () => {
    expect(satisfies('2.0.0', '^1.0.0')).toBe(false);
  });

  it('returns true for >= range', () => {
    expect(satisfies('1.5.0', '>=1.0.0')).toBe(true);
  });

  it('returns false for version below minimum', () => {
    expect(satisfies('0.9.0', '>=1.0.0')).toBe(false);
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// compareVersions() â€” semver comparison
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('compareVersions()', () => {
  it('is a function', () => {
    expect(typeof compareVersions).toBe('function');
  });

  it('returns 0 for equal versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });

  it('returns positive when first > second', () => {
    expect(compareVersions('2.0.0', '1.0.0')).toBeGreaterThan(0);
  });

  it('returns negative when first < second', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0);
  });

  it('compares patch versions', () => {
    expect(compareVersions('1.0.1', '1.0.0')).toBeGreaterThan(0);
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// parseVersionRequirement()
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('parseVersionRequirement()', () => {
  it('is a function', () => {
    expect(typeof parseVersionRequirement).toBe('function');
  });

  it('parses a caret requirement', () => {
    const result = parseVersionRequirement('^1.2.3');
    expect(result).toBeDefined();
    expect(result).toHaveProperty('type');
    expect(result).toHaveProperty('value');
    expect(result.type).toBe('range');
    expect(result.value).toBe('^1.2.3');
  });

  it('parses a tilde requirement', () => {
    const result = parseVersionRequirement('~1.2.3');
    expect(result).toBeDefined();
  });

  it('parses an exact version requirement', () => {
    const result = parseVersionRequirement('1.0.0');
    expect(result).toBeDefined();
  });
});
