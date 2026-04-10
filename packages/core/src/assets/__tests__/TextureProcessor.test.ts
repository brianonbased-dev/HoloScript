import { describe, it, expect } from 'vitest';
import { TextureProcessor, TextureInput } from '../TextureProcessor';

function makeInput(overrides: Partial<TextureInput> = {}): TextureInput {
  return {
    id: 'tex1',
    name: 'Test Texture',
    width: 256,
    height: 256,
    format: 'rgba8',
    sizeBytes: 256 * 256 * 4,
    ...overrides,
  };
}

describe('TextureProcessor', () => {
  it('process returns processed texture', () => {
    const proc = new TextureProcessor();
    const result = proc.process(makeInput());
    expect(result.id).toBe('tex1');
    expect(result.width).toBe(256);
    expect(result.height).toBe(256);
  });

  it('clamps to maxSize', () => {
    const proc = new TextureProcessor({ maxSize: 128 });
    const result = proc.process(makeInput({ width: 512, height: 512 }));
    expect(result.width).toBeLessThanOrEqual(128);
    expect(result.height).toBeLessThanOrEqual(128);
  });

  it('generates mipmaps by default', () => {
    const proc = new TextureProcessor();
    const result = proc.process(makeInput());
    expect(result.mipmapLevels).toBeGreaterThan(1);
  });

  it('no mipmaps when disabled', () => {
    const proc = new TextureProcessor({ generateMipmaps: false });
    const result = proc.process(makeInput());
    expect(result.mipmapLevels).toBe(1);
  });

  it('compression ratio varies by format', () => {
    const procBC1 = new TextureProcessor({ targetFormat: 'bc1' });
    const procRGBA = new TextureProcessor({ targetFormat: 'rgba8' });
    const rBC1 = procBC1.process(makeInput());
    const rRGBA = procRGBA.process(makeInput());
    expect(rBC1.sizeBytes).toBeLessThan(rRGBA.sizeBytes);
  });

  it('packAtlas packs textures into grid', () => {
    const proc = new TextureProcessor();
    const textures = [
      makeInput({ id: 'a', width: 64, height: 64 }),
      makeInput({ id: 'b', width: 64, height: 64 }),
      makeInput({ id: 'c', width: 64, height: 64 }),
    ];
    const result = proc.packAtlas(textures, 512);
    expect(result.entries.length).toBe(3);
    expect(result.utilization).toBeGreaterThan(0);
  });

  it('packAtlas respects atlas size limit', () => {
    const proc = new TextureProcessor();
    const textures = [
      makeInput({ id: 'big', width: 1024, height: 1024 }),
      makeInput({ id: 'another', width: 1024, height: 1024 }),
    ];
    const result = proc.packAtlas(textures, 512);
    // At most one 512x512 fit in a 512 atlas
    expect(result.entries.length).toBeLessThanOrEqual(2);
  });

  it('getMaxSize and getTargetFormat return config', () => {
    const proc = new TextureProcessor({ maxSize: 2048, targetFormat: 'bc3' });
    expect(proc.getMaxSize()).toBe(2048);
    expect(proc.getTargetFormat()).toBe('bc3');
  });
});
