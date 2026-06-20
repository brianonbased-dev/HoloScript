/**
 * GaussianTrainDispatch — the compiler↔runner seam.
 *
 * Closes the gap the 2026-06-20 /critic review named: the compiler emits a job whose `executor` is a
 * string nothing dereferenced. dispatchGaussianTrainJob is that dereferencer. These tests prove a
 * sovereign job (shaped exactly as GaussianTrainCompiler emits) routes to the native runner and
 * trains, and that a remote job is rejected here (it belongs to the baking pipeline).
 */
import { describe, it, expect } from 'vitest';
import { forward2D } from '../GaussianTrainer2D';
import { forward3D, type Gaussian3D } from '../GaussianTrainer3D';
import { type TrainView } from '../GaussianTrainRunner';
import { cameraFromViewMatrix } from '../GaussianTrainDataset';
import { dispatchGaussianTrainJob, type DispatchableTrainJob } from '../GaussianTrainDispatch';

function seeded(s: number): () => number {
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}
function makeScene(seed: number, N: number): Gaussian3D {
  const R = seeded(seed);
  return {
    N,
    x: Float64Array.from({ length: N }, () => (R() - 0.5) * 1.6),
    y: Float64Array.from({ length: N }, () => (R() - 0.5) * 1.2),
    z: Float64Array.from({ length: N }, () => (R() - 0.5) * 0.8),
    sx: Float64Array.from({ length: N }, () => 0.06 + R() * 0.12),
    sy: Float64Array.from({ length: N }, () => 0.06 + R() * 0.12),
    sz: Float64Array.from({ length: N }, () => 0.06 + R() * 0.12),
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
function viewMatrix(theta: number): number[] {
  const c = Math.cos(theta), s = Math.sin(theta);
  // column-major world→camera, rotY(theta), t=(0,0,6)
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 6, 1];
}

/** A job shaped exactly as GaussianTrainCompiler.buildJob emits (sovereign). */
const SOVEREIGN_JOB: DispatchableTrainJob = {
  backend: 'sovereign',
  hyperparams: {
    iterations: 200,
    learningRates: { position: 0.02, scale: 0.004, rotation: 0.01, opacity: 0.01, color: 0.01 },
    dilation: 0.3,
  },
};

describe('dispatchGaussianTrainJob — compiler↔runner seam', () => {
  it('routes a sovereign job to the native runner and trains (loss collapses)', () => {
    const W = 40, H = 30, fx = 55;
    const truth = makeScene(99, 80);
    const views: TrainView[] = [-0.3, 0.3].map((a) => {
      const cam = cameraFromViewMatrix(viewMatrix(a), fx, fx);
      return { cam, W, H, target: forward2D(forward3D(truth, cam, W, H).g2, W, H).img };
    });

    const result = dispatchGaussianTrainJob(SOVEREIGN_JOB, makeScene(3, 80), views);
    expect(result.iterations).toBe(200);
    expect(result.finalLoss).toBeLessThan(result.initialLoss / 8);
  });

  it('rejects a remote job (it belongs to the baking pipeline, not the native runner)', () => {
    const remote: DispatchableTrainJob = { ...SOVEREIGN_JOB, backend: 'remote' };
    const cam = cameraFromViewMatrix(viewMatrix(0), 55, 55);
    const views: TrainView[] = [{ cam, W: 8, H: 8, target: new Float64Array(8 * 8 * 3) }];
    expect(() => dispatchGaussianTrainJob(remote, makeScene(1, 4), views)).toThrow(/not sovereign/);
  });
});
