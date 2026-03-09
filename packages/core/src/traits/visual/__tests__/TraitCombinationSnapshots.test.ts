/**
 * Phase 2 visual test suite — trait combination "snapshots".
 *
 * These tests verify that the TraitCompositor produces deterministic,
 * stable outputs for key trait combinations. They serve as golden-image
 * equivalents for headless environments: instead of comparing pixel images
 * they compare serialised material descriptors.
 *
 * If a snapshot fails it means the composition rules changed and the
 * expected output must be deliberately updated — similar to Jest snapshots.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { TraitCompositor } from '../TraitCompositor';
import { registerAllPresets } from '../index';
import {
  ProceduralGeometryResolver,
  GEOMETRY_TRAITS,
} from '../resolvers/ProceduralGeometryResolver';
import { Text3DAdapter, TEXT_TO_3D_TRAITS } from '../resolvers/Text3DAdapter';
import {
  AssetManifestBuilder,
  ManifestResolver,
  parseManifest,
  ManifestValidationError,
} from '../resolvers/AssetManifest';
import { AssetResolverPipeline, type PrimitiveFallback } from '../resolvers/AssetResolverPipeline';
import { RateLimiter, RateLimitExceededError } from '../resolvers/RateLimiter';
import { ProceduralResolver } from '../resolvers/ProceduralResolver';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Serialise a composed material to a stable string snapshot. */
function snapshot(traits: string[]): string {
  const compositor = new TraitCompositor();
  const result = compositor.compose(traits);
  // Round floats to 2dp to avoid noise
  const serialised = JSON.stringify(result, (_k, v) =>
    typeof v === 'number' ? Math.round(v * 100) / 100 : v
  );
  return serialised;
}

// ─── Phase 2: Trait composition snapshots ────────────────────────────────────

describe('TraitCompositor — combination snapshots', () => {
  beforeEach(() => {
    registerAllPresets();
  });

  // Single-trait baselines
  it('wooden alone produces stable output', () => {
    const out = snapshot(['wooden']);
    expect(out).toMatchSnapshot();
  });

  it('marble alone produces stable output', () => {
    const out = snapshot(['marble_material']);
    expect(out).toMatchSnapshot();
  });

  it('metallic alone produces stable output', () => {
    const out = snapshot(['metallic']);
    expect(out).toMatchSnapshot();
  });

  // Era modifiers
  it('wooden + medieval_era produces stable output', () => {
    const out = snapshot(['wooden', 'medieval_era']);
    expect(out).toMatchSnapshot();
  });

  it('stone + ancient_era produces stable output', () => {
    const out = snapshot(['stone', 'ancient_era']);
    expect(out).toMatchSnapshot();
  });

  it('steel + cyberpunk produces stable output', () => {
    const out = snapshot(['steel', 'cyberpunk']);
    expect(out).toMatchSnapshot();
  });

  // Condition modifiers
  it('wooden + rusted produces stable output', () => {
    const out = snapshot(['wooden', 'rusted']);
    expect(out).toMatchSnapshot();
  });

  it('stone + cracked produces stable output', () => {
    const out = snapshot(['stone', 'cracked']);
    expect(out).toMatchSnapshot();
  });

  it('metallic + pristine produces stable output', () => {
    const out = snapshot(['metallic', 'pristine']);
    expect(out).toMatchSnapshot();
  });

  // Magic / fantasy modifiers
  it('wooden + enchanted produces stable output', () => {
    const out = snapshot(['wooden', 'enchanted']);
    expect(out).toMatchSnapshot();
  });

  it('stone + cursed produces stable output', () => {
    const out = snapshot(['stone', 'cursed']);
    expect(out).toMatchSnapshot();
  });

  it('crystal + blessed produces stable output', () => {
    const out = snapshot(['crystal', 'blessed']);
    expect(out).toMatchSnapshot();
  });

  // Multi-trait stacking (era + condition + magic)
  it('wooden + ancient_era + cursed produces stable output', () => {
    const out = snapshot(['wooden', 'ancient_era', 'cursed']);
    expect(out).toMatchSnapshot();
  });

  it('marble + victorian + enchanted produces stable output', () => {
    const out = snapshot(['marble_material', 'victorian', 'enchanted']);
    expect(out).toMatchSnapshot();
  });

  it('steel + cyberpunk + damaged produces stable output', () => {
    const out = snapshot(['steel', 'cyberpunk', 'damaged']);
    expect(out).toMatchSnapshot();
  });

  // Suppression rules
  it('pristine suppresses rusted modifier', () => {
    const withRust = snapshot(['metallic', 'rusted']);
    const withPristineAndRust = snapshot(['metallic', 'pristine', 'rusted']);
    // pristine should suppress rusted — outputs must differ
    expect(withRust).not.toEqual(withPristineAndRust);
  });

  // Environment modifiers
  it('wooden + underwater produces stable output', () => {
    const out = snapshot(['wooden', 'underwater']);
    expect(out).toMatchSnapshot();
  });

  it('stone + volcanic produces stable output', () => {
    const out = snapshot(['stone', 'volcanic']);
    expect(out).toMatchSnapshot();
  });

  // Determinism: same inputs always produce the same output
  it('composition is deterministic (same traits → same result)', () => {
    const a = snapshot(['wooden', 'ancient_era', 'mossy']);
    const b = snapshot(['wooden', 'ancient_era', 'mossy']);
    expect(a).toBe(b);
  });

  it('trait order does not affect composition result', () => {
    const ab = snapshot(['wooden', 'ancient_era']);
    const ba = snapshot(['ancient_era', 'wooden']);
    expect(ab).toBe(ba);
  });
});

// ─── Phase 3: ProceduralGeometryResolver ─────────────────────────────────────

describe('ProceduralGeometryResolver', () => {
  const resolver = new ProceduralGeometryResolver();

  it('canResolve returns true for all GEOMETRY_TRAITS', () => {
    for (const trait of Object.keys(GEOMETRY_TRAITS)) {
      expect(resolver.canResolve(trait, {})).toBe(true);
    }
  });

  it('canResolve returns false for unknown traits', () => {
    expect(resolver.canResolve('dragon', {})).toBe(false);
    expect(resolver.canResolve('metallic', {})).toBe(false);
  });

  it('resolves tree → model with geometry metadata', async () => {
    const result = await resolver.resolve('tree', {});
    expect(result.type).toBe('model');
    expect(result.data).toBeInstanceOf(ArrayBuffer);
    expect((result.data as ArrayBuffer).byteLength).toBeGreaterThan(0);
    expect(result.metadata?.generator).toBe('procedural-geometry');
    expect(result.metadata?.primitive).toBe('tree');
    expect(result.metadata?.vertexCount).toBeGreaterThan(0);
    expect(result.metadata?.triangleCount).toBeGreaterThan(0);
  });

  it('resolves rock → model', async () => {
    const result = await resolver.resolve('rock', {});
    expect(result.type).toBe('model');
    expect(result.metadata?.primitive).toBe('rock');
  });

  it('resolves terrain_patch traits', async () => {
    const result = await resolver.resolve('hill', {});
    expect(result.type).toBe('model');
    expect(result.metadata?.primitive).toBe('terrain_patch');
  });

  it('resolves building traits', async () => {
    const result = await resolver.resolve('house', {});
    expect(result.type).toBe('model');
    expect(result.metadata?.primitive).toBe('building');
  });

  it('resolves arch', async () => {
    const result = await resolver.resolve('arch', {});
    expect(result.type).toBe('model');
    expect(result.metadata?.primitive).toBe('arch');
  });

  it('resolves crystal cluster', async () => {
    const result = await resolver.resolve('crystal', {});
    expect(result.type).toBe('model');
    expect(result.metadata?.primitive).toBe('crystal_cluster');
  });

  it('geometry is deterministic (same trait → same bytes)', async () => {
    const a = await resolver.resolve('rock', {});
    const b = await resolver.resolve('rock', {});
    const va = new Uint8Array(a.data as ArrayBuffer);
    const vb = new Uint8Array(b.data as ArrayBuffer);
    expect(va).toEqual(vb);
  });

  it('resolves all GEOMETRY_TRAITS without throwing', async () => {
    for (const trait of Object.keys(GEOMETRY_TRAITS)) {
      const result = await resolver.resolve(trait, {});
      expect(result.type).toBe('model');
    }
  });
});

// ─── Phase 3: Text3DAdapter ───────────────────────────────────────────────────

describe('Text3DAdapter', () => {
  it('canResolve returns true for all TEXT_TO_3D_TRAITS', () => {
    const adapter = new Text3DAdapter({ provider: 'meshy', apiKey: 'test' });
    for (const trait of Object.keys(TEXT_TO_3D_TRAITS)) {
      expect(adapter.canResolve(trait, {})).toBe(true);
    }
  });

  it('canResolve returns false for non-3D traits', () => {
    const adapter = new Text3DAdapter({ provider: 'meshy', apiKey: 'test' });
    expect(adapter.canResolve('wooden', {})).toBe(false);
    expect(adapter.canResolve('pristine', {})).toBe(false);
  });

  it('throws on construction when provider is custom with no endpoint', () => {
    expect(() => new Text3DAdapter({ provider: 'custom', apiKey: 'x' })).toThrow();
  });

  it('accepts custom endpoint override', () => {
    expect(
      () => new Text3DAdapter({ provider: 'custom', apiKey: 'x', endpoint: 'https://my.api/3d' })
    ).not.toThrow();
  });

  it('TEXT_TO_3D_TRAITS covers expected categories', () => {
    const traits = Object.keys(TEXT_TO_3D_TRAITS);
    expect(traits).toContain('dragon');
    expect(traits).toContain('chair');
    expect(traits).toContain('lighthouse');
    expect(traits).toContain('sword');
    expect(traits).toContain('tree');
  });
});

// ─── Phase 3: AssetManifest ───────────────────────────────────────────────────

describe('AssetManifest', () => {
  describe('parseManifest', () => {
    it('parses a valid manifest', () => {
      const raw = {
        version: '1.0.0',
        name: '@test/assets',
        entries: [
          { trait: 'chair', url: './chair.glb', type: 'model' },
          { trait: 'wooden', url: './wood.png', type: 'texture' },
        ],
      };
      const doc = parseManifest(raw);
      expect(doc.version).toBe('1.0.0');
      expect(doc.name).toBe('@test/assets');
      expect(doc.entries).toHaveLength(2);
      expect(doc.entries[0].trait).toBe('chair');
    });

    it('throws on missing version', () => {
      expect(() => parseManifest({ name: 'x', entries: [] })).toThrow(ManifestValidationError);
    });

    it('throws on missing name', () => {
      expect(() => parseManifest({ version: '1.0.0', entries: [] })).toThrow(
        ManifestValidationError
      );
    });

    it('throws when entries is not an array', () => {
      expect(() => parseManifest({ version: '1.0.0', name: 'x', entries: 'bad' })).toThrow(
        ManifestValidationError
      );
    });

    it('throws on invalid entry type', () => {
      expect(() =>
        parseManifest({
          version: '1.0.0',
          name: 'x',
          entries: [{ trait: 'chair', url: './a.glb', type: 'invalid' }],
        })
      ).toThrow(ManifestValidationError);
    });

    it('throws on missing entry url', () => {
      expect(() =>
        parseManifest({
          version: '1.0.0',
          name: 'x',
          entries: [{ trait: 'chair', type: 'model' }],
        })
      ).toThrow(ManifestValidationError);
    });
  });

  describe('AssetManifestBuilder', () => {
    it('builds a manifest with model and texture entries', () => {
      const doc = new AssetManifestBuilder('@team/assets', '2.0.0', 'https://cdn.example/')
        .model('chair', 'chair.glb')
        .texture('wooden', 'wood.png')
        .build();

      expect(doc.version).toBe('2.0.0');
      expect(doc.name).toBe('@team/assets');
      expect(doc.baseUrl).toBe('https://cdn.example/');
      expect(doc.entries).toHaveLength(2);
      expect(doc.entries[0]).toEqual({
        trait: 'chair',
        url: 'chair.glb',
        type: 'model',
        metadata: undefined,
      });
    });

    it('toJSON() produces valid JSON', () => {
      const json = new AssetManifestBuilder('test', '1.0.0').model('rock', 'rock.glb').toJSON();
      expect(() => JSON.parse(json)).not.toThrow();
    });
  });

  describe('ManifestResolver', () => {
    it('canResolve returns true for traits in manifest', () => {
      const manifest = new AssetManifestBuilder('test', '1.0.0')
        .model('chair', './chair.glb')
        .build();
      const resolver = new ManifestResolver(manifest);
      expect(resolver.canResolve('chair', {})).toBe(true);
      expect(resolver.canResolve('table', {})).toBe(false);
    });

    it('reports correct size and traits', () => {
      const manifest = new AssetManifestBuilder('test', '1.0.0')
        .model('a', 'a.glb')
        .texture('b', 'b.png')
        .build();
      const resolver = new ManifestResolver(manifest);
      expect(resolver.size).toBe(2);
      expect(resolver.traits).toContain('a');
      expect(resolver.traits).toContain('b');
    });

    it('fromJSON() parses and constructs', () => {
      const raw = {
        version: '1.0.0',
        name: 'x',
        entries: [{ trait: 'sword', url: 'sword.glb', type: 'model' }],
      };
      const resolver = ManifestResolver.fromJSON(raw);
      expect(resolver.canResolve('sword', {})).toBe(true);
    });
  });
});

// ─── Phase 3: RateLimiter ─────────────────────────────────────────────────────

describe('RateLimiter', () => {
  it('allows burst up to burstSize immediately', async () => {
    const limiter = new RateLimiter({ tokensPerSecond: 1, burstSize: 3 });
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    expect(limiter.callCount).toBe(3);
  });

  it('throws when hard cap is reached', async () => {
    const limiter = new RateLimiter({ tokensPerSecond: 100, burstSize: 5, maxCallsTotal: 2 });
    await limiter.acquire();
    await limiter.acquire();
    await expect(limiter.acquire()).rejects.toBeInstanceOf(RateLimitExceededError);
  });

  it('canAcquireNow() returns false when bucket empty', async () => {
    const limiter = new RateLimiter({ tokensPerSecond: 1, burstSize: 1 });
    await limiter.acquire();
    expect(limiter.canAcquireNow()).toBe(false);
  });

  it('canAcquireNow() returns true when tokens available', () => {
    const limiter = new RateLimiter({ tokensPerSecond: 1, burstSize: 5 });
    expect(limiter.canAcquireNow()).toBe(true);
  });

  it('reset() restores full bucket', async () => {
    const limiter = new RateLimiter({ tokensPerSecond: 2, burstSize: 2 });
    await limiter.acquire();
    await limiter.acquire();
    limiter.reset();
    expect(limiter.canAcquireNow()).toBe(true);
    expect(limiter.callCount).toBe(0);
  });

  it('throws on timeout if bucket does not refill in time', async () => {
    const limiter = new RateLimiter({ tokensPerSecond: 0.001, burstSize: 1 });
    await limiter.acquire(); // drains bucket
    // timeout of 50ms — refill at 0.001 t/s takes 1000s
    await expect(limiter.acquire(50)).rejects.toBeInstanceOf(RateLimitExceededError);
  });
});

// ─── Phase 3: AssetResolverPipeline offline mode + fallback ──────────────────

describe('AssetResolverPipeline — offline mode and fallback', () => {
  it('skips API plugins when offline: true', async () => {
    let apiCalled = false;
    const apiPlugin = {
      name: 'ai-texture',
      priority: 10,
      canResolve: () => true,
      resolve: async () => {
        apiCalled = true;
        return { type: 'texture' as const };
      },
    };

    const pipeline = new AssetResolverPipeline({ offline: true });
    pipeline.register(apiPlugin);
    const result = await pipeline.resolve('wooden', {});
    expect(apiCalled).toBe(false);
    expect(result).toHaveProperty('shape'); // primitive fallback
  });

  it('runs API plugins when online', async () => {
    let apiCalled = false;
    const apiPlugin = {
      name: 'ai-texture',
      priority: 10,
      canResolve: () => true,
      resolve: async (): Promise<import('../resolvers/types').ResolvedAsset> => {
        apiCalled = true;
        return { type: 'texture', data: new ArrayBuffer(4) };
      },
    };

    const pipeline = new AssetResolverPipeline({ offline: false });
    pipeline.register(apiPlugin);
    await pipeline.resolve('wooden', {});
    expect(apiCalled).toBe(true);
  });

  it('returns PrimitiveFallback when all resolvers fail', async () => {
    const pipeline = new AssetResolverPipeline();
    const result = await pipeline.resolve('unknown_trait_xyz', {});
    expect(result).toHaveProperty('shape');
    expect(result).toHaveProperty('size');
    expect(result).toHaveProperty('color');
    const fb = result as PrimitiveFallback;
    expect(fb.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('primitive fallback selects cylinder for tree-like traits', async () => {
    const pipeline = new AssetResolverPipeline();
    const result = (await pipeline.resolve('pine_tower', {})) as PrimitiveFallback;
    expect(result.shape).toBe('cylinder');
  });

  it('primitive fallback selects sphere for rock-like traits', async () => {
    const pipeline = new AssetResolverPipeline();
    const result = (await pipeline.resolve('big_rock_here', {})) as PrimitiveFallback;
    expect(result.shape).toBe('sphere');
  });

  it('primitive fallback selects plane for terrain traits', async () => {
    const pipeline = new AssetResolverPipeline();
    const result = (await pipeline.resolve('flat_ground', {})) as PrimitiveFallback;
    expect(result.shape).toBe('plane');
  });

  it('rate limiter blocks API plugin when cap exceeded', async () => {
    const limiter = new RateLimiter({ tokensPerSecond: 100, burstSize: 1, maxCallsTotal: 1 });
    let callCount = 0;
    const apiPlugin = {
      name: 'ai-texture',
      priority: 10,
      canResolve: () => true,
      resolve: async (): Promise<import('../resolvers/types').ResolvedAsset> => {
        callCount++;
        return { type: 'texture', data: new ArrayBuffer(4) };
      },
    };

    const pipeline = new AssetResolverPipeline({ rateLimiter: limiter });
    pipeline.register(apiPlugin);

    await pipeline.resolve('traitA', {}); // uses the 1 token
    await pipeline.resolve('traitB', {}); // rate limited → falls back to primitive
    expect(callCount).toBe(1);
  });

  it('setOffline() switches mode at runtime', async () => {
    const pipeline = new AssetResolverPipeline({ offline: false });
    pipeline.setOffline(true);
    let called = false;
    pipeline.register({
      name: 'ai-texture',
      priority: 5,
      canResolve: () => true,
      resolve: async () => {
        called = true;
        return { type: 'texture' as const };
      },
    });
    await pipeline.resolve('test', {});
    expect(called).toBe(false);
  });

  it('apiPluginCount counts only API plugins', () => {
    const pipeline = new AssetResolverPipeline();
    pipeline.register({
      name: 'ai-texture',
      priority: 10,
      canResolve: () => false,
      resolve: async () => ({ type: 'texture' as const }),
    });
    pipeline.register({
      name: 'text-to-3d',
      priority: 20,
      canResolve: () => false,
      resolve: async () => ({ type: 'model' as const }),
    });
    pipeline.register({
      name: 'procedural',
      priority: 5,
      canResolve: () => false,
      resolve: async () => ({ type: 'texture' as const }),
    });
    expect(pipeline.apiPluginCount).toBe(2);
    expect(pipeline.pluginCount).toBe(3);
  });

  it('ProceduralResolver resolves in offline pipeline', async () => {
    const pipeline = new AssetResolverPipeline({ offline: true });
    pipeline.register(new ProceduralResolver());
    const result = await pipeline.resolve('wooden', {});
    expect(result).toHaveProperty('type', 'texture');
  });
});
