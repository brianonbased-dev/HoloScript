/**
 * Tests for the prophetic GI foundation.
 *
 * Covers:
 *   - Config validation (probeCount alignment, position-array length).
 *   - Orchestrator step → ProphecyFrame contract.
 *   - CPU mirror is byte-equivalent to the WGSL kernel intent (the
 *     shader is read as text and asserted to declare the binding
 *     layout the orchestrator allocates against).
 *   - LocalProphecyTransport delegates and produces frames.
 *   - HoloMeshProphecyTransport falls back when no remote is wired and
 *     throws ProphecyNotImplementedError when no fallback is given.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GPUContext } from '../gpu-context.js';
import {
  ProphecyOrchestrator,
  LocalProphecyTransport,
  HoloMeshProphecyTransport,
  ProphecyNotImplementedError,
  type ProphecyConfig,
  type ProphecySceneContext,
} from '../prophetic-gi/index.js';

function makeConfig(overrides?: Partial<ProphecyConfig>): ProphecyConfig {
  const probeCount = overrides?.probeCount ?? 64;
  const probePositions =
    overrides?.probePositions ?? new Float32Array(probeCount * 3);
  for (let i = 0; i < probeCount; i++) {
    probePositions[i * 3 + 0] = i;
    probePositions[i * 3 + 1] = 0;
    probePositions[i * 3 + 2] = 0;
  }
  return {
    probeCount,
    probePositions,
    confidenceFloor: overrides?.confidenceFloor ?? 0.05,
    albedo: overrides?.albedo,
    failSafe: overrides?.failSafe,
  };
}

const SCENE: ProphecySceneContext = {
  cameraPosition: [0, 1.7, 5],
  cameraForward: [0, 0, -1],
  sunDirection: [0, 1, 0],
  sunColor: [1, 1, 1],
};

describe('ProphecyOrchestrator', () => {
  let ctx: GPUContext;

  beforeEach(async () => {
    ctx = new GPUContext();
    await ctx.initialize();
  });

  afterEach(() => {
    ctx.destroy();
  });

  describe('config validation', () => {
    it('rejects non-positive probeCount', () => {
      expect(
        () =>
          new ProphecyOrchestrator(
            ctx,
            makeConfig({ probeCount: 0, probePositions: new Float32Array(0) }),
          ),
      ).toThrow(/positive integer/);
    });

    it('rejects probeCount that is not a multiple of 64', () => {
      expect(
        () =>
          new ProphecyOrchestrator(
            ctx,
            makeConfig({
              probeCount: 100,
              probePositions: new Float32Array(300),
            }),
          ),
      ).toThrow(/multiple of 64/);
    });

    it('rejects probePositions with wrong length', () => {
      expect(
        () =>
          new ProphecyOrchestrator(
            ctx,
            makeConfig({ probeCount: 64, probePositions: new Float32Array(10) }),
          ),
      ).toThrow(/probePositions length/);
    });

    it('rejects albedo with wrong length', () => {
      expect(
        () =>
          new ProphecyOrchestrator(
            ctx,
            makeConfig({ probeCount: 64, albedo: new Float32Array(10) }),
          ),
      ).toThrow(/albedo length/);
    });

    it('rejects out-of-range confidenceFloor', () => {
      expect(
        () =>
          new ProphecyOrchestrator(ctx, makeConfig({ confidenceFloor: 2 })),
      ).toThrow(/confidenceFloor/);
    });
  });

  describe('step → ProphecyFrame', () => {
    it('produces a frame with the configured probe count', () => {
      const o = new ProphecyOrchestrator(ctx, makeConfig());
      o.initialize();
      o.primeSpikeRatesShadow(new Float32Array(64).fill(0.5));
      const frame = o.step(SCENE);
      expect(frame.probes.length).toBe(64);
      expect(frame.frameId).toBe(0);
      expect(frame.source).toBe('local');
      expect(frame.productionTimeMs).toBeGreaterThanOrEqual(0);
      o.destroy();
    });

    it('increments frameId monotonically', () => {
      const o = new ProphecyOrchestrator(ctx, makeConfig());
      o.initialize();
      o.primeSpikeRatesShadow(new Float32Array(64).fill(0.5));
      const a = o.step(SCENE);
      const b = o.step(SCENE);
      expect(b.frameId).toBe(a.frameId + 1);
      o.destroy();
    });

    it('drops probes below the confidence floor (rgb=0)', () => {
      const o = new ProphecyOrchestrator(
        ctx,
        makeConfig({ confidenceFloor: 0.5 }),
      );
      o.initialize();
      const rates = new Float32Array(64);
      for (let i = 0; i < 64; i++) rates[i] = i < 32 ? 0.1 : 0.9;
      o.primeSpikeRatesShadow(rates);
      const frame = o.step(SCENE);
      // Below floor → zeroed
      expect(frame.probes[0].rgb).toEqual([0, 0, 0]);
      // Above floor → non-zero
      expect(frame.probes[40].rgb[0]).toBeGreaterThan(0);
      o.destroy();
    });

    it('respects sun direction (downward sun → reduced facing mix)', () => {
      const o = new ProphecyOrchestrator(ctx, makeConfig());
      o.initialize();
      o.primeSpikeRatesShadow(new Float32Array(64).fill(1.0));

      // Sun straight up → full facing
      const upFrame = o.step({
        ...SCENE,
        sunDirection: [0, 1, 0],
      });
      // Sun straight down → facing clamps to 0
      const downFrame = o.step({
        ...SCENE,
        sunDirection: [0, -1, 0],
      });

      expect(upFrame.probes[0].rgb[0]).toBeGreaterThan(downFrame.probes[0].rgb[0]);
      o.destroy();
    });

    it('rejects spike rate uploads of the wrong length', () => {
      const o = new ProphecyOrchestrator(ctx, makeConfig());
      o.initialize();
      expect(() => o.uploadSpikeRates(new Float32Array(10))).toThrow(
        /expected length 64/,
      );
      expect(() => o.primeSpikeRatesShadow(new Float32Array(10))).toThrow(
        /expected length 64/,
      );
      o.destroy();
    });

    it('throws if step() is called before initialize()', () => {
      const o = new ProphecyOrchestrator(ctx, makeConfig());
      expect(() => o.step(SCENE)).toThrow(/initialize\(\) first/);
    });
  });
});

describe('prophetic-radiance.wgsl', () => {
  // The orchestrator allocates buffers against a specific bind-group
  // layout — we assert the shader text declares those bindings so a
  // refactor can't silently desync them.
  const SHADER = readFileSync(
    join(__dirname, '..', 'shaders', 'prophetic-radiance.wgsl'),
    'utf8',
  );

  it('declares the ProphecyParams uniform at (0,0)', () => {
    expect(SHADER).toMatch(/@group\(0\)\s*@binding\(0\)\s*var<uniform>\s*params:\s*ProphecyParams/);
  });

  it('declares spike_rates storage buffer at (0,1)', () => {
    expect(SHADER).toMatch(/@group\(0\)\s*@binding\(1\)\s*var<storage,\s*read>\s*spike_rates/);
  });

  it('declares probe_positions storage buffer at (0,2)', () => {
    expect(SHADER).toMatch(/@group\(0\)\s*@binding\(2\)\s*var<storage,\s*read>\s*probe_positions/);
  });

  it('declares probe_albedo storage buffer at (0,3)', () => {
    expect(SHADER).toMatch(/@group\(0\)\s*@binding\(3\)\s*var<storage,\s*read>\s*probe_albedo/);
  });

  it('declares probes_out storage buffer at (0,4)', () => {
    expect(SHADER).toMatch(/@group\(0\)\s*@binding\(4\)\s*var<storage,\s*read_write>\s*probes_out/);
  });

  it('uses workgroup size 64 (matches orchestrator alignment requirement)', () => {
    expect(SHADER).toMatch(/@compute\s*@workgroup_size\(64\)/);
  });

  it('declares the prophetic_radiance entry point', () => {
    expect(SHADER).toMatch(/fn\s+prophetic_radiance\s*\(/);
  });
});

describe('LocalProphecyTransport', () => {
  let ctx: GPUContext;

  beforeEach(async () => {
    ctx = new GPUContext();
    await ctx.initialize();
  });

  afterEach(() => {
    ctx.destroy();
  });

  it('initializes, steps, and destroys cleanly', async () => {
    const transport = new LocalProphecyTransport({
      ctx,
      spikeRates: (_scene, _count) => new Float32Array(64).fill(0.5),
    });
    await transport.initialize(makeConfig());
    const frame = await transport.step(SCENE);
    expect(frame.probes.length).toBe(64);
    expect(frame.source).toBe('local');
    await transport.destroy();
  });

  it('passes scene context to the spike-rate provider', async () => {
    let received: ProphecySceneContext | null = null;
    const transport = new LocalProphecyTransport({
      ctx,
      spikeRates: (scene) => {
        received = scene;
        return new Float32Array(64).fill(0.3);
      },
    });
    await transport.initialize(makeConfig());
    await transport.step(SCENE);
    expect(received).not.toBeNull();
    expect(received!.sunDirection).toEqual(SCENE.sunDirection);
    await transport.destroy();
  });
});

describe('HoloMeshProphecyTransport', () => {
  let ctx: GPUContext;

  beforeEach(async () => {
    ctx = new GPUContext();
    await ctx.initialize();
  });

  afterEach(() => {
    ctx.destroy();
  });

  // A fetch impl that always fails — exercises the "no remote available"
  // path without touching the network. The wired transport translates
  // network failure into a fallback / NotImplemented decision, which is
  // exactly what these tests want to assert.
  const failingFetch: typeof fetch = async () => {
    throw new Error('test: network unavailable');
  };

  it('throws ProphecyNotImplementedError when no fallback is configured', async () => {
    const transport = new HoloMeshProphecyTransport({
      endpoint: 'crdt://holomesh/feed/ttu/test-session',
      fetchImpl: failingFetch,
    });
    await transport.initialize(makeConfig());
    await expect(transport.step(SCENE)).rejects.toBeInstanceOf(
      ProphecyNotImplementedError,
    );
    await transport.destroy();
  });

  it('rejects malformed endpoints at initialize()', async () => {
    const transport = new HoloMeshProphecyTransport({
      endpoint: 'crdt://wrong/scheme/here',
      fetchImpl: failingFetch,
    });
    await expect(transport.initialize(makeConfig())).rejects.toThrow(
      /unsupported CRDT URI shape/,
    );
  });

  it('delegates to the fallback transport when supplied', async () => {
    const fallback = new LocalProphecyTransport({
      ctx,
      spikeRates: () => new Float32Array(64).fill(0.5),
    });
    const transport = new HoloMeshProphecyTransport({
      endpoint: 'crdt://holomesh/feed/ttu/test-session',
      fallback,
      fetchImpl: failingFetch,
    });
    await transport.initialize(makeConfig());
    const frame = await transport.step(SCENE);
    expect(frame.probes.length).toBe(64);
    // Fallback path tags the source for observability.
    expect(frame.source).toBe('fallback');
    await transport.destroy();
  });

  it('returns a remote frame tagged source:"holomesh" when the feed answers', async () => {
    const remoteFrame = {
      frameId: 42,
      producedAtMs: Date.now(),
      productionTimeMs: 1.5,
      probes: new Array(64).fill(0).map((_, i) => ({
        index: i,
        position: [i, 0, 0],
        rgb: [0.1, 0.2, 0.3],
        confidence: 0.9,
      })),
      source: 'local', // publisher's POV — the transport must override to 'holomesh'.
    };

    const fakeFetch: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      expect(url).toContain('/api/holomesh/ttu/test-session/step');
      const body = JSON.parse((init?.body as string) ?? '{}');
      expect(body.scene.sunDirection).toEqual(SCENE.sunDirection);
      return new Response(
        JSON.stringify({ success: true, frame: remoteFrame }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const transport = new HoloMeshProphecyTransport({
      endpoint: 'crdt://holomesh/feed/ttu/test-session',
      fetchImpl: fakeFetch,
    });
    await transport.initialize(makeConfig());
    const frame = await transport.step(SCENE);
    expect(frame.frameId).toBe(42);
    expect(frame.source).toBe('holomesh');
    await transport.destroy();
  });

  it('falls back when the remote returns non-2xx', async () => {
    const fallback = new LocalProphecyTransport({
      ctx,
      spikeRates: () => new Float32Array(64).fill(0.7),
    });
    const fiveOhTwo: typeof fetch = async () =>
      new Response('upstream down', { status: 502 });
    const transport = new HoloMeshProphecyTransport({
      endpoint: 'crdt://holomesh/feed/ttu/test-session',
      fallback,
      fetchImpl: fiveOhTwo,
    });
    await transport.initialize(makeConfig());
    const frame = await transport.step(SCENE);
    expect(frame.source).toBe('fallback');
    await transport.destroy();
  });
});
