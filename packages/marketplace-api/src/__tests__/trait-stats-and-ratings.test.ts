/**
 * @marketplace-api acceptance tests
 * Covers: InMemoryTraitDatabase (CRUD, search, versioning),
 *         DownloadStatsTracker (record, getStats),
 *         RatingService (rate, getRatings, getAverageRating, deleteRating).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryTraitDatabase, TraitRegistry } from '../TraitRegistry.js';
import { DownloadStatsTracker, RatingService } from '../MarketplaceService.js';
import type { TraitPackage } from '../types.js';

// â”€â”€â”€ Helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function makeTrait(overrides: Partial<TraitPackage> = {}): TraitPackage {
  return {
    id: overrides.id ?? 'trait-1',
    name: overrides.name ?? 'my-trait',
    version: overrides.version ?? '1.0.0',
    description: overrides.description ?? 'A test trait',
    author: overrides.author ?? { name: 'Alice', email: 'alice@example.com', verified: false },
    license: 'MIT',
    keywords: overrides.keywords ?? ['xr', 'test'],
    dependencies: {},
    peerDependencies: {},
    source: overrides.source ?? 'export function greet() { return "hello"; }',
    platforms: overrides.platforms ?? ['web'],
    category: overrides.category ?? 'animation',
    verified: overrides.verified ?? false,
    deprecated: overrides.deprecated ?? false,
    downloads: overrides.downloads ?? 0,
    rating: overrides.rating ?? 0,
    ratingCount: overrides.ratingCount ?? 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    publishedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// InMemoryTraitDatabase
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('InMemoryTraitDatabase', () => {
  let db: InMemoryTraitDatabase;

  beforeEach(() => {
    db = new InMemoryTraitDatabase();
  });

  // â”€â”€ insertTrait / getTraitById â”€â”€
  it('insertTrait and getTraitById', async () => {
    const t = makeTrait({ id: 'abc' });
    await db.insertTrait(t);
    const result = await db.getTraitById('abc');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('abc');
  });

  it('getTraitById returns null for unknown id', async () => {
    expect(await db.getTraitById('nonexistent')).toBeNull();
  });

  // â”€â”€ getTraitByName â”€â”€
  it('getTraitByName finds by name', async () => {
    await db.insertTrait(makeTrait({ id: 't1', name: 'cool-trait' }));
    const result = await db.getTraitByName('cool-trait');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('cool-trait');
  });

  it('getTraitByName returns null for unknown name', async () => {
    expect(await db.getTraitByName('nope')).toBeNull();
  });

  // â”€â”€ updateTrait â”€â”€
  it('updateTrait patches fields', async () => {
    await db.insertTrait(makeTrait({ id: 't1', downloads: 0 }));
    await db.updateTrait('t1', { downloads: 100 });
    const updated = await db.getTraitById('t1');
    expect(updated!.downloads).toBe(100);
  });

  it('updateTrait throws for unknown id', async () => {
    await expect(db.updateTrait('missing', { downloads: 1 })).rejects.toThrow();
  });

  // â”€â”€ deleteTrait â”€â”€
  it('deleteTrait removes the trait', async () => {
    await db.insertTrait(makeTrait({ id: 't1' }));
    await db.deleteTrait('t1');
    expect(await db.getTraitById('t1')).toBeNull();
  });

  // â”€â”€ versioning: getTraitVersion â”€â”€
  it('getTraitVersion returns specific version', async () => {
    await db.insertTrait(makeTrait({ id: 't1', name: 'vtrait', version: '1.0.0' }));
    await db.insertTrait(makeTrait({ id: 't2', name: 'vtrait', version: '2.0.0' }));
    const v1 = await db.getTraitVersion('vtrait', '1.0.0');
    expect(v1).not.toBeNull();
    expect(v1!.version).toBe('1.0.0');
  });

  it('getTraitVersion returns null for unknown version', async () => {
    await db.insertTrait(makeTrait({ id: 't1', name: 'vtrait', version: '1.0.0' }));
    expect(await db.getTraitVersion('vtrait', '9.9.9')).toBeNull();
  });

  it('getVersions returns all versions for a trait', async () => {
    await db.insertTrait(makeTrait({ id: 'a1', name: 'multi', version: '1.0.0' }));
    await db.insertTrait(makeTrait({ id: 'a2', name: 'multi', version: '2.0.0' }));
    // getVersions takes traitId; get id from first insert
    const t = await db.getTraitByName('multi');
    const versions = await db.getVersions(t!.id);
    expect(versions.length).toBeGreaterThanOrEqual(1);
    expect(versions.every((v) => typeof v.version === 'string')).toBe(true);
  });

  // â”€â”€ deleteVersion â”€â”€
  it('deleteVersion removes a single version', async () => {
    await db.insertTrait(makeTrait({ id: 't1', name: 'vtrait', version: '1.0.0' }));
    await db.insertTrait(makeTrait({ id: 't2', name: 'vtrait', version: '2.0.0' }));
    const trait = await db.getTraitByName('vtrait');
    await db.deleteVersion(trait!.id, '1.0.0');
    expect(await db.getTraitVersion('vtrait', '1.0.0')).toBeNull();
  });

  // â”€â”€ search: basic text â”€â”€
  it('search by query string finds matching traits', async () => {
    await db.insertTrait(makeTrait({ id: 't1', name: 'gravity-gun', description: 'Physics tool' }));
    await db.insertTrait(
      makeTrait({ id: 't2', name: 'glow-shader', description: 'Visual effect' })
    );
    const result = await db.search({ q: 'gravity' });
    expect(result.results.some((r) => r.name === 'gravity-gun')).toBe(true);
    expect(result.results.some((r) => r.name === 'glow-shader')).toBe(false);
  });

  it('search with no query returns all', async () => {
    await db.insertTrait(makeTrait({ id: 't1', name: 'a' }));
    await db.insertTrait(makeTrait({ id: 't2', name: 'b' }));
    const result = await db.search({});
    expect(result.total).toBe(2);
  });

  it('search filters by category', async () => {
    await db.insertTrait(makeTrait({ id: 't1', name: 'a', category: 'animation' }));
    await db.insertTrait(makeTrait({ id: 't2', name: 'b', category: 'physics' }));
    const result = await db.search({ category: 'physics' });
    expect(result.total).toBe(1);
    expect(result.results[0].name).toBe('b');
  });

  it('search filters by platform', async () => {
    await db.insertTrait(makeTrait({ id: 't1', name: 'unity-only', platforms: ['unity'] }));
    await db.insertTrait(makeTrait({ id: 't2', name: 'web-only', platforms: ['web'] }));
    const result = await db.search({ platform: 'unity' });
    expect(result.results.some((r) => r.name === 'unity-only')).toBe(true);
    expect(result.results.some((r) => r.name === 'web-only')).toBe(false);
  });

  it('search platform "all" matches any platform filter', async () => {
    await db.insertTrait(makeTrait({ id: 't1', name: 'universal', platforms: ['all'] }));
    const result = await db.search({ platform: 'unity' });
    expect(result.results.some((r) => r.name === 'universal')).toBe(true);
  });

  it('search filters by author', async () => {
    await db.insertTrait(
      makeTrait({
        id: 't1',
        name: 'alice-trait',
        author: { name: 'Alice', email: 'a@x.com', verified: true },
      })
    );
    await db.insertTrait(
      makeTrait({
        id: 't2',
        name: 'bob-trait',
        author: { name: 'Bob', email: 'b@x.com', verified: false },
      })
    );
    const result = await db.search({ author: 'alice' });
    expect(result.total).toBe(1);
    expect(result.results[0].name).toBe('alice-trait');
  });

  it('search filters by verified', async () => {
    await db.insertTrait(makeTrait({ id: 't1', name: 'v', verified: true }));
    await db.insertTrait(makeTrait({ id: 't2', name: 'u', verified: false }));
    const result = await db.search({ verified: true });
    expect(result.total).toBe(1);
    expect(result.results[0].name).toBe('v');
  });

  it('search filters deprecated=false', async () => {
    await db.insertTrait(makeTrait({ id: 't1', name: 'old', deprecated: true }));
    await db.insertTrait(makeTrait({ id: 't2', name: 'new', deprecated: false }));
    const result = await db.search({ deprecated: false });
    expect(result.total).toBe(1);
    expect(result.results[0].name).toBe('new');
  });

  it('search filters by minRating', async () => {
    await db.insertTrait(makeTrait({ id: 't1', name: 'high', rating: 4.5 }));
    await db.insertTrait(makeTrait({ id: 't2', name: 'low', rating: 2.0 }));
    const result = await db.search({ minRating: 4.0 });
    expect(result.total).toBe(1);
    expect(result.results[0].name).toBe('high');
  });

  it('search paginates results', async () => {
    for (let i = 0; i < 5; i++) {
      await db.insertTrait(makeTrait({ id: `t${i}`, name: `trait-${i}` }));
    }
    const page1 = await db.search({ page: 1, limit: 3 });
    const page2 = await db.search({ page: 2, limit: 3 });
    expect(page1.results.length).toBe(3);
    expect(page2.results.length).toBe(2);
    expect(page1.total).toBe(5);
  });

  it('search by keywords', async () => {
    await db.insertTrait(makeTrait({ id: 't1', name: 'a', keywords: ['physics', 'gravity'] }));
    await db.insertTrait(makeTrait({ id: 't2', name: 'b', keywords: ['shader', 'glow'] }));
    const result = await db.search({ keywords: ['physics'] });
    expect(result.total).toBe(1);
    expect(result.results[0].name).toBe('a');
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// DownloadStatsTracker
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('DownloadStatsTracker', () => {
  let tracker: DownloadStatsTracker;

  beforeEach(() => {
    tracker = new DownloadStatsTracker();
  });

  it('creates instance', () => {
    expect(tracker).toBeDefined();
  });

  it('getStats for unknown trait has all zeros', () => {
    const stats = tracker.getStats('unknown');
    expect(stats.total).toBe(0);
    expect(stats.lastDay).toBe(0);
    expect(stats.lastWeek).toBe(0);
    expect(stats.lastMonth).toBe(0);
    expect(stats.history).toHaveLength(0);
  });

  it('record increments total', () => {
    tracker.record('trait-1', '1.0.0');
    expect(tracker.getStats('trait-1').total).toBe(1);
  });

  it('multiple records sum correctly', () => {
    tracker.record('t1', '1.0.0');
    tracker.record('t1', '1.0.0');
    tracker.record('t1', '2.0.0');
    expect(tracker.getStats('t1').total).toBe(3);
  });

  it('different traits tracked independently', () => {
    tracker.record('t1', '1.0.0');
    tracker.record('t2', '1.0.0');
    expect(tracker.getStats('t1').total).toBe(1);
    expect(tracker.getStats('t2').total).toBe(1);
  });

  it('lastDay count includes today', () => {
    tracker.record('t1', '1.0.0');
    tracker.record('t1', '1.0.0');
    expect(tracker.getStats('t1').lastDay).toBe(2);
  });

  it('lastWeek includes today', () => {
    tracker.record('t1', '1.0.0');
    expect(tracker.getStats('t1').lastWeek).toBeGreaterThanOrEqual(1);
  });

  it('lastMonth includes today', () => {
    tracker.record('t1', '1.0.0');
    expect(tracker.getStats('t1').lastMonth).toBeGreaterThanOrEqual(1);
  });

  it('history includes today entry', () => {
    tracker.record('t1', '1.0.0');
    const { history } = tracker.getStats('t1');
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(typeof history[0].date).toBe('string');
    expect(typeof history[0].count).toBe('number');
  });

  it('stats object has traitId field', () => {
    tracker.record('my-trait', '1.0.0');
    expect(tracker.getStats('my-trait').traitId).toBe('my-trait');
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// RatingService
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('RatingService', () => {
  let svc: RatingService;

  beforeEach(() => {
    svc = new RatingService();
  });

  it('creates instance', () => {
    expect(svc).toBeDefined();
  });

  // â”€â”€ rate â”€â”€
  it('valid rating returns success:true', async () => {
    const result = await svc.rate('t1', 'user1', 5);
    expect(result.success).toBe(true);
  });

  it('rating below 1 returns error', async () => {
    const result = await svc.rate('t1', 'user1', 0);
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('rating above 5 returns error', async () => {
    const result = await svc.rate('t1', 'user1', 6);
    expect(result.success).toBe(false);
  });

  it('non-integer rating returns error', async () => {
    const result = await svc.rate('t1', 'user1', 3.5);
    expect(result.success).toBe(false);
  });

  it('rating with review stores the review', async () => {
    await svc.rate('t1', 'u1', 4, 'Great XR trait, really useful for my VR project!');
    const ratings = await svc.getRatings('t1');
    expect(ratings[0].review).toBe('Great XR trait, really useful for my VR project!');
  });

  it('spam review is rejected', async () => {
    const result = await svc.rate('t1', 'u1', 3, 'ok'); // too short
    expect(result.success).toBe(false);
    expect(result.error).toContain('Review rejected');
  });

  it('user can update their rating', async () => {
    await svc.rate('t1', 'u1', 3);
    await svc.rate('t1', 'u1', 5);
    const ratings = await svc.getRatings('t1');
    expect(ratings.find((r) => r.userId === 'u1')!.rating).toBe(5);
  });

  // â”€â”€ getRatings â”€â”€
  it('getRatings returns empty array for unknown trait', async () => {
    expect(await svc.getRatings('unknown')).toEqual([]);
  });

  it('getRatings returns all ratings', async () => {
    await svc.rate('t1', 'u1', 5);
    await svc.rate('t1', 'u2', 3);
    const ratings = await svc.getRatings('t1');
    expect(ratings.length).toBe(2);
  });

  it('getRatings paginates results', async () => {
    for (let i = 0; i < 5; i++) {
      await svc.rate('t1', `user${i}`, 4);
    }
    const page1 = await svc.getRatings('t1', 1, 3);
    const page2 = await svc.getRatings('t1', 2, 3);
    expect(page1.length).toBe(3);
    expect(page2.length).toBe(2);
  });

  // â”€â”€ getAverageRating â”€â”€
  it('getAverageRating for unknown trait is 0', () => {
    const { average, count } = svc.getAverageRating('unknown');
    expect(average).toBe(0);
    expect(count).toBe(0);
  });

  it('getAverageRating calculates correctly', async () => {
    await svc.rate('t1', 'u1', 4);
    await svc.rate('t1', 'u2', 2);
    const { average, count } = svc.getAverageRating('t1');
    expect(average).toBe(3);
    expect(count).toBe(2);
  });

  it('getAverageRating rounds to 1 decimal', async () => {
    await svc.rate('t1', 'u1', 5);
    await svc.rate('t1', 'u2', 4);
    await svc.rate('t1', 'u3', 4);
    const { average } = svc.getAverageRating('t1');
    expect(average).toBe(4.3);
  });

  // â”€â”€ deleteRating â”€â”€
  it('deleteRating removes a user rating', async () => {
    await svc.rate('t1', 'u1', 5);
    const deleted = await svc.deleteRating('t1', 'u1');
    expect(deleted).toBe(true);
    expect(await svc.getRatings('t1')).toHaveLength(0);
  });

  it('deleteRating returns false for non-existent rating', async () => {
    expect(await svc.deleteRating('t1', 'nobody')).toBe(false);
  });

  it('after delete, average updates correctly', async () => {
    await svc.rate('t1', 'u1', 5);
    await svc.rate('t1', 'u2', 1);
    await svc.deleteRating('t1', 'u2');
    const { average, count } = svc.getAverageRating('t1');
    expect(average).toBe(5);
    expect(count).toBe(1);
  });
});
