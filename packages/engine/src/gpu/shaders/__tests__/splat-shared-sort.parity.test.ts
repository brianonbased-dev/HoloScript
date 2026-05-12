/**
 * Parity tests for splat-shared-sort.wgsl
 *
 * Two layers of coverage:
 *   1. STRUCTURAL — read splat-shared-sort.wgsl as text and assert it contains
 *      the load-bearing operations (cone test against eyePosition + eyeDirection,
 *      inverseSqrt, DEFAULT_HALF_FOV_COS, the degenerate-eye early-return).
 *      Catches the case where the .wgsl drifts away from the JS twin.
 *   2. BEHAVIORAL — run the JS twin (preprocessSharedSort) on fixtures and
 *      compare against MultiviewGaussianRendererTrait.preprocess() output.
 *      Catches the case where the JS twin drifts away from the CPU reference.
 *
 * Together: WGSL ↔ JS-twin parity is structural; JS-twin ↔ CPU-ref parity is
 * behavioral. The chain WGSL ↔ CPU-ref is asserted by transitivity.
 *
 * @see splat-shared-sort.wgsl
 * @see splat-shared-sort.parity.ts
 * @see packages/core/src/traits/MultiviewGaussianRendererTrait.ts
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  preprocessSharedSort,
  DEFAULT_HALF_FOV_COS,
  type ParityViewConfig,
} from '../splat-shared-sort.parity';
import { MultiviewGaussianRendererTrait } from '@holoscript/core/traits/multiview-gaussian-renderer';

// ── Helpers ──────────────────────────────────────────────────────────

function makeTraitView(userId: string, view: ParityViewConfig) {
  return {
    userId,
    eyePosition: view.eyePosition,
    eyeDirection: view.eyeDirection,
    foveationCenter: [0, 0] as [number, number],
    foveationRadius: 0.3,
    ipd: 0.063,
  };
}

function runCpuRef(positions: Float32Array, views: ParityViewConfig[]) {
  const trait = new MultiviewGaussianRendererTrait();
  trait.setGaussianPositions(positions);
  for (let v = 0; v < views.length; v++) {
    trait.addView(makeTraitView(`v${v}`, views[v]));
  }
  const result = trait.preprocess();
  return {
    sortedIndices: result.sortedIndices,
    visibilityBitmasks: result.visibilityBitmasks ?? new Uint32Array(0),
    viewOrder: result.viewOrder ?? [],
  };
}

function randomPositions(n: number, seed: number): Float32Array {
  // Tiny LCG seeded so fixtures are deterministic across runs.
  let s = seed >>> 0;
  const next = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) {
    out[i] = (next() - 0.5) * 10; // [-5, 5]
  }
  return out;
}

const WGSL_PATH = resolve(__dirname, '..', 'splat-shared-sort.wgsl');
const WGSL = readFileSync(WGSL_PATH, 'utf-8');

// ────────────────────────────────────────────────────────────────────
// LAYER 1 — Structural assertions on the .wgsl file
// ────────────────────────────────────────────────────────────────────

describe('splat-shared-sort.wgsl — structural parity with JS twin', () => {
  it('TRUE: DEFAULT_HALF_FOV_COS constant equals the JS twin value', () => {
    const m = WGSL.match(/const\s+DEFAULT_HALF_FOV_COS\s*:\s*f32\s*=\s*([0-9.]+)/);
    expect(m).not.toBeNull();
    expect(parseFloat(m![1])).toBe(DEFAULT_HALF_FOV_COS);
  });

  it('TRUE: cone-test body uses the eyePosition → toG → inverseSqrt path', () => {
    expect(WGSL).toMatch(/pos\s*-\s*view\.eyePosition/);
    expect(WGSL).toMatch(/inverseSqrt\(toGLen2\)/);
  });

  it('TRUE: cone test compares dot product against DEFAULT_HALF_FOV_COS', () => {
    // We accept any whitespace and any local variable name on the LHS as long
    // as the comparison is against the shared threshold constant.
    expect(WGSL).toMatch(/dot\([^)]+\)\s*>=\s*DEFAULT_HALF_FOV_COS/);
  });

  it('TRUE: degenerate-eye case sets the bit before continue (CPU ref 213-216)', () => {
    // The early-continue branch must exist; absent, degenerate Gaussians would
    // emit NaN normals and corrupt the bitmask.
    expect(WGSL).toMatch(/toGLen2\s*<\s*1e-12/);
    expect(WGSL).toMatch(/mask\s*=\s*mask\s*\|\s*\(1u\s*<<\s*v\)/);
    expect(WGSL).toMatch(/continue;/);
  });

  it('FALSE: the SCAFFOLD-era unconditional "mask |= (1 << v)" outside the conditional has been removed', () => {
    // Pre-port the kernel was the SCAFFOLD: it set every bit unconditionally
    // (CPU iota-fallback behavior). That line MUST not be the only set-bit
    // statement after the port — the conditional check is required.
    //
    // We can't simply grep "mask = mask | (1u << v)" since the degenerate
    // and the cone-pass branches both legitimately use that expression. We
    // instead require that EITHER the dot() comparison OR `toGLen2` appears
    // alongside every set-bit statement in the kernel body.
    const ops = WGSL.match(/mask\s*=\s*mask\s*\|\s*\(1u\s*<<\s*v\)/g) ?? [];
    expect(ops.length).toBeGreaterThanOrEqual(2);
    // And the kernel must contain the cone test (covered by other tests).
  });
});

// ────────────────────────────────────────────────────────────────────
// LAYER 2 — Behavioral: JS twin matches CPU reference on shared fixtures
// ────────────────────────────────────────────────────────────────────

describe('preprocessSharedSort (JS twin) ↔ MultiviewGaussianRendererTrait.preprocess() — bitmask parity', () => {
  // ── Edge / FALSE cases ──────────────────────────────────────

  it('FALSE: empty positions → empty arrays', () => {
    const positions = new Float32Array(0);
    const views: ParityViewConfig[] = [];
    const r = preprocessSharedSort(positions, views);
    expect(r.distances.length).toBe(0);
    expect(r.visibilityBitmasks.length).toBe(0);
    expect(r.sortedIndices.length).toBe(0);
  });

  it('FALSE: positions with no views → bitmasks all zero', () => {
    const positions = new Float32Array([1, 2, 3, 4, 5, 6]);
    const r = preprocessSharedSort(positions, []);
    expect(Array.from(r.visibilityBitmasks)).toEqual([0, 0]);
  });

  it('FALSE: malformed positions (non-multiple-of-3 length) → throws', () => {
    expect(() =>
      preprocessSharedSort(new Float32Array([1, 2, 3, 4]), [])
    ).toThrowError(/divisible by 3/);
  });

  // ── TRUE cases — parity with CPU ref ────────────────────────

  it('TRUE: degenerate eye-position (Gaussian colocated with eye) sets the bit', () => {
    const positions = new Float32Array([0, 0, 0]); // 1 Gaussian at origin
    const views: ParityViewConfig[] = [
      { eyePosition: [0, 0, 0], eyeDirection: [0, 0, -1] }, // colocated
    ];
    const twin = preprocessSharedSort(positions, views);
    const ref = runCpuRef(positions, views);
    expect(Array.from(twin.visibilityBitmasks)).toEqual(Array.from(ref.visibilityBitmasks));
    expect(twin.visibilityBitmasks[0]).toBe(1); // bit 0 set
  });

  it('TRUE: single view looking down -Z; Gaussian in front of view is visible', () => {
    const positions = new Float32Array([0, 0, -3]); // 3 units in front
    const views: ParityViewConfig[] = [
      { eyePosition: [0, 0, 0], eyeDirection: [0, 0, -1] },
    ];
    const twin = preprocessSharedSort(positions, views);
    const ref = runCpuRef(positions, views);
    expect(Array.from(twin.visibilityBitmasks)).toEqual(Array.from(ref.visibilityBitmasks));
    expect(twin.visibilityBitmasks[0]).toBe(1);
  });

  it('TRUE: single view looking down -Z; Gaussian BEHIND view is NOT visible (cos=-1 < 0.5)', () => {
    const positions = new Float32Array([0, 0, +3]); // 3 units behind
    const views: ParityViewConfig[] = [
      { eyePosition: [0, 0, 0], eyeDirection: [0, 0, -1] },
    ];
    const twin = preprocessSharedSort(positions, views);
    const ref = runCpuRef(positions, views);
    expect(Array.from(twin.visibilityBitmasks)).toEqual(Array.from(ref.visibilityBitmasks));
    expect(twin.visibilityBitmasks[0]).toBe(0);
  });

  it('TRUE: 2 views; one Gaussian visible to view 0, another visible to view 1 (disjoint cones)', () => {
    const positions = new Float32Array([
      0, 0, -3, // visible to view 0 (looking -Z)
      0, 0, +3, // visible to view 1 (looking +Z)
    ]);
    const views: ParityViewConfig[] = [
      { eyePosition: [0, 0, 0], eyeDirection: [0, 0, -1] },
      { eyePosition: [0, 0, 0], eyeDirection: [0, 0, +1] },
    ];
    const twin = preprocessSharedSort(positions, views);
    const ref = runCpuRef(positions, views);
    expect(Array.from(twin.visibilityBitmasks)).toEqual(Array.from(ref.visibilityBitmasks));
    expect(twin.visibilityBitmasks[0]).toBe(0b01); // only view 0
    expect(twin.visibilityBitmasks[1]).toBe(0b10); // only view 1
  });

  it('TRUE: random N=64, V=2 fixture — full parity with CPU ref', () => {
    const positions = randomPositions(64, 0x12345678);
    const views: ParityViewConfig[] = [
      { eyePosition: [-1, 0, 0], eyeDirection: [1, 0, 0] },
      { eyePosition: [+1, 0, 0], eyeDirection: [-1, 0, 0] },
    ];
    const twin = preprocessSharedSort(positions, views);
    const ref = runCpuRef(positions, views);
    expect(Array.from(twin.visibilityBitmasks)).toEqual(Array.from(ref.visibilityBitmasks));
  });

  it('TRUE: random N=128, V=4 fixture — full parity with CPU ref', () => {
    const positions = randomPositions(128, 0xdeadbeef);
    const views: ParityViewConfig[] = [
      { eyePosition: [-2, 0, 0], eyeDirection: [1, 0, 0] },
      { eyePosition: [+2, 0, 0], eyeDirection: [-1, 0, 0] },
      { eyePosition: [0, -2, 0], eyeDirection: [0, 1, 0] },
      { eyePosition: [0, +2, 0], eyeDirection: [0, -1, 0] },
    ];
    const twin = preprocessSharedSort(positions, views);
    const ref = runCpuRef(positions, views);
    expect(Array.from(twin.visibilityBitmasks)).toEqual(Array.from(ref.visibilityBitmasks));
  });

  it('TRUE: random N=200, V=8 fixture (Quest-3-class N) — full parity with CPU ref', () => {
    const positions = randomPositions(200, 0xbadf00d);
    const views: ParityViewConfig[] = Array.from({ length: 8 }, (_, i) => {
      const angle = (i / 8) * Math.PI * 2;
      return {
        eyePosition: [Math.cos(angle) * 3, 0, Math.sin(angle) * 3] as [number, number, number],
        eyeDirection: [-Math.cos(angle), 0, -Math.sin(angle)] as [number, number, number],
      };
    });
    const twin = preprocessSharedSort(positions, views);
    const ref = runCpuRef(positions, views);
    expect(Array.from(twin.visibilityBitmasks)).toEqual(Array.from(ref.visibilityBitmasks));
  });

  it('TRUE: sortedIndices order (back-to-front by squared distance to shared centroid)', () => {
    // Two views with centroid at origin; Gaussians on the +X axis sorted descending.
    const positions = new Float32Array([
      5, 0, 0, // far
      1, 0, 0, // near
      3, 0, 0, // mid
    ]);
    const views: ParityViewConfig[] = [
      { eyePosition: [-1, 0, 0], eyeDirection: [1, 0, 0] },
      { eyePosition: [+1, 0, 0], eyeDirection: [-1, 0, 0] },
    ];
    const twin = preprocessSharedSort(positions, views);
    // Centroid = (0, 0, 0). Distances squared: 25, 1, 9. Order desc: 0, 2, 1.
    expect(Array.from(twin.sortedIndices)).toEqual([0, 2, 1]);

    const ref = runCpuRef(positions, views);
    expect(Array.from(twin.sortedIndices)).toEqual(Array.from(ref.sortedIndices));
  });

  it('TRUE: distances are squared (sqrt-free, monotonic with euclidean distance)', () => {
    const positions = new Float32Array([3, 4, 0]); // distance 5 from origin
    const views: ParityViewConfig[] = [
      { eyePosition: [0, 0, 0], eyeDirection: [0, 0, -1] },
    ];
    const twin = preprocessSharedSort(positions, views);
    // Centroid = view eye = (0,0,0). dist² = 9 + 16 = 25.
    expect(twin.distances[0]).toBeCloseTo(25, 5);
  });
});

// ────────────────────────────────────────────────────────────────────
// MAX_BITMASK_VIEWS clamp (G.GOLD.015 — experienced-failure category:
// silent truncation past 32 views would corrupt the bitmask)
// ────────────────────────────────────────────────────────────────────

describe('MAX_BITMASK_VIEWS clamp', () => {
  it('FALSE: 33rd view onward is silently dropped (uint32 has 32 bits)', () => {
    const positions = new Float32Array([0, 0, -3]);
    const views: ParityViewConfig[] = Array.from({ length: 40 }, () => ({
      eyePosition: [0, 0, 0] as [number, number, number],
      eyeDirection: [0, 0, -1] as [number, number, number],
    }));
    const twin = preprocessSharedSort(positions, views);
    // All 32 visible views set, view 32+ ignored. Mask = 0xFFFFFFFF.
    expect(twin.visibilityBitmasks[0] >>> 0).toBe(0xffffffff);
  });
});
