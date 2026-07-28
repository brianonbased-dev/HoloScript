/**
 * GaussianTrainRunner — the sovereign executor for compile_to_gaussian_train jobs.
 *
 * Anti-theater proof (F.125): the job spec the GaussianTrainCompiler emits must actually DRIVE the
 * native trainer, not just look plausible. This runs a job-shaped spec through runGaussianTrainJob
 * over a posed-view target rendered by the same pipeline and asserts the loss collapses — proving
 * the emitted GaussianTrainJob → GaussianTrainer3D wiring genuinely optimizes 3D gaussians.
 */
import { describe, it, expect } from 'vitest';
import { forward2D } from '../GaussianTrainer2D';
import { forward3D, type Gaussian3D, type SplatCamera } from '../GaussianTrainer3D';
import {
  runGaussianTrainJob,
  type GaussianTrainJobSpec,
  type TrainView,
} from '../GaussianTrainRunner';

function seeded(s: number): () => number {
  return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}
function makeScene(seed: number, N: number): Gaussian3D {
  const R = seeded(seed);
  return {
    N,
    x: Float64Array.from({ length: N }, () => (R() - 0.5) * 2.4),
    y: Float64Array.from({ length: N }, () => (R() - 0.5) * 1.8),
    z: Float64Array.from({ length: N }, () => (R() - 0.5) * 1.2),
    sx: Float64Array.from({ length: N }, () => 0.05 + R() * 0.12),
    sy: Float64Array.from({ length: N }, () => 0.05 + R() * 0.12),
    sz: Float64Array.from({ length: N }, () => 0.05 + R() * 0.12),
    qr: Float64Array.from({ length: N }, () => 1.0),
    qx: Float64Array.from({ length: N }, () => (R() - 0.5) * 0.4),
    qy: Float64Array.from({ length: N }, () => (R() - 0.5) * 0.4),
    qz: Float64Array.from({ length: N }, () => (R() - 0.5) * 0.4),
    op: Float64Array.from({ length: N }, () => 0.4 + R() * 0.5),
    r: Float64Array.from({ length: N }, () => R()),
    gr: Float64Array.from({ length: N }, () => R()),
    bl: Float64Array.from({ length: N }, () => R()),
  };
}

describe('GaussianTrainRunner — sovereign job execution', () => {
  it('a sovereign job drives GaussianTrainer3D to fit a posed view (>10x loss reduction)', () => {
    const W = 48,
      H = 36,
      N = 100;
    const cam: SplatCamera = {
      Vrow: [Math.cos(0.15), 0, Math.sin(0.15), 0, 1, 0, -Math.sin(0.15), 0, Math.cos(0.15)],
      t: [0, 0, 6],
      fx: 60,
      fy: 60,
    };
    // Target = a known 3D scene rendered through the same native pipeline.
    const target = forward2D(forward3D(makeScene(99, N), cam, W, H).g2, W, H).img;
    const views: TrainView[] = [{ cam, W, H, target }];

    // A job spec as the compiler would emit it (test-scale LRs/iterations).
    const job: GaussianTrainJobSpec = {
      hyperparams: {
        iterations: 250,
        learningRates: { position: 0.02, scale: 0.004, rotation: 0.01, opacity: 0.01, color: 0.01 },
        dilation: 0.3,
      },
    };

    const result = runGaussianTrainJob(job, makeScene(3, N), views);
    expect(result.iterations).toBe(250);
    expect(result.finalLoss).toBeLessThan(result.initialLoss / 10);
    // Monotone-ish: last loss is far below the first sampled loss.
    expect(result.lossHistory[result.lossHistory.length - 1]).toBeLessThan(result.lossHistory[0]);
  });

  it('throws on an empty view set (a trainer with no views cannot train)', () => {
    const job: GaussianTrainJobSpec = {
      hyperparams: {
        iterations: 10,
        learningRates: { position: 0.01, scale: 0.01, rotation: 0.01, opacity: 0.01, color: 0.01 },
        dilation: 0.3,
      },
    };
    expect(() => runGaussianTrainJob(job, makeScene(1, 5), [])).toThrow();
  });
});
