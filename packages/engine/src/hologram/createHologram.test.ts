/**
 * Tests for createHologram orchestrator + HologramBundle hashing.
 *
 * AUDIT MODE: coverage targets
 *   - Hash determinism (same identity = same hash)
 *   - Hash sensitivity (different inputs = different hashes)
 *   - Bundle validation (size mismatches, bad dimensions)
 *   - Orchestrator error propagation (depth fails, render fails)
 *   - Input validation at every boundary (empty media, bad source kind,
 *     bad target, missing provider for requested target)
 *   - Provider composition (only requested targets render; others skipped)
 *   - Node-stub providers throw with explicit Sprint-0c guidance
 */

import { describe, expect, it } from 'vitest';

import {
  canonicalMetaJson,
  computeBundleHash,
  HologramBundleError,
  validateBundle,
  verifyBundleHash,
  type HologramBundle,
  type HologramMeta,
} from './HologramBundle';
import {
  createHologram,
  CreateHologramError,
  createNodeProvidersStub,
  type DepthInferenceResult,
  type DepthProvider,
  type HologramProviders,
  type MvhevcEncoder,
  type ParallaxEncoder,
  type QuiltRenderer,
} from './createHologram';

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeMeta(overrides: Partial<HologramMeta> = {}): HologramMeta {
  return {
    sourceKind: 'image',
    width: 4,
    height: 4,
    frames: 1,
    modelId: 'depth-anything/Depth-Anything-V2-Small-hf',
    backend: 'webgpu',
    inferenceMs: 123,
    createdAt: '2026-04-20T00:00:00.000Z',
    schemaVersion: 1,
    ...overrides,
  };
}

/** 4x4x1 depth = 16 floats = 64 bytes */
function makeDepth(seed = 0): Float32Array {
  const d = new Float32Array(16);
  for (let i = 0; i < 16; i++) d[i] = ((i + seed) % 16) / 16;
  return d;
}

/** 4x4x1 normal = 48 floats = 192 bytes */
function makeNormal(seed = 0): Float32Array {
  const n = new Float32Array(48);
  for (let i = 0; i < 48; i++) n[i] = ((i + seed) % 48) / 48;
  return n;
}

function asBytes(arr: Float32Array): Uint8Array {
  return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
}

// ── Providers (mocks) ───────────────────────────────────────────────────────

function makeDepthProvider(overrides: Partial<DepthInferenceResult> = {}): DepthProvider {
  return {
    async infer(): Promise<DepthInferenceResult> {
      return {
        depthMap: makeDepth(),
        width: 4,
        height: 4,
        frames: 1,
        backend: 'webgpu',
        modelId: 'depth-anything/Depth-Anything-V2-Small-hf',
        ...overrides,
      };
    },
  };
}

function makeQuilt(bytes = new Uint8Array([1, 2, 3])): QuiltRenderer {
  return {
    async render() {
      return bytes;
    },
  };
}

function makeMvhevc(bytes = new Uint8Array([4, 5, 6])): MvhevcEncoder {
  return {
    async encode() {
      return bytes;
    },
  };
}

function makeParallax(bytes = new Uint8Array([7, 8, 9])): ParallaxEncoder {
  return {
    async encode() {
      return bytes;
    },
  };
}

function fullProviders(): HologramProviders {
  return {
    depth: makeDepthProvider(),
    quilt: makeQuilt(),
    mvhevc: makeMvhevc(),
    parallax: makeParallax(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HologramBundle — hashing + validation
// ─────────────────────────────────────────────────────────────────────────────

describe('canonicalMetaJson', () => {
  it('is byte-stable across key order in input', () => {
    const a = makeMeta({ sourceKind: 'image', width: 10, height: 20 });
    const b = makeMeta({ height: 20, width: 10, sourceKind: 'image' });
    expect(canonicalMetaJson(a)).toBe(canonicalMetaJson(b));
  });

  it('excludes observational fields (inferenceMs, createdAt)', () => {
    const a = makeMeta({ inferenceMs: 10, createdAt: '2026-04-20T00:00:00.000Z' });
    const b = makeMeta({ inferenceMs: 999, createdAt: '2099-12-31T23:59:59.999Z' });
    expect(canonicalMetaJson(a)).toBe(canonicalMetaJson(b));
  });

  it('changes when identity fields change', () => {
    const base = makeMeta();
    expect(canonicalMetaJson(base)).not.toBe(canonicalMetaJson(makeMeta({ width: 5 })));
    expect(canonicalMetaJson(base)).not.toBe(canonicalMetaJson(makeMeta({ sourceKind: 'gif' })));
    expect(canonicalMetaJson(base)).not.toBe(canonicalMetaJson(makeMeta({ modelId: 'x' })));
    expect(canonicalMetaJson(base)).not.toBe(canonicalMetaJson(makeMeta({ backend: 'wasm' })));
  });
});

describe('computeBundleHash', () => {
  it('is deterministic for identical inputs', async () => {
    const meta = makeMeta();
    const h1 = await computeBundleHash(meta, asBytes(makeDepth()), asBytes(makeNormal()));
    const h2 = await computeBundleHash(meta, asBytes(makeDepth()), asBytes(makeNormal()));
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when depth bytes change', async () => {
    const meta = makeMeta();
    const h1 = await computeBundleHash(meta, asBytes(makeDepth(0)), asBytes(makeNormal()));
    const h2 = await computeBundleHash(meta, asBytes(makeDepth(1)), asBytes(makeNormal()));
    expect(h1).not.toBe(h2);
  });

  it('changes when normal bytes change', async () => {
    const meta = makeMeta();
    const h1 = await computeBundleHash(meta, asBytes(makeDepth()), asBytes(makeNormal(0)));
    const h2 = await computeBundleHash(meta, asBytes(makeDepth()), asBytes(makeNormal(1)));
    expect(h1).not.toBe(h2);
  });

  it('changes when meta identity fields change', async () => {
    const depth = asBytes(makeDepth());
    const normal = asBytes(makeNormal());
    const h1 = await computeBundleHash(makeMeta({ width: 4 }), depth, normal);
    const h2 = await computeBundleHash(makeMeta({ width: 5 }), depth, normal);
    // Note: changing width alone would make the depth buffer size-inconsistent
    // in validateBundle, but hashing is data-only so it's still valid to test.
    expect(h1).not.toBe(h2);
  });

  it('is stable across observational meta changes', async () => {
    const depth = asBytes(makeDepth());
    const normal = asBytes(makeNormal());
    const h1 = await computeBundleHash(makeMeta({ inferenceMs: 10 }), depth, normal);
    const h2 = await computeBundleHash(makeMeta({ inferenceMs: 9999 }), depth, normal);
    expect(h1).toBe(h2);
  });
});

describe('validateBundle', () => {
  const goodBundle = (): HologramBundle => ({
    hash: 'x'.repeat(64),
    meta: makeMeta(),
    depthBin: asBytes(makeDepth()),
    normalBin: asBytes(makeNormal()),
  });

  it('accepts a well-formed bundle', () => {
    expect(() => validateBundle(goodBundle())).not.toThrow();
  });

  it('rejects zero width', () => {
    const b = goodBundle();
    b.meta = makeMeta({ width: 0 });
    expect(() => validateBundle(b)).toThrowError(HologramBundleError);
  });

  it('rejects non-integer height', () => {
    const b = goodBundle();
    b.meta = makeMeta({ height: 3.5 });
    expect(() => validateBundle(b)).toThrowError(/height must be a positive integer/);
  });

  it('rejects depth size mismatch', () => {
    const b = goodBundle();
    b.depthBin = new Uint8Array(8); // should be 64 bytes
    expect(() => validateBundle(b)).toThrowError(/depthBin is 8 bytes, expected 64/);
  });

  it('rejects normal size mismatch', () => {
    const b = goodBundle();
    b.normalBin = new Uint8Array(8); // should be 192 bytes
    expect(() => validateBundle(b)).toThrowError(/normalBin is 8 bytes, expected 192/);
  });

  it('rejects unsupported schemaVersion', () => {
    const b = goodBundle();
    b.meta = { ...makeMeta(), schemaVersion: 2 as 1 };
    expect(() => validateBundle(b)).toThrowError(/unsupported schemaVersion/);
  });
});

describe('verifyBundleHash', () => {
  it('passes when hash matches', async () => {
    const meta = makeMeta();
    const depthBin = asBytes(makeDepth());
    const normalBin = asBytes(makeNormal());
    const hash = await computeBundleHash(meta, depthBin, normalBin);
    await expect(verifyBundleHash({ hash, meta, depthBin, normalBin })).resolves.toBeUndefined();
  });

  it('throws on hash mismatch', async () => {
    const meta = makeMeta();
    const depthBin = asBytes(makeDepth());
    const normalBin = asBytes(makeNormal());
    await expect(
      verifyBundleHash({ hash: 'deadbeef'.repeat(8), meta, depthBin, normalBin })
    ).rejects.toThrowError(/hash_mismatch|does not match/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createHologram — orchestrator
// ─────────────────────────────────────────────────────────────────────────────

describe('createHologram — input validation', () => {
  it('rejects empty media', async () => {
    await expect(
      createHologram(new Uint8Array(0), 'image', fullProviders())
    ).rejects.toThrowError(/empty_media|non-empty/);
  });

  it('rejects invalid sourceKind', async () => {
    await expect(
      createHologram(
        new Uint8Array([1]),
        'mp3' as unknown as 'image',
        fullProviders()
      )
    ).rejects.toThrowError(/sourceKind must be one of/);
  });

  it('rejects unknown target', async () => {
    await expect(
      createHologram(new Uint8Array([1]), 'image', fullProviders(), {
        targets: ['quilt', 'hologram' as unknown as 'quilt'],
      })
    ).rejects.toThrowError(/unknown target/);
  });

  it('rejects missing depth provider', async () => {
    await expect(
      createHologram(
        new Uint8Array([1]),
        'image',
        { depth: undefined as unknown as DepthProvider }
      )
    ).rejects.toThrowError(/providers\.depth is required/);
  });

  it('rejects target=quilt when quilt provider is absent', async () => {
    await expect(
      createHologram(new Uint8Array([1]), 'image', { depth: makeDepthProvider() }, {
        targets: ['quilt'],
      })
    ).rejects.toThrowError(/target 'quilt' requested but providers\.quilt is not configured/);
  });

  it('rejects target=mvhevc when mvhevc provider is absent', async () => {
    await expect(
      createHologram(
        new Uint8Array([1]),
        'image',
        { depth: makeDepthProvider(), quilt: makeQuilt() },
        { targets: ['quilt', 'mvhevc'] }
      )
    ).rejects.toThrowError(/providers\.mvhevc/);
  });
});

describe('createHologram — happy path', () => {
  it('produces a bundle with all three targets when requested', async () => {
    const bundle = await createHologram(
      new Uint8Array([0xff, 0xd8, 0xff]), // fake JPEG SOI
      'image',
      fullProviders(),
      { targets: ['quilt', 'mvhevc', 'parallax'] }
    );

    expect(bundle.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(bundle.meta.sourceKind).toBe('image');
    expect(bundle.meta.width).toBe(4);
    expect(bundle.meta.height).toBe(4);
    expect(bundle.meta.frames).toBe(1);
    expect(bundle.meta.schemaVersion).toBe(1);
    expect(bundle.depthBin.byteLength).toBe(4 * 4 * 1 * 4);
    expect(bundle.normalBin.byteLength).toBe(4 * 4 * 1 * 3 * 4);
    expect(bundle.quiltPng).toEqual(new Uint8Array([1, 2, 3]));
    expect(bundle.mvhevcMp4).toEqual(new Uint8Array([4, 5, 6]));
    expect(bundle.parallaxWebm).toEqual(new Uint8Array([7, 8, 9]));
  });

  it('omits targets that were not requested', async () => {
    const bundle = await createHologram(
      new Uint8Array([1]),
      'image',
      fullProviders(),
      { targets: ['quilt'] }
    );
    expect(bundle.quiltPng).toBeDefined();
    expect(bundle.mvhevcMp4).toBeUndefined();
    expect(bundle.parallaxWebm).toBeUndefined();
  });

  it('produces identical hashes for identical depth/normal/meta identity', async () => {
    const fixedNow = () => new Date('2026-04-20T00:00:00.000Z');
    const a = await createHologram(new Uint8Array([1]), 'image', fullProviders(), {
      targets: ['quilt'],
      now: fixedNow,
    });
    const b = await createHologram(new Uint8Array([1]), 'image', fullProviders(), {
      targets: ['quilt'],
      now: fixedNow,
    });
    expect(a.hash).toBe(b.hash);
  });

  it('produces different hashes when depth output differs', async () => {
    const providersA = { ...fullProviders(), depth: makeDepthProvider() };
    const providersB = {
      ...fullProviders(),
      depth: {
        async infer(): Promise<DepthInferenceResult> {
          return {
            depthMap: makeDepth(7), // different seed
            width: 4,
            height: 4,
            frames: 1,
            backend: 'webgpu' as const,
            modelId: 'depth-anything/Depth-Anything-V2-Small-hf',
          };
        },
      },
    };
    const a = await createHologram(new Uint8Array([1]), 'image', providersA, { targets: ['quilt'] });
    const b = await createHologram(new Uint8Array([1]), 'image', providersB, { targets: ['quilt'] });
    expect(a.hash).not.toBe(b.hash);
  });

  it('allows gif and video source kinds', async () => {
    const gif = await createHologram(new Uint8Array([1]), 'gif', fullProviders(), {
      targets: ['quilt'],
    });
    const vid = await createHologram(new Uint8Array([1]), 'video', fullProviders(), {
      targets: ['quilt'],
    });
    expect(gif.meta.sourceKind).toBe('gif');
    expect(vid.meta.sourceKind).toBe('video');
  });
});

describe('createHologram — error propagation', () => {
  it('wraps depth provider errors as CreateHologramError(depth_failed)', async () => {
    const providers: HologramProviders = {
      depth: {
        async infer() {
          throw new Error('ONNX inference crashed');
        },
      },
      quilt: makeQuilt(),
    };
    await expect(
      createHologram(new Uint8Array([1]), 'image', providers, { targets: ['quilt'] })
    ).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof CreateHologramError &&
        err.code === 'depth_failed' &&
        err.message.includes('ONNX inference crashed')
      );
    });
  });

  it('wraps renderer errors as CreateHologramError(render_failed)', async () => {
    const providers: HologramProviders = {
      depth: makeDepthProvider(),
      quilt: {
        async render() {
          throw new Error('WebGL context lost');
        },
      },
    };
    await expect(
      createHologram(new Uint8Array([1]), 'image', providers, { targets: ['quilt'] })
    ).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof CreateHologramError &&
        err.code === 'render_failed' &&
        err.message.includes('WebGL context lost')
      );
    });
  });

  it('propagates non-Error throws with a message', async () => {
    const providers: HologramProviders = {
      depth: {
        async infer(): Promise<DepthInferenceResult> {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw 'bare string';
        },
      },
    };
    await expect(
      createHologram(new Uint8Array([1]), 'image', providers, { targets: [] })
    ).rejects.toThrowError(/bare string/);
  });
});

describe('createNodeProvidersStub', () => {
  it('returns providers that throw with Sprint 0c guidance', async () => {
    const stubs = createNodeProvidersStub();
    await expect(stubs.depth.infer(new Uint8Array([1]), 'image')).rejects.toThrowError(
      /Sprint 0c|hologram-worker/
    );
    await expect(
      stubs.quilt!.render({
        depthMap: makeDepth(),
        normalMap: makeNormal(),
        width: 4,
        height: 4,
        frames: 1,
        media: new Uint8Array([1]),
        sourceKind: 'image',
      })
    ).rejects.toThrowError(/Sprint 0c|hologram-worker/);
  });
});
