/**
 * GaussianDensify — adaptive density control (3DGS Algorithm 1).
 *
 * Refutes the /critic "fixed-cardinality trainer" finding two ways:
 *  1. UNIT: densifyAndPrune clones small high-gradient gaussians, splits large ones, prunes
 *     transparent ones, and reports the origin map (survivor→old, new→-1).
 *  2. INTEGRATION: a SPARSE init trained toward a detailed target with densification ON both grows
 *     the gaussian count AND reaches a lower loss than the same init run fixed-cardinality. (You
 *     cannot fit a detailed scene from too few gaussians — adding them where the gradient is high is
 *     exactly the mechanism, so a better fit is real evidence the mechanism works, not noise.)
 */
import { describe, it, expect } from 'vitest';
import { forward2D } from '../GaussianTrainer2D';
import { forward3D, type Gaussian3D } from '../GaussianTrainer3D';
import { runGaussianTrainJob, type GaussianTrainJobSpec, type TrainView } from '../GaussianTrainRunner';
import { cameraFromViewMatrix } from '../GaussianTrainDataset';
import { densifyAndPrune, seededRng } from '../GaussianDensify';

function seeded(s: number): () => number {
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}
function scene(seed: number, N: number): Gaussian3D {
  const R = seeded(seed);
  return {
    N,
    x: Float64Array.from({ length: N }, () => (R() - 0.5) * 1.6),
    y: Float64Array.from({ length: N }, () => (R() - 0.5) * 1.2),
    z: Float64Array.from({ length: N }, () => (R() - 0.5) * 0.8),
    sx: Float64Array.from({ length: N }, () => 0.05 + R() * 0.1),
    sy: Float64Array.from({ length: N }, () => 0.05 + R() * 0.1),
    sz: Float64Array.from({ length: N }, () => 0.05 + R() * 0.1),
    qr: Float64Array.from({ length: N }, () => 1.0),
    qx: Float64Array.from({ length: N }, () => (R() - 0.5) * 0.3),
    qy: Float64Array.from({ length: N }, () => (R() - 0.5) * 0.3),
    qz: Float64Array.from({ length: N }, () => (R() - 0.5) * 0.3),
    op: Float64Array.from({ length: N }, () => 0.4 + R() * 0.5),
    r: Float64Array.from({ length: N }, () => R()),
    gr: Float64Array.from({ length: N }, () => R()),
    bl: Float64Array.from({ length: N }, () => R()),
  };
}

describe('densifyAndPrune — clone / split / prune', () => {
  it('prunes transparent, clones small high-grad, splits large high-grad; origin map is correct', () => {
    const g: Gaussian3D = {
      N: 3,
      x: Float64Array.from([0, 1, 2]), y: Float64Array.from([0, 0, 0]), z: Float64Array.from([0, 0, 0]),
      sx: Float64Array.from([0.1, 0.05, 0.5]), sy: Float64Array.from([0.1, 0.05, 0.5]), sz: Float64Array.from([0.1, 0.05, 0.5]),
      qr: Float64Array.from([1, 1, 1]), qx: Float64Array.from([0, 0, 0]), qy: Float64Array.from([0, 0, 0]), qz: Float64Array.from([0, 0, 0]),
      op: Float64Array.from([0.005, 0.5, 0.5]), // g0 transparent → pruned
      r: Float64Array.from([0.1, 0.2, 0.3]), gr: Float64Array.from([0.1, 0.2, 0.3]), bl: Float64Array.from([0.1, 0.2, 0.3]),
    };
    const stats = { avgGrad2d: Float64Array.from([0, 1, 1]) }; // g1, g2 over threshold
    const { gaussians, origin } = densifyAndPrune(
      g, stats,
      { gradThreshold: 0.1, opacityPrune: 0.02, scaleThreshold: 0.15, splitFactor: 1.6, maxGaussians: 100 },
      seededRng(7),
    );

    // g0 pruned (0); g1 small → clone (original + 1 = 2); g2 large → split (2). Total 4.
    expect(gaussians.N).toBe(4);
    expect([...origin]).toEqual([1, -1, -1, -1]); // g1 survivor, then clone + 2 splits (all new)
    // no g0-derived gaussian survives (its opacity 0.005 was pruned)
    for (let i = 0; i < gaussians.N; i++) expect(gaussians.op[i]).not.toBe(0.005);
    // g1 original + clone keep the small scale; g2 splits shrink by φ
    expect(gaussians.sx[0]).toBeCloseTo(0.05, 6); // g1 original
    expect(gaussians.sx[1]).toBeCloseTo(0.05, 6); // clone
    expect(gaussians.sx[2]).toBeCloseTo(0.5 / 1.6, 6); // split
    expect(gaussians.sx[3]).toBeCloseTo(0.5 / 1.6, 6);
  });

  it('does nothing when no gaussian is transparent or over-threshold (fixed-cardinality)', () => {
    const g = scene(5, 8);
    const { gaussians, origin } = densifyAndPrune(
      g, { avgGrad2d: new Float64Array(8) /* all 0 */ },
      { gradThreshold: 0.1, opacityPrune: 0.0, scaleThreshold: 0.15, maxGaussians: 100 },
      seededRng(1),
    );
    expect(gaussians.N).toBe(8);
    expect([...origin]).toEqual([0, 1, 2, 3, 4, 5, 6, 7]); // identity — all survivors
  });
});

describe('runGaussianTrainJob with densification — grows the count AND improves the fit', () => {
  it('a sparse init densifies and beats the fixed-cardinality run on a detailed target', () => {
    const W = 44, H = 33, fx = 55;
    const truth = scene(99, 170); // detailed target — too rich for a sparse init
    const angles = [-0.3, 0.3];
    const views: TrainView[] = angles.map((a) => {
      const c = Math.cos(a), s = Math.sin(a);
      const vm = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 6, 1]; // column-major rotY, t=(0,0,6)
      const cam = cameraFromViewMatrix(vm, fx, fx);
      return { cam, W, H, target: forward2D(forward3D(truth, cam, W, H).g2, W, H).img };
    });

    const baseHyper = {
      iterations: 220,
      learningRates: { position: 0.02, scale: 0.004, rotation: 0.01, opacity: 0.01, color: 0.01 },
      dilation: 0.3,
    };
    const INIT_N = 22;

    // A: fixed-cardinality baseline.
    const fixed = runGaussianTrainJob({ hyperparams: baseHyper }, scene(3, INIT_N), views);

    // B: same init, densification ON.
    const densifyJob: GaussianTrainJobSpec = {
      hyperparams: baseHyper,
      densification: {
        interval: 20, fromIter: 15, untilIter: 180,
        gradThreshold: 0.04, opacityPrune: 0.03, scaleThreshold: 0.18, splitFactor: 1.6,
        maxGaussians: 400, seed: 1,
      },
    };
    const dense = runGaussianTrainJob(densifyJob, scene(3, INIT_N), views);

    expect(fixed.finalCount).toBe(INIT_N); // fixed run never changes count
    expect(dense.finalCount).toBeGreaterThan(INIT_N); // densification actually grew the set
    expect(dense.finalLoss).toBeLessThan(fixed.finalLoss); // and it produced a better fit
  });
});
