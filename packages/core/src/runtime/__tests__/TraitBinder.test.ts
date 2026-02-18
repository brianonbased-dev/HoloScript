import { describe, it, expect, beforeEach } from 'vitest';
import { TraitBinder } from '../TraitBinder';
import type { TraitHandler } from '../../traits/TraitTypes';

function makeHandler(defaults: Record<string, any> = {}): TraitHandler<any> {
  return {
    name: 'test',
    defaultConfig: defaults,
    attach: () => {},
    detach: () => {},
  };
}

describe('TraitBinder', () => {
  let binder: TraitBinder;

  beforeEach(() => {
    binder = new TraitBinder();
  });

  // ---- Register ----

  it('register stores handler', () => {
    binder.register('audio', makeHandler());
    expect(binder.has('audio')).toBe(true);
  });

  it('register overwrites existing', () => {
    binder.register('audio', makeHandler({ vol: 1 }));
    binder.register('audio', makeHandler({ vol: 0.5 }));
    const handler = binder.resolve('audio')!;
    expect(handler.defaultConfig.vol).toBe(0.5);
  });

  it('registerAll registers multiple', () => {
    binder.registerAll([
      ['a', makeHandler()],
      ['b', makeHandler()],
      ['c', makeHandler()],
    ]);
    expect(binder.count).toBe(3);
  });

  // ---- Resolve ----

  it('resolve returns handler', () => {
    binder.register('grab', makeHandler());
    expect(binder.resolve('grab')).toBeDefined();
  });

  it('resolve returns undefined for missing', () => {
    expect(binder.resolve('nope')).toBeUndefined();
  });

  // ---- Has ----

  it('has returns false for missing', () => {
    expect(binder.has('x')).toBe(false);
  });

  // ---- List ----

  it('listTraits returns all names', () => {
    binder.register('a', makeHandler());
    binder.register('b', makeHandler());
    expect(binder.listTraits()).toContain('a');
    expect(binder.listTraits()).toContain('b');
  });

  // ---- Count ----

  it('count returns 0 initially', () => {
    expect(binder.count).toBe(0);
  });

  // ---- MergeConfig ----

  it('mergeConfig merges defaults with overrides', () => {
    binder.register('audio', makeHandler({ volume: 1, loop: false }));
    const merged = binder.mergeConfig('audio', { volume: 0.5, pitch: 2 });
    expect(merged.volume).toBe(0.5);
    expect(merged.loop).toBe(false);
    expect(merged.pitch).toBe(2);
  });

  it('mergeConfig returns directiveConfig when handler missing', () => {
    const config = { x: 1 };
    expect(binder.mergeConfig('missing', config)).toEqual(config);
  });
});
