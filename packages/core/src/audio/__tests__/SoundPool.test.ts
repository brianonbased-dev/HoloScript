import { describe, it, expect, beforeEach } from 'vitest';
import { SoundPool } from '../SoundPool';

function sound(id: string, category = 'sfx'): any {
  return { id, name: id, duration: 1, category, volume: 1, loop: false };
}

describe('SoundPool', () => {
  let pool: SoundPool;

  beforeEach(() => {
    pool = new SoundPool();
  });

  it('starts empty', () => {
    expect(pool.count).toBe(0);
  });

  it('registers a sound', () => {
    pool.register(sound('click'));
    expect(pool.has('click')).toBe(true);
    expect(pool.count).toBe(1);
  });

  it('registerAll adds multiple sounds', () => {
    pool.registerAll([sound('a'), sound('b'), sound('c')]);
    expect(pool.count).toBe(3);
  });

  it('get returns registered sound', () => {
    pool.register(sound('shot'));
    const s = pool.get('shot');
    expect(s).toBeDefined();
    expect(s!.id).toBe('shot');
  });

  it('get returns undefined for unknown', () => {
    expect(pool.get('nope')).toBeUndefined();
  });

  it('has returns false for unregistered', () => {
    expect(pool.has('nope')).toBe(false);
  });

  it('getByCategory filters correctly', () => {
    pool.register(sound('fx1', 'sfx'));
    pool.register(sound('music1', 'music'));
    pool.register(sound('fx2', 'sfx'));
    const sfx = pool.getByCategory('sfx');
    expect(sfx.length).toBe(2);
  });

  it('getByCategory returns empty for unknown category', () => {
    expect(pool.getByCategory('ambient').length).toBe(0);
  });

  it('getRandomFromCategory returns a sound from category', () => {
    pool.register(sound('a', 'ui'));
    pool.register(sound('b', 'ui'));
    const s = pool.getRandomFromCategory('ui');
    expect(s).toBeDefined();
    expect(s!.category).toBe('ui');
  });

  it('getRandomFromCategory returns undefined for empty', () => {
    expect(pool.getRandomFromCategory('empty')).toBeUndefined();
  });

  it('listIds returns all IDs', () => {
    pool.registerAll([sound('x'), sound('y')]);
    const ids = pool.listIds();
    expect(ids).toContain('x');
    expect(ids).toContain('y');
  });
});
