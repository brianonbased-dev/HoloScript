/**
 * TextureAtlas — Production Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TextureAtlas } from '../TextureAtlas';
import type { AtlasConfig } from '../TextureAtlas';

function makeConfig(opts: Partial<AtlasConfig> = {}): AtlasConfig {
  return {
    id: 'test-atlas',
    maxWidth: 1024,
    maxHeight: 1024,
    padding: 0,
    allowRotation: false,
    powerOfTwo: false,
    ...opts,
  };
}

describe('TextureAtlas — construction', () => {
  it('starts with no entries', () => {
    const atlas = new TextureAtlas(makeConfig());
    expect(atlas.getEntryCount()).toBe(0);
  });
});

describe('TextureAtlas — pack', () => {
  let atlas: TextureAtlas;
  beforeEach(() => { atlas = new TextureAtlas(makeConfig()); });

  it('returns an AtlasEntry for fitting texture', () => {
    const entry = atlas.pack('tex1', 64, 64);
    expect(entry).not.toBeNull();
    expect(entry!.id).toBe('tex1');
  });

  it('entry sourceWidth and sourceHeight match input', () => {
    const e = atlas.pack('t', 128, 64)!;
    expect(e.sourceWidth).toBe(128);
    expect(e.sourceHeight).toBe(64);
  });

  it('entry rect has correct width and height', () => {
    const e = atlas.pack('t', 100, 50)!;
    expect(e.rect.width).toBe(100);
    expect(e.rect.height).toBe(50);
  });

  it('UV u0 >= 0 and u1 <= 1 for normal texture', () => {
    const e = atlas.pack('t', 256, 256)!;
    expect(e.uv.u0).toBeGreaterThanOrEqual(0);
    expect(e.uv.u1).toBeLessThanOrEqual(1);
    expect(e.uv.v0).toBeGreaterThanOrEqual(0);
    expect(e.uv.v1).toBeLessThanOrEqual(1);
  });

  it('UV u0 < u1 and v0 < v1', () => {
    const e = atlas.pack('t', 64, 64)!;
    expect(e.uv.u0).toBeLessThan(e.uv.u1);
    expect(e.uv.v0).toBeLessThan(e.uv.v1);
  });

  it('padding offset reflected in rect.x and rect.y', () => {
    const a = new TextureAtlas(makeConfig({ padding: 4 }));
    const e = a.pack('t', 64, 64)!;
    expect(e.rect.x).toBeGreaterThanOrEqual(4);
    expect(e.rect.y).toBeGreaterThanOrEqual(4);
    expect(e.padding).toBe(4);
  });

  it('packing multiple textures grows entry count', () => {
    atlas.pack('a', 64, 64);
    atlas.pack('b', 64, 64);
    atlas.pack('c', 32, 32);
    expect(atlas.getEntryCount()).toBe(3);
  });

  it('second texture placed to the right of first on same shelf', () => {
    const e1 = atlas.pack('a', 100, 50)!;
    const e2 = atlas.pack('b', 100, 50)!;
    // They should be on the same row — e2.rect.x > e1.rect.x
    expect(e2.rect.x).toBeGreaterThan(e1.rect.x);
    expect(e2.rect.y).toBe(e1.rect.y);
  });

  it('returns null for texture wider than maxWidth', () => {
    expect(atlas.pack('huge', 2000, 64)).toBeNull();
  });

  it('returns null when atlas is full', () => {
    const a = new TextureAtlas(makeConfig({ maxWidth: 64, maxHeight: 64 }));
    a.pack('a', 64, 64); // fill it
    expect(a.pack('b', 32, 32)).toBeNull();
  });

  it('rotated flag is false when allowRotation disabled', () => {
    const e = atlas.pack('t', 100, 50)!;
    expect(e.rotated).toBe(false);
  });

  it('trimmed flag is always false', () => {
    const e = atlas.pack('t', 64, 64)!;
    expect(e.trimmed).toBe(false);
  });
});

describe('TextureAtlas — getEntry / getAllEntries', () => {
  let atlas: TextureAtlas;
  beforeEach(() => { atlas = new TextureAtlas(makeConfig()); });

  it('getEntry returns packed entry by id', () => {
    atlas.pack('tex', 64, 64);
    expect(atlas.getEntry('tex')).toBeDefined();
    expect(atlas.getEntry('tex')!.id).toBe('tex');
  });

  it('getEntry returns undefined for unknown id', () => {
    expect(atlas.getEntry('missing')).toBeUndefined();
  });

  it('getAllEntries returns all packed textures', () => {
    atlas.pack('a', 64, 64);
    atlas.pack('b', 32, 32);
    const all = atlas.getAllEntries();
    expect(all).toHaveLength(2);
    expect(all.map(e => e.id)).toContain('a');
    expect(all.map(e => e.id)).toContain('b');
  });
});

describe('TextureAtlas — power-of-two mode', () => {
  it('getAtlasWidth rounds up to next power of two', () => {
    const a = new TextureAtlas(makeConfig({ powerOfTwo: true }));
    a.pack('t', 100, 100); // triggers width=100 → next pow2=128
    expect(a.getAtlasWidth()).toBe(128);
  });

  it('getAtlasHeight rounds up to next power of two', () => {
    const a = new TextureAtlas(makeConfig({ powerOfTwo: true }));
    a.pack('t', 64, 300);
    expect(a.getAtlasHeight()).toBe(512);
  });
});

describe('TextureAtlas — occupancy', () => {
  it('occupancy is 0 with no entries', () => {
    const a = new TextureAtlas(makeConfig());
    expect(a.getOccupancy()).toBe(0);
  });

  it('occupancy > 0 after packing', () => {
    const a = new TextureAtlas(makeConfig());
    a.pack('t', 256, 256);
    expect(a.getOccupancy()).toBeGreaterThan(0);
  });

  it('occupancy <= 1', () => {
    const a = new TextureAtlas(makeConfig({ maxWidth: 128, maxHeight: 128 }));
    a.pack('a', 64, 64);
    a.pack('b', 64, 64);
    expect(a.getOccupancy()).toBeLessThanOrEqual(1);
  });
});

describe('TextureAtlas — getAtlas / clear', () => {
  it('getAtlas returns atlas snapshot with all entries', () => {
    const a = new TextureAtlas(makeConfig({ id: 'my-atlas' }));
    a.pack('t1', 64, 64);
    a.pack('t2', 64, 64);
    const atlas = a.getAtlas();
    expect(atlas.id).toBe('my-atlas');
    expect(atlas.entries.size).toBe(2);
    expect(atlas.occupancy).toBeGreaterThan(0);
  });

  it('clear resets all entries and dimensions', () => {
    const a = new TextureAtlas(makeConfig());
    a.pack('t', 256, 256);
    a.clear();
    expect(a.getEntryCount()).toBe(0);
    expect(a.getAtlasWidth()).toBe(1);
    expect(a.getAtlasHeight()).toBe(1);
    expect(a.getOccupancy()).toBe(0);
  });

  it('can pack again after clear', () => {
    const a = new TextureAtlas(makeConfig());
    a.pack('first', 64, 64);
    a.clear();
    const e = a.pack('second', 64, 64);
    expect(e).not.toBeNull();
    expect(a.getEntryCount()).toBe(1);
  });
});
