import { describe, it, expect, beforeEach } from 'vitest';
import { SoundPool } from '../SoundPool.js';

describe('SoundPool', () => {
  let pool: SoundPool;

  const sfx1 = { id: 'beep', name: 'Beep Sound', duration: 0.5, category: 'sfx', volume: 1, loop: false };
  const sfx2 = { id: 'boop', name: 'Boop Sound', duration: 0.3, category: 'sfx', volume: 0.8, loop: false };
  const music1 = { id: 'theme', name: 'Main Theme', duration: 120, category: 'music', volume: 1, loop: true };

  beforeEach(() => {
    pool = new SoundPool();
  });

  describe('register()', () => {
    it('registers a sound', () => {
      pool.register(sfx1);
      expect(pool.has('beep')).toBe(true);
    });

    it('increments count', () => {
      pool.register(sfx1);
      expect(pool.count).toBe(1);
    });

    it('sound is retrievable after registration', () => {
      pool.register(sfx1);
      const sound = pool.get('beep');
      expect(sound).toBeDefined();
      expect(sound?.id).toBe('beep');
      expect(sound?.name).toBe('Beep Sound');
    });
  });

  describe('registerAll()', () => {
    it('registers multiple sounds at once', () => {
      pool.registerAll([sfx1, sfx2, music1]);
      expect(pool.count).toBe(3);
      expect(pool.has('beep')).toBe(true);
      expect(pool.has('boop')).toBe(true);
      expect(pool.has('theme')).toBe(true);
    });
  });

  describe('has()', () => {
    it('returns false for unregistered id', () => {
      expect(pool.has('unknown')).toBe(false);
    });

    it('returns true for registered id', () => {
      pool.register(sfx1);
      expect(pool.has('beep')).toBe(true);
    });
  });

  describe('get()', () => {
    it('returns undefined for unknown id', () => {
      expect(pool.get('unknown')).toBeUndefined();
    });

    it('returns sound definition', () => {
      pool.register(sfx1);
      const s = pool.get('beep');
      expect(s?.id).toBe('beep');
      expect(s?.duration).toBe(0.5);
      expect(s?.loop).toBe(false);
    });
  });

  describe('count getter', () => {
    it('starts at 0', () => {
      expect(pool.count).toBe(0);
    });

    it('increases with each registration', () => {
      pool.register(sfx1);
      pool.register(sfx2);
      expect(pool.count).toBe(2);
    });
  });

  describe('getByCategory()', () => {
    beforeEach(() => {
      pool.registerAll([sfx1, sfx2, music1]);
    });

    it('returns sounds in category', () => {
      const sfxSounds = pool.getByCategory('sfx');
      expect(sfxSounds).toHaveLength(2);
      const ids = sfxSounds.map((s) => s.id);
      expect(ids).toContain('beep');
      expect(ids).toContain('boop');
    });

    it('returns empty array for unknown category', () => {
      expect(pool.getByCategory('unknown')).toHaveLength(0);
    });
  });

  describe('getRandomFromCategory()', () => {
    beforeEach(() => {
      pool.registerAll([sfx1, sfx2, music1]);
    });

    it('returns a sound from the category', () => {
      const sound = pool.getRandomFromCategory('sfx');
      expect(sound).toBeDefined();
      expect(sound?.category).toBe('sfx');
    });

    it('returns undefined for empty category', () => {
      expect(pool.getRandomFromCategory('ambient')).toBeUndefined();
    });
  });

  describe('listIds()', () => {
    it('returns all registered ids', () => {
      pool.registerAll([sfx1, sfx2]);
      const ids = pool.listIds();
      expect(ids).toContain('beep');
      expect(ids).toContain('boop');
      expect(ids).toHaveLength(2);
    });

    it('returns empty array when pool is empty', () => {
      expect(pool.listIds()).toHaveLength(0);
    });
  });
});
