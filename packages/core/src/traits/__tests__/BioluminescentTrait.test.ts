/**
 * BioluminescentTrait — determinism + correctness tests
 *
 * The trait's load-bearing contract: per-tick (intensity, color) is a
 * pure function of (config, nodePosition, observerPosition, elapsedSeconds).
 * Same inputs → byte-for-byte identical output across V8 / SpiderMonkey
 * / WASM. These tests pin:
 *   - Pure helpers (resolveBioluminescentPattern / clamp01 / pulseAt /
 *     proximityAt / splitmix32 / hash4ToUnit / valueNoise3D / voronoi3D /
 *     patternAt / deriveBioluminescentOutput)
 *   - Pulse modulation at multiple BPMs (incl. 0 → frozen, ≤ 0 fallback)
 *   - Proximity falloff curve shape (zero at radius, full at observer)
 *   - Pattern fallback ('solid' for unknown values)
 *   - Spatial pattern in [0, 1] for both 'perlin' and 'voronoi'
 *   - Determinism: repeating the same inputs → byte-equal outputs
 *   - Determinism: different seed → different but stable outputs
 *   - Composite weight clamping in [0, 1]
 *   - Lifecycle: attach / update / observer / query / reset / detach
 */

import { describe, it, expect } from 'vitest';
import {
  bioluminescentHandler,
  resolveBioluminescentPattern,
  clamp01,
  pulseAt,
  proximityAt,
  splitmix32,
  hash4ToUnit,
  valueNoise3D,
  voronoi3D,
  patternAt,
  deriveBioluminescentOutput,
  lerp,
  distSquared,
  type BioluminescentConfig,
  type BioluminescentOutput,
  type Vec3Like,
} from '../BioluminescentTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

// ---------------------------------------------------------------------------
// Pure helpers — clamp01
// ---------------------------------------------------------------------------

describe('BioluminescentTrait — clamp01 (pure)', () => {
  it('clamps below 0 to 0', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(-1e9)).toBe(0);
  });

  it('clamps above 1 to 1', () => {
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(1e9)).toBe(1);
  });

  it('passes through values in [0, 1]', () => {
    expect(clamp01(0)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(1)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Pure helpers — resolveBioluminescentPattern
// ---------------------------------------------------------------------------

describe('BioluminescentTrait — resolveBioluminescentPattern (pure)', () => {
  it('passes through canonical patterns', () => {
    expect(resolveBioluminescentPattern('solid')).toBe('solid');
    expect(resolveBioluminescentPattern('perlin')).toBe('perlin');
    expect(resolveBioluminescentPattern('voronoi')).toBe('voronoi');
  });

  it('falls back to solid for unknown enum values', () => {
    expect(resolveBioluminescentPattern('unknown_future_pattern')).toBe('solid');
    expect(resolveBioluminescentPattern('')).toBe('solid');
    expect(resolveBioluminescentPattern('PERLIN')).toBe('solid');
  });
});

// ---------------------------------------------------------------------------
// Pure helpers — pulseAt
// ---------------------------------------------------------------------------

describe('BioluminescentTrait — pulseAt (pure)', () => {
  it('returns 1 when bpm <= 0 (frozen pulse / no modulation)', () => {
    expect(pulseAt(0, 0)).toBe(1);
    expect(pulseAt(0, 100)).toBe(1);
    expect(pulseAt(-12, 5)).toBe(1);
  });

  it('returns 0.5 at t=0 for any positive bpm (sin(0) = 0 → (0+1)/2)', () => {
    expect(pulseAt(60, 0)).toBeCloseTo(0.5, 12);
    expect(pulseAt(12, 0)).toBeCloseTo(0.5, 12);
    expect(pulseAt(120, 0)).toBeCloseTo(0.5, 12);
  });

  it('returns 1 at t = 0.25 cycles for any positive bpm (sin(π/2) = 1)', () => {
    // bpm=60 → 1Hz → quarter-cycle at t=0.25s
    expect(pulseAt(60, 0.25)).toBeCloseTo(1, 12);
    // bpm=12 → 0.2Hz → quarter-cycle at t=1.25s
    expect(pulseAt(12, 1.25)).toBeCloseTo(1, 12);
  });

  it('returns 0 at t = 0.75 cycles for any positive bpm (sin(3π/2) = -1)', () => {
    expect(pulseAt(60, 0.75)).toBeCloseTo(0, 12);
    expect(pulseAt(12, 3.75)).toBeCloseTo(0, 12);
  });

  it('output is always in [0, 1]', () => {
    for (let i = 0; i < 200; i++) {
      const t = i * 0.137;
      const v = pulseAt(20, t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic — same inputs → byte-equal output', () => {
    const a = pulseAt(12, 1.234);
    const b = pulseAt(12, 1.234);
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// Pure helpers — distSquared / proximityAt
// ---------------------------------------------------------------------------

describe('BioluminescentTrait — distSquared (pure)', () => {
  it('returns 0 for identical positions', () => {
    expect(distSquared({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 })).toBe(0);
  });

  it('returns squared euclidean distance', () => {
    expect(distSquared({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })).toBe(25);
    expect(distSquared({ x: 0, y: 0, z: 0 }, { x: 1, y: 2, z: 2 })).toBe(9);
  });
});

describe('BioluminescentTrait — proximityAt (pure)', () => {
  const node: Vec3Like = { x: 0, y: 0, z: 0 };

  it('returns 1 when observer is null (ambient)', () => {
    expect(proximityAt(node, null, 5)).toBe(1);
  });

  it('returns 1 when radius <= 0 (proximity disabled)', () => {
    expect(proximityAt(node, { x: 100, y: 0, z: 0 }, 0)).toBe(1);
    expect(proximityAt(node, { x: 100, y: 0, z: 0 }, -5)).toBe(1);
  });

  it('returns 1 when observer is at the node (full intensity)', () => {
    expect(proximityAt(node, { x: 0, y: 0, z: 0 }, 5)).toBe(1);
  });

  it('returns 0 when observer is at the falloff radius', () => {
    expect(proximityAt(node, { x: 5, y: 0, z: 0 }, 5)).toBe(0);
    expect(proximityAt(node, { x: 0, y: 0, z: 5 }, 5)).toBe(0);
  });

  it('returns 0 when observer is beyond the falloff radius', () => {
    expect(proximityAt(node, { x: 10, y: 0, z: 0 }, 5)).toBe(0);
  });

  it('falls off smoothly between center and radius', () => {
    // At half-radius (d=2.5, r=5), prox = 1 - (0.5)^2 = 0.75
    expect(proximityAt(node, { x: 2.5, y: 0, z: 0 }, 5)).toBeCloseTo(0.75, 12);
  });

  it('output is always in [0, 1]', () => {
    for (let i = 0; i < 100; i++) {
      const d = i * 0.13;
      const v = proximityAt(node, { x: d, y: 0, z: 0 }, 5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Pure helpers — splitmix32 / hash4ToUnit
// ---------------------------------------------------------------------------

describe('BioluminescentTrait — splitmix32 (pure 32-bit)', () => {
  it('returns an unsigned 32-bit integer', () => {
    for (let i = 0; i < 100; i++) {
      const v = splitmix32(i);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(2 ** 32);
    }
  });

  it('is deterministic — same seed → byte-equal output', () => {
    expect(splitmix32(42)).toBe(splitmix32(42));
    expect(splitmix32(0xdeadbeef)).toBe(splitmix32(0xdeadbeef));
  });

  it('produces different outputs for different seeds (statistical)', () => {
    const samples = new Set<number>();
    for (let i = 0; i < 1000; i++) samples.add(splitmix32(i));
    // Expect near-perfect uniqueness for 1000 sequential seeds
    expect(samples.size).toBeGreaterThan(995);
  });
});

describe('BioluminescentTrait — hash4ToUnit (pure)', () => {
  it('returns a value in [0, 1)', () => {
    for (let i = 0; i < 200; i++) {
      const v = hash4ToUnit(i, i * 7, i * 13, i * 17);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is deterministic — same inputs → byte-equal output', () => {
    expect(hash4ToUnit(1, 2, 3, 4)).toBe(hash4ToUnit(1, 2, 3, 4));
  });
});

// ---------------------------------------------------------------------------
// Pure helpers — valueNoise3D / voronoi3D / patternAt
// ---------------------------------------------------------------------------

describe('BioluminescentTrait — valueNoise3D (pure)', () => {
  it('returns a value in [0, 1]', () => {
    for (let i = 0; i < 100; i++) {
      const v = valueNoise3D(i * 0.13, i * 0.27, i * 0.41, 0xabcd);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic — same inputs → byte-equal output', () => {
    const a = valueNoise3D(1.5, 2.5, 3.5, 42);
    const b = valueNoise3D(1.5, 2.5, 3.5, 42);
    expect(a).toBe(b);
  });

  it('produces different output for different seeds at the same point', () => {
    const a = valueNoise3D(1.5, 2.5, 3.5, 1);
    const b = valueNoise3D(1.5, 2.5, 3.5, 2);
    expect(a).not.toBe(b);
  });
});

describe('BioluminescentTrait — voronoi3D (pure)', () => {
  it('returns a value in [0, 1]', () => {
    for (let i = 0; i < 100; i++) {
      const v = voronoi3D(i * 0.31, i * 0.47, i * 0.61, 0x70AD);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic — same inputs → byte-equal output', () => {
    const a = voronoi3D(0.7, 1.3, 2.9, 0x70AD);
    const b = voronoi3D(0.7, 1.3, 2.9, 0x70AD);
    expect(a).toBe(b);
  });
});

describe('BioluminescentTrait — patternAt (pure)', () => {
  const pos: Vec3Like = { x: 1, y: 2, z: 3 };

  it("returns 1 for 'solid' regardless of inputs", () => {
    expect(patternAt('solid', pos, 0, 0.5, 0)).toBe(1);
    expect(patternAt('solid', pos, 100, 1, 99)).toBe(1);
  });

  it("returns a value in [0, 1] for 'perlin'", () => {
    for (let t = 0; t < 10; t += 0.5) {
      const v = patternAt('perlin', pos, t, 0.5, 0x7777);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("returns a value in [0, 1] for 'voronoi'", () => {
    for (let t = 0; t < 10; t += 0.5) {
      const v = patternAt('voronoi', pos, t, 0.5, 0x7777);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic — same inputs → byte-equal output', () => {
    expect(patternAt('perlin', pos, 1.5, 0.5, 7)).toBe(
      patternAt('perlin', pos, 1.5, 0.5, 7)
    );
    expect(patternAt('voronoi', pos, 1.5, 0.5, 7)).toBe(
      patternAt('voronoi', pos, 1.5, 0.5, 7)
    );
  });
});

// ---------------------------------------------------------------------------
// Pure helpers — lerp
// ---------------------------------------------------------------------------

describe('BioluminescentTrait — lerp (pure)', () => {
  it('returns a at t=0 and b at t=1', () => {
    expect(lerp(0.05, 0.8, 0)).toBe(0.05);
    expect(lerp(0.05, 0.8, 1)).toBe(0.8);
  });

  it('interpolates linearly', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(2, 6, 0.25)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Pure derivation — deriveBioluminescentOutput
// ---------------------------------------------------------------------------

const baseConfig: BioluminescentConfig = {
  color: '#00ffcc',
  pulse_bpm: 12,
  radius_falloff: 2.5,
  min_intensity: 0.05,
  max_intensity: 0.8,
  pattern: 'solid',
  spatial_scale: 0.5,
  spatial_seed: 0x70AD,
  emit_attach_event: false,
};

describe('BioluminescentTrait — deriveBioluminescentOutput (pure)', () => {
  it('mirrors color from config', () => {
    const out = deriveBioluminescentOutput(
      baseConfig,
      { x: 0, y: 0, z: 0 },
      null,
      0
    );
    expect(out.color).toBe('#00ffcc');
  });

  it('intensity is clamped to [min_intensity, max_intensity]', () => {
    for (let t = 0; t < 20; t += 0.13) {
      const out = deriveBioluminescentOutput(
        baseConfig,
        { x: 0, y: 0, z: 0 },
        null,
        t
      );
      expect(out.intensity).toBeGreaterThanOrEqual(baseConfig.min_intensity);
      expect(out.intensity).toBeLessThanOrEqual(baseConfig.max_intensity);
    }
  });

  it('weight is in [0, 1]', () => {
    for (let t = 0; t < 20; t += 0.13) {
      const out = deriveBioluminescentOutput(
        baseConfig,
        { x: 0, y: 0, z: 0 },
        null,
        t
      );
      expect(out.weight).toBeGreaterThanOrEqual(0);
      expect(out.weight).toBeLessThanOrEqual(1);
    }
  });

  it('frozen pulse (bpm=0) gives constant weight = pattern * proximity', () => {
    const cfg: BioluminescentConfig = { ...baseConfig, pulse_bpm: 0 };
    const a = deriveBioluminescentOutput(cfg, { x: 0, y: 0, z: 0 }, null, 0);
    const b = deriveBioluminescentOutput(cfg, { x: 0, y: 0, z: 0 }, null, 5);
    const c = deriveBioluminescentOutput(cfg, { x: 0, y: 0, z: 0 }, null, 100);
    expect(a.intensity).toBe(b.intensity);
    expect(b.intensity).toBe(c.intensity);
    // 'solid' pattern + null observer → weight = 1
    expect(a.weight).toBe(1);
    expect(a.intensity).toBe(baseConfig.max_intensity);
  });

  it('observer at falloff radius → proximity 0 → intensity at min', () => {
    const cfg: BioluminescentConfig = { ...baseConfig, pulse_bpm: 0 };
    const out = deriveBioluminescentOutput(
      cfg,
      { x: 0, y: 0, z: 0 },
      { x: 2.5, y: 0, z: 0 },
      0
    );
    expect(out.proximity).toBe(0);
    expect(out.weight).toBe(0);
    expect(out.intensity).toBe(baseConfig.min_intensity);
  });

  it('is deterministic — same inputs → byte-equal output', () => {
    const a = deriveBioluminescentOutput(
      baseConfig,
      { x: 1, y: 2, z: 3 },
      { x: 0.5, y: 0, z: 0 },
      0.7
    );
    const b = deriveBioluminescentOutput(
      baseConfig,
      { x: 1, y: 2, z: 3 },
      { x: 0.5, y: 0, z: 0 },
      0.7
    );
    expect(a.intensity).toBe(b.intensity);
    expect(a.weight).toBe(b.weight);
    expect(a.pulse).toBe(b.pulse);
    expect(a.pattern).toBe(b.pattern);
    expect(a.proximity).toBe(b.proximity);
  });

  it('different spatial seed → different but stable pattern', () => {
    const cfgA: BioluminescentConfig = {
      ...baseConfig,
      pattern: 'perlin',
      spatial_seed: 1,
    };
    const cfgB: BioluminescentConfig = {
      ...baseConfig,
      pattern: 'perlin',
      spatial_seed: 999,
    };
    const a = deriveBioluminescentOutput(cfgA, { x: 1, y: 2, z: 3 }, null, 0);
    const b = deriveBioluminescentOutput(cfgB, { x: 1, y: 2, z: 3 }, null, 0);
    expect(a.pattern).not.toBe(b.pattern);
    // But each is itself stable on repeat
    expect(a.pattern).toBe(
      deriveBioluminescentOutput(cfgA, { x: 1, y: 2, z: 3 }, null, 0).pattern
    );
  });

  it("unknown pattern name falls back to 'solid' (pattern = 1)", () => {
    const cfg = {
      ...baseConfig,
      pattern: 'unknown_future_pattern' as BioluminescentConfig['pattern'],
    };
    const out = deriveBioluminescentOutput(cfg, { x: 1, y: 2, z: 3 }, null, 1);
    expect(out.pattern).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Handler lifecycle
// ---------------------------------------------------------------------------

describe('BioluminescentTrait — handler lifecycle', () => {
  it('attaches and emits bioluminescent_attached when emit_attach_event=true', () => {
    const ctx = createMockContext();
    const node = createMockNode('forest-floor');
    attachTrait(bioluminescentHandler, node, { emit_attach_event: true }, ctx);
    expect(getEventCount(ctx, 'bioluminescent_attached')).toBe(1);
    const ev = getLastEvent(ctx, 'bioluminescent_attached') as {
      color: string;
      pulse_bpm: number;
    };
    expect(ev.color).toBe('#00ffcc');
    expect(ev.pulse_bpm).toBe(12);
  });

  it('does NOT emit attached event when emit_attach_event=false', () => {
    const ctx = createMockContext();
    const node = createMockNode('forest-floor');
    attachTrait(bioluminescentHandler, node, { emit_attach_event: false }, ctx);
    expect(getEventCount(ctx, 'bioluminescent_attached')).toBe(0);
  });

  it('emits bioluminescent_sample on each onUpdate', () => {
    const ctx = createMockContext();
    const node = createMockNode('forest-floor');
    attachTrait(bioluminescentHandler, node, { emit_attach_event: false }, ctx);
    updateTrait(bioluminescentHandler, node, {}, ctx, 0.1);
    updateTrait(bioluminescentHandler, node, {}, ctx, 0.1);
    updateTrait(bioluminescentHandler, node, {}, ctx, 0.1);
    expect(getEventCount(ctx, 'bioluminescent_sample')).toBe(3);
  });

  it('reads node.position when present', () => {
    const ctx = createMockContext();
    const node = createMockNode('floating-spore') as Record<string, unknown>;
    node.position = { x: 5, y: 0, z: 0 };
    attachTrait(
      bioluminescentHandler,
      node,
      { emit_attach_event: false, pulse_bpm: 0, pattern: 'solid' },
      ctx
    );
    updateTrait(bioluminescentHandler, node, { pulse_bpm: 0, pattern: 'solid' }, ctx, 0.1);
    const sample = getLastEvent(ctx, 'bioluminescent_sample') as BioluminescentOutput;
    // No observer, so proximity = 1, pattern = 1, pulse frozen → weight = 1
    expect(sample.proximity).toBe(1);
    expect(sample.weight).toBe(1);
  });

  it('falls back to (0,0,0) when node.position is missing', () => {
    const ctx = createMockContext();
    const node = createMockNode('no-pos');
    attachTrait(
      bioluminescentHandler,
      node,
      { emit_attach_event: false, pulse_bpm: 0, pattern: 'solid' },
      ctx
    );
    updateTrait(bioluminescentHandler, node, { pulse_bpm: 0, pattern: 'solid' }, ctx, 0.1);
    const sample = getLastEvent(ctx, 'bioluminescent_sample') as BioluminescentOutput;
    expect(sample.proximity).toBe(1);
  });

  it('observer event sets observerPosition, affecting proximity', () => {
    const ctx = createMockContext();
    const node = createMockNode('pond');
    (node as Record<string, unknown>).position = { x: 0, y: 0, z: 0 };

    attachTrait(
      bioluminescentHandler,
      node,
      { emit_attach_event: false, pulse_bpm: 0, pattern: 'solid', radius_falloff: 5 },
      ctx
    );
    sendEvent(
      bioluminescentHandler,
      node,
      { pulse_bpm: 0, pattern: 'solid', radius_falloff: 5 },
      ctx,
      { type: 'bioluminescent_observer', position: { x: 5, y: 0, z: 0 } }
    );
    updateTrait(
      bioluminescentHandler,
      node,
      { pulse_bpm: 0, pattern: 'solid', radius_falloff: 5 },
      ctx,
      0.1
    );
    const sample = getLastEvent(ctx, 'bioluminescent_sample') as BioluminescentOutput;
    expect(sample.proximity).toBe(0);
    expect(sample.intensity).toBe(0.05); // min_intensity
  });

  it('observer event with null position clears observer (back to ambient)', () => {
    const ctx = createMockContext();
    const node = createMockNode('pond');
    (node as Record<string, unknown>).position = { x: 0, y: 0, z: 0 };

    attachTrait(
      bioluminescentHandler,
      node,
      { emit_attach_event: false, pulse_bpm: 0, pattern: 'solid' },
      ctx
    );
    sendEvent(
      bioluminescentHandler,
      node,
      { pulse_bpm: 0, pattern: 'solid' },
      ctx,
      { type: 'bioluminescent_observer', position: { x: 5, y: 0, z: 0 } }
    );
    sendEvent(
      bioluminescentHandler,
      node,
      { pulse_bpm: 0, pattern: 'solid' },
      ctx,
      { type: 'bioluminescent_observer', position: null }
    );
    updateTrait(
      bioluminescentHandler,
      node,
      { pulse_bpm: 0, pattern: 'solid' },
      ctx,
      0.1
    );
    const sample = getLastEvent(ctx, 'bioluminescent_sample') as BioluminescentOutput;
    expect(sample.proximity).toBe(1);
  });

  it('query event emits bioluminescent_response with same shape', () => {
    const ctx = createMockContext();
    const node = createMockNode('moss');
    attachTrait(
      bioluminescentHandler,
      node,
      { emit_attach_event: false, pulse_bpm: 0, pattern: 'solid' },
      ctx
    );
    sendEvent(
      bioluminescentHandler,
      node,
      { pulse_bpm: 0, pattern: 'solid' },
      ctx,
      { type: 'bioluminescent_query', queryId: 'q-1' }
    );
    const resp = getLastEvent(ctx, 'bioluminescent_response') as
      | (BioluminescentOutput & { queryId: string })
      | undefined;
    expect(resp).toBeDefined();
    expect(resp?.queryId).toBe('q-1');
    expect(resp?.color).toBe('#00ffcc');
    expect(resp?.weight).toBeGreaterThanOrEqual(0);
    expect(resp?.weight).toBeLessThanOrEqual(1);
  });

  it('reset event zeros elapsedSeconds and clears observer', () => {
    const ctx = createMockContext();
    const node = createMockNode('moss');
    attachTrait(
      bioluminescentHandler,
      node,
      { emit_attach_event: false, pulse_bpm: 60, pattern: 'solid' },
      ctx
    );
    // Advance time, set observer
    updateTrait(bioluminescentHandler, node, { pulse_bpm: 60 }, ctx, 0.5);
    sendEvent(
      bioluminescentHandler,
      node,
      { pulse_bpm: 60, pattern: 'solid' },
      ctx,
      { type: 'bioluminescent_observer', position: { x: 1, y: 0, z: 0 } }
    );
    sendEvent(
      bioluminescentHandler,
      node,
      { pulse_bpm: 60, pattern: 'solid' },
      ctx,
      { type: 'bioluminescent_reset' }
    );
    expect(getEventCount(ctx, 'bioluminescent_reset_done')).toBe(1);

    // After reset, t=0 → pulse = 0.5; observer cleared → proximity = 1
    updateTrait(bioluminescentHandler, node, { pulse_bpm: 60, pattern: 'solid' }, ctx, 0);
    const sample = getLastEvent(ctx, 'bioluminescent_sample') as BioluminescentOutput;
    expect(sample.elapsedSeconds).toBe(0);
    expect(sample.proximity).toBe(1);
    expect(sample.pulse).toBeCloseTo(0.5, 12);
  });

  it('detach emits bioluminescent_detached and clears state', () => {
    const ctx = createMockContext();
    const node = createMockNode('detach-target');
    attachTrait(bioluminescentHandler, node, { emit_attach_event: false }, ctx);
    bioluminescentHandler.onDetach?.(
      node as never,
      bioluminescentHandler.defaultConfig,
      ctx as never
    );
    expect(getEventCount(ctx, 'bioluminescent_detached')).toBe(1);
    expect((node as Record<string, unknown>).__bioluminescentState).toBeUndefined();
  });

  it('onUpdate is a no-op if state was never attached', () => {
    const ctx = createMockContext();
    const node = createMockNode('orphan');
    // Skip attach — call update directly
    updateTrait(bioluminescentHandler, node, {}, ctx, 0.1);
    expect(getEventCount(ctx, 'bioluminescent_sample')).toBe(0);
  });

  it('per-frame outputs match deriveBioluminescentOutput exactly', () => {
    const ctx = createMockContext();
    const node = createMockNode('parity');
    (node as Record<string, unknown>).position = { x: 0.5, y: 1, z: 1.5 };
    attachTrait(
      bioluminescentHandler,
      node,
      { emit_attach_event: false, pattern: 'perlin' },
      ctx
    );
    updateTrait(bioluminescentHandler, node, { pattern: 'perlin' }, ctx, 0.25);
    updateTrait(bioluminescentHandler, node, { pattern: 'perlin' }, ctx, 0.25);
    const sample = getLastEvent(ctx, 'bioluminescent_sample') as BioluminescentOutput;
    const expected = deriveBioluminescentOutput(
      { ...bioluminescentHandler.defaultConfig, pattern: 'perlin' },
      { x: 0.5, y: 1, z: 1.5 },
      null,
      0.5
    );
    expect(sample.intensity).toBe(expected.intensity);
    expect(sample.pulse).toBe(expected.pulse);
    expect(sample.pattern).toBe(expected.pattern);
    expect(sample.proximity).toBe(expected.proximity);
    expect(sample.weight).toBe(expected.weight);
  });
});
