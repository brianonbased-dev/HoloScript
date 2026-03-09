/**
 * SoundPool.prod.test.ts
 *
 * Production tests for SoundPool — register, lookup, category query,
 * random selection, and count management.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SoundPool, SoundDefinition } from '../SoundPool';

function makeSfx(id: string, cat = 'sfx'): SoundDefinition {
  return { id, name: `Sound ${id}`, duration: 1, category: cat, volume: 1, loop: false };
}

describe('SoundPool', () => {
  let pool: SoundPool;

  beforeEach(() => {
    pool = new SoundPool();
  });

  // -------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------
  describe('construction', () => {
    it('starts empty', () => {
      expect(pool.count).toBe(0);
    });
    it('listIds returns empty array', () => {
      expect(pool.listIds()).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // register / get / has
  // -------------------------------------------------------------------------
  describe('register() / get() / has()', () => {
    it('register stores a sound', () => {
      pool.register(makeSfx('boom'));
      expect(pool.count).toBe(1);
    });

    it('get retrieves registered sound', () => {
      pool.register(makeSfx('boom'));
      expect(pool.get('boom')!.name).toBe('Sound boom');
    });

    it('get returns undefined for unknown id', () => {
      expect(pool.get('ghost')).toBeUndefined();
    });

    it('has returns true for registered sound', () => {
      pool.register(makeSfx('beep'));
      expect(pool.has('beep')).toBe(true);
    });

    it('has returns false for unknown id', () => {
      expect(pool.has('nope')).toBe(false);
    });

    it('overwriting same id replaces definition', () => {
      pool.register({ ...makeSfx('x'), duration: 2 });
      pool.register({ ...makeSfx('x'), duration: 9 });
      expect(pool.get('x')!.duration).toBe(9);
      expect(pool.count).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // registerAll
  // -------------------------------------------------------------------------
  describe('registerAll()', () => {
    it('registers multiple sounds at once', () => {
      pool.registerAll([makeSfx('a'), makeSfx('b'), makeSfx('c')]);
      expect(pool.count).toBe(3);
    });

    it('empty array is a no-op', () => {
      pool.registerAll([]);
      expect(pool.count).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // getByCategory
  // -------------------------------------------------------------------------
  describe('getByCategory()', () => {
    it('returns all sounds in a category', () => {
      pool.register(makeSfx('boom', 'sfx'));
      pool.register(makeSfx('whoosh', 'sfx'));
      pool.register(makeSfx('theme', 'music'));
      const sfx = pool.getByCategory('sfx');
      expect(sfx).toHaveLength(2);
      expect(sfx.every((s) => s.category === 'sfx')).toBe(true);
    });

    it('returns empty array for unknown category', () => {
      expect(pool.getByCategory('ambient')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // getRandomFromCategory
  // -------------------------------------------------------------------------
  describe('getRandomFromCategory()', () => {
    it('returns undefined for empty category', () => {
      expect(pool.getRandomFromCategory('ghost')).toBeUndefined();
    });

    it('returns the only sound if one exists', () => {
      pool.register(makeSfx('beep', 'ui'));
      const result = pool.getRandomFromCategory('ui');
      expect(result!.id).toBe('beep');
    });

    it('returns a sound from the correct category (multi-sample)', () => {
      pool.registerAll([makeSfx('a', 'sfx'), makeSfx('b', 'sfx'), makeSfx('c', 'sfx')]);
      for (let i = 0; i < 20; i++) {
        const result = pool.getRandomFromCategory('sfx');
        expect(result).toBeDefined();
        expect(result!.category).toBe('sfx');
      }
    });
  });

  // -------------------------------------------------------------------------
  // listIds
  // -------------------------------------------------------------------------
  describe('listIds()', () => {
    it('returns all registered ids', () => {
      pool.registerAll([makeSfx('x'), makeSfx('y'), makeSfx('z')]);
      const ids = pool.listIds();
      expect(ids).toContain('x');
      expect(ids).toContain('y');
      expect(ids).toContain('z');
    });

    it('length equals count', () => {
      pool.registerAll([makeSfx('a'), makeSfx('b')]);
      expect(pool.listIds().length).toBe(pool.count);
    });
  });
});
