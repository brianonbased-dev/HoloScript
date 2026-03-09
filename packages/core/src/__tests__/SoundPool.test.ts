import { describe, it, expect, beforeEach } from 'vitest';
import { SoundPool } from '../audio/SoundPool';
import type { SoundDefinition } from '../audio/SoundPool';

// =============================================================================
// C241 — Sound Pool
// =============================================================================

function sfx(id: string, cat = 'sfx'): SoundDefinition {
  return { id, name: id, duration: 1, category: cat, volume: 0.8, loop: false };
}

describe('SoundPool', () => {
  let pool: SoundPool;
  beforeEach(() => {
    pool = new SoundPool();
  });

  it('register and get', () => {
    pool.register(sfx('hit'));
    expect(pool.get('hit')).toBeDefined();
    expect(pool.get('hit')!.name).toBe('hit');
  });

  it('has returns boolean', () => {
    pool.register(sfx('coin'));
    expect(pool.has('coin')).toBe(true);
    expect(pool.has('nope')).toBe(false);
  });

  it('registerAll bulk registers', () => {
    pool.registerAll([sfx('a'), sfx('b'), sfx('c')]);
    expect(pool.count).toBe(3);
  });

  it('getByCategory filters correctly', () => {
    pool.registerAll([sfx('a', 'sfx'), sfx('b', 'music'), sfx('c', 'sfx')]);
    const sfxList = pool.getByCategory('sfx');
    expect(sfxList).toHaveLength(2);
  });

  it('getRandomFromCategory returns item from category', () => {
    pool.registerAll([sfx('a', 'ambient'), sfx('b', 'ambient')]);
    const r = pool.getRandomFromCategory('ambient');
    expect(r).toBeDefined();
    expect(r!.category).toBe('ambient');
  });

  it('getRandomFromCategory returns undefined for empty', () => {
    expect(pool.getRandomFromCategory('nope')).toBeUndefined();
  });

  it('count reflects size', () => {
    expect(pool.count).toBe(0);
    pool.register(sfx('x'));
    expect(pool.count).toBe(1);
  });

  it('listIds returns all registered ids', () => {
    pool.registerAll([sfx('a'), sfx('b')]);
    const ids = pool.listIds();
    expect(ids).toContain('a');
    expect(ids).toContain('b');
  });

  it('get returns undefined for missing', () => {
    expect(pool.get('missing')).toBeUndefined();
  });

  it('register overwrites same id', () => {
    pool.register(sfx('a'));
    pool.register({ ...sfx('a'), volume: 0.5 });
    expect(pool.get('a')!.volume).toBe(0.5);
    expect(pool.count).toBe(1);
  });
});
