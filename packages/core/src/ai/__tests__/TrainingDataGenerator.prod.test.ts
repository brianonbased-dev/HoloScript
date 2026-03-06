/**
 * TrainingDataGenerator — Production Tests
 *
 * Tests: constructor, generate (no opts, category, complexity, count, combined),
 * generateAll, getByCategory, getByComplexity, getByTag, getStats,
 * exportJSON, exportJSONL, createTrainingDataGenerator factory.
 */

import { describe, it, expect } from 'vitest';
import {
  TrainingDataGenerator,
  createTrainingDataGenerator,
  ALL_CATEGORIES,
} from '../TrainingDataGenerator';

describe('TrainingDataGenerator — constructor / generateAll', () => {
  it('has non-empty example pool after construction', () => {
    const gen = new TrainingDataGenerator();
    expect(gen.generateAll().length).toBeGreaterThan(0);
  });

  it('all examples have required fields', () => {
    const gen = new TrainingDataGenerator();
    for (const ex of gen.generateAll()) {
      expect(typeof ex.id).toBe('string');
      expect(typeof ex.category).toBe('string');
      expect(typeof ex.holoScript).toBe('string');
      expect(['basic','intermediate','advanced']).toContain(ex.complexity);
      expect(Array.isArray(ex.tags)).toBe(true);
    }
  });

  it('generateAll returns same count on each call', () => {
    const gen = new TrainingDataGenerator();
    expect(gen.generateAll().length).toBe(gen.generateAll().length);
  });

  it('generateAll result is a copy (mutation does not affect internal state)', () => {
    const gen = new TrainingDataGenerator();
    const all1 = gen.generateAll();
    all1.length = 0;
    expect(gen.generateAll().length).toBeGreaterThan(0);
  });
});

describe('TrainingDataGenerator — generate() no filters', () => {
  it('returns all examples when no options given', () => {
    const gen = new TrainingDataGenerator();
    expect(gen.generate().length).toBe(gen.generateAll().length);
  });
});

describe('TrainingDataGenerator — generate() category filter', () => {
  it('filters by single category', () => {
    const gen = new TrainingDataGenerator();
    const results = gen.generate({ categories: ['geometry'] });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(e => e.category === 'geometry')).toBe(true);
  });

  it('filters by multiple categories', () => {
    const gen = new TrainingDataGenerator();
    const results = gen.generate({ categories: ['geometry', 'physics'] });
    expect(results.every(e => ['geometry','physics'].includes(e.category))).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it('empty categories array returns all', () => {
    const gen = new TrainingDataGenerator();
    const results = gen.generate({ categories: [] });
    expect(results.length).toBe(gen.generateAll().length);
  });
});

describe('TrainingDataGenerator — generate() complexity filter', () => {
  it('filters basic only', () => {
    const gen = new TrainingDataGenerator();
    const results = gen.generate({ complexityFilter: ['basic'] });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(e => e.complexity === 'basic')).toBe(true);
  });

  it('filters advanced only', () => {
    const gen = new TrainingDataGenerator();
    const results = gen.generate({ complexityFilter: ['advanced'] });
    expect(results.every(e => e.complexity === 'advanced')).toBe(true);
  });

  it('filters multiple complexities', () => {
    const gen = new TrainingDataGenerator();
    const results = gen.generate({ complexityFilter: ['basic','intermediate'] });
    expect(results.every(e => ['basic','intermediate'].includes(e.complexity))).toBe(true);
  });
});

describe('TrainingDataGenerator — generate() count limit', () => {
  it('limits results to count', () => {
    const gen = new TrainingDataGenerator();
    const results = gen.generate({ count: 3 });
    expect(results.length).toBe(3);
  });

  it('count larger than pool returns all', () => {
    const gen = new TrainingDataGenerator();
    const total = gen.generateAll().length;
    const results = gen.generate({ count: total + 999 });
    expect(results.length).toBe(total);
  });

  it('count=1 returns single example', () => {
    const gen = new TrainingDataGenerator();
    const results = gen.generate({ count: 1 });
    expect(results.length).toBe(1);
  });
});

describe('TrainingDataGenerator — generate() combined filters', () => {
  it('category + complexity combined', () => {
    const gen = new TrainingDataGenerator();
    const results = gen.generate({ categories: ['physics'], complexityFilter: ['basic'] });
    expect(results.every(e => e.category === 'physics' && e.complexity === 'basic')).toBe(true);
  });

  it('count with category never exceeds category pool', () => {
    const gen = new TrainingDataGenerator();
    const geoAll = gen.generate({ categories: ['geometry'] });
    const geoLimited = gen.generate({ categories: ['geometry'], count: 1 });
    expect(geoLimited.length).toBe(Math.min(1, geoAll.length));
  });
});

describe('TrainingDataGenerator — getByCategory', () => {
  it('returns correct category', () => {
    const gen = new TrainingDataGenerator();
    const results = gen.getByCategory('audio');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(e => e.category === 'audio')).toBe(true);
  });

  it('returns empty for unknown category (cast)', () => {
    const gen = new TrainingDataGenerator();
    const results = gen.getByCategory('zzzz' as any);
    expect(results).toHaveLength(0);
  });
});

describe('TrainingDataGenerator — getByComplexity', () => {
  it('returns basic complexity examples', () => {
    const gen = new TrainingDataGenerator();
    const results = gen.getByComplexity('basic');
    expect(results.every(e => e.complexity === 'basic')).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it('basic + intermediate + advanced covers all', () => {
    const gen = new TrainingDataGenerator();
    const total = gen.generateAll().length;
    const b = gen.getByComplexity('basic').length;
    const i = gen.getByComplexity('intermediate').length;
    const a = gen.getByComplexity('advanced').length;
    expect(b + i + a).toBe(total);
  });
});

describe('TrainingDataGenerator — getByTag', () => {
  it('returns examples that include the tag', () => {
    const gen = new TrainingDataGenerator();
    const results = gen.getByTag('physics');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(e => e.tags.includes('physics'))).toBe(true);
  });

  it('returns empty for unknown tag', () => {
    const gen = new TrainingDataGenerator();
    expect(gen.getByTag('zzz-unknown-xxx')).toHaveLength(0);
  });

  it('tag "basic" matches examples with that tag', () => {
    const gen = new TrainingDataGenerator();
    const results = gen.getByTag('basic');
    expect(results.every(e => e.tags.includes('basic'))).toBe(true);
  });
});

describe('TrainingDataGenerator — getStats', () => {
  it('returns an object with geometry key', () => {
    const gen = new TrainingDataGenerator();
    const stats = gen.getStats();
    expect(typeof stats.geometry).toBe('number');
    expect(stats.geometry).toBeGreaterThan(0);
  });

  it('sum of all category counts equals total examples', () => {
    const gen = new TrainingDataGenerator();
    const stats = gen.getStats();
    const sumStats = Object.values(stats).reduce((a, b) => a + b, 0);
    expect(sumStats).toBe(gen.generateAll().length);
  });

  it('each category in stats appears in ALL_CATEGORIES', () => {
    const gen = new TrainingDataGenerator();
    const stats = gen.getStats();
    for (const key of Object.keys(stats)) {
      expect(ALL_CATEGORIES).toContain(key);
    }
  });
});

describe('TrainingDataGenerator — exportJSON / exportJSONL', () => {
  it('exportJSON returns valid JSON string', () => {
    const gen = new TrainingDataGenerator();
    const json = gen.exportJSON();
    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(gen.generateAll().length);
  });

  it('exportJSON is formatted with indentation', () => {
    const gen = new TrainingDataGenerator();
    const json = gen.exportJSON();
    expect(json).toContain('\n');
  });

  it('exportJSONL returns one object per line', () => {
    const gen = new TrainingDataGenerator();
    const lines = gen.exportJSONL().split('\n').filter(l => l.trim().length > 0);
    expect(lines.length).toBe(gen.generateAll().length);
  });

  it('each JSONL line is valid JSON', () => {
    const gen = new TrainingDataGenerator();
    const lines = gen.exportJSONL().split('\n').filter(l => l.trim().length > 0);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('JSONL lines do not contain newlines within them', () => {
    const gen = new TrainingDataGenerator();
    const lines = gen.exportJSONL().split('\n').filter(l => l.trim().length > 0);
    for (const line of lines) {
      // the holoScript field contains internal newlines but JSON.stringify escapes them
      const obj = JSON.parse(line);
      expect(typeof obj.id).toBe('string');
    }
  });
});

describe('createTrainingDataGenerator factory', () => {
  it('returns a TrainingDataGenerator instance', () => {
    const gen = createTrainingDataGenerator();
    expect(gen).toBeInstanceOf(TrainingDataGenerator);
  });

  it('factory produces same total as constructor', () => {
    const gen1 = new TrainingDataGenerator();
    const gen2 = createTrainingDataGenerator();
    expect(gen2.generateAll().length).toBe(gen1.generateAll().length);
  });
});

describe('ALL_CATEGORIES', () => {
  it('is a non-empty array of strings', () => {
    expect(Array.isArray(ALL_CATEGORIES)).toBe(true);
    expect(ALL_CATEGORIES.length).toBeGreaterThan(0);
    expect(ALL_CATEGORIES.every(c => typeof c === 'string')).toBe(true);
  });

  it('includes expected categories', () => {
    expect(ALL_CATEGORIES).toContain('geometry');
    expect(ALL_CATEGORIES).toContain('physics');
    expect(ALL_CATEGORIES).toContain('ui');
    expect(ALL_CATEGORIES).toContain('animations');
    expect(ALL_CATEGORIES).toContain('ar_vr');
  });
});
