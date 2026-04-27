/**
 * MoMETraitDatabase — comprehensive test suite
 */
import { describe, it, expect } from 'vitest';
import {
  TraitExpert,
  MoMETraitDatabase,
  createMoMETraitDatabase,
  type TraitDefinition,
  type TraitCategory,
  type QueryOptions,
} from '../MoMETraitDatabase';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTrait(
  name: string,
  category: TraitCategory,
  overrides: Partial<TraitDefinition> = {}
): TraitDefinition {
  return {
    name,
    category,
    description: `${name} trait description`,
    parameters: [],
    compatibleWith: [],
    conflictsWith: [],
    version: '1.0.0',
    tags: [],
    ...overrides,
  };
}

const DEFAULT_OPTS: QueryOptions = {
  maxResults: 20,
  minRelevance: 0.1,
};

// ---------------------------------------------------------------------------
// TraitExpert
// ---------------------------------------------------------------------------

describe('TraitExpert construction', () => {
  it('should have the correct category', () => {
    const e = new TraitExpert('rendering');
    expect(e.category).toBe('rendering');
  });

  it('should start empty', () => {
    const e = new TraitExpert('physics');
    expect(e.size).toBe(0);
  });

  it('listTraits returns empty array initially', () => {
    const e = new TraitExpert('audio');
    expect(e.listTraits()).toEqual([]);
  });
});

describe('TraitExpert.addTrait', () => {
  it('should add a trait', () => {
    const e = new TraitExpert('rendering');
    e.addTrait(makeTrait('material', 'rendering'));
    expect(e.size).toBe(1);
  });

  it('should throw when category mismatch', () => {
    const e = new TraitExpert('rendering');
    expect(() => e.addTrait(makeTrait('rigidBody', 'physics'))).toThrow();
  });

  it('listTraits should return added trait', () => {
    const e = new TraitExpert('rendering');
    const t = makeTrait('material', 'rendering');
    e.addTrait(t);
    expect(e.listTraits()).toHaveLength(1);
    expect(e.listTraits()[0].name).toBe('material');
  });

  it('should index tags', () => {
    const e = new TraitExpert('rendering');
    e.addTrait(makeTrait('emissive', 'rendering', { tags: ['glow', 'neon'] }));
    const r = e.query('glow', DEFAULT_OPTS);
    expect(r.some(x => x.trait.name === 'emissive')).toBe(true);
  });
});

describe('TraitExpert.removeTrait', () => {
  it('should remove an existing trait', () => {
    const e = new TraitExpert('rendering');
    e.addTrait(makeTrait('material', 'rendering'));
    expect(e.removeTrait('material')).toBe(true);
    expect(e.size).toBe(0);
  });

  it('should return false for unknown trait', () => {
    const e = new TraitExpert('rendering');
    expect(e.removeTrait('ghost')).toBe(false);
  });

  it('should clean up tag index on removal', () => {
    const e = new TraitExpert('rendering');
    e.addTrait(makeTrait('emissive', 'rendering', { tags: ['glow'] }));
    e.removeTrait('emissive');
    const r = e.query('glow', DEFAULT_OPTS);
    expect(r.some(x => x.trait.name === 'emissive')).toBe(false);
  });
});

describe('TraitExpert.getTrait', () => {
  it('should return the trait by exact name', () => {
    const e = new TraitExpert('rendering');
    e.addTrait(makeTrait('material', 'rendering'));
    expect(e.getTrait('material')?.name).toBe('material');
  });

  it('should return undefined for unknown name', () => {
    const e = new TraitExpert('rendering');
    expect(e.getTrait('ghost')).toBeUndefined();
  });
});

describe('TraitExpert.query — exact match', () => {
  it('should return relevance 1.0 for exact name match', () => {
    const e = new TraitExpert('rendering');
    e.addTrait(makeTrait('material', 'rendering'));
    const r = e.query('material', DEFAULT_OPTS);
    expect(r[0]?.relevance).toBe(1.0);
  });

  it('should match with @prefix', () => {
    const e = new TraitExpert('rendering');
    e.addTrait(makeTrait('material', 'rendering'));
    const r = e.query('@material', DEFAULT_OPTS);
    expect(r[0]?.relevance).toBe(1.0);
  });

  it('matchType should be exact', () => {
    const e = new TraitExpert('rendering');
    e.addTrait(makeTrait('material', 'rendering'));
    const r = e.query('material', DEFAULT_OPTS);
    expect(r[0]?.matchType).toBe('exact');
  });
});

describe('TraitExpert.query — fuzzy match', () => {
  it('should return 0.85 for partial name match', () => {
    const e = new TraitExpert('rendering');
    e.addTrait(makeTrait('materialPBR', 'rendering'));
    const r = e.query('material', DEFAULT_OPTS);
    expect(r[0]?.relevance).toBe(0.85);
    expect(r[0]?.matchType).toBe('fuzzy');
  });
});

describe('TraitExpert.query — tag match', () => {
  it('should boost relevance with matching tag', () => {
    const e = new TraitExpert('rendering');
    e.addTrait(makeTrait('emissive', 'rendering', { tags: ['glow'] }));
    const r = e.query('glow', DEFAULT_OPTS);
    expect(r[0]?.relevance).toBeGreaterThanOrEqual(0.7);
    expect(r[0]?.matchType).toBe('tag');
  });
});

describe('TraitExpert.query — description match', () => {
  it('should match against description', () => {
    const e = new TraitExpert('rendering');
    e.addTrait(makeTrait('glowEffect', 'rendering', { description: 'Creates a glowing aura' }));
    const r = e.query('glowing aura', DEFAULT_OPTS);
    expect(r.length).toBeGreaterThan(0);
    expect(r[0]?.matchType).toBe('description');
  });
});

describe('TraitExpert.query — filters', () => {
  it('maxResults should cap results', () => {
    const e = new TraitExpert('rendering');
    for (let i = 0; i < 10; i++) e.addTrait(makeTrait(`trait${i}`, 'rendering', { tags: ['glow'] }));
    const r = e.query('glow', { ...DEFAULT_OPTS, maxResults: 3 });
    expect(r.length).toBeLessThanOrEqual(3);
  });

  it('minRelevance should filter out low scores', () => {
    const e = new TraitExpert('rendering');
    e.addTrait(makeTrait('xyzzy', 'rendering', { description: 'unrelated' }));
    const r = e.query('totally_unrelated_xyz', { ...DEFAULT_OPTS, minRelevance: 0.9 });
    expect(r.length).toBe(0);
  });

  it('tags filter should reduce relevance for non-matching tags', () => {
    const e = new TraitExpert('rendering');
    e.addTrait(makeTrait('material', 'rendering', { tags: ['pbr'] }));
    const r = e.query('material', { ...DEFAULT_OPTS, tags: ['nonexistent'] });
    const withFilter = r[0]?.relevance ?? 0;
    const r2 = e.query('material', DEFAULT_OPTS);
    const withoutFilter = r2[0]?.relevance ?? 0;
    expect(withFilter).toBeLessThan(withoutFilter);
  });

  it('platformFilter mobile should reduce relevance for non-mobileSafe', () => {
    const e = new TraitExpert('rendering');
    e.addTrait(
      makeTrait('heavyShader', 'rendering', {
        performance: {
          gpuCost: 'high',
          cpuCost: 'negligible',
          memoryCost: 'low',
          drawCallImpact: 0,
          vrSafe: true,
          mobileSafe: false,
        },
      })
    );
    const r = e.query('heavyShader', { ...DEFAULT_OPTS, platformFilter: 'mobile' });
    const rBase = e.query('heavyShader', DEFAULT_OPTS);
    expect((r[0]?.relevance ?? 0)).toBeLessThan(rBase[0]?.relevance ?? 1);
  });
});

describe('TraitExpert.getStats', () => {
  it('should return correct traitCount', () => {
    const e = new TraitExpert('rendering');
    e.addTrait(makeTrait('m1', 'rendering'));
    e.addTrait(makeTrait('m2', 'rendering'));
    expect(e.getStats().traitCount).toBe(2);
  });

  it('hitCount should increment on getTrait', () => {
    const e = new TraitExpert('rendering');
    e.addTrait(makeTrait('m', 'rendering'));
    e.getTrait('m');
    e.getTrait('m');
    expect(e.getStats().hitCount).toBe(2);
  });

  it('hitCount should increment on query', () => {
    const e = new TraitExpert('rendering');
    const before = e.getStats().hitCount;
    e.query('test', DEFAULT_OPTS);
    expect(e.getStats().hitCount).toBeGreaterThan(before);
  });
});

// ---------------------------------------------------------------------------
// MoMETraitDatabase
// ---------------------------------------------------------------------------

describe('MoMETraitDatabase construction', () => {
  it('should start with totalTraits = 0', () => {
    const db = new MoMETraitDatabase();
    expect(db.totalTraits).toBe(0);
  });

  it('should have all 12 categories initialized', () => {
    const db = new MoMETraitDatabase();
    const dist = db.getCategoryDistribution();
    expect(Object.keys(dist).length).toBe(12);
  });
});

describe('MoMETraitDatabase.register', () => {
  it('should register a trait', () => {
    const db = new MoMETraitDatabase();
    db.register(makeTrait('material', 'rendering'));
    expect(db.totalTraits).toBe(1);
  });

  it('should throw for unknown category', () => {
    const db = new MoMETraitDatabase();
    const bad = makeTrait('t', 'rendering');
    (bad as any).category = 'unknown_category';
    expect(() => db.register(bad)).toThrow();
  });

  it('get() should find the registered trait', () => {
    const db = new MoMETraitDatabase();
    db.register(makeTrait('material', 'rendering'));
    expect(db.get('material')?.name).toBe('material');
  });

  it('get() with category should find the trait', () => {
    const db = new MoMETraitDatabase();
    db.register(makeTrait('material', 'rendering'));
    expect(db.get('material', 'rendering')?.name).toBe('material');
  });

  it('get() with wrong category should return undefined', () => {
    const db = new MoMETraitDatabase();
    db.register(makeTrait('material', 'rendering'));
    expect(db.get('material', 'physics')).toBeUndefined();
  });
});

describe('MoMETraitDatabase.registerBatch', () => {
  it('should register multiple traits at once', () => {
    const db = new MoMETraitDatabase();
    db.registerBatch([
      makeTrait('a', 'rendering'),
      makeTrait('b', 'physics'),
    ]);
    expect(db.totalTraits).toBe(2);
  });

  it('should silently skip unknown category traits', () => {
    const db = new MoMETraitDatabase();
    const bad = makeTrait('t', 'rendering');
    (bad as any).category = 'bad_cat';
    // registerBatch silently skips unknown categories
    expect(() => db.registerBatch([bad])).not.toThrow();
  });
});

describe('MoMETraitDatabase.remove', () => {
  it('should remove a registered trait', () => {
    const db = new MoMETraitDatabase();
    db.register(makeTrait('material', 'rendering'));
    expect(db.remove('material', 'rendering')).toBe(true);
    expect(db.totalTraits).toBe(0);
  });

  it('should return false for unknown trait', () => {
    const db = new MoMETraitDatabase();
    expect(db.remove('ghost', 'rendering')).toBe(false);
  });

  it('should return false for unknown category', () => {
    const db = new MoMETraitDatabase();
    expect(db.remove('x', 'nonexistent' as TraitCategory)).toBe(false);
  });
});

describe('MoMETraitDatabase.query', () => {
  it('should find exact name match', () => {
    const db = new MoMETraitDatabase();
    db.register(makeTrait('rigidBody', 'physics'));
    const r = db.query('rigidBody');
    expect(r.some(x => x.trait.name === 'rigidBody')).toBe(true);
  });

  it('should return empty for unrelated query', () => {
    const db = new MoMETraitDatabase();
    db.register(makeTrait('material', 'rendering'));
    const r = db.query('xyzxyzxyz');
    expect(r.every(x => x.relevance < 0.1)).toBe(true);
  });

  it('should respect maxResults option', () => {
    const db = new MoMETraitDatabase();
    for (let i = 0; i < 10; i++) {
      db.register(makeTrait(`glow${i}`, 'rendering', { tags: ['glow'] }));
    }
    const r = db.query('glow', { maxResults: 3 });
    expect(r.length).toBeLessThanOrEqual(3);
  });

  it('should filter by category option', () => {
    const db = new MoMETraitDatabase();
    db.register(makeTrait('spatialAudio', 'audio', { tags: ['spatial'] }));
    db.register(makeTrait('spatialPortal', 'spatial', { tags: ['spatial'] }));
    const r = db.query('spatial', { categories: ['audio'] });
    expect(r.every(x => x.expert === 'audio')).toBe(true);
  });

  it('results should be sorted by relevance descending', () => {
    const db = new MoMETraitDatabase();
    db.register(makeTrait('material', 'rendering'));
    db.register(makeTrait('materialPBR', 'rendering'));
    const r = db.query('material');
    for (let i = 1; i < r.length; i++) {
      expect(r[i - 1].relevance).toBeGreaterThanOrEqual(r[i].relevance);
    }
  });

  it('should deduplicate results from multiple experts', () => {
    const db = new MoMETraitDatabase();
    // Register same name in different categories shouldn't happen but test dedupe
    db.register(makeTrait('shared', 'rendering'));
    const r = db.query('shared');
    const names = r.map(x => x.trait.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('should cache results for repeated identical queries', () => {
    const db = new MoMETraitDatabase();
    db.register(makeTrait('material', 'rendering'));
    const r1 = db.query('material');
    const r2 = db.query('material');
    // Results should be identical (same objects from cache)
    expect(r1).toBe(r2);
  });

  it('should invalidate cache on register', () => {
    const db = new MoMETraitDatabase();
    db.register(makeTrait('material', 'rendering'));
    const r1 = db.query('material');
    db.register(makeTrait('materialPBR', 'rendering'));
    const r2 = db.query('material');
    // Cache was invalidated so reference differs
    expect(r1).not.toBe(r2);
  });
});

describe('MoMETraitDatabase.findCompatible', () => {
  it('should find compatible traits', () => {
    const db = new MoMETraitDatabase();
    db.register(makeTrait('material', 'rendering', { compatibleWith: ['emissive'] }));
    db.register(makeTrait('emissive', 'rendering'));
    expect(db.findCompatible('material').map(t => t.name)).toContain('emissive');
  });

  it('should return empty array for unknown trait', () => {
    const db = new MoMETraitDatabase();
    expect(db.findCompatible('ghost')).toEqual([]);
  });

  it('should skip compatible traits not registered', () => {
    const db = new MoMETraitDatabase();
    db.register(makeTrait('material', 'rendering', { compatibleWith: ['missing_trait'] }));
    expect(db.findCompatible('material')).toEqual([]);
  });
});

describe('MoMETraitDatabase.findConflicts', () => {
  it('should find conflicting traits', () => {
    const db = new MoMETraitDatabase();
    db.register(makeTrait('toon', 'rendering', { conflictsWith: ['iridescence'] }));
    db.register(makeTrait('iridescence', 'rendering'));
    expect(db.findConflicts('toon').map(t => t.name)).toContain('iridescence');
  });

  it('should return empty array for unknown trait', () => {
    const db = new MoMETraitDatabase();
    expect(db.findConflicts('ghost')).toEqual([]);
  });
});

describe('MoMETraitDatabase.listCategory', () => {
  it('should list traits in a category', () => {
    const db = new MoMETraitDatabase();
    db.register(makeTrait('a', 'rendering'));
    db.register(makeTrait('b', 'rendering'));
    db.register(makeTrait('c', 'physics'));
    expect(db.listCategory('rendering').length).toBe(2);
  });

  it('should return empty for category with no traits', () => {
    const db = new MoMETraitDatabase();
    expect(db.listCategory('audio')).toEqual([]);
  });

  it('should return empty for unknown category', () => {
    const db = new MoMETraitDatabase();
    expect(db.listCategory('nonexistent' as TraitCategory)).toEqual([]);
  });
});

describe('MoMETraitDatabase.listAll', () => {
  it('should list all registered traits', () => {
    const db = new MoMETraitDatabase();
    db.register(makeTrait('a', 'rendering'));
    db.register(makeTrait('b', 'physics'));
    db.register(makeTrait('c', 'audio'));
    expect(db.listAll().length).toBe(3);
  });

  it('should return empty when database is empty', () => {
    const db = new MoMETraitDatabase();
    expect(db.listAll()).toEqual([]);
  });
});

describe('MoMETraitDatabase.getStats', () => {
  it('should return stats for all categories', () => {
    const db = new MoMETraitDatabase();
    const stats = db.getStats();
    expect(stats.length).toBe(12);
  });

  it('stats should include traitCount', () => {
    const db = new MoMETraitDatabase();
    db.register(makeTrait('a', 'rendering'));
    const stats = db.getStats();
    const renderStat = stats.find(s => s.category === 'rendering');
    expect(renderStat?.traitCount).toBe(1);
  });
});

describe('MoMETraitDatabase.getCategoryDistribution', () => {
  it('should return a record with all categories', () => {
    const db = new MoMETraitDatabase();
    const dist = db.getCategoryDistribution();
    expect(dist.rendering).toBeDefined();
    expect(dist.physics).toBeDefined();
    expect(dist.audio).toBeDefined();
  });

  it('should reflect registered counts', () => {
    const db = new MoMETraitDatabase();
    db.register(makeTrait('a', 'rendering'));
    db.register(makeTrait('b', 'rendering'));
    db.register(makeTrait('c', 'physics'));
    const dist = db.getCategoryDistribution();
    expect(dist.rendering).toBe(2);
    expect(dist.physics).toBe(1);
  });
});

describe('MoMETraitDatabase.clearCache', () => {
  it('should not throw', () => {
    const db = new MoMETraitDatabase();
    expect(() => db.clearCache()).not.toThrow();
  });

  it('should cause cache miss on next query', () => {
    const db = new MoMETraitDatabase();
    db.register(makeTrait('material', 'rendering'));
    const r1 = db.query('material');
    db.clearCache();
    const r2 = db.query('material');
    expect(r1).not.toBe(r2); // not the same object
  });
});

// ---------------------------------------------------------------------------
// MoMETraitDatabase options
// ---------------------------------------------------------------------------

describe('MoMETraitDatabase constructor options', () => {
  it('defaultMaxResults should limit query results', () => {
    const db = new MoMETraitDatabase({ defaultMaxResults: 2 });
    for (let i = 0; i < 10; i++) {
      db.register(makeTrait(`material${i}`, 'rendering', { tags: ['pbr'] }));
    }
    const r = db.query('pbr');
    expect(r.length).toBeLessThanOrEqual(2);
  });

  it('defaultMinRelevance should filter low-relevance results', () => {
    const db = new MoMETraitDatabase({ defaultMinRelevance: 0.9 });
    db.register(makeTrait('vagueTrait', 'rendering', { description: 'does something vague' }));
    const r = db.query('vague');
    // Description match relevance 0.4 < 0.9 → filtered
    expect(r.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// createMoMETraitDatabase factory
// ---------------------------------------------------------------------------

describe('createMoMETraitDatabase', () => {
  it('should return a MoMETraitDatabase instance', () => {
    expect(createMoMETraitDatabase()).toBeInstanceOf(MoMETraitDatabase);
  });

  it('should be pre-loaded with rendering traits', () => {
    const db = createMoMETraitDatabase();
    expect(db.listCategory('rendering').length).toBeGreaterThan(0);
  });

  it('should have material trait registered', () => {
    const db = createMoMETraitDatabase();
    expect(db.get('material')).toBeDefined();
  });

  it('should have emissive trait registered', () => {
    const db = createMoMETraitDatabase();
    expect(db.get('emissive')).toBeDefined();
  });

  it('should have rigidBody trait registered', () => {
    const db = createMoMETraitDatabase();
    expect(db.get('rigidBody')).toBeDefined();
  });

  it('should have collider trait registered', () => {
    const db = createMoMETraitDatabase();
    expect(db.get('collider')).toBeDefined();
  });

  it('should have spatialAudio trait registered', () => {
    const db = createMoMETraitDatabase();
    expect(db.get('spatialAudio')).toBeDefined();
  });

  it('material should have compatible traits', () => {
    const db = createMoMETraitDatabase();
    const m = db.get('material')!;
    expect(m.compatibleWith.length).toBeGreaterThan(0);
  });

  it('iridescence should conflict with toon', () => {
    const db = createMoMETraitDatabase();
    const t = db.get('iridescence')!;
    expect(t.conflictsWith).toContain('toon');
  });

  it('material should be mobileSafe', () => {
    const db = createMoMETraitDatabase();
    expect(db.get('material')?.performance?.mobileSafe).toBe(true);
  });

  it('transmission should not be vrSafe', () => {
    const db = createMoMETraitDatabase();
    expect(db.get('transmission')?.performance?.vrSafe).toBe(false);
  });

  it('totalTraits should be greater than 5', () => {
    const db = createMoMETraitDatabase();
    expect(db.totalTraits).toBeGreaterThan(5);
  });

  it('query("material") should return material as top result', () => {
    const db = createMoMETraitDatabase();
    const r = db.query('material');
    expect(r[0]?.trait.name).toBe('material');
    expect(r[0]?.relevance).toBe(1.0);
  });

  it('query("glow") should return emissive in results', () => {
    const db = createMoMETraitDatabase();
    const r = db.query('glow');
    expect(r.some(x => x.trait.name === 'emissive')).toBe(true);
  });

  it('query("rigid physics") should return rigidBody', () => {
    const db = createMoMETraitDatabase();
    const r = db.query('rigid physics');
    expect(r.some(x => x.trait.name === 'rigidBody')).toBe(true);
  });

  it('findCompatible("material") should include emissive', () => {
    const db = createMoMETraitDatabase();
    const compat = db.findCompatible('material');
    expect(compat.some(t => t.name === 'emissive')).toBe(true);
  });

  it('options override should apply', () => {
    const db = createMoMETraitDatabase({ defaultMaxResults: 1 });
    const r = db.query('material');
    expect(r.length).toBeLessThanOrEqual(1);
  });
});
