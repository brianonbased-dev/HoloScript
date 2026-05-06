/**
 * PhyllotaxisTrait — determinism + correctness tests
 *
 * Determinism is the trait's load-bearing contract (lotus garden.seedable.holo
 * is a "byte-for-byte same seed → same composition" artifact). These tests
 * pin the contract by computing positions twice with identical inputs and
 * asserting bitwise float equality, plus a few golden-angle correctness
 * checks against the published 137.50776...° divergence angle.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  phyllotaxisHandler,
  computePhyllotaxisPosition,
  hashSeed,
  GOLDEN_ANGLE_DEG,
} from '../PhyllotaxisTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

describe('PhyllotaxisTrait — golden-angle constant', () => {
  it('computes the canonical 137.50776...° divergence angle', () => {
    // Sunflower / lotus / pinecone literature value, 11 sf
    expect(GOLDEN_ANGLE_DEG).toBeCloseTo(137.50776405003785, 10);
  });

  it('golden angle is precisely 360 / phi^2', () => {
    const phi = (1 + Math.sqrt(5)) / 2;
    expect(GOLDEN_ANGLE_DEG).toBeCloseTo(360 / (phi * phi), 12);
  });
});

describe('PhyllotaxisTrait — hashSeed', () => {
  it('hashes hex strings deterministically', () => {
    expect(hashSeed('0x0000DEAD')).toBe(0x0000dead);
    expect(hashSeed('0xDEADBEEF')).toBe(0xdeadbeef);
  });

  it('hashes plain strings via FNV-1a deterministically', () => {
    const a = hashSeed('lotus-genesis');
    const b = hashSeed('lotus-genesis');
    expect(a).toBe(b);
    // Different input → different output (overwhelmingly probable)
    expect(hashSeed('lotus-genesis')).not.toBe(hashSeed('lotus-genesis-2'));
  });

  it('produces 32-bit unsigned values', () => {
    const h = hashSeed('any-string-here');
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(h)).toBe(true);
  });
});

describe('PhyllotaxisTrait — computePhyllotaxisPosition (pure)', () => {
  const lotusConfig = {
    layer_radii: [2.0, 3.4, 4.8],
    layer_counts: [8, 13, 21],
    seed: '0x0000DEAD',
    y_offset: 1.5,
    jitter: 0,
    rotation_offset_deg: 0,
  };

  it('places petal 0 on the +X axis at inner radius (no jitter, no rotation)', () => {
    const p = computePhyllotaxisPosition(0, lotusConfig);
    // petal 0 → angle 0 → (radius, y_offset, 0)
    expect(p.position[0]).toBeCloseTo(2.0, 10);
    expect(p.position[1]).toBeCloseTo(1.5, 10);
    expect(p.position[2]).toBeCloseTo(0, 10);
    expect(p.layerIndex).toBe(0);
    expect(p.indexInLayer).toBe(0);
    expect(p.angleRad).toBeCloseTo(0, 10);
  });

  it('assigns petals to correct layers per cumulative count', () => {
    // counts [8, 13, 21] → boundaries at 8 and 21
    expect(computePhyllotaxisPosition(7, lotusConfig).layerIndex).toBe(0);
    expect(computePhyllotaxisPosition(8, lotusConfig).layerIndex).toBe(1);
    expect(computePhyllotaxisPosition(20, lotusConfig).layerIndex).toBe(1);
    expect(computePhyllotaxisPosition(21, lotusConfig).layerIndex).toBe(2);
    expect(computePhyllotaxisPosition(41, lotusConfig).layerIndex).toBe(2);
  });

  it('petal 8 (first of middle layer) sits at radius 3.4', () => {
    const p = computePhyllotaxisPosition(8, lotusConfig);
    const r = Math.sqrt(p.position[0] ** 2 + p.position[2] ** 2);
    expect(r).toBeCloseTo(3.4, 10);
  });

  it('petal 21 (first of outer layer) sits at radius 4.8', () => {
    const p = computePhyllotaxisPosition(21, lotusConfig);
    const r = Math.sqrt(p.position[0] ** 2 + p.position[2] ** 2);
    expect(r).toBeCloseTo(4.8, 10);
  });

  it('continuous spiral: petal N angle = N * golden_angle_rad', () => {
    const goldenRad = (GOLDEN_ANGLE_DEG * Math.PI) / 180;
    for (let i = 0; i < 42; i++) {
      const p = computePhyllotaxisPosition(i, lotusConfig);
      // Angle is unwrapped (continuous), not modulo 2π
      expect(p.angleRad).toBeCloseTo(i * goldenRad, 10);
    }
  });

  it('rotation_offset_deg shifts the entire spiral', () => {
    const a = computePhyllotaxisPosition(0, lotusConfig);
    const b = computePhyllotaxisPosition(0, { ...lotusConfig, rotation_offset_deg: 90 });
    expect(b.angleRad).toBeCloseTo(a.angleRad + Math.PI / 2, 10);
    // 90° rotation of (2, 1.5, 0) → (0, 1.5, 2)
    expect(b.position[0]).toBeCloseTo(0, 10);
    expect(b.position[2]).toBeCloseTo(2, 10);
  });
});

describe('PhyllotaxisTrait — DETERMINISM CONTRACT', () => {
  const config = {
    layer_radii: [2.0, 3.4, 4.8],
    layer_counts: [8, 13, 21],
    seed: '0x0000DEAD',
    y_offset: 1.5,
    jitter: 0.15,
    rotation_offset_deg: 0,
  };

  it('SAME seed → byte-for-byte identical positions across runs', () => {
    // Compute the full 42-petal lotus twice and compare every coord exactly
    const run1: number[] = [];
    const run2: number[] = [];
    for (let i = 0; i < 42; i++) {
      const a = computePhyllotaxisPosition(i, config);
      const b = computePhyllotaxisPosition(i, config);
      run1.push(a.position[0], a.position[1], a.position[2]);
      run2.push(b.position[0], b.position[1], b.position[2]);
    }
    // Bitwise equality — not toBeCloseTo. This is the determinism contract.
    expect(run1).toEqual(run2);
  });

  it('DIFFERENT seed → different jitter (overwhelmingly)', () => {
    const a = computePhyllotaxisPosition(5, config);
    const b = computePhyllotaxisPosition(5, { ...config, seed: '0xDEADBEEF' });
    // Seed only affects jitter — angle and base radius are seed-independent
    // so we check that at least one of x/y/z diverges.
    const diverged =
      a.position[0] !== b.position[0] ||
      a.position[1] !== b.position[1] ||
      a.position[2] !== b.position[2];
    expect(diverged).toBe(true);
  });

  it('jitter=0 → seed has no effect on position', () => {
    const a = computePhyllotaxisPosition(5, { ...config, jitter: 0, seed: '0x0000DEAD' });
    const b = computePhyllotaxisPosition(5, { ...config, jitter: 0, seed: '0xDEADBEEF' });
    expect(a.position).toEqual(b.position);
  });

  it('jitter magnitude bounded by configured value (per axis)', () => {
    const cfg = { ...config, jitter: 0.5 };
    for (let i = 0; i < 42; i++) {
      const jittered = computePhyllotaxisPosition(i, cfg);
      const clean = computePhyllotaxisPosition(i, { ...cfg, jitter: 0 });
      // |Δ| ≤ jitter on each axis (uintToBipolarFloat returns [-1, 1))
      expect(Math.abs(jittered.position[0] - clean.position[0])).toBeLessThanOrEqual(0.5);
      expect(Math.abs(jittered.position[1] - clean.position[1])).toBeLessThanOrEqual(0.5);
      expect(Math.abs(jittered.position[2] - clean.position[2])).toBeLessThanOrEqual(0.5);
    }
  });
});

describe('PhyllotaxisTrait — handler lifecycle', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    petal_index: 8,
    layer_radii: [2.0, 3.4, 4.8],
    layer_counts: [8, 13, 21],
    seed: '0x0000DEAD',
    y_offset: 1.5,
    jitter: 0,
    rotation_offset_deg: 0,
    emit_placement_event: true,
  };

  beforeEach(() => {
    node = createMockNode('lotus-petal-8');
    ctx = createMockContext();
    attachTrait(phyllotaxisHandler, node, cfg, ctx);
  });

  it('writes computed position to node.position on attach', () => {
    expect((node as any).position).toBeDefined();
    expect((node as any).position).toHaveLength(3);
    // petal 8 sits on radius 3.4 with non-zero phyllotaxis angle
    const r = Math.sqrt((node as any).position[0] ** 2 + (node as any).position[2] ** 2);
    expect(r).toBeCloseTo(3.4, 10);
  });

  it('stores state under __phyllotaxisState', () => {
    const s = (node as any).__phyllotaxisState;
    expect(s).toBeDefined();
    expect(s.layer_index).toBe(1); // petal 8 → middle layer
    expect(s.index_in_layer).toBe(0); // first of middle layer
    expect(s.seed_hash).toBe(0x0000dead);
  });

  it('emits phyllotaxis_placed on attach', () => {
    expect(getEventCount(ctx, 'phyllotaxis_placed')).toBe(1);
    const ev = getLastEvent(ctx, 'phyllotaxis_placed') as any;
    expect(ev.petalIndex).toBe(8);
    expect(ev.layerIndex).toBe(1);
    expect(ev.angleDeg).toBeCloseTo(8 * GOLDEN_ANGLE_DEG, 10);
  });

  it('phyllotaxis_query returns current position', () => {
    ctx.clearEvents();
    sendEvent(phyllotaxisHandler, node, cfg, ctx, {
      type: 'phyllotaxis_query',
      queryId: 'q-1',
    });
    const resp = getLastEvent(ctx, 'phyllotaxis_response') as any;
    expect(resp.queryId).toBe('q-1');
    expect(resp.position).toEqual((node as any).position);
    expect(resp.layerIndex).toBe(1);
  });

  it('phyllotaxis_reseed re-runs placement with the new seed (jitter only)', () => {
    const before = [...(node as any).position];
    ctx.clearEvents();
    sendEvent(
      phyllotaxisHandler,
      node,
      { ...cfg, jitter: 0.3 },
      ctx,
      { type: 'phyllotaxis_reseed', seed: '0xDEADBEEF' }
    );
    const after = [...(node as any).position];
    // Jitter active and seed changed → at least one axis must move
    const diverged = before[0] !== after[0] || before[1] !== after[1] || before[2] !== after[2];
    expect(diverged).toBe(true);

    const ev = getLastEvent(ctx, 'phyllotaxis_placed') as any;
    expect(ev.reseeded).toBe(true);
    expect(ev.seedHash).toBe(0xdeadbeef);
  });

  it('emit_placement_event=false suppresses the attach event', () => {
    const node2 = createMockNode('p2');
    const ctx2 = createMockContext();
    attachTrait(phyllotaxisHandler, node2, { ...cfg, emit_placement_event: false }, ctx2);
    expect(getEventCount(ctx2, 'phyllotaxis_placed')).toBe(0);
    // But position is still written
    expect((node2 as any).position).toBeDefined();
  });

  it('cleans up state on detach', () => {
    phyllotaxisHandler.onDetach?.(node as any, cfg, ctx as any);
    expect((node as any).__phyllotaxisState).toBeUndefined();
    expect(getEventCount(ctx, 'phyllotaxis_unplaced')).toBe(1);
  });
});

describe('PhyllotaxisTrait — full lotus pinned positions (regression guard)', () => {
  // Pin every petal-0 layer-boundary position to catch silent algorithmic drift.
  // If any of these change, the lotus garden.seedable.holo composition
  // changes byte-for-byte and downstream caches must be invalidated.
  const lotus = {
    layer_radii: [2.0, 3.4, 4.8],
    layer_counts: [8, 13, 21],
    seed: '0x0000DEAD',
    y_offset: 1.5,
    jitter: 0,
    rotation_offset_deg: 0,
  };

  it('petal 0 pinned', () => {
    const p = computePhyllotaxisPosition(0, lotus).position;
    expect(p[0]).toBeCloseTo(2.0, 10);
    expect(p[1]).toBeCloseTo(1.5, 10);
    expect(p[2]).toBeCloseTo(0, 10);
  });

  it('petal 8 pinned (first middle)', () => {
    const p = computePhyllotaxisPosition(8, lotus).position;
    // angle = 8 * 137.50776° ≈ 1100.06° ≡ 20.06°
    const angleDeg = (8 * GOLDEN_ANGLE_DEG) % 360;
    expect(p[0]).toBeCloseTo(3.4 * Math.cos((angleDeg * Math.PI) / 180), 10);
    expect(p[2]).toBeCloseTo(3.4 * Math.sin((angleDeg * Math.PI) / 180), 10);
  });

  it('petal 21 pinned (first outer)', () => {
    const p = computePhyllotaxisPosition(21, lotus).position;
    const angleDeg = (21 * GOLDEN_ANGLE_DEG) % 360;
    expect(p[0]).toBeCloseTo(4.8 * Math.cos((angleDeg * Math.PI) / 180), 10);
    expect(p[2]).toBeCloseTo(4.8 * Math.sin((angleDeg * Math.PI) / 180), 10);
  });

  it('petal 41 (last) pinned to outer ring', () => {
    const p = computePhyllotaxisPosition(41, lotus).position;
    const r = Math.sqrt(p[0] ** 2 + p[2] ** 2);
    expect(r).toBeCloseTo(4.8, 10);
  });
});
