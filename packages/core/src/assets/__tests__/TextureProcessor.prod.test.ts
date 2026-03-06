/**
 * TextureProcessor — Production Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TextureProcessor } from '../TextureProcessor';
import type { TextureInput } from '../TextureProcessor';

function makeInput(opts: Partial<TextureInput> = {}): TextureInput {
  return { id: 'tex1', name: 'texture', width: 512, height: 512, format: 'rgba8', sizeBytes: 1048576, ...opts };
}

describe('TextureProcessor — constructor defaults', () => {
  it('default maxSize is 4096', () => {
    expect(new TextureProcessor().getMaxSize()).toBe(4096);
  });

  it('default targetFormat is rgba8', () => {
    expect(new TextureProcessor().getTargetFormat()).toBe('rgba8');
  });

  it('custom maxSize stored', () => {
    expect(new TextureProcessor({ maxSize: 2048 }).getMaxSize()).toBe(2048);
  });

  it('custom targetFormat stored', () => {
    expect(new TextureProcessor({ targetFormat: 'bc1' }).getTargetFormat()).toBe('bc1');
  });
});

describe('TextureProcessor — process', () => {
  let proc: TextureProcessor;
  beforeEach(() => { proc = new TextureProcessor(); });

  it('returns ProcessedTexture with same id and name', () => {
    const r = proc.process(makeInput({ id: 'x', name: 'y' }));
    expect(r.id).toBe('x');
    expect(r.name).toBe('y');
  });

  it('output dimensions are power of two', () => {
    const r = proc.process(makeInput({ width: 300, height: 200 }));
    expect(Number.isInteger(Math.log2(r.width))).toBe(true);
    expect(Number.isInteger(Math.log2(r.height))).toBe(true);
  });

  it('clamps dimensions to maxSize', () => {
    const r = new TextureProcessor({ maxSize: 512 }).process(makeInput({ width: 8192, height: 4096 }));
    expect(r.width).toBeLessThanOrEqual(512);
    expect(r.height).toBeLessThanOrEqual(512);
  });

  it('mipmapLevels > 1 when generateMipmaps=true (default)', () => {
    const r = proc.process(makeInput({ width: 256, height: 256 }));
    expect(r.mipmapLevels).toBeGreaterThan(1);
  });

  it('mipmapLevels = 1 when generateMipmaps=false', () => {
    const r = new TextureProcessor({ generateMipmaps: false }).process(makeInput({ width: 256, height: 256 }));
    expect(r.mipmapLevels).toBe(1);
  });

  it('rgba8 compressionRatio = 1', () => {
    const r = new TextureProcessor({ targetFormat: 'rgba8' }).process(makeInput());
    expect(r.compressionRatio).toBe(1);
  });

  it('bc1 compressionRatio = 0.125', () => {
    const r = new TextureProcessor({ targetFormat: 'bc1' }).process(makeInput());
    expect(r.compressionRatio).toBe(0.125);
  });

  it('bc3 compressionRatio = 0.25', () => {
    const r = new TextureProcessor({ targetFormat: 'bc3' }).process(makeInput());
    expect(r.compressionRatio).toBe(0.25);
  });

  it('bc7 compressionRatio = 0.25', () => {
    const r = new TextureProcessor({ targetFormat: 'bc7' }).process(makeInput());
    expect(r.compressionRatio).toBe(0.25);
  });

  it('astc compressionRatio = 0.25', () => {
    const r = new TextureProcessor({ targetFormat: 'astc' }).process(makeInput());
    expect(r.compressionRatio).toBe(0.25);
  });

  it('sizeBytes > 0', () => {
    expect(proc.process(makeInput()).sizeBytes).toBeGreaterThan(0);
  });

  it('format in output matches targetFormat', () => {
    const r = new TextureProcessor({ targetFormat: 'bc1' }).process(makeInput());
    expect(r.format).toBe('bc1');
  });

  it('compressed output smaller than rgba8 for same input', () => {
    const input = makeInput({ width: 512, height: 512 });
    const base = new TextureProcessor({ targetFormat: 'rgba8' }).process(input);
    const compressed = new TextureProcessor({ targetFormat: 'bc1' }).process(input);
    expect(compressed.sizeBytes).toBeLessThan(base.sizeBytes);
  });
});

describe('TextureProcessor — packAtlas', () => {
  let proc: TextureProcessor;
  beforeEach(() => { proc = new TextureProcessor(); });

  it('returns AtlasResult with all inputs packed when they fit', () => {
    const inputs = [
      makeInput({ id: 'a', width: 64, height: 64 }),
      makeInput({ id: 'b', width: 64, height: 64 }),
    ];
    const result = proc.packAtlas(inputs, 512);
    expect(result.entries).toHaveLength(2);
  });

  it('entries each have id, x, y, w, h', () => {
    const inputs = [makeInput({ id: 'a', width: 100, height: 50 })];
    const [e] = proc.packAtlas(inputs, 512).entries;
    expect(typeof e.x).toBe('number');
    expect(typeof e.y).toBe('number');
    expect(e.w).toBe(100);
    expect(e.h).toBe(50);
    expect(e.id).toBe('a');
  });

  it('utilization is between 0 and 1', () => {
    const inputs = [makeInput({ id: 'a', width: 64, height: 64 })];
    const r = proc.packAtlas(inputs, 256);
    expect(r.utilization).toBeGreaterThan(0);
    expect(r.utilization).toBeLessThanOrEqual(1);
  });

  it('atlas width and height match requested atlasSize', () => {
    const r = proc.packAtlas([], 1024);
    expect(r.width).toBe(1024);
    expect(r.height).toBe(1024);
  });

  it('entries that overflow atlas rows wrap to next row', () => {
    const inputs = [
      makeInput({ id: 'a', width: 600, height: 64 }),
      makeInput({ id: 'b', width: 600, height: 64 }),
    ];
    const r = proc.packAtlas(inputs, 1024);
    expect(r.entries[0].y).toBe(0);
    expect(r.entries[1].y).toBeGreaterThan(0); // wrapped to next row
  });

  it('drops entries that exceed atlas height', () => {
    const inputs = Array.from({ length: 100 }, (_, i) =>
      makeInput({ id: `t${i}`, width: 64, height: 64 })
    );
    const r = proc.packAtlas(inputs, 128);
    // Atlas 128x128 can fit 4 tiles max
    expect(r.entries.length).toBeLessThan(inputs.length);
  });
});
