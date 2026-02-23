/**
 * Sprint 7 — AssetPipeline Tests
 *
 * Tests the AssetPipeline standalone: register, load, cache, error handling,
 * and cleanup.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssetPipeline } from '../../runtime/AssetPipeline';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLoader(value: unknown, delay = 0) {
  return vi.fn(async (_path: string) => {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    return value;
  });
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

describe('AssetPipeline — registration', () => {
  it('registers a loader for a type', () => {
    const pipeline = new AssetPipeline();
    const loader = makeLoader(null);
    pipeline.registerLoader('mesh', loader);
    expect(pipeline.hasLoader('mesh')).toBe(true);
  });

  it('returns false for unknown loader types', () => {
    const pipeline = new AssetPipeline();
    expect(pipeline.hasLoader('unknowntype')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

describe('AssetPipeline — loading', () => {
  let pipeline: AssetPipeline;

  beforeEach(() => {
    pipeline = new AssetPipeline();
    pipeline.registerLoader('texture', makeLoader({ pixels: [] }));
    pipeline.registerLoader('mesh', makeLoader({ vertices: [] }));
  });

  it('loads an asset and returns the result', async () => {
    const result = await pipeline.load('texture', './grass.png');
    expect(result).toEqual({ pixels: [] });
  });

  it('loads different asset types', async () => {
    const mesh = await pipeline.load('mesh', './cube.glb');
    expect(mesh).toEqual({ vertices: [] });
  });

  it('throws for unregistered asset type', async () => {
    await expect(pipeline.load('audio', './sound.mp3')).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Caching
// ---------------------------------------------------------------------------

describe('AssetPipeline — caching', () => {
  it('returns cached asset on second load (loader called once)', async () => {
    const loader = makeLoader({ cached: true });
    const pipeline = new AssetPipeline();
    pipeline.registerLoader('texture', loader);

    await pipeline.load('texture', './img.png');
    await pipeline.load('texture', './img.png');

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('different paths produce separate cache entries', async () => {
    const loader = makeLoader({ data: 'asset' });
    const pipeline = new AssetPipeline();
    pipeline.registerLoader('mesh', loader);

    await pipeline.load('mesh', './a.glb');
    await pipeline.load('mesh', './b.glb');

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('isLoaded() reflects cache state', async () => {
    const pipeline = new AssetPipeline();
    pipeline.registerLoader('mesh', makeLoader({}));
    expect(pipeline.isLoaded('mesh', './model.glb')).toBe(false);
    await pipeline.load('mesh', './model.glb');
    expect(pipeline.isLoaded('mesh', './model.glb')).toBe(true);
  });

  it('evict() removes the asset from cache', async () => {
    const pipeline = new AssetPipeline();
    pipeline.registerLoader('texture', makeLoader({ pixels: [] }));
    await pipeline.load('texture', './img.png');
    pipeline.evict('texture', './img.png');
    expect(pipeline.isLoaded('texture', './img.png')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('AssetPipeline — error handling', () => {
  it('propagates loader errors', async () => {
    const pipeline = new AssetPipeline();
    pipeline.registerLoader('broken', async () => {
      throw new Error('load-failed');
    });
    await expect(pipeline.load('broken', './bad.glb')).rejects.toThrow('load-failed');
  });

  it('does not cache failed loads', async () => {
    let attempt = 0;
    const pipeline = new AssetPipeline();
    pipeline.registerLoader('flaky', async () => {
      attempt++;
      if (attempt === 1) throw new Error('first-fail');
      return { ok: true };
    });

    await expect(pipeline.load('flaky', './file.ext')).rejects.toThrow();
    const result = await pipeline.load('flaky', './file.ext');
    expect(result).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

describe('AssetPipeline — cleanup', () => {
  it('clear() removes all cached assets', async () => {
    const pipeline = new AssetPipeline();
    pipeline.registerLoader('mesh', makeLoader({}));
    await pipeline.load('mesh', './a.glb');
    await pipeline.load('mesh', './b.glb');
    pipeline.clear();
    expect(pipeline.isLoaded('mesh', './a.glb')).toBe(false);
    expect(pipeline.isLoaded('mesh', './b.glb')).toBe(false);
  });

  it('loadedCount tracks the number of cached assets', async () => {
    const pipeline = new AssetPipeline();
    pipeline.registerLoader('texture', makeLoader({}));
    expect(pipeline.loadedCount).toBe(0);
    await pipeline.load('texture', './a.png');
    await pipeline.load('texture', './b.png');
    expect(pipeline.loadedCount).toBe(2);
    pipeline.clear();
    expect(pipeline.loadedCount).toBe(0);
  });
});
