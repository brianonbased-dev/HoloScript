import { describe, it, expect, beforeEach } from 'vitest';
import { TextureAtlas } from '../assets/TextureAtlas';

// =============================================================================
// C309 — TextureAtlas
// =============================================================================

describe('TextureAtlas', () => {
  let atlas: TextureAtlas;
  beforeEach(() => {
    atlas = new TextureAtlas({
      id: 'test-atlas', maxWidth: 256, maxHeight: 256,
      padding: 1, allowRotation: false, powerOfTwo: false,
    });
  });

  it('packs a single texture', () => {
    const entry = atlas.pack('sprite1', 32, 32);
    expect(entry).not.toBeNull();
    expect(entry!.id).toBe('sprite1');
    expect(entry!.sourceWidth).toBe(32);
  });

  it('packs multiple textures', () => {
    atlas.pack('a', 32, 32);
    atlas.pack('b', 64, 32);
    atlas.pack('c', 32, 64);
    expect(atlas.getEntryCount()).toBe(3);
  });

  it('returns null when texture does not fit', () => {
    const small = new TextureAtlas({
      id: 'tiny', maxWidth: 50, maxHeight: 50,
      padding: 0, allowRotation: false, powerOfTwo: false,
    });
    small.pack('a', 40, 40);
    const result = small.pack('b', 40, 40);
    expect(result).toBeNull();
  });

  it('UV coordinates are in [0,1]', () => {
    const entry = atlas.pack('uv', 64, 64)!;
    expect(entry.uv.u0).toBeGreaterThanOrEqual(0);
    expect(entry.uv.v0).toBeGreaterThanOrEqual(0);
    expect(entry.uv.u1).toBeLessThanOrEqual(1);
    expect(entry.uv.v1).toBeLessThanOrEqual(1);
  });

  it('padding offsets rect position', () => {
    const a = new TextureAtlas({
      id: 'pad', maxWidth: 512, maxHeight: 512,
      padding: 4, allowRotation: false, powerOfTwo: false,
    });
    const entry = a.pack('padded', 32, 32)!;
    expect(entry.rect.x).toBe(4); // padding offset
    expect(entry.rect.y).toBe(4);
    expect(entry.padding).toBe(4);
  });

  it('getEntry retrieves by id', () => {
    atlas.pack('lookup', 16, 16);
    const entry = atlas.getEntry('lookup');
    expect(entry).toBeDefined();
    expect(entry!.id).toBe('lookup');
  });

  it('occupancy is non-zero after packing', () => {
    atlas.pack('a', 100, 100);
    atlas.pack('b', 50, 50);
    const occ = atlas.getOccupancy();
    expect(occ).toBeGreaterThan(0);
    expect(occ).toBeLessThanOrEqual(1);
  });

  it('getAtlas returns full atlas info', () => {
    atlas.pack('item', 32, 32);
    const info = atlas.getAtlas();
    expect(info.id).toBe('test-atlas');
    expect(info.entries.size).toBe(1);
    expect(info.width).toBeGreaterThan(0);
    expect(info.height).toBeGreaterThan(0);
  });

  it('powerOfTwo rounds up dimensions', () => {
    const pot = new TextureAtlas({
      id: 'pot', maxWidth: 1024, maxHeight: 1024,
      padding: 0, allowRotation: false, powerOfTwo: true,
    });
    pot.pack('x', 33, 33);
    // 33 → next power of 2 = 64
    expect(pot.getAtlasWidth()).toBe(64);
    expect(pot.getAtlasHeight()).toBe(64);
  });

  it('clear resets all entries', () => {
    atlas.pack('a', 32, 32);
    atlas.pack('b', 32, 32);
    atlas.clear();
    expect(atlas.getEntryCount()).toBe(0);
    expect(atlas.getOccupancy()).toBe(0);
  });

  it('getAllEntries returns array of all entries', () => {
    atlas.pack('x', 10, 10);
    atlas.pack('y', 20, 20);
    const all = atlas.getAllEntries();
    expect(all.length).toBe(2);
  });
});
