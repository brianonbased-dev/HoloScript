/**
 * proceduralTextures — tests for data-declared procedural detail maps (I.007 pillar 3).
 *
 * Keystone (`real botanical generator`): the REAL core generateBotanicalNormalMap
 * (pure, canvas-free) resolves through the registry to valid, deterministic RGBA8
 * data — i.e. a compiled `.holo` material could carry the lotus's procedural maps
 * by declaration, no hand-built canvas. The rest pin dispatch, caching, fallback,
 * and the three.js DataTexture conversion.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateBotanicalNormalMap,
  generateBotanicalRoughnessMap,
} from '../../../core/src/traits/BotanicalLotusTrait';
import {
  registerProceduralTexture,
  hasProceduralTexture,
  clearProceduralTextures,
  resolveProceduralData,
  resolveProceduralTexture,
  proceduralDataToTexture,
  type ProceduralPixelData,
} from '../runtime/proceduralTextures';

beforeEach(() => clearProceduralTextures());

const solid = (w: number, h: number, v = 128): ProceduralPixelData => ({
  width: w,
  height: h,
  data: new Uint8Array(w * h * 4).fill(v),
});

describe('proceduralTextures — registry + resolver', () => {
  it('dispatches a spec to its registered generator with params', () => {
    let seenParams: unknown;
    registerProceduralTexture('mock', (p) => {
      seenParams = p;
      return solid(2, 2);
    });
    const data = resolveProceduralData({ generator: 'mock', params: { k: 7 } });
    expect(seenParams).toEqual({ k: 7 });
    expect(data).toEqual(solid(2, 2));
  });

  it('caches by spec — same declaration never regenerates', () => {
    let calls = 0;
    registerProceduralTexture('counted', () => {
      calls += 1;
      return solid(4, 4);
    });
    const a = resolveProceduralData({ generator: 'counted', params: { s: 1 } });
    const b = resolveProceduralData({ generator: 'counted', params: { s: 1 } });
    expect(a).toBe(b); // same object (cached)
    expect(calls).toBe(1);
    resolveProceduralData({ generator: 'counted', params: { s: 2 } }); // different params → regen
    expect(calls).toBe(2);
  });

  it('returns null for an unregistered generator (caller falls back)', () => {
    expect(hasProceduralTexture('nope')).toBe(false);
    expect(resolveProceduralData({ generator: 'nope' })).toBeNull();
    expect(resolveProceduralTexture({ generator: 'nope' })).toBeNull();
  });

  it('converts pixel data to a three.js DataTexture with correct dimensions', () => {
    const tex = proceduralDataToTexture(solid(8, 8));
    expect(tex.image.width).toBe(8);
    expect(tex.image.height).toBe(8);
    // `needsUpdate` is a write-only setter in three (bumps .version); assert the bump.
    expect(tex.version).toBeGreaterThan(0);
  });

  it('resolves the REAL botanical generators to valid, deterministic RGBA8 data', () => {
    registerProceduralTexture('botanical_normal', (p) =>
      generateBotanicalNormalMap(p as Parameters<typeof generateBotanicalNormalMap>[0])
    );
    registerProceduralTexture('botanical_roughness', (p) =>
      generateBotanicalRoughnessMap(p as Parameters<typeof generateBotanicalRoughnessMap>[0])
    );

    const spec = {
      generator: 'botanical_normal',
      params: { pattern: 'petal_veins', size: 64, seed: 7 },
    };
    const data = resolveProceduralData(spec)!;
    expect(data.width).toBe(64);
    expect(data.height).toBe(64);
    expect(data.data.length).toBe(64 * 64 * 4); // RGBA8
    // not a flat field — the procedural pattern actually varies
    expect(new Set(data.data).size).toBeGreaterThan(1);

    // Deterministic: same seed → byte-identical (regenerate fresh, bypassing cache)
    clearProceduralTextures();
    registerProceduralTexture('botanical_normal', (p) =>
      generateBotanicalNormalMap(p as Parameters<typeof generateBotanicalNormalMap>[0])
    );
    const again = resolveProceduralData(spec)!;
    expect(Array.from(again.data)).toEqual(Array.from(data.data));

    // Roughness generator also produces a valid map and converts to a texture.
    registerProceduralTexture('botanical_roughness', (p) =>
      generateBotanicalRoughnessMap(p as Parameters<typeof generateBotanicalRoughnessMap>[0])
    );
    const tex = resolveProceduralTexture({
      generator: 'botanical_roughness',
      params: { size: 32 },
    });
    expect(tex).not.toBeNull();
    expect(tex!.image.width).toBe(32);
  });
});
