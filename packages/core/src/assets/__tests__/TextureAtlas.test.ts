import { describe, it, expect, beforeEach } from 'vitest';
import { TextureAtlas, AtlasConfig } from '../TextureAtlas';

function makeConfig(overrides: Partial<AtlasConfig> = {}): AtlasConfig {
  return {
    id: 'test_atlas',
    maxWidth: 1024,
    maxHeight: 1024,
    padding: 0,
    allowRotation: false,
    powerOfTwo: false,
    ...overrides,
  };
}

describe('TextureAtlas', () => {
  let atlas: TextureAtlas;

  beforeEach(() => {
    atlas = new TextureAtlas(makeConfig());
  });

  it('pack adds entry', () => {
    const entry = atlas.pack('tex1', 64, 64);
    expect(entry).not.toBeNull();
    expect(entry!.id).toBe('tex1');
    expect(atlas.getEntryCount()).toBe(1);
  });

  it('pack assigns UV coordinates', () => {
    const entry = atlas.pack('t', 100, 50);
    expect(entry!.uv.u0).toBeGreaterThanOrEqual(0);
    expect(entry!.uv.v1).toBeGreaterThan(0);
  });

  it('pack multiple textures on same shelf', () => {
    atlas.pack('a', 100, 50);
    atlas.pack('b', 100, 50);
    expect(atlas.getEntryCount()).toBe(2);
    const a = atlas.getEntry('a')!;
    const b = atlas.getEntry('b')!;
    // b should be to the right of a on the same row
    expect(b.rect.x).toBeGreaterThanOrEqual(a.rect.x + a.rect.width);
  });

  it('pack wraps to new shelf row', () => {
    atlas = new TextureAtlas(makeConfig({ maxWidth: 200 }));
    atlas.pack('a', 150, 50);
    atlas.pack('b', 150, 50); // won't fit on first row
    const b = atlas.getEntry('b')!;
    expect(b.rect.y).toBeGreaterThan(0);
  });

  it('pack returns null when atlas is full', () => {
    atlas = new TextureAtlas(makeConfig({ maxWidth: 100, maxHeight: 100 }));
    atlas.pack('a', 100, 100);
    const result = atlas.pack('b', 100, 100);
    expect(result).toBeNull();
  });

  it('getAtlasWidth/Height returns dimensions', () => {
    atlas.pack('t', 64, 32);
    expect(atlas.getAtlasWidth()).toBeGreaterThanOrEqual(64);
    expect(atlas.getAtlasHeight()).toBeGreaterThanOrEqual(32);
  });

  it('powerOfTwo mode rounds dimensions up', () => {
    atlas = new TextureAtlas(makeConfig({ powerOfTwo: true }));
    atlas.pack('t', 100, 100);
    const w = atlas.getAtlasWidth();
    const h = atlas.getAtlasHeight();
    expect(w).toBe(128); // next power of 2
    expect(h).toBe(128);
  });

  it('getOccupancy returns positive value', () => {
    atlas.pack('t', 100, 100);
    expect(atlas.getOccupancy()).toBeGreaterThan(0);
  });

  it('getAtlas returns atlas object', () => {
    atlas.pack('t', 64, 64);
    const a = atlas.getAtlas();
    expect(a.id).toBe('test_atlas');
    expect(a.entries.size).toBe(1);
  });

  it('getAllEntries returns flat array', () => {
    atlas.pack('a', 32, 32);
    atlas.pack('b', 32, 32);
    expect(atlas.getAllEntries().length).toBe(2);
  });

  it('clear resets atlas', () => {
    atlas.pack('t', 64, 64);
    atlas.clear();
    expect(atlas.getEntryCount()).toBe(0);
    expect(atlas.getAtlasWidth()).toBe(1); // max(1,0)
  });

  it('padding applies spacing', () => {
    atlas = new TextureAtlas(makeConfig({ padding: 4 }));
    atlas.pack('a', 32, 32);
    atlas.pack('b', 32, 32);
    const a = atlas.getEntry('a')!;
    const b = atlas.getEntry('b')!;
    const gap = b.rect.x - (a.rect.x + a.rect.width);
    expect(gap).toBeGreaterThanOrEqual(4); // at least 2*padding between them
  });
});
